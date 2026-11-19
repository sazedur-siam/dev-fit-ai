import { COLLECTIONS, getDb } from "@/lib/mongodb";

/**
 * Fixed-window counters, one document per key.
 *
 * They live in MongoDB rather than process memory because serverless hosting runs
 * many instances, each with its own memory. An in-memory counter would let an
 * attacker spread attempts across instances and never reach the limit.
 */
interface RateLimitDoc {
  key: string;
  count: number;
  expiresAt: Date;
}

async function rateLimits() {
  return (await getDb()).collection<RateLimitDoc>(COLLECTIONS.rateLimits);
}

let indexesReady: Promise<unknown> | null = null;

function ensureIndexes() {
  indexesReady ??= rateLimits()
    .then((col) =>
      Promise.all([
        col.createIndex({ key: 1 }, { unique: true }),
        // Mongo's TTL monitor deletes expired windows on its own (roughly once a
        // minute). The counting logic below never relies on that having happened.
        col.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 }),
      ])
    )
    .catch((err) => {
      indexesReady = null; // retry on the next call rather than caching a failure
      throw err;
    });
  return indexesReady;
}

/**
 * Count one hit against `key` and return the count in the current window.
 *
 * A single pipeline update does the whole thing atomically: if the window is still
 * open, increment; if it expired (or the key is new), start a fresh window at 1.
 * Both `$cond`s read the document as it was before the update, so two concurrent
 * requests can't both reset the window.
 */
export async function recordHit(
  key: string,
  windowSec: number,
  now: Date = new Date()
): Promise<{ count: number; expiresAt: Date }> {
  await ensureIndexes();
  const col = await rateLimits();
  const freshExpiry = new Date(now.getTime() + windowSec * 1000);
  const open = { $gt: ["$expiresAt", now] };

  const update = [
    {
      $set: {
        count: { $cond: [open, { $add: ["$count", 1] }, 1] },
        expiresAt: { $cond: [open, "$expiresAt", freshExpiry] },
      },
    },
  ];

  for (let attempt = 0; ; attempt++) {
    try {
      const doc = await col.findOneAndUpdate({ key }, update, {
        upsert: true,
        returnDocument: "after",
      });
      if (!doc) throw new Error("rate limit upsert returned no document");
      return { count: doc.count, expiresAt: doc.expiresAt };
    } catch (err) {
      // Two first-ever hits on the same key can race to insert; the loser gets a
      // duplicate-key error and simply retries as an update.
      const dup = (err as { code?: number }).code === 11000;
      if (!dup || attempt >= 1) throw err;
    }
  }
}

/** Forget a key, e.g. an email's failed-login count after a successful sign-in. */
export async function clearKey(key: string): Promise<void> {
  const col = await rateLimits();
  await col.deleteOne({ key });
}
