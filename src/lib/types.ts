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

/** Which third-party credential a stored key belongs to. */
export type KeyKind = "gemini" | "github";

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

/** A persisted fit run, for the user's own history. */
export interface StoredAnalysis {
  id: string;
  repoUrl: string;
  owner: string;
  repo: string;
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
  credentialSources: { gemini: CredentialSource; github: CredentialSource };
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

/** Shape the /explain Gemini call must return. */
export interface GeminiExplanationResponse {
  explanations: { devId: string; explanation: string }[];
  topPickRationale: string;
}
