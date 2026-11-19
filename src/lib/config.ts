/**
 * Tunable knobs for the fit engine. Kept here so a demo audience can point at
 * one file and see how the score is composed.
 */

export const SCORING_WEIGHTS = {
  stackOverlap: 0.40,
  archetypeMatch: 0.35,
  experienceDepth: 0.25,
} as const;

export const VERDICT_THRESHOLDS = {
  fit: 75, // >= 75 → "fit"
  rampUp: 55, // 55–74 → "ramp-up"; below → "not fit"
} as const;

export const ARCHETYPE_MATCH_SCORES = {
  exact: 100,
  fullstackToSpecialist: 75, // dev is fullstack, repo needs frontend or backend
  specialistToFullstack: 60, // dev is a specialist, repo needs fullstack
  oppositeSpecialist: 25, // frontend dev vs backend need (or reverse)
} as const;

/**
 * How long a public repo's digest and Gemini requirement are reused for the same
 * commit. The key includes the commit SHA, so a new push is never served stale;
 * this only bounds storage.
 */
export const REPO_CACHE_TTL_DAYS = 7;

/**
 * Part of the requirement cache key. **Bump it whenever the analyzeRepo() prompt
 * changes**, or cached requirements from the old prompt keep being served.
 */
export const REQUIREMENT_PROMPT_VERSION = "1";

export const DIGEST_LIMITS = {
  maxTreePaths: 400,
  maxInlinedFiles: 20,
  maxFileBytes: 15 * 1024, // 15 KB
} as const;

/**
 * `gemini-2.5-flash` was retired for new API keys ("no longer available to new
 * users", HTTP 404), so the default is a current flash model. Use
 * `gemini-flash-latest` via GEMINI_MODEL if you'd rather never touch this again
 * and can tolerate the narration drifting between releases.
 */
export const GEMINI_MODEL = process.env.GEMINI_MODEL || "gemini-3.6-flash";
