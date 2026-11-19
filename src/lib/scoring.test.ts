import { describe, expect, it } from "vitest";
import { ARCHETYPE_MATCH_SCORES } from "@/lib/config";
import {
  archetypeMatch,
  computeSubScores,
  experienceDepth,
  overallScore,
  rankCohort,
  stackOverlap,
  verdictFor,
} from "@/lib/scoring";
import type { Archetype, DeveloperView, RepoRequirement } from "@/lib/types";

function dev(
  id: string,
  over: Partial<DeveloperView> = {}
): DeveloperView {
  return {
    id,
    name: id,
    archetype: "fullstack",
    totalCommits: 100,
    linesAdded: 1000,
    linesDeleted: 0,
    repos: [],
    recentCommitMessages: [],
    languages: [],
    netLines: 1000,
    ...over,
  };
}

function requirement(over: Partial<RepoRequirement> = {}): RepoRequirement {
  return {
    stack: [],
    languages: [],
    primaryArchetypeNeeded: "fullstack",
    domain: "test",
    complexity: "moderate",
    summary: "test",
    ...over,
  };
}

describe("stackOverlap", () => {
  it("is neutral (50) when the requirement names nothing", () => {
    expect(stackOverlap(["TypeScript"], requirement())).toBe(50);
  });

  it("matches case-insensitively and ignores whitespace", () => {
    const req = requirement({ languages: ["typescript", " Python "] });
    expect(stackOverlap(["TypeScript", "python"], req)).toBe(100);
  });

  it("scores the share of required terms the developer has", () => {
    const req = requirement({ languages: ["TypeScript", "Go"] });
    expect(stackOverlap(["TypeScript"], req)).toBe(50);
  });
});

describe("archetypeMatch", () => {
  const cases: [Archetype, Archetype, number][] = [
    ["frontend", "frontend", ARCHETYPE_MATCH_SCORES.exact],
    ["fullstack", "backend", ARCHETYPE_MATCH_SCORES.fullstackToSpecialist],
    ["backend", "fullstack", ARCHETYPE_MATCH_SCORES.specialistToFullstack],
    ["frontend", "backend", ARCHETYPE_MATCH_SCORES.oppositeSpecialist],
  ];
  it.each(cases)("%s dev for a %s need → %d", (d, need, expected) => {
    expect(archetypeMatch(d, need)).toBe(expected);
  });
});

describe("experienceDepth", () => {
  it("is neutral (50) for a cohort of one", () => {
    const only = dev("a");
    expect(experienceDepth(only, [only])).toBe(50);
  });

  it("ranks the heaviest committer highest", () => {
    const low = dev("low", { totalCommits: 10, netLines: 100 });
    const mid = dev("mid", { totalCommits: 100, netLines: 500 });
    const high = dev("high", { totalCommits: 1000, netLines: 1000 });
    const cohort = [low, mid, high];
    expect(experienceDepth(high, cohort)).toBe(100);
    expect(experienceDepth(high, cohort)).toBeGreaterThan(
      experienceDepth(mid, cohort)
    );
    expect(experienceDepth(mid, cohort)).toBeGreaterThan(
      experienceDepth(low, cohort)
    );
  });

  it("clamps negative net lines to zero rather than going below 0", () => {
    const neg = dev("neg", { totalCommits: 1, netLines: -5000 });
    const pos = dev("pos", { totalCommits: 2, netLines: 100 });
    expect(experienceDepth(neg, [neg, pos])).toBe(0);
  });
});

describe("verdictFor", () => {
  it.each([
    [75, "fit"],
    [74.96, "ramp-up"], // displays as 75.0 after rounding, but is still ramp-up
    [55, "ramp-up"],
    [54.99, "not fit"],
    [0, "not fit"],
  ] as const)("%d → %s", (score, verdict) => {
    expect(verdictFor(score)).toBe(verdict);
  });
});

describe("overallScore", () => {
  it("is 100 when every sub-score is 100", () => {
    expect(
      overallScore({ stackOverlap: 100, archetypeMatch: 100, experienceDepth: 100 })
    ).toBeCloseTo(100);
  });
});

describe("rankCohort", () => {
  const cohort = [
    dev("fe", { archetype: "frontend", languages: ["TypeScript"], totalCommits: 50 }),
    dev("be", { archetype: "backend", languages: ["Python"], totalCommits: 500 }),
    dev("fs", { archetype: "fullstack", languages: ["TypeScript", "Python"], totalCommits: 200 }),
  ];
  const req = requirement({
    languages: ["Python"],
    primaryArchetypeNeeded: "backend",
  });

  it("is deterministic: the same input gives identical output", () => {
    expect(rankCohort(cohort, req)).toEqual(rankCohort(cohort, req));
  });

  it("sorts by overall, highest first", () => {
    const ranked = rankCohort(cohort, req);
    const overalls = ranked.map((r) => r.overall);
    expect(overalls).toEqual([...overalls].sort((a, b) => b - a));
    expect(ranked[0].devId).toBe("be");
  });

  it("rounds returned sub-scores to one decimal", () => {
    const s = computeSubScores(cohort[2], req, cohort);
    for (const v of [s.stackOverlap, s.archetypeMatch, s.experienceDepth, s.overall]) {
      expect(Math.round(v * 10) / 10).toBe(v);
    }
  });
});
