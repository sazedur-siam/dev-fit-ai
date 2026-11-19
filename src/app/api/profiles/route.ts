import { NextResponse } from "next/server";
import { resolveCredentials } from "@/lib/credentials";
import { saveProfileReport } from "@/lib/db/profileReports";
import { toView } from "@/lib/developerHelpers";
import { fetchProfileInsights } from "@/lib/githubInsights";
import { buildDeveloper, fetchGithubDeveloper } from "@/lib/githubProfile";
import { summarizeProfile } from "@/lib/profileSummary";
import { parseJsonBody, ProfileAnalyzeBodySchema } from "@/lib/schemas";
import { requireUser, statusForError } from "@/lib/session";
import type { AppUser, MockDeveloper, ProfileSummary } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Four GitHub GraphQL calls (three in sequence, one alongside) and one model call (the user's chosen provider).
export const maxDuration = 60;

/**
 * Analyze a GitHub account and save the report privately for this user. Any
 * signed-in user may run it. Nothing enters the shared pool here; that's
 * `POST /api/profiles/[id]/pool`.
 */
export async function POST(req: Request) {
  let user: AppUser;
  try {
    user = await requireUser();
  } catch (err) {
    const message = err instanceof Error ? err.message : "Not signed in";
    return NextResponse.json({ error: message }, { status: statusForError(err) });
  }

  const body = await parseJsonBody(req, ProfileAnalyzeBodySchema);
  if (!body.ok) return body.response;
  const { login } = body.data;

  const creds = await resolveCredentials(user);
  if (!creds.githubToken) {
    return NextResponse.json(
      {
        error:
          "Analyzing a profile needs a GitHub token (GitHub's GraphQL API has no anonymous access). Add one under Settings.",
      },
      { status: 400 }
    );
  }

  try {
    const [devResult, insights] = await Promise.all([
      fetchGithubDeveloper(login, creds.githubToken).then(
        (dev) => ({ ok: true as const, dev }),
        (err: unknown) => ({ ok: false as const, err })
      ),
      fetchProfileInsights(login, creds.githubToken),
    ]);

    // The commit/stack half samples commits across repos and is the one GitHub
    // can time out on (a 502 for accounts with huge histories, e.g. torvalds).
    // The profile half succeeded, so save a partial report rather than nothing.
    // A 4xx (bad or unknown login) is still a failure for the whole request.
    let developer: MockDeveloper;
    let developerError: string | null = null;
    if (devResult.ok) {
      developer = devResult.dev;
    } else {
      const message = devResult.err instanceof Error ? devResult.err.message : String(devResult.err);
      if (/^GitHub 4\d\d/.test(message)) throw devResult.err;
      console.error("[profiles] commit analysis failed:", message);
      developer = buildDeveloper({ id: "", login: insights.login, name: insights.name }, [], {});
      developerError = /^GitHub 5\d\d/.test(message)
        ? "GitHub timed out sampling commits (common for very large repositories)."
        : message;
    }

    // The summary is optional: no key, or a failed call, still saves the report.
    let summary: ProfileSummary | null = null;
    let summaryError: string | null = null;
    if (creds.llm.apiKey) {
      try {
        summary = await summarizeProfile(toView(developer), insights, creds.llm, {
          commitDataMissing: developerError !== null,
        });
      } catch (err) {
        summaryError = err instanceof Error ? err.message : "The AI summary failed.";
        console.error("[profiles] summary failed:", summaryError);
      }
    }

    const reportId = await saveProfileReport(user.id, {
      login: developer.githubLogin ?? insights.login,
      developer,
      insights,
      summary,
      summaryError,
      developerError,
    });
    return NextResponse.json({ reportId }, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Analysis failed";
    const status = /^GitHub 4\d\d/.test(message) ? 400 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
