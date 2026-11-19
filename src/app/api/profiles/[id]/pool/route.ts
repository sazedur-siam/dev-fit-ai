import { NextResponse } from "next/server";
import { getDeveloperById, upsertDeveloper } from "@/lib/db/developers";
import { getProfileReportDeveloper } from "@/lib/db/profileReports";
import { poolDecision } from "@/lib/profilePool";
import { requireUser, statusForError } from "@/lib/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

/**
 * Add the developer from one of your reports to the shared pool, where every
 * user can rank, shortlist, note and tag them. Open to project managers as well
 * as admins, by design. Adding someone shifts everyone's cohort-relative
 * experience score; that's expected (see CLAUDE.md, Scoring).
 */
export async function POST(_req: Request, { params }: Params) {
  try {
    const user = await requireUser();
    const { id } = await params;
    const dev = await getProfileReportDeveloper(user.id, id);
    if (!dev) return NextResponse.json({ error: "Report not found" }, { status: 404 });

    const decision = poolDecision(dev, await getDeveloperById(dev.id), user.id);
    if (decision.action === "refuse") {
      return NextResponse.json({ error: decision.reason }, { status: 422 });
    }
    if (decision.action === "keep") {
      return NextResponse.json({ developerId: dev.id, result: "unchanged" });
    }
    const result = await upsertDeveloper(decision.doc);
    return NextResponse.json({ developerId: dev.id, result }, { status: result === "inserted" ? 201 : 200 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Could not add to the pool";
    return NextResponse.json({ error: message }, { status: statusForError(err) });
  }
}
