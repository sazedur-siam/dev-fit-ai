import { describe, expect, it, vi } from "vitest";
import { nextRefreshDate } from "@/lib/githubProfile";
import { REFRESH_LIMITS, runRefresh, type RefreshDeps } from "@/lib/refresh";
import type { MockDeveloper } from "@/lib/types";

const NOW = new Date("2026-11-19T01:00:00Z");
const days = (n: number) => new Date(NOW.getTime() - n * 86_400_000).toISOString();

function dev(id: string, over: Partial<MockDeveloper> = {}): MockDeveloper {
  return {
    id,
    name: id,
    archetype: "backend",
    totalCommits: 1,
    linesAdded: 1,
    linesDeleted: 0,
    repos: [],
    recentCommitMessages: [],
    source: "github",
    githubLogin: id,
    ...over,
  };
}

function deps(over: Partial<RefreshDeps> = {}): RefreshDeps {
  return {
    listDue: vi.fn(async () => [dev("a"), dev("b")]),
    fetchDeveloper: vi.fn(async (d: MockDeveloper) => ({ ...d, archetype: "frontend" as const, totalCommits: 99 })),
    save: vi.fn(async () => {}),
    postpone: vi.fn(async () => {}),
    rateLimitRemaining: () => 5000,
    now: () => NOW,
    ...over,
  };
}

describe("nextRefreshDate", () => {
  it.each([
    [days(3), 7],
    [days(60), 14],
    [days(400), 30],
    [undefined, 30],
  ])("last commit %s → refresh in %d days", (last, interval) => {
    expect(nextRefreshDate(last, NOW).getTime() - NOW.getTime()).toBe(interval * 86_400_000);
  });
});

describe("runRefresh", () => {
  it("refreshes every due developer and keeps their archetype", async () => {
    const d = deps();
    const run = await runRefresh(d);
    expect(run).toMatchObject({ due: 2, refreshed: 2, failed: 0, stoppedForRateLimit: false });
    expect(d.save).toHaveBeenCalledTimes(2);
    const saved = vi.mocked(d.save).mock.calls[0][0];
    expect(saved.totalCommits).toBe(99); // fresh data
    expect(saved.archetype).toBe("backend"); // not the re-guessed "frontend"
  });

  it("asks for at most maxPerRun developers", async () => {
    const d = deps();
    await runRefresh(d);
    expect(d.listDue).toHaveBeenCalledWith(NOW, REFRESH_LIMITS.maxPerRun);
  });

  it("postpones a failing developer and carries on with the rest", async () => {
    const d = deps({
      fetchDeveloper: vi.fn(async (x: MockDeveloper) => {
        if (x.id === "a") throw new Error("GitHub 404 — no GitHub user named \"a\"");
        return x;
      }),
    });
    const run = await runRefresh(d);
    expect(run).toMatchObject({ refreshed: 1, failed: 1 });
    expect(d.postpone).toHaveBeenCalledWith(
      "a",
      new Date(NOW.getTime() + REFRESH_LIMITS.failureBackoffDays * 86_400_000),
      expect.stringContaining("404")
    );
  });

  it("stops early when the GitHub budget runs low, leaving the rest due", async () => {
    let remaining = 600;
    const d = deps({
      fetchDeveloper: vi.fn(async (x: MockDeveloper) => {
        remaining -= 200; // each import spends points
        return x;
      }),
      rateLimitRemaining: () => remaining,
    });
    const run = await runRefresh(d);
    expect(run).toMatchObject({ refreshed: 1, stoppedForRateLimit: true });
    expect(d.postpone).not.toHaveBeenCalled();
  });

  it("is a no-op with nothing due", async () => {
    const d = deps({ listDue: vi.fn(async () => []) });
    expect(await runRefresh(d)).toMatchObject({ due: 0, refreshed: 0, failed: 0 });
  });
});
