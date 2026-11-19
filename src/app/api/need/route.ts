import { NextResponse } from "next/server";
import { parseNeed, rankAndExplain } from "@/lib/analyzer";
import { SCORING_VERSION } from "@/lib/config";
import { resolveCredentials } from "@/lib/credentials";
import { saveAnalysis } from "@/lib/db/analyses";
import { getAllDevelopers } from "@/lib/db/developers";
import { NeedBodySchema, parseJsonBody } from "@/lib/schemas";
import { requireUser, statusForError } from "@/lib/session";
import type { AppUser, NeedResponse } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Two Gemini calls (parse + explain); no repo digest, so faster than /api/fit.
export const maxDuration = 60;

/**
 * Rank the cohort against a need described in plain text. The first call may
 * come back with `status: "clarify"` and up to 3 questions; the follow-up (with
 * `answers`, or `skipQuestions: true`) always ranks.
 */
export async function POST(req: Request) {
  let user: AppUser;
  try {
    user = await requireUser();
  } catch (err) {
    const message = err instanceof Error ? err.message : "Not signed in";
    return NextResponse.json({ error: message }, { status: statusForError(err) });
  }

  const body = await parseJsonBody(req, NeedBodySchema);
  if (!body.ok) return body.response;
  const { text, answers = [], skipQuestions = false } = body.data;

  try {
    const creds = await resolveCredentials(user);
    const cohort = await getAllDevelopers();
    if (cohort.length === 0) {
      return NextResponse.json(
        { error: "No developers in the database. Run `npm run seed` first." },
        { status: 503 }
      );
    }

    const allowQuestions = answers.length === 0 && !skipQuestions;
    const parsed = await parseNeed(text, answers, allowQuestions, creds);
    if (parsed.status === "clarify") {
      const response: NeedResponse = { status: "clarify", questions: parsed.questions };
      return NextResponse.json(response);
    }

    const result = await rankAndExplain(parsed.requirement, cohort, creds);

    let analysisId: string | null = null;
    try {
      analysisId = await saveAnalysis(user.id, {
        repoUrl: null,
        owner: null,
        repo: null,
        needText: text,
        requirement: result.requirement,
        ranked: result.ranked,
        topPickId: result.topPickId,
        topPickRationale: result.topPickRationale,
      });
    } catch {
      analysisId = null;
    }

    const response: NeedResponse = {
      status: "ready",
      ...result,
      analysisId,
      scoringVersion: SCORING_VERSION,
      credentialSources: { gemini: creds.geminiSource, github: creds.githubSource },
    };
    return NextResponse.json(response);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Ranking failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
