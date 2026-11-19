import { NextResponse } from "next/server";
import { resolveCredentials } from "@/lib/credentials";
import { getUserAnalysis } from "@/lib/db/analyses";
import { getDeveloperById } from "@/lib/db/developers";
import { draftOutreach } from "@/lib/outreach";
import { OutreachBodySchema, parseJsonBody } from "@/lib/schemas";
import { requireUser, statusForError } from "@/lib/session";
import type { AppUser } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// One Gemini call, two if the first draft mentions a number.
export const maxDuration = 60;

/**
 * Draft (never send) a first-contact email to a developer, about one of your own
 * saved analyses. The analysis is loaded scoped to you, so someone else's id is a
 * 404. Uses your own Gemini key; self-service accounts never get the server's.
 */
export async function POST(req: Request) {
  let user: AppUser;
  try {
    user = await requireUser();
  } catch (err) {
    const message = err instanceof Error ? err.message : "Not signed in";
    return NextResponse.json({ error: message }, { status: statusForError(err) });
  }

  const body = await parseJsonBody(req, OutreachBodySchema);
  if (!body.ok) return body.response;
  const { analysisId, developerId, tone } = body.data;

  try {
    const analysis = await getUserAnalysis(user.id, analysisId);
    if (!analysis) return NextResponse.json({ error: "Analysis not found" }, { status: 404 });
    const score = analysis.ranked.find((r) => r.devId === developerId);
    if (!score) {
      return NextResponse.json({ error: "That developer isn't in this analysis" }, { status: 404 });
    }
    const dev = await getDeveloperById(developerId);
    if (!dev) return NextResponse.json({ error: "Developer not found" }, { status: 404 });

    const creds = await resolveCredentials(user);
    const draft = await draftOutreach(
      { dev, requirement: analysis.requirement, score, tone, senderName: user.name },
      creds
    );
    return NextResponse.json({ draft });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Could not draft the email";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
