import { describe, expect, it } from "vitest";
import {
  buildDeveloper,
  GITHUB_LOGIN,
  githubDeveloperId,
  guessArchetype,
  type GhRepo,
} from "@/lib/githubProfile";
import { ImportDeveloperBodySchema, ProfileAnalyzeBodySchema } from "@/lib/schemas";

function repo(
  name: string,
  total: number,
  sample: { add: number; del: number; msg?: string; at?: string }[],
  languages: [string, number][]
): GhRepo {
  return {
    name,
    pushedAt: "2026-11-01T00:00:00Z",
    languages: {
      totalSize: languages.reduce((a, [, s]) => a + s, 0),
      edges: languages.map(([n, size]) => ({ size, node: { name: n } })),
    },
    defaultBranchRef: {
      target: {
        history: {
          totalCount: total,
          nodes: sample.map((c, i) => ({
            messageHeadline: c.msg ?? `commit ${name} ${i}`,
            committedDate: c.at ?? `2026-10-${String(10 + i).padStart(2, "0")}T00:00:00Z`,
            additions: c.add,
            deletions: c.del,
          })),
        },
      },
    },
  };
}

const user = { id: "U1", login: "Octo-Cat", name: "Octo Cat" };

describe("buildDeveloper", () => {
  const repos = [
    repo("shop", 40, [{ add: 100, del: 20 }, { add: 50, del: 10 }], [["TypeScript", 900], ["CSS", 100]]),
    repo("api", 10, [{ add: 300, del: 0 }], [["Python", 1000]]),
    repo("someone-elses-fork-ish", 0, [], [["Go", 500]]),
    repo("tiny-lang", 5, [{ add: 10, del: 0 }], [["TypeScript", 970], ["Shell", 30]]),
  ];
  const dev = buildDeveloper(user, repos, {
    shop: { packageJson: JSON.stringify({ dependencies: { next: "15" } }) },
    api: { requirementsTxt: "fastapi\n" },
  }, { now: new Date("2026-11-19T00:00:00Z") });

  it("uses a stable, lowercased id and the display name", () => {
    expect(dev.id).toBe("gh-octo-cat");
    expect(dev.name).toBe("Octo Cat");
    expect(dev.source).toBe("github");
    expect(dev.githubLogin).toBe("Octo-Cat");
    expect(dev.importedAt).toBe("2026-11-19T00:00:00.000Z");
  });

  it("drops repos the user never committed to and sorts by commits", () => {
    expect(dev.repos.map((r) => r.name)).toEqual(["shop", "api", "tiny-lang"]);
    expect(dev.totalCommits).toBe(55);
  });

  it("scales sampled line counts up to the repo's commit total", () => {
    // shop: 2 sampled commits, 40 total → ×20.
    const shop = dev.repos[0];
    expect(shop.additions).toBe(150 * 20);
    expect(shop.deletions).toBe(30 * 20);
  });

  it("ignores languages under 5% of a repo", () => {
    expect(dev.repos.find((r) => r.name === "tiny-lang")?.languages).toEqual(["TypeScript"]);
  });

  it("detects frameworks from manifests", () => {
    expect(dev.repos[0].frameworks).toEqual(["Next.js"]);
    expect(dev.repos[1].frameworks).toEqual(["FastAPI"]);
    expect(dev.repos[2].frameworks).toEqual([]);
  });

  it("keeps the 5 most recent unique commit messages", () => {
    expect(dev.recentCommitMessages).toHaveLength(4);
  });

  it("respects an explicit archetype", () => {
    expect(buildDeveloper(user, repos, {}, { archetype: "backend" }).archetype).toBe("backend");
  });

  it("falls back to the login when there's no display name", () => {
    expect(buildDeveloper({ ...user, name: null }, repos, {}).name).toBe("Octo-Cat");
  });
});

describe("guessArchetype", () => {
  it("frontend when bytes are mostly CSS/TSX or React-flavoured TypeScript", () => {
    expect(guessArchetype({ TypeScript: 900, CSS: 100 }, ["React"])).toBe("frontend");
  });
  it("backend when bytes are mostly server languages", () => {
    expect(guessArchetype({ Python: 900, HTML: 50 }, ["Django"])).toBe("backend");
  });
  it("fullstack when both sides carry real weight", () => {
    expect(guessArchetype({ TypeScript: 500, Python: 500 }, ["React", "FastAPI"])).toBe("fullstack");
  });
  it("fullstack when there's no signal at all", () => {
    expect(guessArchetype({}, [])).toBe("fullstack");
  });
});

describe("GitHub usernames", () => {
  it.each(["octocat", "a", "a-b-c", "A1"])("accepts %s", (l) => expect(GITHUB_LOGIN.test(l)).toBe(true));
  it.each(["-a", "a-", "a--b", "a_b", "x".repeat(40), "a/b"])("rejects %s", (l) =>
    expect(GITHUB_LOGIN.test(l)).toBe(false)
  );

  it("id is case-insensitive", () => {
    expect(githubDeveloperId("OctoCat")).toBe(githubDeveloperId("octocat"));
  });

  it.each([
    ["octocat", "octocat"],
    [" @octocat ", "octocat"],
    ["https://github.com/octocat", "octocat"],
    ["github.com/octocat/some-repo", "octocat"],
    ["https://github.com/octocat?tab=repositories", "octocat"],
    ["https://www.github.com/octocat#pinned", "octocat"],
  ])("import and analyzer bodies clean %j to %s", (input, login) => {
    expect(ImportDeveloperBodySchema.parse({ login: input }).login).toBe(login);
    expect(ProfileAnalyzeBodySchema.parse({ login: input }).login).toBe(login);
  });

  it("the analyzer body requires a login", () => {
    expect(ProfileAnalyzeBodySchema.safeParse({ login: "  " }).error?.issues[0]?.message).toBe(
      "GitHub username is required"
    );
  });

  it("archetype defaults to auto and ignores junk", () => {
    expect(ImportDeveloperBodySchema.parse({ login: "a" }).archetype).toBeUndefined();
    expect(ImportDeveloperBodySchema.parse({ login: "a", archetype: "ninja" }).archetype).toBe("auto");
  });
});

describe("guessArchetype: TypeScript attribution", () => {
  it("TypeScript with an Express backend and no UI framework is backend", () => {
    expect(guessArchetype({ TypeScript: 1000 }, ["Express", "Prisma"])).toBe("backend");
  });
  it("a Next.js + tRPC monorepo is fullstack", () => {
    expect(guessArchetype({ TypeScript: 1000 }, ["Next.js", "tRPC"])).toBe("fullstack");
  });
});
