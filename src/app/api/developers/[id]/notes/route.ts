import { NextResponse } from "next/server";
import { getDeveloperById } from "@/lib/db/developers";
import { createNote, listNotes } from "@/lib/db/notes";
import { NoteBodySchema, parseJsonBody } from "@/lib/schemas";
import { requireUser, statusForError } from "@/lib/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

/** Your own notes on a developer. Nobody else's are ever returned, admins included. */
export async function GET(_req: Request, { params }: Params) {
  try {
    const user = await requireUser();
    const { id } = await params;
    return NextResponse.json({ notes: await listNotes(user.id, id) });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Could not load notes";
    return NextResponse.json({ error: message }, { status: statusForError(err) });
  }
}

export async function POST(req: Request, { params }: Params) {
  try {
    const user = await requireUser();
    const { id } = await params;
    const body = await parseJsonBody(req, NoteBodySchema);
    if (!body.ok) return body.response;
    if (!(await getDeveloperById(id))) {
      return NextResponse.json({ error: "Developer not found" }, { status: 404 });
    }
    return NextResponse.json({ note: await createNote(user.id, id, body.data.body) }, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Could not save note";
    return NextResponse.json({ error: message }, { status: statusForError(err) });
  }
}
