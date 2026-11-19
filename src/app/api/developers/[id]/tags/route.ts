import { NextResponse } from "next/server";
import { getDeveloperById } from "@/lib/db/developers";
import { addTag, listTags, removeTag } from "@/lib/db/tags";
import { parseJsonBody, TagBodySchema } from "@/lib/schemas";
import { requireUser, statusForError } from "@/lib/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

export async function GET(_req: Request, { params }: Params) {
  try {
    const user = await requireUser();
    const { id } = await params;
    return NextResponse.json({ tags: await listTags(user.id, id) });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Could not load tags";
    return NextResponse.json({ error: message }, { status: statusForError(err) });
  }
}

/** Add one of your tags to a developer. Idempotent. */
export async function POST(req: Request, { params }: Params) {
  try {
    const user = await requireUser();
    const { id } = await params;
    const body = await parseJsonBody(req, TagBodySchema);
    if (!body.ok) return body.response;
    if (!(await getDeveloperById(id))) {
      return NextResponse.json({ error: "Developer not found" }, { status: 404 });
    }
    await addTag(user.id, id, body.data.label);
    return NextResponse.json({ tags: await listTags(user.id, id) });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Could not add tag";
    return NextResponse.json({ error: message }, { status: statusForError(err) });
  }
}

/** `DELETE …/tags?label=available-q1` */
export async function DELETE(req: Request, { params }: Params) {
  try {
    const user = await requireUser();
    const { id } = await params;
    const label = new URL(req.url).searchParams.get("label")?.trim().toLowerCase();
    if (!label) return NextResponse.json({ error: "label is required" }, { status: 400 });
    await removeTag(user.id, id, label);
    return NextResponse.json({ tags: await listTags(user.id, id) });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Could not remove tag";
    return NextResponse.json({ error: message }, { status: statusForError(err) });
  }
}
