import { describe, expect, it } from "vitest";
import { poolDecision } from "@/lib/profilePool";
import type { MockDeveloper } from "@/lib/types";

const fromReport: MockDeveloper = {
  id: "gh-octo",
  name: "Octo",
  archetype: "fullstack",
  totalCommits: 10,
  linesAdded: 100,
  linesDeleted: 10,
  repos: [{ name: "api", commits: 10, additions: 100, deletions: 10, languages: ["Go"] }],
  recentCommitMessages: [],
  source: "github",
  githubLogin: "octo",
  importedAt: "2026-11-19T10:00:00.000Z",
};

describe("poolDecision", () => {
  it("adds a new developer, recording who added them", () => {
    const d = poolDecision(fromReport, undefined, "pm1");
    expect(d).toEqual({ action: "save", doc: { ...fromReport, addedBy: "pm1" } });
  });

  it("keeps a hand-set archetype and the original adder on update", () => {
    const d = poolDecision(
      fromReport,
      { archetype: "backend", addedBy: "admin1", importedAt: "2026-11-01T00:00:00.000Z" },
      "pm1"
    );
    expect(d).toMatchObject({ action: "save", doc: { archetype: "backend", addedBy: "admin1" } });
  });

  it("never rolls the pool back to an older report", () => {
    const d = poolDecision(fromReport, { archetype: "backend", importedAt: "2026-11-20T00:00:00.000Z" }, "pm1");
    expect(d).toEqual({ action: "keep" });
  });

  it("refuses someone with nothing to score", () => {
    const d = poolDecision({ ...fromReport, repos: [] }, undefined, "pm1");
    expect(d).toMatchObject({ action: "refuse" });
    expect(d.action === "refuse" && d.reason).toContain("octo has no commits");
  });
});
