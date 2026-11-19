import type { MockDeveloper } from "@/lib/types";

/**
 * What "Add to developer pool" does with a report's developer, given whoever is
 * already in the pool under that id. Pure, so the rules are tested without a DB.
 *
 * - Nothing to score (no authored commits in own public repos) → refuse.
 * - The pool already holds a **newer** import (the nightly refresh, or a later
 *   analysis by someone else) → keep it rather than roll it back.
 * - Otherwise save the report's developer, but keep the pool's archetype (an
 *   admin may have set it by hand, the same rule as refresh) and its original
 *   `addedBy`.
 */
export type PoolDecision =
  | { action: "refuse"; reason: string }
  | { action: "keep" }
  | { action: "save"; doc: MockDeveloper };

export function poolDecision(
  fromReport: MockDeveloper,
  existing: Pick<MockDeveloper, "archetype" | "addedBy" | "importedAt"> | undefined,
  userId: string
): PoolDecision {
  if (fromReport.repos.length === 0) {
    return {
      action: "refuse",
      reason: `${fromReport.githubLogin ?? fromReport.name} has no commits in their own public repositories, so there's nothing to score.`,
    };
  }
  if (existing?.importedAt && fromReport.importedAt && existing.importedAt > fromReport.importedAt) {
    return { action: "keep" };
  }
  return {
    action: "save",
    doc: {
      ...fromReport,
      archetype: existing?.archetype ?? fromReport.archetype,
      addedBy: existing?.addedBy ?? userId,
    },
  };
}
