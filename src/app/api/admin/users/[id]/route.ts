import { NextResponse } from "next/server";
import {
  countAdmins,
  deleteUser,
  getUserById,
  setUserPassword,
  setUserRole,
} from "@/lib/db/users";
import { requireAdmin, statusForError } from "@/lib/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

/** Change a user's role, or reset their password. */
export async function PATCH(req: Request, { params }: Params) {
  try {
    const admin = await requireAdmin();
    const { id } = await params;

    let body: { role?: unknown; password?: unknown };
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }

    const target = await getUserById(id);
    if (!target) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    // Password reset. Allowed on any account, including the admin's own.
    if (typeof body.password === "string") {
      try {
        await setUserPassword(id, body.password);
      } catch (err) {
        const message = err instanceof Error ? err.message : "Could not set password";
        return NextResponse.json({ error: message }, { status: 400 });
      }
      return NextResponse.json({ user: target, passwordChanged: true });
    }

    if (body.role !== "admin" && body.role !== "project_manager") {
      return NextResponse.json(
        { error: 'role must be "admin" or "project_manager"' },
        { status: 400 }
      );
    }

    // Guard against locking everyone out of the dashboard: the last admin cannot
    // demote themselves, and self-demotion is refused outright so it is never a
    // surprise.
    if (target.id === admin.id && body.role === "project_manager") {
      return NextResponse.json(
        { error: "You cannot remove your own admin role." },
        { status: 409 }
      );
    }
    if (
      target.role === "admin" &&
      body.role === "project_manager" &&
      (await countAdmins()) <= 1
    ) {
      return NextResponse.json(
        { error: "This is the only admin — promote someone else first." },
        { status: 409 }
      );
    }

    await setUserRole(id, body.role);
    return NextResponse.json({ user: await getUserById(id) });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Could not update user";
    return NextResponse.json({ error: message }, { status: statusForError(err) });
  }
}

/** Delete a user, along with their stored keys and analysis history. */
export async function DELETE(_req: Request, { params }: Params) {
  try {
    const admin = await requireAdmin();
    const { id } = await params;

    if (id === admin.id) {
      return NextResponse.json(
        { error: "You cannot delete your own account here." },
        { status: 409 }
      );
    }

    const target = await getUserById(id);
    if (!target) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }
    if (target.role === "admin" && (await countAdmins()) <= 1) {
      return NextResponse.json(
        { error: "This is the only admin — promote someone else first." },
        { status: 409 }
      );
    }

    return NextResponse.json({ deleted: await deleteUser(id) });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Could not delete user";
    return NextResponse.json({ error: message }, { status: statusForError(err) });
  }
}
