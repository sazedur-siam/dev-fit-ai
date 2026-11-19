import { NextResponse } from "next/server";
import { getDeveloperById } from "@/lib/db/developers";
import { deleteShortlist, updateShortlist } from "@/lib/db/shortlists";
import { parseJsonBody, ShortlistUpdateSchema } from "@/lib/schemas";
import { requireUser, statusForError } from "@/lib/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

/** `{ name }` to rename, `{ add: devId }` or `{ remove: devId }` to change members. */
export async function PATCH(req: Request, { params }: Params) {
  try {
    const user = await requireUser();
    const { id } = await params;
    const body = await parseJsonBody(req, ShortlistUpdateSchema);
    if (!body.ok) return body.response;
    if (body.data.add !== undefined && !(await getDeveloperById(body.data.add))) {
      return NextResponse.json({ error: "Developer not found" }, { status: 404 });
    }
    const shortlist = await updateShortlist(user.id, id, body.data);
    if (!shortlist) return NextResponse.json({ error: "Shortlist not found" }, { status: 404 });
    return NextResponse.json({ shortlist });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Could not update shortlist";
    return NextResponse.json({ error: message }, { status: statusForError(err) });
  }
}

export async function DELETE(_req: Request, { params }: Params) {
  try {
    const user = await requireUser();
    const { id } = await params;
    if (!(await deleteShortlist(user.id, id))) {
      return NextResponse.json({ error: "Shortlist not found" }, { status: 404 });
    }
    return NextResponse.json({ deleted: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Could not delete shortlist";
    return NextResponse.json({ error: message }, { status: statusForError(err) });
  }
}
