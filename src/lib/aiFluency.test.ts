import { describe, expect, it } from "vitest";
import { AI_CONFIG_PATHS, computeAiFluency, detectAiTools, tierFor } from "@/lib/aiFluency";
import { AI_FLUENCY_TIERS } from "@/lib/config";
import { buildDeveloper } from "@/lib/githubProfile";
import type { DeveloperRepo, MockDeveloper } from "@/lib/types";

const repo = (name: string, aiTools?: string[]): DeveloperRepo => ({
  name,
  commits: 10,
  additions: 100,
  deletions: 10,
  languages: ["TypeScript"],
  ...(aiTools ? { aiTools } : {}),
});

const dev = (repos: DeveloperRepo[], source: MockDeveloper["source"] = "github"): MockDeveloper => ({
  id: "gh-x",
  name: "X",
  archetype: "fullstack",
  totalCommits: 10,
  linesAdded: 100,
  linesDeleted: 10,
  repos,
  recentCommitMessages: [],
  source,
});

describe("detectAiTools", () => {
  it("maps config paths to tools, any path counts", () => {
    expect(detectAiTools(new Set(["CLAUDE.md", ".cursor/rules", "AGENTS.md"]))).toEqual([
      "claude-code",
      "cursor",
      "agents-md",
    ]);
    expect(detectAiTools(new Set([".claude"]))).toEqual(["claude-code"]);
    expect(detectAiTools(new Set())).toEqual([]);
  });

  it("probes every path exactly once", () => {
    expect(new Set(AI_CONFIG_PATHS).size).toBe(AI_CONFIG_PATHS.length);
  });
});

describe("computeAiFluency", () => {
  it("is null for sample developers and for imports made before detection", () => {
    expect(computeAiFluency(dev([repo("a", ["claude-code"])], "seed"))).toBeNull();
    expect(computeAiFluency(dev([repo("a"), repo("b")]))).toBeNull();
  });

  it("is 0 / none when checked and nothing was found", () => {
    expect(computeAiFluency(dev([repo("a", []), repo("b", [])]))).toMatchObject({
      score: 0,
      tier: "none",
      tools: [],
    });
  });

  it("scores adoption by tool weight and consistency by share of repos", () => {
    // Claude Code (8) + AGENTS.md (4) = 12 × 2.5 = 30 adoption; 2 of 4 repos → 20.
    const out = computeAiFluency(
      dev([repo("a", ["claude-code", "agents-md"]), repo("b", ["claude-code"]), repo("c", []), repo("d", [])])
    );
    expect(out).toMatchObject({ score: 50, tier: "proficient", reposWithConfig: 2, reposMeasured: 4 });
    expect(out?.tools).toEqual([
      { id: "claude-code", label: "Claude Code", repos: ["a", "b"] },
      { id: "agents-md", label: "AGENTS.md", repos: ["a"] },
    ]);
  });

  it("gives a bonus for 3+ tools and caps adoption", () => {
    const many = ["claude-code", "cursor", "aider", "copilot", "windsurf"];
    const out = computeAiFluency(dev([repo("a", many)]));
    expect(out?.score).toBe(100); // 50 (capped) + 10 bonus + 40 consistency
    expect(out?.tier).toBe("elite");
  });

  it("ranks more tools above fewer", () => {
    const one = computeAiFluency(dev([repo("a", ["copilot"])]))!;
    const two = computeAiFluency(dev([repo("a", ["copilot", "cursor"])]))!;
    expect(two.score).toBeGreaterThan(one.score);
  });

  it("is deterministic", () => {
    const d = dev([repo("a", ["cursor"]), repo("b", [])]);
    expect(computeAiFluency(d)).toEqual(computeAiFluency(d));
  });
});

describe("tierFor", () => {
  it("uses the floors from config", () => {
    expect(tierFor(AI_FLUENCY_TIERS.emerging - 0.1)).toBe("none");
    expect(tierFor(AI_FLUENCY_TIERS.emerging)).toBe("emerging");
    expect(tierFor(AI_FLUENCY_TIERS.proficient)).toBe("proficient");
    expect(tierFor(AI_FLUENCY_TIERS.advanced)).toBe("advanced");
    expect(tierFor(AI_FLUENCY_TIERS.elite)).toBe("elite");
  });
});

describe("import wiring", () => {
  it("buildDeveloper gives every profile repo an aiTools array when detection ran", () => {
    const ghRepo = (name: string) => ({
      name,
      pushedAt: null,
      languages: { totalSize: 1, edges: [{ size: 1, node: { name: "TypeScript" } }] },
      defaultBranchRef: {
        target: {
          history: {
            totalCount: 1,
            nodes: [{ messageHeadline: "m", committedDate: "2026-11-01T00:00:00Z", additions: 1, deletions: 0 }],
          },
        },
      },
    });
    const built = buildDeveloper({ id: "U", login: "x", name: null }, [ghRepo("a"), ghRepo("b")], {}, {
      aiToolsByRepo: { a: ["cursor"] },
    });
    expect(built.repos.map((r) => r.aiTools)).toEqual([["cursor"], []]);
  });
});
