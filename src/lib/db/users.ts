import { ObjectId, type WithId } from "mongodb";
import bcrypt from "bcryptjs";
import { COLLECTIONS, getDb } from "@/lib/mongodb";
import type { AccountSource, AppUser, Role } from "@/lib/types";

interface UserDoc {
  email: string; // stored lowercase; unique
  /** Null for an account that has only ever signed in with Google. */
  passwordHash: string | null;
  name: string | null;
  role: Role;
  createdAt: Date;
  lastLoginAt: Date | null;
  /** Absent on accounts created before self-registration existed — see sourceOf(). */
  source?: AccountSource;
  /** Google's stable `sub` claim, once the account has signed in with Google. */
  googleId?: string;
  /**
   * Whether ownership of `email` has been proven. Only Google proves it — there is
   * no email-sending flow — so a self-registered account stays unverified until
   * its owner signs in with Google.
   */
  emailVerified?: boolean;
}

/** bcrypt work factor. 12 is ~250ms on modern hardware — deliberate. */
const BCRYPT_ROUNDS = 12;

export const MIN_PASSWORD_LENGTH = 8;

/**
 * Accounts that predate self-registration carry no `source`. Every one of them was
 * made by the seed script or an admin, so they are treated as admin-created.
 */
function sourceOf(doc: UserDoc): AccountSource {
  return doc.source ?? (doc.role === "admin" ? "bootstrap" : "admin");
}

function toAppUser(doc: WithId<UserDoc>): AppUser {
  return {
    id: doc._id.toHexString(),
    email: doc.email,
    name: doc.name ?? null,
    role: doc.role,
    source: sourceOf(doc),
    hasPassword: Boolean(doc.passwordHash),
    hasGoogle: Boolean(doc.googleId),
    createdAt: doc.createdAt.toISOString(),
    lastLoginAt: doc.lastLoginAt ? doc.lastLoginAt.toISOString() : null,
  };
}

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function isValidEmail(email: string): boolean {
  // Deliberately permissive. Nothing sends mail to this address, so a stricter
  // pattern would only reject real addresses without proving anything.
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
}

/**
 * Index creation is memoised per process. It used to run on every call, adding a
 * round trip to every user lookup — and `getCurrentUser()` runs on every page, so
 * each navigation paid for it. `createIndex` is idempotent but not free.
 */
let emailIndexReady: Promise<unknown> | null = null;

async function users() {
  const col = (await getDb()).collection<UserDoc>(COLLECTIONS.users);
  if (!emailIndexReady) {
    emailIndexReady = col.createIndex({ email: 1 }, { unique: true }).catch((err) => {
      // Don't cache a failure — a transient error would otherwise leave the
      // collection permanently unindexed for this process.
      emailIndexReady = null;
      throw err;
    });
  }
  await emailIndexReady;
  return col;
}

export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, BCRYPT_ROUNDS);
}

/**
 * Bootstraps the single admin from ADMIN_EMAIL / ADMIN_PASSWORD.
 *
 * Idempotent, and it will not clobber a password the admin later changed: the
 * hash is only written when the account is first created. Returns null when the
 * env vars are absent, so a misconfigured deployment fails at the login screen
 * with a clear message rather than at import time.
 */
export async function ensureAdminSeeded(): Promise<AppUser | null> {
  const email = process.env.ADMIN_EMAIL && normalizeEmail(process.env.ADMIN_EMAIL);
  const password = process.env.ADMIN_PASSWORD;
  if (!email || !password) return null;

  const col = await users();
  const existing = await col.findOne({ email });
  if (existing) {
    // Keep the role correct even if it was changed in the database by hand.
    if (existing.role !== "admin") {
      await col.updateOne({ _id: existing._id }, { $set: { role: "admin" } });
      existing.role = "admin";
    }
    return toAppUser(existing);
  }

  const doc: UserDoc = {
    email,
    passwordHash: await hashPassword(password),
    name: process.env.ADMIN_NAME?.trim() || "Administrator",
    role: "admin",
    createdAt: new Date(),
    lastLoginAt: null,
    source: "bootstrap",
  };
  const res = await col.insertOne(doc);
  return toAppUser({ ...doc, _id: res.insertedId });
}

