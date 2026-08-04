/**
 * Seeds the developer cohort into MongoDB.
 *
 *   npm run seed
 *
 * The cohort source of truth at runtime is the `developers` collection;
 * src/data/developers.ts is only the seed input. Re-running is safe — records are
 * upserted on the business `id`, so this updates in place instead of duplicating.
 *
 * Plain .mjs so it runs on bare node with no TypeScript loader. It reads
 * .env.local itself because it runs outside Next, which is what normally loads it.
 */
import { readFileSync } from "node:fs";
import { MongoClient } from "mongodb";

function loadEnvFile(path) {
  let raw;
  try {
    raw = readFileSync(path, "utf8");
  } catch {
    return;
  }
  for (const line of raw.split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/i);
    if (!match) continue;
    const [, key, rest] = match;
    if (process.env[key] !== undefined) continue; // real env wins
    process.env[key] = rest.trim().replace(/^["']|["']$/g, "");
  }
}

// .env.local takes precedence over .env, matching Next's own order.
loadEnvFile(".env.local");
loadEnvFile(".env");

const uri = process.env.MONGODB_URI;
if (!uri) {
  console.error(
    "MONGODB_URI is not set. Add it to .env.local — see .env.local.example."
  );
  process.exit(1);
}

/**
 * The seed data is TypeScript, which bare node cannot import. Rather than pull in
 * a loader, strip the type-only bits and evaluate the array literal.
 */
async function loadCohort() {
  const source = readFileSync("src/data/developers.ts", "utf8");

  const declaration = source.indexOf("export const DEVELOPERS");
  if (declaration === -1) throw new Error("Could not find DEVELOPERS declaration");

  // Scan from the `=`, not the declaration: the type annotation
  // `: MockDeveloper[] =` contains its own brackets, and starting earlier
  // matches that empty pair instead of the real array literal.
  const equals = source.indexOf("=", declaration);
  if (equals === -1) throw new Error("Could not find DEVELOPERS assignment");

  const start = source.indexOf("[", equals);
  if (start === -1) throw new Error("Could not find DEVELOPERS array literal");

  let depth = 0;
  let end = -1;
  for (let i = start; i < source.length; i += 1) {
    if (source[i] === "[") depth += 1;
    else if (source[i] === "]") {
      depth -= 1;
      if (depth === 0) {
        end = i;
        break;
      }
    }
  }
  if (end === -1) throw new Error("Unbalanced DEVELOPERS array literal");

  const literal = source.slice(start, end + 1);
  return (await import(
    `data:text/javascript,export default ${encodeURIComponent(literal)}`
  )).default;
}

const cohort = await loadCohort();
if (!Array.isArray(cohort) || cohort.length === 0) {
  console.error("Seed data is empty — nothing to do.");
  process.exit(1);
}

const client = new MongoClient(uri);
try {
  await client.connect();
  const db = client.db(process.env.MONGODB_DB || undefined);
  const col = db.collection("developers");

  await col.createIndex({ id: 1 }, { unique: true });

  const result = await col.bulkWrite(
    cohort.map((dev) => ({
      replaceOne: { filter: { id: dev.id }, replacement: dev, upsert: true },
    }))
  );

  console.log(
    `Seeded "${db.databaseName}".developers — ${result.upsertedCount} inserted, ${result.modifiedCount} updated, ${await col.countDocuments()} total.`
  );

  // Bootstrap the single admin. Only ever creates; never overwrites a password
  // the admin has since changed.
  const adminEmail = process.env.ADMIN_EMAIL?.trim().toLowerCase();
  const adminPassword = process.env.ADMIN_PASSWORD;

  if (!adminEmail || !adminPassword) {
    console.log(
      "Skipped admin: set ADMIN_EMAIL and ADMIN_PASSWORD to create the admin account."
    );
  } else {
    const users = db.collection("users");
    await users.createIndex({ email: 1 }, { unique: true });

    const existing = await users.findOne({ email: adminEmail });
    if (existing) {
      if (existing.role !== "admin") {
        await users.updateOne({ _id: existing._id }, { $set: { role: "admin" } });
        console.log(`Admin: promoted existing account ${adminEmail}.`);
      } else {
        console.log(`Admin: ${adminEmail} already exists — password left unchanged.`);
      }
    } else {
      // bcryptjs is a dependency of the app; import it lazily so the developer
      // seed still works if it is ever removed.
      const { default: bcrypt } = await import("bcryptjs");
      await users.insertOne({
        email: adminEmail,
        passwordHash: await bcrypt.hash(adminPassword, 12),
        name: process.env.ADMIN_NAME?.trim() || "Administrator",
        role: "admin",
        createdAt: new Date(),
        lastLoginAt: null,
      });
      console.log(`Admin: created ${adminEmail}.`);
    }
  }
} catch (err) {
  console.error("Seed failed:", err instanceof Error ? err.message : err);
  process.exitCode = 1;
} finally {
  await client.close();
}
