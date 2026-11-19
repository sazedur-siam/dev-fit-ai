import { z } from "zod";
import { llmJSON, type LlmConfig } from "@/lib/llm";
import type { DeveloperView, GithubProfileInsights, ProfileSummary } from "@/lib/types";

/**
 * The Profile Analyzer's one model call: a plain-language read of a GitHub
 * profile for a project manager. **The model only narrates.** Every figure in
 * the report is computed in code before this call; the prompt hands over those
 * figures and forbids inventing others, and nothing the model returns is turned
 * into a score.
 */

/** The facts the model sees: computed numbers and names, nothing else. */
export function profileFacts(
  dev: DeveloperView,
  insights: GithubProfileInsights,
  opts: { commitDataMissing?: boolean } = {}
) {
  const details = new Map(insights.repoDetails.map((r) => [r.name, r]));
  return {
    ...(opts.commitDataMissing
      ? {
          note: "Commit, repository-stack and archetype data could not be fetched for this account (GitHub timed out). Their absence says nothing about the developer; do not draw conclusions from it.",
        }
      : {}),
    login: insights.login,
    name: insights.name,
    bio: insights.bio,
    company: insights.company,
    accountAgeYears: insights.accountAgeYears,
    followers: insights.followers,
    publicRepos: insights.publicRepos,
    starsEarned: insights.starsEarned,
    organizations: insights.organizations.map((o) => o.name ?? o.login),
    guessedArchetype: opts.commitDataMissing ? null : dev.archetype,
    languages: dev.languages,
    frameworks: dev.frameworks,
    sampledCommitsInOwnRepos: dev.totalCommits,
    aiTools: dev.aiFluency?.tools.map((t) => t.label) ?? [],
    lastYear: {
      contributions: insights.activity.totalContributions,
      commits: insights.activity.commits,
      pullRequests: insights.activity.pullRequests,
      reviews: insights.activity.reviews,
      issues: insights.activity.issues,
      activeDays: insights.activity.activeDays,
      longestStreakDays: insights.activity.longestStreak,
    },
    topRepos: dev.repos.map((r) => ({
      name: r.name,
      description: details.get(r.name)?.description ?? null,
      stars: details.get(r.name)?.stars ?? 0,
      topics: details.get(r.name)?.topics ?? [],
      commits: r.commits,
      languages: r.languages,
      frameworks: r.frameworks ?? [],
    })),
    contributionsToOtherProjects: insights.openSource.repos.slice(0, 8).map((o) => ({
      repo: o.repo,
      stars: o.stars,
      mergedPullRequests: o.mergedCount,
    })),
    recentCommitMessages: dev.recentCommitMessages,
  };
}

export function buildProfilePrompt(facts: ReturnType<typeof profileFacts>): string {
  return `You are a senior engineering manager helping a project manager understand a developer from their public GitHub profile.

Return STRICTLY this JSON shape (no prose, no fences):
{
  "headline": string,            // one sentence: what kind of developer this looks like
  "strengths": string[],         // 2-5 short points, each tied to a repo, framework or activity below
  "likelyRoles": string[],       // 1-3 roles they look suited to, e.g. "React frontend developer"
  "seniorityNotes": string,      // 1-2 sentences on experience signals, hedged appropriately
  "verifyInInterview": string[], // 2-4 things the public data can't confirm and an interviewer should ask about
  "caveats": string[]            // 1-3 limits of this evidence
}

Rules:
- Use ONLY the facts below. Do not invent employers, projects, years of experience or skills.
- Do not invent numbers. If you cite a figure, it must appear in the facts exactly.
- Do not score, rate, rank or give a hire / no-hire verdict. Describe; the humans decide.
- This is public activity only: private and work repositories are invisible, so say when evidence is thin.
- Return valid JSON only.

--- FACTS START ---
${JSON.stringify(facts, null, 2)}
--- FACTS END ---`;
}

const asObject = (v: unknown) => (v && typeof v === "object" && !Array.isArray(v) ? v : {});
const list = (max: number) =>
  z
    .array(z.unknown())
    .catch([])
    .transform((items) =>
      items
        .map((s) => (typeof s === "string" ? s.trim() : ""))
        .filter(Boolean)
        .slice(0, max)
    );

const RawSummarySchema = z.preprocess(
  asObject,
  z.object({
    headline: z.string().trim().catch(""),
    strengths: list(5),
    likelyRoles: list(3),
    seniorityNotes: z.string().trim().catch(""),
    verifyInInterview: list(4),
    caveats: list(3),
  })
);

/** Lenient: a malformed reply degrades to defaults; an empty one is an error. */
export function coerceProfileSummary(raw: unknown): ProfileSummary {
  const s = RawSummarySchema.parse(raw);
  if (!s.headline && s.strengths.length === 0) {
    throw new Error("The model returned an empty summary.");
  }
  return {
    ...s,
    headline: s.headline || "Summary of public GitHub activity",
    caveats: s.caveats.length
      ? s.caveats
      : ["Based on public GitHub activity only; private and work repositories aren't visible."],
  };
}

export async function summarizeProfile(
  dev: DeveloperView,
  insights: GithubProfileInsights,
  llm: LlmConfig,
  opts: { commitDataMissing?: boolean } = {}
): Promise<ProfileSummary> {
  const raw = await llmJSON<unknown>(buildProfilePrompt(profileFacts(dev, insights, opts)), llm);
  return coerceProfileSummary(raw);
}
