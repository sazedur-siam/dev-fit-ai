/**
 * Re-import every GitHub developer whose refresh date has passed.
 *
 *   npm run refresh            # locally, reads .env.local / .env
 *
 * Runs nightly from .github/workflows/refresh.yml. Needs MONGODB_URI (and
 * MONGODB_DB) plus a GitHub token in GITHUB_REFRESH_TOKEN, falling back to
 * GITHUB_TOKEN. With either missing it logs why and exits 0, so the scheduled
 * workflow stays green until it's configured.
 */
import { getLastRefreshRun, recordRefreshRun } from "@/lib/db/refreshRuns";
import { listDueForRefresh, postponeRefresh, upsertDeveloper } from "@/lib/db/developers";
import { fetchGithubDeveloper, getRateLimitRemaining } from "@/lib/githubProfile";
import { getMongoClient } from "@/lib/mongodb";
import { runRefresh } from "@/lib/refresh";

// Real environment wins; local files fill gaps, in Next's order.
for (const file of [".env.local", ".env"]) {
  try {
    process.loadEnvFile(file);
  } catch {
    // file absent: fine
  }
}

async function main(): Promise<number> {
  const token = (process.env.GITHUB_REFRESH_TOKEN || process.env.GITHUB_TOKEN || "").trim();
  if (!process.env.MONGODB_URI || !token) {
    console.log(
      "Refresh skipped: set MONGODB_URI and GITHUB_REFRESH_TOKEN (or GITHUB_TOKEN). See docs in CLAUDE.md → Real developers."
    );
    return 0;
  }

  const previous = await getLastRefreshRun();
  if (previous) console.log(`Previous run: ${previous.startedAt}, ${previous.refreshed} refreshed.`);

  const run = await runRefresh({
    listDue: listDueForRefresh,
    fetchDeveloper: (dev) => fetchGithubDeveloper(dev.githubLogin ?? "", token),
    save: async (dev) => {
      await upsertDeveloper(dev);
    },
    postpone: postponeRefresh,
    rateLimitRemaining: getRateLimitRemaining,
    log: (line) => console.log(line),
  });
  await recordRefreshRun(run);

  console.log(
    `Done: ${run.due} due, ${run.refreshed} refreshed, ${run.failed} failed` +
      (run.stoppedForRateLimit ? ", stopped early for the GitHub rate limit." : ".")
  );
  // Individual failures are expected (deleted accounts); only a crash fails the job.
  return 0;
}

/**
 * Close the cached client if one was opened. getMongoClient() throws
 * synchronously without MONGODB_URI, so it's only called when one is set.
 */
async function closeDb(): Promise<void> {
  if (!process.env.MONGODB_URI) return;
  try {
    await (await getMongoClient()).close();
  } catch {
    // never connected, or already closed
  }
}

main()
  .then(async (code) => {
    await closeDb();
    process.exit(code);
  })
  .catch(async (err) => {
    console.error("Refresh crashed:", err);
    await closeDb();
    process.exit(1);
  });
