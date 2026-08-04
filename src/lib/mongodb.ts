import { MongoClient, type Db } from "mongodb";

/**
 * Cached connection. Next's dev server re-evaluates modules on every HMR pass,
 * so creating a client per import opens connections until the server refuses
 * them. Stashing the promise on globalThis survives module reloads.
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
  return new MongoClient(uri).connect();
}

export function getMongoClient(): Promise<MongoClient> {
  // Cache in development only; in production the module is evaluated once.
  if (process.env.NODE_ENV === "production") return connect();
  globalForMongo._devfitMongo ??= connect();
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
} as const;
