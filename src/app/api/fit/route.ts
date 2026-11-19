import { NextResponse } from "next/server";
import { analyzeAndRank } from "@/lib/analyzer";
import { getAllDevelopers } from "@/lib/db/developers";
import { saveAnalysis } from "@/lib/db/analyses";
import { resolveCredentials } from "@/lib/credentials";
import { requireUser, statusForError } from "@/lib/session";
import { parseJsonBody, RepoUrlBodySchema } from "@/lib/schemas";
import { SCORING_VERSION } from "@/lib/config";
import type { AppUser, FitResponse } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * A fit run measured ~30s end to end: ~20 sequential GitHub file reads plus two
 * Gemini calls. Serverless platforms default well below that (Vercel Hobby is 10s),
 * so without this the request is killed mid-analysis and the user sees a generic
 * 504 rather than a result. 60s is the Hobby ceiling.
 */
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
    const cohort = await getAllDevelopers();
    if (cohort.length === 0) {
      return NextResponse.json(
        { error: "No developers in the database. Run `npm run seed` first." },
        { status: 503 }
      );
    }

    const result = await analyzeAndRank(repoUrl, cohort, creds);

    // History is a convenience, not part of the contract — a write failure must
    // not discard a ranking the user already waited 30s for.
    let analysisId: string | null = null;
    try {
      analysisId = await saveAnalysis(user.id, {
        repoUrl,
        owner: result.digestMeta.owner,
        repo: result.digestMeta.repo,
        requirement: result.requirement,
        ranked: result.ranked,
        topPickId: result.topPickId,
        topPickRationale: result.topPickRationale,
      });
    } catch {
      analysisId = null;
    }

    const response: FitResponse = {
      requirement: result.requirement,
      ranked: result.ranked,
      topPickId: result.topPickId,
      topPickRationale: result.topPickRationale,
      analysisId,
      scoringVersion: SCORING_VERSION,
      credentialSources: {
        gemini: creds.geminiSource,
        github: creds.githubSource,
      },
    };
    return NextResponse.json(response);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Fit ranking failed";
    const status = /^GitHub 4\d\d/.test(message) ? 400 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
