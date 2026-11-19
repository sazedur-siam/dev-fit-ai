import { buildRepoDigest, getRepoHead, parseRepoUrl, type RepoDigest } from "@/lib/github";
import { GEMINI_MODEL, REQUIREMENT_PROMPT_VERSION } from "@/lib/config";
import {
  digestCacheKey,
  getCachedDigest,
  getCachedRequirement,
  requirementCacheKey,
  saveDigest,
  saveRequirement,
} from "@/lib/db/repoCache";
import { geminiJSON } from "@/lib/gemini";
import type {
  AnalyzeAndRankResult,
  DeveloperView,
  FitScore,
  GeminiExplanationResponse,
  RepoRequirement,
} from "@/lib/types";
import { rankCohort } from "@/lib/scoring";
import { ExplanationResponseSchema, RawRequirementSchema } from "@/lib/schemas";
import type { ResolvedCredentials } from "@/lib/credentials";

function fallbackLanguagesFromBytes(bytes: Record<string, number>): string[] {
  return Object.entries(bytes)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6)
    .map(([lang]) => lang);
}

/**
 * Turn Gemini's raw reply into a complete RepoRequirement. Never throws: every
 * field has a schema default, and the two that need repo context (languages,
 * summary) fall back to the language byte counts and the repo name.
 */
export function coerceRequirement(
  raw: unknown,
  ctx: { languageBytes: Record<string, number>; repoLabel: string }
): RepoRequirement {
  const parsed = RawRequirementSchema.parse(raw);
  return {
    ...parsed,
    languages:
      parsed.languages.length > 0
        ? parsed.languages
        : fallbackLanguagesFromBytes(ctx.languageBytes),
    summary: parsed.summary || `Repository ${ctx.repoLabel}.`,
  };
}

/**
 * Turn Gemini's raw explanation reply into exactly one explanation per ranked
 * developer, in ranking order. Missing or unknown entries get a neutral default.
 */
export function coerceExplanations(
  raw: unknown,
  ranked: Pick<FitScore, "devId">[]
): GeminiExplanationResponse {
  const parsed = ExplanationResponseSchema.parse(raw);
  const byId = new Map(parsed.explanations.map((e) => [e.devId, e.explanation]));
  return {
    explanations: ranked.map((r) => ({
      devId: r.devId,
      explanation:
        byId.get(r.devId) ||
        "No explanation generated. Fit is based on the deterministic sub-scores.",
    })),
    topPickRationale:
      parsed.topPickRationale || "Top pick chosen by highest overall score.",
  };
}

/**
 * Whether Gemini's raw reply was complete enough to cache. A reply that only
 * survived through schema defaults would otherwise be pinned for a week.
 */
export function isCacheableReply(raw: unknown): boolean {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return false;
  const r = raw as Record<string, unknown>;
  return (
    Array.isArray(r.languages) &&
    r.languages.length > 0 &&
    ["frontend", "backend", "fullstack"].includes(r.primaryArchetypeNeeded as string) &&
    typeof r.summary === "string" &&
    r.summary.trim().length > 0
  );
}

/**
 * Cache reads and writes are an optimisation. Any failure is logged and treated
 * as a miss, never as a failed request.
 */
async function bestEffort<T>(label: string, fn: () => Promise<T>): Promise<T | null> {
  try {
    return await fn();
  } catch (err) {
    console.error(`[repo cache] ${label} failed:`, err);
    return null;
  }
}

/**
 * Ask Gemini for a RepoRequirement given a digest. Applies safe defaults.
 *
 * Public repos are cached per commit SHA: the digest (skips ~20 file reads) and
 * the requirement for the current model + prompt version (skips Gemini call #1,
 * and makes repeat runs on one commit return the same requirement). Private repos
 * are never cached, because the cache key has no user in it.
 */
