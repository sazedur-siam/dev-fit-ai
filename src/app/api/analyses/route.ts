import { NextResponse } from "next/server";
import { listUserAnalyses } from "@/lib/db/analyses";
import { requireUser, statusForError } from "@/lib/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** The signed-in user's own fit history. Scoped by userId in the query. */
export async function GET() {
  try {
    const user = await requireUser();
    return NextResponse.json({ analyses: await listUserAnalyses(user.id) });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Could not read history";
    return NextResponse.json({ error: message }, { status: statusForError(err) });
  }
}
