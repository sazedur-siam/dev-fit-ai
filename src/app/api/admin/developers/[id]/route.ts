import { NextResponse } from "next/server";
import { deleteDeveloper } from "@/lib/db/developers";
import { requireAdmin, statusForError } from "@/lib/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

/**
 * Remove a developer from the cohort. Seeded developers come back on the next
 * `npm run seed`; imported ones are gone until re-imported.
 */
export async function DELETE(_req: Request, { params }: Params) {
  try {
    await requireAdmin();
    const { id } = await params;
    const deleted = await deleteDeveloper(id);
    if (!deleted) {
      return NextResponse.json({ error: "Developer not found" }, { status: 404 });
    }
    return NextResponse.json({ deleted: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Could not delete developer";
    return NextResponse.json({ error: message }, { status: statusForError(err) });
  }
}
