import { NextResponse } from "next/server";
import { analyzeRepo } from "@/lib/analyzer";
import { resolveCredentials } from "@/lib/credentials";
import { requireUser, statusForError } from "@/lib/session";
import { parseJsonBody, RepoUrlBodySchema } from "@/lib/schemas";
import type { AppUser } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Digest + one Gemini call; slower than a default serverless timeout allows.
export const maxDuration = 60;

export async function POST(req: Request) {
  let user: AppUser;
  try {
    user = await requireUser();
  } catch (err) {
    const message = err instanceof Error ? err.message : "Not signed in";
    return NextResponse.json({ error: message }, { status: statusForError(err) });
  }

  const body = await parseJsonBody(req, RepoUrlBodySchema);
  if (!body.ok) return body.response;
  const { repoUrl } = body.data;

  try {
    const creds = await resolveCredentials(user);
    const { requirement, digestMeta } = await analyzeRepo(repoUrl, creds);
    return NextResponse.json({ requirement, digestMeta });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Analysis failed";
    const status = /^GitHub 4\d\d/.test(message) ? 400 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
