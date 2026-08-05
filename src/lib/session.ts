import { getServerSession, type Session } from "next-auth";
import { unstable_rethrow } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { getUserById } from "@/lib/db/users";
import type { AppUser } from "@/lib/types";

/**
 * Read the session without letting a misconfiguration take the site down.
 *
 * NextAuth throws in production when NEXTAUTH_SECRET is absent. Because the
 * session is read on every route, an unguarded call turns one missing env var into
 * an opaque 500 on every page — including /login, the only page that can explain
 * what is wrong. Treating a failed read as "signed out" keeps the app reachable
 * and self-diagnosing.
 */
export async function readSessionSafe(): Promise<Session | null> {
  try {
    return await getServerSession(authOptions);
  } catch (err) {
    // Next signals redirect(), notFound() and dynamic-rendering decisions by
    // throwing. Swallowing those breaks the framework rather than the request —
    // during a build it silently reported "signed out" for /_not-found instead of
    // letting Next mark the route dynamic. Only genuine failures fall through.
    unstable_rethrow(err);
    console.error("[session] read failed — treating as signed out:", err);
    return null;
  }
}

/**
 * Authorization helpers. These re-read the user from MongoDB rather than
 * trusting the JWT's `role` claim: a JWT is issued at sign-in and would keep
 * asserting `admin` until it expired, so an admin demoting someone would not
 * take effect. The token's role is a UI hint; this is the enforcement point.
 */

export class AuthError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = "AuthError";
    this.status = status;
  }
}

/** The signed-in user, or null. */
export async function getCurrentUser(): Promise<AppUser | null> {
  const session = await readSessionSafe();
  const id = session?.user?.id;
  if (!id) return null;
  return getUserById(id);
}

/** The signed-in user, or throw 401. */
export async function requireUser(): Promise<AppUser> {
  const user = await getCurrentUser();
  if (!user) throw new AuthError("You must be signed in.", 401);
  return user;
}

/** The signed-in user if they are an admin, or throw 401/403. */
export async function requireAdmin(): Promise<AppUser> {
  const user = await requireUser();
  if (user.role !== "admin") {
    throw new AuthError("Admins only.", 403);
  }
  return user;
}

/** Map a thrown AuthError to its status; anything else is a 500. */
export function statusForError(err: unknown): number {
  return err instanceof AuthError ? err.status : 500;
}
