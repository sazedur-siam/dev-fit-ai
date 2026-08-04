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

/** Shape the /explain Gemini call must return. */
export interface GeminiExplanationResponse {
  explanations: { devId: string; explanation: string }[];
  topPickRationale: string;
}
