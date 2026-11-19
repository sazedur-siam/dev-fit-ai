/**
 * One `admin` is bootstrapped from ADMIN_EMAIL/ADMIN_PASSWORD. Everyone else is a
 * `project_manager` — created by an admin, or self-registered.
 */
export type Role = "admin" | "project_manager";

export const ROLE_LABELS: Record<Role, string> = {
  admin: "Admin",
  project_manager: "Project manager",
};

/**
 * How an account came to exist. `"self"` and `"google"` are the self-service
 * paths; they never fall back to the server's own API keys — see credentials.ts.
 */
export type AccountSource = "bootstrap" | "admin" | "self" | "google";

export const SOURCE_LABELS: Record<AccountSource, string> = {
  bootstrap: "Bootstrapped",
  admin: "Added by admin",
  self: "Self-registered",
  google: "Google",
};

/** Self-service accounts, which must bring their own API keys. */
export function isSelfService(source: AccountSource): boolean {
  return source === "self" || source === "google";
}

/** Where each role lands after signing in. */
export const ROLE_HOME: Record<Role, string> = {
  admin: "/admin",
  project_manager: "/fit",
};

/**
 * Sidebar collapse preference, written by the client and read by the server
 * layout so the first paint is already the right width.
 *
 * It lives here rather than in AppShell.tsx on purpose: everything exported from a
 * `"use client"` module becomes a *client reference* when a server component
 * imports it, so `cookies().get(thatImport)` silently never matches.
 */
export const SIDEBAR_COOKIE = "devfit_sidebar";

/**
 * Theme preference, stored the same way and for the same reason: the server
 * stamps the resolved class onto `<html>` so the first paint is already the
 * right theme instead of flashing light then swapping.
 *
 * `"system"` is represented by the *absence* of a class on `<html>`, which
 * `globals.css` picks up with a `prefers-color-scheme` block. That is why no
 * blocking inline script is needed to avoid a flash.
 */
export const THEME_COOKIE = "devfit_theme";

export type ThemePreference = "light" | "dark" | "system";

export const THEME_PREFERENCES: ThemePreference[] = ["light", "dark", "system"];

/** Narrows an untrusted cookie value; anything unrecognised means "system". */
export function parseThemePreference(value: string | undefined): ThemePreference {
  return value === "light" || value === "dark" ? value : "system";
}

/** An AI model vendor a user can bring their own key for. */
export type LlmProvider = "gemini" | "openai" | "anthropic";

/** Every provider, in the order the picker shows them. */
export const LLM_PROVIDERS: LlmProvider[] = ["gemini", "openai", "anthropic"];

export function isLlmProvider(value: unknown): value is LlmProvider {
  return typeof value === "string" && LLM_PROVIDERS.includes(value as LlmProvider);
}

/** A user's chosen AI provider and model id. Not secret: no key material. */
export interface LlmPreference {
  provider: LlmProvider;
  model: string;
}

/** Which third-party credential a stored key belongs to. */
export type KeyKind = LlmProvider | "github";

/**
 * A user as the app and admin dashboard see them. Never carries the password
 * hash or any key material.
 */
export interface AppUser {
  id: string;
  email: string;
  name: string | null;
  role: Role;
  source: AccountSource;
  /** Whether email + password sign-in works for this account. */
  hasPassword: boolean;
  /** Whether a Google account is linked. */
  hasGoogle: boolean;
  createdAt: string;
  lastLoginAt: string | null;
  /** The AI provider and model picked in Settings; null until one is chosen. */
  llm: LlmPreference | null;
}

/**
 * What the client is allowed to know about a saved key: that it exists, a masked
 * preview, and when it changed. Never the value.
 */
export interface KeyStatus {
  kind: KeyKind;
  isSet: boolean;
  preview: string | null;
  updatedAt: string | null;
}

/**
 * Everything the Settings page and the model picker may know about a user's AI
 * setup. Previews only, never key values.
 */
export interface LlmSettings {
  /** The provider + model requests would use right now. */
  active: LlmPreference;
  /** Whose key that would be: the user's own, the server's, or none (will fail). */
  activeSource: CredentialSource;
  /** False until the user has picked a model explicitly. */
  chosen: boolean;
  /** One status per AI provider, in picker order. */
  keys: KeyStatus[];
  /** Providers the server has a fallback key for, usable by this account. */
  serverProviders: LlmProvider[];
  /** The model each provider uses when none is picked (env-overridable). */
  defaults: Record<LlmProvider, string>;
}

/** A persisted fit run, for the user's own history. */
export interface StoredAnalysis {
  id: string;
  /** Null for a run started from a described need rather than a repo. */
  repoUrl: string | null;
  owner: string | null;
  repo: string | null;
  /** The PM's description, for runs started from text. */
  needText: string | null;
  requirement: RepoRequirement;
  ranked: FitScore[];
  topPickId: string;
  topPickRationale: string;
  /** `SCORING_VERSION` when it was scored; `"0"` for analyses saved before versioning. */
  scoringVersion: string;
  createdAt: string;
}

export type Archetype = "frontend" | "backend" | "fullstack";
export type Verdict = "fit" | "ramp-up" | "not fit";
export type Complexity = "low" | "moderate" | "high";

