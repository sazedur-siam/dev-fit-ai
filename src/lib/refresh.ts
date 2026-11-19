import type { MockDeveloper } from "@/lib/types";

/**
 * The nightly refresh of imported developers, with its I/O injected so the loop
 * itself is testable. `scripts/refresh-developers.ts` wires it to MongoDB and
 * GitHub; GitHub Actions runs that on a schedule.
 *
 * The rules:
 * - Only `source: "github"` developers whose `nextRefreshAt` has passed (or is
 *   missing) are due, oldest first, capped per run.
 * - The **archetype is kept**, not re-guessed: an admin may have set it by hand,
 *   and a profile flipping between frontend and fullstack overnight helps nobody.
 * - A developer whose account is gone (GitHub 404) keeps their last profile and
 *   is pushed back 30 days, so one deleted account doesn't fail every night.
 * - The run stops early when the token's GraphQL budget gets low; whoever is
 *   left is still due tomorrow.
 */

export const REFRESH_LIMITS = {
  maxPerRun: 100,
  /** Stop before the token's remaining GraphQL points drop below this. */
  minRateLimitRemaining: 500,
  /** Push-back after a failure, so one bad account doesn't retry every night. */
  failureBackoffDays: 30,
} as const;

export interface RefreshDeps {
  listDue: (now: Date, limit: number) => Promise<MockDeveloper[]>;
  fetchDeveloper: (dev: MockDeveloper) => Promise<MockDeveloper>;
  save: (dev: MockDeveloper) => Promise<void>;
  /** Push a failed developer's next attempt back without changing their data. */
  postpone: (id: string, until: Date, error: string) => Promise<void>;
  rateLimitRemaining: () => number | null;
  now?: () => Date;
  log?: (line: string) => void;
}

export interface RefreshRun {
  startedAt: string;
  finishedAt: string;
  due: number;
  refreshed: number;
  failed: number;
  stoppedForRateLimit: boolean;
}

export async function runRefresh(deps: RefreshDeps): Promise<RefreshRun> {
  const now = deps.now ?? (() => new Date());
  const log = deps.log ?? (() => {});
  const started = now();
  const due = await deps.listDue(started, REFRESH_LIMITS.maxPerRun);
  let refreshed = 0;
  let failed = 0;
  let stoppedForRateLimit = false;

  for (const dev of due) {
    const remaining = deps.rateLimitRemaining();
    if (remaining !== null && remaining < REFRESH_LIMITS.minRateLimitRemaining) {
      stoppedForRateLimit = true;
      log(`stopping: ${remaining} GraphQL points left; ${due.length - refreshed - failed} left for tomorrow`);
      break;
    }
    try {
      const fresh = await deps.fetchDeveloper(dev);
      // Keep what a person decided: a hand-set archetype, and who added them.
      await deps.save({
        ...fresh,
        archetype: dev.archetype,
        ...(dev.addedBy ? { addedBy: dev.addedBy } : {}),
      });
      refreshed += 1;
      log(`refreshed ${dev.id}`);
    } catch (err) {
      failed += 1;
      const message = err instanceof Error ? err.message : String(err);
      const until = new Date(now().getTime() + REFRESH_LIMITS.failureBackoffDays * 86_400_000);
      await deps.postpone(dev.id, until, message).catch(() => {});
      log(`failed ${dev.id}: ${message}`);
    }
  }

  return {
    startedAt: started.toISOString(),
    finishedAt: now().toISOString(),
    due: due.length,
    refreshed,
    failed,
    stoppedForRateLimit,
  };
}
