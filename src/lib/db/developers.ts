import { COLLECTIONS, getDb } from "@/lib/mongodb";
import { DEVELOPERS } from "@/data/developers";
import { toView } from "@/lib/developerHelpers";
import type { DeveloperView, MockDeveloper } from "@/lib/types";

type DeveloperDoc = MockDeveloper;

async function developers() {
  return (await getDb()).collection<DeveloperDoc>(COLLECTIONS.developers);
}

/**
 * The cohort now lives in MongoDB. `src/data/developers.ts` is retained purely as
 * the seed source — see `npm run seed`.
 */
export async function getAllDevelopers(): Promise<DeveloperView[]> {
  const col = await developers();
  const docs = await col.find({}, { projection: { _id: 0 } }).toArray();
  return docs.map((doc) => toView(doc));
}

export async function getDeveloperById(
  id: string
): Promise<DeveloperView | undefined> {
  const col = await developers();
  const doc = await col.findOne({ id }, { projection: { _id: 0 } });
  return doc ? toView(doc) : undefined;
}

export async function countDevelopers(): Promise<number> {
  const col = await developers();
  return col.countDocuments();
}

/**
 * Idempotent seed, keyed on the business `id` so re-running it updates in place
 * rather than duplicating the cohort.
 */
export async function seedDevelopers(
  cohort: MockDeveloper[] = DEVELOPERS
): Promise<{ upserted: number; matched: number }> {
  const col = await developers();
  await col.createIndex({ id: 1 }, { unique: true });

  const result = await col.bulkWrite(
    cohort.map((dev) => ({
      replaceOne: { filter: { id: dev.id }, replacement: dev, upsert: true },
    }))
  );

  return {
    upserted: result.upsertedCount,
    matched: result.matchedCount,
  };
}
