import { buildRepoDigest } from "@/lib/github";
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

/** Ask Gemini for a RepoRequirement given a digest. Applies safe defaults. */
export async function analyzeRepo(
  repoUrl: string,
  creds: ResolvedCredentials
): Promise<{
  requirement: RepoRequirement;
  digestMeta: { owner: string; repo: string; fileCount: number };
}> {
  const digestObj = await buildRepoDigest(repoUrl, creds.githubToken);

  const prompt = `You are a senior tech lead. Read the digest of a public GitHub repo below and describe what kind of developer this codebase needs.

Return STRICTLY this JSON shape (no prose, no fences):
{
  "stack": string[],                     // frameworks, libs, patterns actually used (e.g. "Next.js App Router", "Django REST Framework", "Magento 2")
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
- Keep arrays deduplicated. Return valid JSON only.

--- DIGEST START ---
${digestObj.digest}
--- DIGEST END ---`;

  const raw = await geminiJSON<unknown>(prompt, creds.geminiApiKey);
  const requirement = coerceRequirement(raw, {
    languageBytes: digestObj.languageBytes,
    repoLabel: `${digestObj.owner}/${digestObj.repo}`,
  });

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
    totalCommits: d.totalCommits,
    netLines: d.netLines,
    recentCommitMessages: d.recentCommitMessages.slice(0, 3),
    repos: d.repos.map((r) => ({ name: r.name, languages: r.languages })),
  }));

  const scoredLite = ranked.map((r) => ({
    devId: r.devId,
    stackOverlap: r.stackOverlap,
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
- Reference concrete signals (languages the dev has that the repo needs, archetype fit, commit depth).
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
