import { NextResponse } from "next/server";
import { getAllDevelopers } from "@/lib/db/developers";
import { requireUser, statusForError } from "@/lib/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    // The cohort is no longer public — every page is behind the login.
    await requireUser();
    return NextResponse.json({ developers: await getAllDevelopers() });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Could not read developers";
    return NextResponse.json({ error: message }, { status: statusForError(err) });
  }
}
