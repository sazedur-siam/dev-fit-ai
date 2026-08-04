import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getUserById } from "@/lib/db/users";
import type { AppUser } from "@/lib/types";

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
  const session = await getServerSession(authOptions);
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
