import { describe, expect, it } from "vitest";
import {
  buildProfileInsights,
  calendarStats,
  ossContributions,
  safeWebsite,
  type GhProfile,
} from "@/lib/githubInsights";

const days = (counts: number[], start = "2026-11-01") =>
  counts.map((count, i) => {
    const d = new Date(`${start}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() + i);
    return { date: d.toISOString().slice(0, 10), count };
  });

const pr = (owner: string, name: string, opts: { private?: boolean; mergedAt?: string; stars?: number; title?: string } = {}) => ({
  title: opts.title ?? `PR to ${name}`,
  url: `https://github.com/${owner}/${name}/pull/1`,
  mergedAt: opts.mergedAt ?? "2026-10-01T00:00:00Z",
  repository: {
    nameWithOwner: `${owner}/${name}`,
    url: `https://github.com/${owner}/${name}`,
    stargazerCount: opts.stars ?? 10,
    isPrivate: opts.private ?? false,
    owner: { login: owner },
  },
});

function profile(overrides: Partial<GhProfile> = {}): GhProfile {
  return {
    login: "Octo",
    name: "  The Octo  ",
    bio: "",
    company: null,
    location: "Dhaka",
    websiteUrl: "octo.dev",
    twitterUsername: null,
    avatarUrl: "https://avatars.githubusercontent.com/u/1?v=4",
    url: "https://github.com/Octo",
    createdAt: "2016-11-19T00:00:00Z",
    followers: { totalCount: 12 },
    following: { totalCount: 3 },
    organizations: { nodes: [{ login: "acme", name: null, url: "https://github.com/acme" }, null] },
    pinnedItems: {
      nodes: [
        { nameWithOwner: "Octo/public", url: "https://github.com/Octo/public", stargazerCount: 5, isPrivate: false, primaryLanguage: { name: "Go" } },
        { nameWithOwner: "Octo/secret", url: "https://github.com/Octo/secret", stargazerCount: 0, isPrivate: true },
        {},
      ],
    },
    ownedRepos: { totalCount: 3, nodes: [{ stargazerCount: 7, forkCount: 1 }, { stargazerCount: 3, forkCount: 2 }, null] },
    recentRepos: {
      nodes: [
        {
          name: "api",
          url: "https://github.com/Octo/api",
          description: " An API ",
          stargazerCount: 7,
          forkCount: 1,
          isArchived: false,
          pushedAt: "2026-11-01T00:00:00Z",
          licenseInfo: { spdxId: "NOASSERTION" },
          repositoryTopics: { nodes: [{ topic: { name: "rest" } }, null] },
        },
      ],
    },
    contributionsCollection: {
      totalCommitContributions: 40,
      totalPullRequestContributions: 5,
      totalIssueContributions: 2,
      totalPullRequestReviewContributions: 9,
      restrictedContributionsCount: 4,
      contributionCalendar: {
        totalContributions: 60,
        weeks: [{ contributionDays: [{ date: "2026-11-02", contributionCount: 0 }, { date: "2026-11-01", contributionCount: 3 }] }],
      },
    },
    pullRequests: { totalCount: 3, nodes: [pr("Octo", "own"), pr("vercel", "next.js"), null] },
    ...overrides,
  };
}

describe("calendarStats", () => {
  it("counts active days and the longest run", () => {
    const s = calendarStats(days([1, 2, 0, 1, 1, 1, 0]));
    expect(s.activeDays).toBe(5);
    expect(s.longestStreak).toBe(3);
  });

  it("a current streak survives today having no contributions yet", () => {
    expect(calendarStats(days([0, 1, 1, 0])).currentStreak).toBe(2);
    expect(calendarStats(days([0, 1, 1, 1])).currentStreak).toBe(3);
    expect(calendarStats(days([1, 0, 0])).currentStreak).toBe(0);
  });

  it("handles an empty or silent calendar", () => {
    expect(calendarStats([])).toEqual({ activeDays: 0, longestStreak: 0, currentStreak: 0, busiestWeekday: null });
    expect(calendarStats(days([0, 0])).busiestWeekday).toBeNull();
  });

  it("finds the busiest weekday by contributions, not by active days", () => {
    // 2026-11-01 is a Sunday.
    expect(calendarStats(days([1, 9, 1])).busiestWeekday).toBe("Monday");
  });
});

describe("ossContributions", () => {
  it("drops own repos (any case) and private repos, then groups by repository", () => {
    const out = ossContributions("octo", [
      pr("Octo", "mine"),
      pr("corp", "internal", { private: true }),
      pr("vercel", "next.js", { mergedAt: "2026-01-01T00:00:00Z", title: "old" }),
      pr("vercel", "next.js", { mergedAt: "2026-05-01T00:00:00Z", title: "newest" }),
      pr("facebook", "react", { stars: 999 }),
      null,
    ]);
    expect(out.map((o) => o.repo)).toEqual(["vercel/next.js", "facebook/react"]);
    expect(out[0]).toMatchObject({ mergedCount: 2, lastMergedAt: "2026-05-01T00:00:00Z", example: "newest" });
  });

  it("orders ties by stars", () => {
    const out = ossContributions("me", [pr("a", "small", { stars: 1 }), pr("b", "big", { stars: 50 })]);
    expect(out.map((o) => o.repo)).toEqual(["b/big", "a/small"]);
  });
});

describe("safeWebsite", () => {
  it("adds https to a bare domain and keeps http(s)", () => {
    expect(safeWebsite("octo.dev")).toBe("https://octo.dev/");
    expect(safeWebsite("http://octo.dev/blog")).toBe("http://octo.dev/blog");
  });

  it("drops other schemes and junk", () => {
    expect(safeWebsite("javascript:alert(1)")).toBeNull();
    expect(safeWebsite("mailto:a@b.c")).toBeNull();
    expect(safeWebsite("   ")).toBeNull();
    expect(safeWebsite(null)).toBeNull();
  });
});

describe("buildProfileInsights", () => {
  const now = new Date("2026-11-19T00:00:00Z");

  it("maps identity, totals and activity", () => {
    const i = buildProfileInsights(profile(), now);
    expect(i).toMatchObject({
      login: "Octo",
      name: "The Octo",
      bio: null,
      websiteUrl: "https://octo.dev/",
      accountAgeYears: 10,
      followers: 12,
      publicRepos: 3,
      starsEarned: 10,
      forksEarned: 3,
      organizations: [{ login: "acme", name: null, url: "https://github.com/acme" }],
    });
    expect(i.activity).toMatchObject({ totalContributions: 60, commits: 40, reviews: 9, privateContributions: 4 });
  });

  it("sorts the calendar by date", () => {
    expect(buildProfileInsights(profile(), now).activity.calendar.map((d) => d.date)).toEqual([
      "2026-11-01",
      "2026-11-02",
    ]);
  });

  it("never names a private pinned repo", () => {
    expect(buildProfileInsights(profile(), now).pinned.map((p) => p.nameWithOwner)).toEqual(["Octo/public"]);
  });

  it("counts only outside, public contributions", () => {
    expect(buildProfileInsights(profile(), now).openSource).toMatchObject({ sampled: 2, externalMerged: 1 });
  });

  it("cleans repository details", () => {
    expect(buildProfileInsights(profile(), now).repoDetails[0]).toMatchObject({
      description: "An API",
      license: null,
      topics: ["rest"],
    });
  });
});
