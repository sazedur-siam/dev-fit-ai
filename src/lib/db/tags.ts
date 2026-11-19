import { COLLECTIONS, getDb } from "@/lib/mongodb";

/**
 * Private labels on developers ("available-q1", "wants-backend"). One document
 * per (user, developer, label); scoped by userId like notes.
 */
interface TagDoc {
  userId: string;
  developerId: string;
  label: string;
}

let indexed: Promise<unknown> | null = null;

async function tags() {
  const col = (await getDb()).collection<TagDoc>(COLLECTIONS.tags);
  indexed ??= col
    .createIndex({ userId: 1, developerId: 1, label: 1 }, { unique: true })
    .catch((e) => {
      indexed = null;
      throw e;
    });
  await indexed;
  return col;
}

export async function listTags(userId: string, developerId: string): Promise<string[]> {
  const docs = await (await tags()).find({ userId, developerId }).sort({ label: 1 }).toArray();
  return docs.map((d) => d.label);
}

/** developerId → labels, for filtering the developer list. */
export async function tagsByDeveloper(userId: string): Promise<Record<string, string[]>> {
  const docs = await (await tags()).find({ userId }).sort({ label: 1 }).toArray();
  const out: Record<string, string[]> = {};
  for (const d of docs) (out[d.developerId] ??= []).push(d.label);
  return out;
}

/** Idempotent: adding an existing tag is a no-op. */
export async function addTag(userId: string, developerId: string, label: string): Promise<void> {
  await (await tags()).updateOne(
    { userId, developerId, label },
    { $setOnInsert: { userId, developerId, label } },
    { upsert: true }
  );
}

export async function removeTag(userId: string, developerId: string, label: string): Promise<boolean> {
  const res = await (await tags()).deleteOne({ userId, developerId, label });
  return res.deletedCount === 1;
}
