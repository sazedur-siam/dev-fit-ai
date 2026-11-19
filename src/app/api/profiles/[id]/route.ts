import { NextResponse } from "next/server";
import { deleteProfileReport } from "@/lib/db/profileReports";
import { requireUser, statusForError } from "@/lib/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

/** Delete one of your own reports. Doesn't touch the pool. */
export async function DELETE(_req: Request, { params }: Params) {
  try {
    const user = await requireUser();
    const { id } = await params;
    if (!(await deleteProfileReport(user.id, id))) {
      return NextResponse.json({ error: "Report not found" }, { status: 404 });
    }
    return NextResponse.json({ deleted: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Could not delete report";
    return NextResponse.json({ error: message }, { status: statusForError(err) });
  }
}
