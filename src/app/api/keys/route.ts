import { NextResponse } from "next/server";
import {
  deleteUserKey,
  getKeyStatuses,
  isKeyKind,
  saveUserKey,
} from "@/lib/db/keys";
import { requireUser, statusForError } from "@/lib/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * The user's own credentials. Responses carry masked previews only — there is no
 * endpoint that returns a stored key, by design.
 */
export async function GET() {
  try {
    const user = await requireUser();
    return NextResponse.json({ keys: await getKeyStatuses(user.id) });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Could not read keys";
    return NextResponse.json({ error: message }, { status: statusForError(err) });
  }
}

export async function PUT(req: Request) {
  try {
    const user = await requireUser();

    let body: { kind?: unknown; value?: unknown };
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }

    if (!isKeyKind(body.kind)) {
      return NextResponse.json(
        { error: 'kind must be "gemini" or "github"' },
        { status: 400 }
      );
    }
    if (typeof body.value !== "string" || !body.value.trim()) {
      return NextResponse.json({ error: "value is required" }, { status: 400 });
    }

    const status = await saveUserKey(user.id, body.kind, body.value);
    return NextResponse.json({ key: status });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Could not save key";
    return NextResponse.json({ error: message }, { status: statusForError(err) });
  }
}

export async function DELETE(req: Request) {
  try {
    const user = await requireUser();
    const kind = new URL(req.url).searchParams.get("kind");
    if (!isKeyKind(kind)) {
      return NextResponse.json(
        { error: 'kind must be "gemini" or "github"' },
        { status: 400 }
      );
    }
    const removed = await deleteUserKey(user.id, kind);
    return NextResponse.json({ removed, keys: await getKeyStatuses(user.id) });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Could not delete key";
    return NextResponse.json({ error: message }, { status: statusForError(err) });
  }
}
