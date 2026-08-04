import { COLLECTIONS, getDb } from "@/lib/mongodb";
import { maskSecret, openSecret, sealSecret, type SealedSecret } from "@/lib/crypto";
import type { KeyKind, KeyStatus } from "@/lib/types";

interface UserKeyDoc {
  userId: string;
  kind: KeyKind;
  sealed: SealedSecret;
  preview: string;
  updatedAt: Date;
}

async function keys() {
  return (await getDb()).collection<UserKeyDoc>(COLLECTIONS.userKeys);
}

export const KEY_KINDS: KeyKind[] = ["gemini", "github"];

export function isKeyKind(value: unknown): value is KeyKind {
  return typeof value === "string" && KEY_KINDS.includes(value as KeyKind);
}

/**
 * Store (or replace) one credential for one user, encrypted at rest.
 * The plaintext is used to derive a masked preview and is then discarded.
 */
export async function saveUserKey(
  userId: string,
  kind: KeyKind,
  plaintext: string
): Promise<KeyStatus> {
  const value = plaintext.trim();
  if (!value) throw new Error("Key value is empty");

  const col = await keys();
  const now = new Date();
  const doc: UserKeyDoc = {
    userId,
    kind,
    sealed: sealSecret(value),
    preview: maskSecret(value),
    updatedAt: now,
  };
  await col.replaceOne({ userId, kind }, doc, { upsert: true });

  return { kind, isSet: true, preview: doc.preview, updatedAt: now.toISOString() };
}

/**
 * Decrypted key for server-side use. Never send the result to a client.
 * Returns null when unset, so callers can fall back to the process env.
 */
export async function readUserKey(
  userId: string,
  kind: KeyKind
): Promise<string | null> {
  const col = await keys();
  const doc = await col.findOne({ userId, kind });
  if (!doc) return null;
  try {
    return openSecret(doc.sealed);
  } catch {
    // Wrong/rotated ENCRYPTION_KEY, or a tampered document. Treat as unset
    // rather than throwing — the caller's "no key" path is the safe outcome.
    return null;
  }
}

export async function deleteUserKey(
  userId: string,
  kind: KeyKind
): Promise<boolean> {
  const col = await keys();
  const res = await col.deleteOne({ userId, kind });
  return res.deletedCount === 1;
}

/** Safe-to-expose status for every kind, in a stable order. */
export async function getKeyStatuses(userId: string): Promise<KeyStatus[]> {
  const col = await keys();
  const docs = await col.find({ userId }).toArray();
  const byKind = new Map(docs.map((d) => [d.kind, d]));
  return KEY_KINDS.map((kind) => {
    const doc = byKind.get(kind);
    return {
      kind,
      isSet: Boolean(doc),
      preview: doc?.preview ?? null,
      updatedAt: doc?.updatedAt.toISOString() ?? null,
    };
  });
}

/** For the admin table: which kinds each user has stored, values untouched. */
export async function getKeyPresenceByUser(): Promise<
  Record<string, KeyKind[]>
> {
  const col = await keys();
  const docs = await col.find({}, { projection: { userId: 1, kind: 1 } }).toArray();
  const out: Record<string, KeyKind[]> = {};
  for (const doc of docs) {
    (out[doc.userId] ??= []).push(doc.kind);
  }
  return out;
}
