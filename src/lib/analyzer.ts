import { buildRepoDigest } from "@/lib/github";
import { geminiJSON } from "@/lib/gemini";
import type {
  Archetype,
  Complexity,
  DeveloperView,
  FitScore,
  GeminiExplanationResponse,
  RepoRequirement,
} from "@/lib/types";
import { rankCohort } from "@/lib/scoring";
import type { ResolvedCredentials } from "@/lib/credentials";

const ARCHETYPES: Archetype[] = ["frontend", "backend", "fullstack"];
const COMPLEXITIES: Complexity[] = ["low", "moderate", "high"];

function fallbackLanguagesFromBytes(bytes: Record<string, number>): string[] {
  return Object.entries(bytes)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6)
    .map(([lang]) => lang);
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

  const raw = await geminiJSON<Partial<RepoRequirement>>(
    prompt,
    creds.geminiApiKey
  );

  // Coerce & fill defaults
  const languages = Array.isArray(raw.languages) && raw.languages.length > 0
    ? raw.languages.map(String)
    : fallbackLanguagesFromBytes(digestObj.languageBytes);

  const stack = Array.isArray(raw.stack) ? raw.stack.map(String) : [];
  const archetype = ARCHETYPES.includes(raw.primaryArchetypeNeeded as Archetype)
    ? (raw.primaryArchetypeNeeded as Archetype)
    : "fullstack";
  const complexity = COMPLEXITIES.includes(raw.complexity as Complexity)
    ? (raw.complexity as Complexity)
    : "moderate";

  const requirement: RepoRequirement = {
    stack,
    languages,
    primaryArchetypeNeeded: archetype,
    domain: typeof raw.domain === "string" ? raw.domain : "(unknown domain)",
    complexity,
    summary:
      typeof raw.summary === "string" && raw.summary.trim().length > 0
        ? raw.summary
        : `Repository ${digestObj.owner}/${digestObj.repo}.`,
  };

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

  const raw = await geminiJSON<Partial<GeminiExplanationResponse>>(
    prompt,
    creds.geminiApiKey
  );
  const explanations = Array.isArray(raw.explanations) ? raw.explanations : [];
  const explanationById = new Map(
    explanations
      .filter((e) => e && typeof e.devId === "string")
      .map((e) => [e.devId as string, String(e.explanation ?? "")])
  );

  const filled: GeminiExplanationResponse["explanations"] = ranked.map((r) => ({
    devId: r.devId,
    explanation:
      explanationById.get(r.devId) ||
      "No explanation generated. Fit is based on the deterministic sub-scores.",
  }));

  return {
    explanations: filled,
    topPickRationale:
      typeof raw.topPickRationale === "string" && raw.topPickRationale.trim()
        ? raw.topPickRationale
        : "Top pick chosen by highest overall score.",
  };
}

/** End-to-end: repoUrl → RepoRequirement + ranked FitScore[] + topPickId. */
export async function analyzeAndRank(
  repoUrl: string,
  cohort: DeveloperView[],
  creds: ResolvedCredentials
) {
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
