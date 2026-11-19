import { NextResponse } from "next/server";
import { getAllDevelopers } from "@/lib/db/developers";
import { createShortlist, listShortlists } from "@/lib/db/shortlists";
import { parseJsonBody, ShortlistCreateSchema } from "@/lib/schemas";
import { requireUser, statusForError } from "@/lib/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Your shortlists, most recently changed first. */
export async function GET() {
  try {
    const user = await requireUser();
    return NextResponse.json({ shortlists: await listShortlists(user.id) });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Could not load shortlists";
    return NextResponse.json({ error: message }, { status: statusForError(err) });
  }
}

export async function POST(req: Request) {
  try {
    const user = await requireUser();
    const body = await parseJsonBody(req, ShortlistCreateSchema);
    if (!body.ok) return body.response;
    // Only real developers go in; unknown ids are dropped rather than stored.
    const known = new Set((await getAllDevelopers()).map((d) => d.id));
    const shortlist = await createShortlist(user.id, {
      name: body.data.name,
      analysisId: body.data.analysisId ?? null,
      developerIds: (body.data.developerIds ?? []).filter((id) => known.has(id)),
    });
    return NextResponse.json({ shortlist }, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Could not create shortlist";
    return NextResponse.json({ error: message }, { status: statusForError(err) });
  }
}
