import { NextResponse } from "next/server";
import { analyzeRepo } from "@/lib/analyzer";
import { resolveCredentials } from "@/lib/credentials";
import { requireUser, statusForError } from "@/lib/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Digest + one Gemini call; slower than a default serverless timeout allows.
export const maxDuration = 60;

export async function POST(req: Request) {
  let userId: string;
  try {
    userId = (await requireUser()).id;
  } catch (err) {
    const message = err instanceof Error ? err.message : "Not signed in";
    return NextResponse.json({ error: message }, { status: statusForError(err) });
  }

  let body: { repoUrl?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const repoUrl = body?.repoUrl?.trim();
  if (!repoUrl) {
    return NextResponse.json({ error: "repoUrl is required" }, { status: 400 });
  }

  try {
    const creds = await resolveCredentials(userId);
    const { requirement, digestMeta } = await analyzeRepo(repoUrl, creds);
    return NextResponse.json({ requirement, digestMeta });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Analysis failed";
    const status = /^GitHub 4\d\d/.test(message) ? 400 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
