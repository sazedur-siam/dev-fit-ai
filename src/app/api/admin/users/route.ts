import { NextResponse } from "next/server";
import { createUser, listUsers } from "@/lib/db/users";
import { getKeyPresenceByUser } from "@/lib/db/keys";
import { requireAdmin, statusForError } from "@/lib/session";
import { AdminCreateUserBodySchema, parseJsonBody } from "@/lib/schemas";

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
 * Create an account on someone's behalf. Admin-only, and the only path that can
 * create another admin — public registration (/api/register) and Google sign-in
 * only ever make project managers.
 */
export async function POST(req: Request) {
  try {
    await requireAdmin();

    const body = await parseJsonBody(req, AdminCreateUserBodySchema);
    if (!body.ok) return body.response;

    const user = await createUser({
      email: body.data.email,
      password: body.data.password,
      name: body.data.name ?? null,
      role: body.data.role,
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
