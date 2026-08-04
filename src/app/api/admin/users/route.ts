import { NextResponse } from "next/server";
import { createUser, listUsers } from "@/lib/db/users";
import { getKeyPresenceByUser } from "@/lib/db/keys";
import { requireAdmin, statusForError } from "@/lib/session";
import type { Role } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Admin roster: every user, plus which credential kinds they have stored. */
export async function GET() {
  try {
    await requireAdmin();
    const [users, presence] = await Promise.all([
      listUsers(),
      getKeyPresenceByUser(),
    ]);
    return NextResponse.json({
      users: users.map((user) => ({
        ...user,
        // Presence only. Admins never see previews, let alone values.
        hasGeminiKey: (presence[user.id] ?? []).includes("gemini"),
        hasGithubKey: (presence[user.id] ?? []).includes("github"),
      })),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Could not list users";
    return NextResponse.json({ error: message }, { status: statusForError(err) });
  }
}

/**
 * Create an account. Admin-only — there is no self-registration anywhere in the
 * app, so this is the only path by which a user comes into existence besides the
 * bootstrapped admin.
 */
export async function POST(req: Request) {
  try {
    await requireAdmin();

    let body: { email?: unknown; password?: unknown; name?: unknown; role?: unknown };
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }

    if (typeof body.email !== "string" || typeof body.password !== "string") {
      return NextResponse.json(
        { error: "email and password are required" },
        { status: 400 }
      );
    }

    const role: Role = body.role === "admin" ? "admin" : "project_manager";

    const user = await createUser({
      email: body.email,
      password: body.password,
      name: typeof body.name === "string" ? body.name : null,
      role,
    });

    return NextResponse.json(
      { user: { ...user, hasGeminiKey: false, hasGithubKey: false } },
      { status: 201 }
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "Could not create user";
    // createUser throws user-facing validation messages (duplicate email, weak
    // password); those are 400s, not server faults.
    const status =
      /already exists|at least|email address/i.test(message) && !(err instanceof Error && "status" in err)
        ? 400
        : statusForError(err);
    return NextResponse.json({ error: message }, { status });
  }
}
