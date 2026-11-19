import { ObjectId, type WithId } from "mongodb";
import { COLLECTIONS, getDb } from "@/lib/mongodb";
import type { Shortlist } from "@/lib/types";

/** Named lists of developers, private to their owner. */
interface ShortlistDoc {
  userId: string;
  name: string;
  analysisId: string | null;
  developerIds: string[];
  createdAt: Date;
  updatedAt: Date;
}

let indexed: Promise<unknown> | null = null;

async function shortlists() {
  const col = (await getDb()).collection<ShortlistDoc>(COLLECTIONS.shortlists);
  indexed ??= col.createIndex({ userId: 1, updatedAt: -1 }).catch((e) => {
    indexed = null;
    throw e;
  });
  await indexed;
  return col;
}

const toShortlist = (d: WithId<ShortlistDoc>): Shortlist => ({
  id: d._id.toHexString(),
  name: d.name,
  analysisId: d.analysisId,
  developerIds: d.developerIds,
  createdAt: d.createdAt.toISOString(),
  updatedAt: d.updatedAt.toISOString(),
});

export async function listShortlists(userId: string): Promise<Shortlist[]> {
  const docs = await (await shortlists()).find({ userId }).sort({ updatedAt: -1 }).toArray();
  return docs.map(toShortlist);
}

export async function createShortlist(
  userId: string,
  input: { name: string; analysisId?: string | null; developerIds?: string[] }
): Promise<Shortlist> {
  const now = new Date();
  const doc: ShortlistDoc = {
    userId,
    name: input.name,
    analysisId: input.analysisId ?? null,
    developerIds: [...new Set(input.developerIds ?? [])],
    createdAt: now,
    updatedAt: now,
  };
  const res = await (await shortlists()).insertOne(doc);
  return toShortlist({ ...doc, _id: res.insertedId });
}

/**
 * Rename, add a developer, or remove one. `add` and `remove` are exclusive per
 * call: $addToSet and $pull can't target the same field in one update.
 */
export async function updateShortlist(
  userId: string,
  id: string,
  change: { name?: string; add?: string; remove?: string }
): Promise<Shortlist | null> {
  if (!ObjectId.isValid(id)) return null;
  const set: Partial<ShortlistDoc> = { updatedAt: new Date() };
  if (change.name !== undefined) set.name = change.name;

  const update =
    change.add !== undefined
      ? { $set: set, $addToSet: { developerIds: change.add } }
      : change.remove !== undefined
        ? { $set: set, $pull: { developerIds: change.remove } }
        : { $set: set };

  const doc = await (await shortlists()).findOneAndUpdate(
    { _id: new ObjectId(id), userId },
    update,
    { returnDocument: "after" }
  );
  return doc ? toShortlist(doc) : null;
}

export async function deleteShortlist(userId: string, id: string): Promise<boolean> {
  if (!ObjectId.isValid(id)) return false;
  const res = await (await shortlists()).deleteOne({ _id: new ObjectId(id), userId });
  return res.deletedCount === 1;
}
