import { COLLECTIONS, getDb } from "@/lib/mongodb";
import type { RefreshRun } from "@/lib/refresh";

/** One document per nightly refresh, so the admin page can show the last run. */
async function runs() {
  return (await getDb()).collection<RefreshRun>(COLLECTIONS.refreshRuns);
}

export async function recordRefreshRun(run: RefreshRun): Promise<void> {
  await (await runs()).insertOne({ ...run });
}

export async function getLastRefreshRun(): Promise<RefreshRun | null> {
  return (await runs()).findOne({}, { sort: { startedAt: -1 }, projection: { _id: 0 } });
}