/** A syntactically valid hash that matches nothing, for constant-time misses. */
const DUMMY_HASH = "$2b$12$invalidinvalidinvalidinvalidinvalidinvalidinvalidinvalidinv";

/**
 * Verify an email/password pair. Returns null on any failure — unknown email and
 * wrong password are indistinguishable to the caller, so the login form cannot be
 * used to enumerate accounts.
 */
export async function verifyCredentials(
  emailInput: string,
  password: string
): Promise<AppUser | null> {
  const email = normalizeEmail(emailInput);
  const col = await users();

  let doc = await col.findOne({ email });

  // Self-heal: if the configured admin has never been created (seed not run),
  // create it on their first sign-in attempt rather than dead-ending.
  if (!doc && process.env.ADMIN_EMAIL && normalizeEmail(process.env.ADMIN_EMAIL) === email) {
    await ensureAdminSeeded();
    doc = await col.findOne({ email });
  }

  // A Google-only account has no password to check. It is handled exactly like a
  // missing account, so the form reveals neither that the email exists nor how
  // its owner signs in.
  if (!doc?.passwordHash) {
    // Spend comparable time on a miss so response timing does not reveal whether
    // the email exists.
    await bcrypt.compare(password, DUMMY_HASH);
    return null;
  }

  if (!(await bcrypt.compare(password, doc.passwordHash))) return null;

  const now = new Date();
  await col.updateOne({ _id: doc._id }, { $set: { lastLoginAt: now } });
  return toAppUser({ ...doc, lastLoginAt: now });
}

/**
 * Creates a password account. Throws with a user-facing message on bad input.
 *
 * `source` records who made it: `"admin"` from the dashboard, `"self"` from the
 * public registration form. Self-registered accounts are always project managers
 * and start unverified — see signInWithGoogle() for why that matters.
 */
export async function createUser(input: {
  email: string;
  password: string;
  name?: string | null;
  role?: Role;
  source?: "admin" | "self";
}): Promise<AppUser> {
  const email = normalizeEmail(input.email);
  if (!isValidEmail(email)) throw new Error("That doesn't look like an email address.");
  if (input.password.length < MIN_PASSWORD_LENGTH) {
    throw new Error(`Password must be at least ${MIN_PASSWORD_LENGTH} characters.`);
  }

  const col = await users();
  if (await col.findOne({ email })) {
    throw new Error("An account with that email already exists.");
  }

  const source = input.source ?? "admin";
  const doc: UserDoc = {
    email,
    passwordHash: await hashPassword(input.password),
    name: input.name?.trim() || null,
    // Never trust a caller-supplied role on the public path.
    role: source === "self" ? "project_manager" : (input.role ?? "project_manager"),
    createdAt: new Date(),
    lastLoginAt: null,
    source,
    emailVerified: false,
  };
  try {
    const res = await col.insertOne(doc);
    return toAppUser({ ...doc, _id: res.insertedId });
  } catch (err) {
    // Two requests for the same email raced past the findOne above.
    if (isDuplicateKey(err)) throw new Error("An account with that email already exists.");
    throw err;
  }
}

function isDuplicateKey(err: unknown): boolean {
  return typeof err === "object" && err !== null && (err as { code?: number }).code === 11000;
}

/**
 * Find or create the account for a Google sign-in. Only called once Google has
 * confirmed `email_verified`, so the email is proven to belong to this person.
 *
 * Linking is by email, with one defence. Registration sends no confirmation mail,
 * so anyone could have self-registered this address first and set the password.
 * If the rightful owner then arrives via Google, that squatter's password is
 * discarded rather than kept alongside Google — otherwise the squatter would keep
 * a working login to the owner's account. Accounts an admin created are trusted
 * and keep their password.
 *
 * Returns null when the email is already linked to a *different* Google account.
 */
