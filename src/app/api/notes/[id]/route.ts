import { NextResponse } from "next/server";
import { deleteNote, updateNote } from "@/lib/db/notes";
import { NoteBodySchema, parseJsonBody } from "@/lib/schemas";
import { requireUser, statusForError } from "@/lib/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

/** Edit one of your notes. Someone else's note id is a 404, not a 403: no leak. */
export async function PATCH(req: Request, { params }: Params) {
  try {
    const user = await requireUser();
    const { id } = await params;
    const body = await parseJsonBody(req, NoteBodySchema);
    if (!body.ok) return body.response;
    const note = await updateNote(user.id, id, body.data.body);
    if (!note) return NextResponse.json({ error: "Note not found" }, { status: 404 });
    return NextResponse.json({ note });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Could not update note";
    return NextResponse.json({ error: message }, { status: statusForError(err) });
  }
}

export async function DELETE(_req: Request, { params }: Params) {
  try {
    const user = await requireUser();
    const { id } = await params;
    if (!(await deleteNote(user.id, id))) {
      return NextResponse.json({ error: "Note not found" }, { status: 404 });
    }
    return NextResponse.json({ deleted: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Could not delete note";
    return NextResponse.json({ error: message }, { status: statusForError(err) });
  }
}
