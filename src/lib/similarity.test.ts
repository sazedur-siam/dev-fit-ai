import { describe, expect, it } from "vitest";
import { suggestAliases } from "@/lib/aliasSuggest";
import { cosine, similarDevelopers, skillVector } from "@/lib/similarity";
import { isKnownSkill } from "@/lib/skills";
import type { DeveloperView } from "@/lib/types";

function dev(id: string, repos: { commits: number; languages: string[]; frameworks?: string[] }[]): DeveloperView {
  const full = repos.map((r, i) => ({ name: `${id}-${i}`, additions: 1, deletions: 0, ...r }));
  return {
    id,
    name: id.toUpperCase(),
    archetype: "fullstack",
    totalCommits: 1,
    linesAdded: 1,
    linesDeleted: 0,
    repos: full,
    recentCommitMessages: [],
    languages: [...new Set(full.flatMap((r) => r.languages))],
    frameworks: [...new Set(full.flatMap((r) => r.frameworks ?? []))],
    netLines: 1,
    aiFluency: null,
  };
}

describe("cosine", () => {
  it("is 1 for parallel, 0 for orthogonal or empty vectors", () => {
    expect(cosine([1, 2], [2, 4])).toBeCloseTo(1);
    expect(cosine([1, 0], [0, 1])).toBe(0);
    expect(cosine([0, 0], [1, 1])).toBe(0);
  });
});

describe("skillVector", () => {
  it("spreads each repo's commits over its skills, with implications", () => {
    const v = skillVector(dev("a", [{ commits: 30, languages: ["TypeScript"], frameworks: ["Next.js"] }]));
    // TypeScript, nextjs, and implied react share 30 commits.
    expect(v.get("typescript")).toBe(10);
    expect(v.get("nextjs")).toBe(10);
    expect(v.get("react")).toBe(10);
  });
});

describe("similarDevelopers", () => {
  const nextDev = dev("next", [{ commits: 100, languages: ["TypeScript"], frameworks: ["Next.js"] }]);
  const reactDev = dev("react", [{ commits: 80, languages: ["TypeScript"], frameworks: ["React"] }]);
  const djangoDev = dev("django", [{ commits: 90, languages: ["Python"], frameworks: ["Django"] }]);
  const cohort = [nextDev, reactDev, djangoDev];

  it("ranks the closest skill profile first, excludes self and zero overlap", () => {
    const out = similarDevelopers(nextDev, cohort);
    expect(out.map((s) => s.id)).toEqual(["react"]);
    expect(out[0].similarity).toBeGreaterThan(0.5);
    expect(out[0].shared).toEqual(expect.arrayContaining(["TypeScript"]));
  });

  it("is deterministic", () => {
    expect(similarDevelopers(reactDev, cohort)).toEqual(similarDevelopers(reactDev, cohort));
  });

  it("honours the limit", () => {
    const many = Array.from({ length: 6 }, (_, i) =>
      dev(`d${i}`, [{ commits: 10 + i, languages: ["TypeScript"] }])
    );
    expect(similarDevelopers(many[0], many, 3)).toHaveLength(3);
  });
});

describe("suggestAliases", () => {
  // Fake embedder: names that should match get identical vectors.
  const vec: Record<string, number[]> = {
    "Next.js": [1, 0, 0],
    "NextJS Framework": [0.99, 0.05, 0],
    Django: [0, 1, 0],
    "Some Unrelated Lib": [0, 0, 1],
  };
  const embed = async (texts: string[]) => texts.map((t) => vec[t] ?? [0, 0, 0]);

  it("suggests mapping an unknown spelling onto the known name it means", async () => {
    expect(isKnownSkill("NextJS Framework")).toBe(false);
    const out = await suggestAliases(Object.keys(vec), embed, 0.9);
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ from: "NextJS Framework", to: "Next.js" });
    expect(out[0].line).toBe('nextjsframework: "nextjs",');
  });

  it("suggests nothing below the threshold", async () => {
    expect(await suggestAliases(Object.keys(vec), embed, 0.9999)).toEqual([]);
  });

  it("never suggests for names the table already knows", async () => {
    const out = await suggestAliases(["React", "React.js", "Vue"], async (t) => t.map(() => [1, 1]));
    expect(out).toEqual([]);
  });
});
