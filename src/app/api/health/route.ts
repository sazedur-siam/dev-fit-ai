import { NextResponse } from "next/server";
import { COLLECTIONS, getDb } from "@/lib/mongodb";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Deployment self-check. Reports which configuration is present and whether the
 * database is reachable, so a broken deploy can be diagnosed from one request
 * instead of hunting through platform logs.
 *
 * Reports booleans and counts only — never a secret value, and never a hostname or
 * connection string. It is intentionally reachable while signed out, because the
 * failures it exists to diagnose stop anyone from signing in at all.
 */

function present(name: string): boolean {
  return Boolean(process.env[name]?.trim());
}

/** Whether ENCRYPTION_KEY is not just present but actually usable. */
function encryptionKeyValid(): boolean {
  const raw = process.env.ENCRYPTION_KEY?.trim();
  if (!raw) return false;
  const buf = /^[0-9a-f]{64}$/i.test(raw)
    ? Buffer.from(raw, "hex")
    : Buffer.from(raw, "base64");
  return buf.length === 32;
}

export async function GET() {
  const env = {
    MONGODB_URI: present("MONGODB_URI"),
    MONGODB_DB: present("MONGODB_DB"),
    NEXTAUTH_SECRET: present("NEXTAUTH_SECRET"),
    NEXTAUTH_URL: present("NEXTAUTH_URL"),
    ENCRYPTION_KEY: present("ENCRYPTION_KEY"),
    ENCRYPTION_KEY_is32Bytes: encryptionKeyValid(),
    ADMIN_EMAIL: present("ADMIN_EMAIL"),
    ADMIN_PASSWORD: present("ADMIN_PASSWORD"),
    GEMINI_MODEL: process.env.GEMINI_MODEL?.trim() || "(default)",
  };

  const problems: string[] = [];
  if (!env.MONGODB_URI) problems.push("MONGODB_URI is not set");
  if (!env.NEXTAUTH_SECRET)
    problems.push("NEXTAUTH_SECRET is not set — every route will 500");
  if (!env.ENCRYPTION_KEY) problems.push("ENCRYPTION_KEY is not set");
  else if (!env.ENCRYPTION_KEY_is32Bytes)
    problems.push("ENCRYPTION_KEY does not decode to 32 bytes");
  if (!env.ADMIN_EMAIL || !env.ADMIN_PASSWORD)
    problems.push("ADMIN_EMAIL / ADMIN_PASSWORD not set — nobody can sign in");
  if (!env.NEXTAUTH_URL)
    problems.push("NEXTAUTH_URL is not set — sign-in may redirect to the wrong host");

  let database: Record<string, unknown> = { reachable: false };
  if (env.MONGODB_URI) {
    try {
      const db = await getDb();
      const [developers, users] = await Promise.all([
        db.collection(COLLECTIONS.developers).countDocuments(),
        db.collection(COLLECTIONS.users).countDocuments(),
      ]);
      database = { reachable: true, name: db.databaseName, developers, users };
      if (developers === 0)
        problems.push("No developers — run `npm run seed` against this database");
      if (users === 0)
        problems.push("No users — run `npm run seed` to create the admin account");
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      database = { reachable: false, error: message.slice(0, 200) };
      problems.push(
        /timed out|ETIMEDOUT|ENOTFOUND/i.test(message)
          ? "Database unreachable — allow 0.0.0.0/0 in MongoDB Atlas Network Access"
          : "Database unreachable"
      );
    }
  }

  return NextResponse.json(
    { ok: problems.length === 0, problems, env, database },
    { status: problems.length === 0 ? 200 : 503 }
  );
}
