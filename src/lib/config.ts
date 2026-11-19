import { PROVIDER_META } from "@/lib/providers";
import type { LlmProvider } from "@/lib/types";

/**
 * Tunable knobs for the fit engine. Kept here so a demo audience can point at
 * one file and see how the score is composed.
 */

/**
 * Stamped on every saved analysis, so a stored ranking always says which formula
 * produced it. **Bump it on any change to the weights, thresholds or archetype
 * scores below, or to a sub-score formula in scoring.ts.** `config.test.ts`
 * fingerprints the constants and fails if they change under an unchanged version.
 */
export const SCORING_VERSION = "2.0.0";

/**
 * 2.0.0 split the old `stackOverlap` (0.40) into languages and frameworks, and
 * took 0.05 from archetype so the two skill signals together outweigh it.
 */
export const SCORING_WEIGHTS = {
  languageOverlap: 0.25,
  frameworkOverlap: 0.20,
  archetypeMatch: 0.30,
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
 * How long a public repo's digest and AI requirement are reused for the same
 * commit. The key includes the commit SHA, so a new push is never served stale;
 * this only bounds storage.
 */
export const REPO_CACHE_TTL_DAYS = 7;

/**
 * Part of the requirement cache key. **Bump it whenever the analyzeRepo() prompt
 * changes**, or cached requirements from the old prompt keep being served.
 */
export const REQUIREMENT_PROMPT_VERSION = "2";

/**
 * AI Fluency tier floors (0–100). The **only** definition: import it, never copy
 * the numbers. OMAV's handover warns its tiers lived in three files that drifted.
 */
export const AI_FLUENCY_TIERS = {
  emerging: 10,
  proficient: 30,
  advanced: 55,
  elite: 80,
} as const;

export const DIGEST_LIMITS = {
  maxTreePaths: 400,
  maxInlinedFiles: 20,
  maxFileBytes: 15 * 1024, // 15 KB
} as const;

/**
 * The model used for each AI provider when the user hasn't picked one. The
 * built-in defaults live in providers.ts (client-safe, the picker shows them);
 * each can be overridden per deployment with an env var.
 *
 * `gemini-2.5-flash` was retired for new API keys ("no longer available to new
 * users", HTTP 404), which is why Gemini's default moved. Use
 * `gemini-flash-latest` via GEMINI_MODEL if you'd rather never touch this again
 * and can tolerate the narration drifting between releases.
 */
export const DEFAULT_LLM_MODELS: Record<LlmProvider, string> = {
  gemini: process.env.GEMINI_MODEL?.trim() || PROVIDER_META.gemini.defaultModel,
  openai: process.env.OPENAI_MODEL?.trim() || PROVIDER_META.openai.defaultModel,
  anthropic: process.env.ANTHROPIC_MODEL?.trim() || PROVIDER_META.anthropic.defaultModel,
};

/**
 * Embedding model for the offline alias suggester (`npm run suggest-aliases`)
 * only. Nothing at request time embeds anything. Model names rot here too; the
 * script probes the model first and says so clearly if it's gone.
 */
export const GEMINI_EMBEDDING_MODEL =
  process.env.GEMINI_EMBEDDING_MODEL || "gemini-embedding-001";
