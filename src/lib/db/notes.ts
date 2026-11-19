import { ObjectId, type WithId } from "mongodb";
import { COLLECTIONS, getDb } from "@/lib/mongodb";
import type { DeveloperNote } from "@/lib/types";

/**
 * Private notes. **Every query is scoped by userId**, so another user's note id
 * is a miss rather than a leak, admins included.
 */
interface NoteDoc {
  userId: string;
  developerId: string;
  body: string;
  createdAt: Date;
  updatedAt: Date;
}

let indexed: Promise<unknown> | null = null;

async function notes() {
  const col = (await getDb()).collection<NoteDoc>(COLLECTIONS.notes);
  indexed ??= col.createIndex({ userId: 1, developerId: 1, createdAt: -1 }).catch((e) => {
    indexed = null;
    throw e;
  });
  await indexed;
  return col;
}

const toNote = (d: WithId<NoteDoc>): DeveloperNote => ({
  id: d._id.toHexString(),
  developerId: d.developerId,
  body: d.body,
  createdAt: d.createdAt.toISOString(),
  updatedAt: d.updatedAt.toISOString(),
});

export async function listNotes(userId: string, developerId: string): Promise<DeveloperNote[]> {
  const docs = await (await notes()).find({ userId, developerId }).sort({ createdAt: -1 }).toArray();
  return docs.map(toNote);
}

export async function createNote(userId: string, developerId: string, body: string): Promise<DeveloperNote> {
  const now = new Date();
  const doc: NoteDoc = { userId, developerId, body, createdAt: now, updatedAt: now };
  const res = await (await notes()).insertOne(doc);
  return toNote({ ...doc, _id: res.insertedId });
}

export async function updateNote(userId: string, id: string, body: string): Promise<DeveloperNote | null> {
  if (!ObjectId.isValid(id)) return null;
  const doc = await (await notes()).findOneAndUpdate(
    { _id: new ObjectId(id), userId },
    { $set: { body, updatedAt: new Date() } },
    { returnDocument: "after" }
  );
  return doc ? toNote(doc) : null;
}

export async function deleteNote(userId: string, id: string): Promise<boolean> {
  if (!ObjectId.isValid(id)) return false;
  const res = await (await notes()).deleteOne({ _id: new ObjectId(id), userId });
  return res.deletedCount === 1;
}