export async function signInWithGoogle(input: {
  email: string;
  googleId: string;
  name?: string | null;
}): Promise<AppUser | null> {
  const email = normalizeEmail(input.email);
  const col = await users();

  let doc = await col.findOne({ $or: [{ googleId: input.googleId }, { email }] });

  // Same self-heal as the password path: the configured admin may sign in with
  // Google before the seed ever ran.
  if (!doc && process.env.ADMIN_EMAIL && normalizeEmail(process.env.ADMIN_EMAIL) === email) {
    await ensureAdminSeeded();
    doc = await col.findOne({ email });
  }

  const now = new Date();

  if (doc) {
    if (doc.googleId && doc.googleId !== input.googleId) return null;

    const set: Partial<UserDoc> = { googleId: input.googleId, emailVerified: true, lastLoginAt: now };
    if (sourceOf(doc) === "self" && !doc.emailVerified) set.passwordHash = null;
    if (!doc.name && input.name) set.name = input.name.trim();

    await col.updateOne({ _id: doc._id }, { $set: set });
    return toAppUser({ ...doc, ...set });
  }

  const created: UserDoc = {
    email,
    passwordHash: null,
    name: input.name?.trim() || null,
    role: "project_manager",
    createdAt: now,
    lastLoginAt: now,
    source: "google",
    googleId: input.googleId,
    emailVerified: true,
  };
  try {
    const res = await col.insertOne(created);
    return toAppUser({ ...created, _id: res.insertedId });
  } catch (err) {
    // A concurrent first sign-in created it; use that one.
    if (!isDuplicateKey(err)) throw err;
    const existing = await col.findOne({ email });
    return existing ? toAppUser(existing) : null;
  }
}

export async function getUserByGoogleId(googleId: string): Promise<AppUser | null> {
  const col = await users();
  const doc = await col.findOne({ googleId });
  return doc ? toAppUser(doc) : null;
}

export async function setUserPassword(
  id: string,
  password: string
): Promise<boolean> {
  if (!ObjectId.isValid(id)) return false;
  if (password.length < MIN_PASSWORD_LENGTH) {
    throw new Error(`Password must be at least ${MIN_PASSWORD_LENGTH} characters.`);
  }
  const col = await users();
  const res = await col.updateOne(
    { _id: new ObjectId(id) },
    { $set: { passwordHash: await hashPassword(password) } }
  );
  return res.matchedCount === 1;
}

export async function getUserById(id: string): Promise<AppUser | null> {
  if (!ObjectId.isValid(id)) return null;
  const col = await users();
  const doc = await col.findOne({ _id: new ObjectId(id) });
  return doc ? toAppUser(doc) : null;
}

export async function listUsers(): Promise<AppUser[]> {
  const col = await users();
  const docs = await col.find({}).sort({ createdAt: 1 }).toArray();
  return docs.map(toAppUser);
}

export async function setUserRole(id: string, role: Role): Promise<boolean> {
  if (!ObjectId.isValid(id)) return false;
  const col = await users();
  const res = await col.updateOne({ _id: new ObjectId(id) }, { $set: { role } });
  return res.matchedCount === 1;
}

export async function deleteUser(id: string): Promise<boolean> {
  if (!ObjectId.isValid(id)) return false;
  const db = await getDb();
  const _id = new ObjectId(id);
  const res = await db.collection(COLLECTIONS.users).deleteOne({ _id });
  if (res.deletedCount !== 1) return false;
  // Their stored credentials and history go with them.
  await db.collection(COLLECTIONS.userKeys).deleteMany({ userId: id });
  await db.collection(COLLECTIONS.analyses).deleteMany({ userId: id });
  return true;
}

export async function countAdmins(): Promise<number> {
  const col = await users();
  return col.countDocuments({ role: "admin" });
}
