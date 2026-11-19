import { MongoClient, type Db } from "mongodb";

/**
 * One connection promise per process, cached on globalThis.
 *
 * This matters in *both* environments, for different reasons. In development,
 * Next re-evaluates modules on every HMR pass, so a per-import client would open
 * connections until the server refused them. In production — especially
 * serverless — a warm instance handles many requests, and the connection must be
 * reused across them: establishing one costs an SRV lookup, a TLS handshake and a
 * SCRAM exchange, which is hundreds of milliseconds against a remote cluster.
 */
const globalForMongo = globalThis as unknown as {
  _devfitMongo?: Promise<MongoClient>;
};

function connect(): Promise<MongoClient> {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    throw new Error(
      "MONGODB_URI is not set. Add it to .env.local — see .env.local.example."
    );
  }
  return new MongoClient(uri, {
    // The driver defaults to waiting 30s to select a server. On a blocked
    // connection — an IP missing from the Atlas access list, say — that turns
    // "sign in" into a 30s hang and can outlast a serverless function's own
    // timeout, so the request appears to hang forever with no error at all.
    // Failing in a few seconds with a real message is far more useful.
    serverSelectionTimeoutMS: 8000,
    connectTimeoutMS: 8000,
  }).connect();
}

export function getMongoClient(): Promise<MongoClient> {
  // Cache unconditionally. This previously short-circuited in production on the
  // assumption that the module is evaluated once — but the cost is per *call*, not
  // per module load, so every getDb() built a whole new client and reconnected
  // from scratch. A page touching three collections paid for three handshakes, and
  // nothing ever closed them, so the cluster's connection limit was the ceiling.
  if (!globalForMongo._devfitMongo) {
    globalForMongo._devfitMongo = connect().catch((err) => {
      // Never cache a rejection. A failed first connection — a blocked IP, a
      // paused cluster — would otherwise be remembered for the life of the
      // process, so the instance could not recover once the cause was fixed
      // without being recycled. Clearing it lets the next request retry.
      globalForMongo._devfitMongo = undefined;
      throw err;
    });
  }
  return globalForMongo._devfitMongo;
}

export async function getDb(): Promise<Db> {
  const client = await getMongoClient();
  // Falls back to the database encoded in the URI when DB name is omitted.
  return client.db(process.env.MONGODB_DB || undefined);
}

export const COLLECTIONS = {
  users: "users",
  userKeys: "userKeys",
  developers: "developers",
  analyses: "analyses",
  rateLimits: "rateLimits",
  repoDigests: "repoDigests",
  repoRequirements: "repoRequirements",
  refreshRuns: "refreshRuns",
  notes: "notes",
  tags: "tags",
  shortlists: "shortlists",
} as const;
