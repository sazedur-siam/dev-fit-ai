/**
 * Exactly one `admin` exists, bootstrapped from ADMIN_EMAIL/ADMIN_PASSWORD.
 * Everyone else is a `project_manager`, created by that admin.
 */
export type Role = "admin" | "project_manager";

export const ROLE_LABELS: Record<Role, string> = {
  admin: "Admin",
  project_manager: "Project manager",
};

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
}

export interface MockDeveloper {
  id: string;
  name: string;
  archetype: Archetype;
  totalCommits: number;
  linesAdded: number;
  linesDeleted: number;
  repos: DeveloperRepo[];
  recentCommitMessages: string[];
}

/** Developer with derived fields the UI/API want alongside the raw seed. */
export interface DeveloperView extends MockDeveloper {
  languages: string[]; // union of repos[].languages
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
  stackOverlap: number;
  archetypeMatch: number;
  experienceDepth: number;
  overall: number;
  verdict: Verdict;
  explanation: string;
}

export interface FitRanking {
  requirement: RepoRequirement;
  ranked: FitScore[];
  topPickId: string;
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
