import { describe, expect, it } from "vitest";
import { buildProfilePrompt, coerceProfileSummary, profileFacts } from "@/lib/profileSummary";
import { toView } from "@/lib/developerHelpers";
import type { GithubProfileInsights, MockDeveloper } from "@/lib/types";

const dev: MockDeveloper = {
  id: "gh-octo",
  name: "Octo",
  archetype: "backend",
  totalCommits: 120,
  linesAdded: 5000,
  linesDeleted: 1000,
  repos: [{ name: "api", commits: 120, additions: 5000, deletions: 1000, languages: ["Go"], frameworks: ["Gin"], aiTools: [] }],
  recentCommitMessages: ["fix: retry"],
  source: "github",
  githubLogin: "octo",
};

const insights = {
  login: "octo",
  name: "Octo",
  bio: null,
  company: null,
  accountAgeYears: 4,
  followers: 3,
  publicRepos: 5,
  starsEarned: 12,
  organizations: [],
  repoDetails: [{ name: "api", description: "An API", stars: 12, topics: ["rest"] }],
  activity: { totalContributions: 300, commits: 250, pullRequests: 20, reviews: 10, issues: 3, activeDays: 140, longestStreak: 9 },
  openSource: { repos: [{ repo: "gin-gonic/gin", stars: 80000, mergedCount: 2 }] },
} as unknown as GithubProfileInsights;

describe("profile summary prompt", () => {
  it("hands over computed facts only, between delimiters", () => {
    const facts = profileFacts(toView(dev), insights);
    expect(facts.topRepos[0]).toMatchObject({ name: "api", description: "An API", stars: 12, commits: 120 });
    expect(facts.contributionsToOtherProjects).toEqual([{ repo: "gin-gonic/gin", stars: 80000, mergedPullRequests: 2 }]);
    const prompt = buildProfilePrompt(facts);
    expect(prompt).toContain("Do not invent numbers");
    expect(prompt).toContain("Do not score, rate, rank");
    expect(prompt).toMatch(/--- FACTS START ---[\s\S]*"gin-gonic\/gin"[\s\S]*--- FACTS END ---/);
  });
});

describe("partial reports", () => {
  it("tells the model commit data is missing, and withholds the default archetype", () => {
    const empty = toView({ ...dev, repos: [], totalCommits: 0 });
    const facts = profileFacts(empty, insights, { commitDataMissing: true });
    expect(facts.guessedArchetype).toBeNull();
    expect(facts).toHaveProperty("note");
    expect(buildProfilePrompt(facts)).toContain("could not be fetched");
  });

  it("adds no note on a complete report", () => {
    expect(profileFacts(toView(dev), insights)).not.toHaveProperty("note");
  });
});

describe("coerceProfileSummary", () => {
  it("keeps good fields and defaults the rest", () => {
    const s = coerceProfileSummary({ headline: " Go backend dev ", strengths: ["APIs", 7, " ", "Tests"], likelyRoles: "nope" });
    expect(s).toMatchObject({ headline: "Go backend dev", strengths: ["APIs", "Tests"], likelyRoles: [], seniorityNotes: "" });
    expect(s.caveats.length).toBe(1); // the default public-data caveat
  });

  it("caps list lengths", () => {
    expect(coerceProfileSummary({ headline: "x", strengths: Array(9).fill("s") }).strengths).toHaveLength(5);
  });

  it("an empty reply is an error, not a blank summary", () => {
    expect(() => coerceProfileSummary("not json")).toThrow(/empty summary/);
    expect(() => coerceProfileSummary({})).toThrow(/empty summary/);
  });
});