export interface DeveloperRepo {
  name: string;
  commits: number;
  additions: number;
  deletions: number;
  languages: string[];
  /**
   * Frameworks, libraries and platforms used in this repo ("Next.js", "Django").
   * Optional so developer documents seeded before frameworks existed still load.
   */
  frameworks?: string[];
  /**
   * AI coding tools whose config is committed here (ids from aiFluency.ts).
   * Absent means "not checked" (samples, older imports); `[]` means "none found".
   */
  aiTools?: string[];
}

export type AiFluencyTier = "none" | "emerging" | "proficient" | "advanced" | "elite";

/** Shown alongside a ranking, never part of it. See aiFluency.ts. */
export interface AiFluency {
  score: number;
  tier: AiFluencyTier;
  tools: { id: string; label: string; repos: string[] }[];
  reposWithConfig: number;
  reposMeasured: number;
}

/** `seed`: invented sample data from src/data. `github`: imported from public GitHub activity. */
export type DeveloperSource = "seed" | "github";

/**
 * A developer in the cohort. The name is historical: the type started as the
 * seeded mock data, and imported GitHub developers use the same shape.
 */
export interface MockDeveloper {
  id: string;
  name: string;
  archetype: Archetype;
  totalCommits: number;
  linesAdded: number;
  linesDeleted: number;
  repos: DeveloperRepo[];
  recentCommitMessages: string[];
  /** Absent on seeded documents, which count as `"seed"`. */
  source?: DeveloperSource;
  /** GitHub username, for imported developers. */
  githubLogin?: string;
  /** ISO timestamp of the last import or refresh. */
  importedAt?: string;
  /** ISO timestamp of their newest sampled commit, for imported developers. */
  lastCommitAt?: string;
  /** ISO timestamp after which the nightly refresh re-imports them. */
  nextRefreshAt?: string;
  /** Why the last refresh failed, if it did. Cleared by a successful one. */
  lastRefreshError?: string;
}

/** Developer with derived fields the UI/API want alongside the raw seed. */
export interface DeveloperView extends MockDeveloper {
  languages: string[]; // union of repos[].languages
  frameworks: string[]; // union of repos[].frameworks
  aiFluency: AiFluency | null; // null when not measurable (samples, older imports)
  netLines: number; // linesAdded - linesDeleted
}

export interface RepoRequirement {
  stack: string[];
  languages: string[];
  primaryArchetypeNeeded: Archetype;
  domain: string;
  complexity: Complexity;
  summary: string;
}

export interface FitScore {
  devId: string;
  languageOverlap: number;
  frameworkOverlap: number;
  archetypeMatch: number;
  experienceDepth: number;
  overall: number;
  verdict: Verdict;
  explanation: string;
}

/** Which credential a request actually used: the user's own, the server's, or none. */
export type CredentialSource = "user" | "env" | "none";

/** What `analyzeAndRank()` returns: the ranking plus where the repo came from. */
export interface AnalyzeAndRankResult {
  requirement: RepoRequirement;
  ranked: FitScore[];
  topPickId: string;
  topPickRationale: string;
  digestMeta: { owner: string; repo: string; fileCount: number };
}

/** A multiple-choice follow-up asked when a described need is too vague. */
export interface ClarifyingQuestion {
  id: string;
  question: string;
  options: string[];
}

/** `/api/need`: either questions to answer first, or a ranking shaped like /api/fit's. */
export type NeedResponse =
  | { status: "clarify"; questions: ClarifyingQuestion[] }
  | ({ status: "ready" } & FitResponse);

/**
 * The `/api/fit` response body. This is the **only** declaration of that
 * contract: the route builds it, and FitView reads it.
 */
export interface FitResponse {
  requirement: RepoRequirement;
  ranked: FitScore[];
  topPickId: string;
  topPickRationale: string;
  /** Null when saving to history failed; the ranking is still returned. */
  analysisId: string | null;
  /** The `SCORING_VERSION` these scores were computed with. */
  scoringVersion: string;
  credentialSources: { llm: CredentialSource; github: CredentialSource };
  /** The provider and model that wrote the requirement and explanations. */
  llm: LlmPreference;
}

/** One repository visible to the configured GITHUB_TOKEN. */
export interface ViewerRepo {
  fullName: string;
  name: string;
  owner: string;
  description: string | null;
  language: string | null;
  isPrivate: boolean;
  isFork: boolean;
  htmlUrl: string;
  updatedAt: string;
  stars: number;
}

/** Response shape of GET /api/repos. */
export interface ViewerRepoList {
  login: string;
  repos: ViewerRepo[];
}

/** Shape the /explain model call must return. */
export interface ExplanationResponse {
  explanations: { devId: string; explanation: string }[];
  topPickRationale: string;
}

// ───────────────────────── Workspace (private to each user) ─────────────────────────

/** A private note one user wrote about one developer. */
export interface DeveloperNote {
  id: string;
  developerId: string;
  body: string;
  createdAt: string;
  updatedAt: string;
}

/** A named list of developers, optionally tied to the analysis that produced it. */
export interface Shortlist {
  id: string;
  name: string;
  analysisId: string | null;
  developerIds: string[];
  createdAt: string;
  updatedAt: string;
}