export async function analyzeRepo(
  repoUrl: string,
  creds: ResolvedCredentials
): Promise<{
  requirement: RepoRequirement;
  digestMeta: { owner: string; repo: string; fileCount: number };
}> {
  const { owner, repo } = parseRepoUrl(repoUrl);
  const head = await getRepoHead(owner, repo, creds.githubToken);
  const cacheable = !head.isPrivate;
  const dKey = digestCacheKey(owner, repo, head.sha);
  const rKey = requirementCacheKey(owner, repo, head.sha, GEMINI_MODEL, REQUIREMENT_PROMPT_VERSION);

  if (cacheable) {
    const hit = await bestEffort("read requirement", () => getCachedRequirement(rKey));
    if (hit) {
      return { requirement: hit.requirement, digestMeta: { owner, repo, fileCount: hit.fileCount } };
    }
  }

  let digestObj: RepoDigest | null = cacheable
    ? await bestEffort("read digest", () => getCachedDigest(dKey))
    : null;
  if (!digestObj) {
    digestObj = await buildRepoDigest(owner, repo, head, creds.githubToken);
    if (cacheable) {
      const built = digestObj;
      await bestEffort("save digest", () => saveDigest(dKey, built));
    }
  }

  const prompt = `You are a senior tech lead. Read the digest of a public GitHub repo below and describe what kind of developer this codebase needs.

Return STRICTLY this JSON shape (no prose, no fences):
{
  "stack": string[],                     // frameworks, libraries and platforms actually used, by their SHORT common name (e.g. "Next.js", "React", "Django REST Framework", "Magento", "Tailwind CSS") — no versions, no qualifiers like "App Router"
  "languages": string[],                 // programming languages present, most-used first
  "primaryArchetypeNeeded": "frontend" | "backend" | "fullstack",
  "domain": string,                      // one-line business/technical domain (e.g. "e-commerce storefront on Magento 2")
  "complexity": "low" | "moderate" | "high",
  "summary": string                      // 2–3 sentences: what this repo is and what a developer would need to be effective on it
}

Rules:
- Base your answer on evidence in the digest (file paths, config files, imports).
- If the tree is mixed but the meaningful code is on one side, pick that archetype; only choose "fullstack" if BOTH frontend and backend concerns are non-trivial.
- Do not invent frameworks that aren't visible. Prefer omitting to guessing.
- Put programming languages in "languages", not in "stack".
- Keep arrays deduplicated. Return valid JSON only.

--- DIGEST START ---
${digestObj.digest}
--- DIGEST END ---`;

  const raw = await geminiJSON<unknown>(prompt, creds.geminiApiKey);
  const requirement = coerceRequirement(raw, {
    languageBytes: digestObj.languageBytes,
    repoLabel: `${digestObj.owner}/${digestObj.repo}`,
  });

  if (cacheable && isCacheableReply(raw)) {
    const fileCount = digestObj.fileCount;
    await bestEffort("save requirement", () => saveRequirement(rKey, requirement, fileCount));
  }

  return {
    requirement,
    digestMeta: {
      owner: digestObj.owner,
      repo: digestObj.repo,
      fileCount: digestObj.fileCount,
    },
  };
}

/**
 * One Gemini pass to write an explanation per developer + a top-pick rationale.
 * Scoring is already decided; the AI only narrates.
 */
export async function explainRanking(
  requirement: RepoRequirement,
  ranked: Omit<FitScore, "explanation">[],
  cohort: DeveloperView[],
  creds: ResolvedCredentials
): Promise<GeminiExplanationResponse> {
  const cohortLite = cohort.map((d) => ({
    id: d.id,
    name: d.name,
    archetype: d.archetype,
    languages: d.languages,
    frameworks: d.frameworks,
    // Context only: AI fluency is not part of any score.
    aiTools: d.aiFluency?.tools.map((t) => t.label) ?? null,
    totalCommits: d.totalCommits,
    netLines: d.netLines,
    recentCommitMessages: d.recentCommitMessages.slice(0, 3),
    repos: d.repos.map((r) => ({
      name: r.name,
      languages: r.languages,
      frameworks: r.frameworks ?? [],
    })),
  }));

  const scoredLite = ranked.map((r) => ({
    devId: r.devId,
    languageOverlap: r.languageOverlap,
    frameworkOverlap: r.frameworkOverlap,
    archetypeMatch: r.archetypeMatch,
    experienceDepth: r.experienceDepth,
    overall: r.overall,
    verdict: r.verdict,
  }));

  const prompt = `You are a tech lead explaining why each developer does or does not fit a target repo. Scores are already computed; DO NOT re-rank or invent numbers — only narrate.

Repo requirement:
${JSON.stringify(requirement, null, 2)}

Developers (with pre-computed scores):
${JSON.stringify(
  scoredLite.map((s) => ({
    ...s,
    developer: cohortLite.find((d) => d.id === s.devId),
  })),
  null,
  2
)}

Return STRICTLY this JSON:
{
  "explanations": [
    { "devId": string, "explanation": string }   // one 2-sentence explanation per developer
  ],
  "topPickRationale": string                     // one sentence naming the top-scored dev and why they're the top pick for THIS repo
}

Rules:
- Reference concrete signals (languages and frameworks the dev has that the repo needs, archetype fit, commit depth).
- For low-fit devs, name the gap (missing language, wrong specialty).
- Never contradict the numeric verdict.
- Be specific. No filler ("This developer would be a great addition"). Aim for review-caliber sharpness.`;

  const raw = await geminiJSON<unknown>(prompt, creds.geminiApiKey);
  return coerceExplanations(raw, ranked);
}

/** End-to-end: repoUrl → RepoRequirement + ranked FitScore[] + topPickId. */
export async function analyzeAndRank(
  repoUrl: string,
  cohort: DeveloperView[],
  creds: ResolvedCredentials
): Promise<AnalyzeAndRankResult> {
  const { requirement, digestMeta } = await analyzeRepo(repoUrl, creds);
  const rankedBase = rankCohort(cohort, requirement);
  const { explanations, topPickRationale } = await explainRanking(
    requirement,
    rankedBase,
    cohort,
    creds
  );
  const explanationMap = new Map(explanations.map((e) => [e.devId, e.explanation]));

  const ranked: FitScore[] = rankedBase.map((r) => ({
    ...r,
    explanation: explanationMap.get(r.devId) || "",
  }));

  return {
    requirement,
    ranked,
    topPickId: ranked[0]?.devId ?? "",
    topPickRationale,
    digestMeta,
  };
}
