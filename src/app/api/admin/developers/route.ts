import { NextResponse } from "next/server";
import { resolveCredentials } from "@/lib/credentials";
import { getDeveloperById, upsertDeveloper } from "@/lib/db/developers";
import { toView } from "@/lib/developerHelpers";
import { fetchGithubDeveloper } from "@/lib/githubProfile";
import { ImportDeveloperBodySchema, parseJsonBody } from "@/lib/schemas";
import { requireAdmin, statusForError } from "@/lib/session";
import type { AppUser } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Three GitHub GraphQL calls, ~8s on a busy account.
export const maxDuration = 60;

/**
 * Import (or re-import) a developer from their public GitHub activity. Admin-only:
 * it adds a real person to the cohort every project manager ranks against.
 */
export async function POST(req: Request) {
  let admin: AppUser;
  try {
    admin = await requireAdmin();
  } catch (err) {
    const message = err instanceof Error ? err.message : "Not allowed";
    return NextResponse.json({ error: message }, { status: statusForError(err) });
  }

  const body = await parseJsonBody(req, ImportDeveloperBodySchema);
  if (!body.ok) return body.response;
  const { login, archetype } = body.data;

  // GraphQL has no unauthenticated tier, so a token is required. resolveCredentials
  // applies the usual rules: the admin's own key, then the server's env key.
  const { githubToken } = await resolveCredentials(admin);
  if (!githubToken) {
    return NextResponse.json(
      {
        error:
          "Importing needs a GitHub token (GitHub's GraphQL API has no anonymous access). Add one under Settings.",
      },
      { status: 400 }
    );
  }

  try {
    const dev = await fetchGithubDeveloper(login, githubToken, {
      archetype: archetype && archetype !== "auto" ? archetype : undefined,
    });
    if (dev.repos.length === 0) {
      return NextResponse.json(
        {
          error: `${login} has no commits in their own public repositories, so there's nothing to score.`,
        },
        { status: 422 }
      );
    }
    // A re-import keeps whoever first added them (possibly a PM, via Profile Analyzer).
    const existing = await getDeveloperById(dev.id);
    const result = await upsertDeveloper({ ...dev, addedBy: existing?.addedBy ?? admin.id });
    return NextResponse.json({ developer: toView(dev), result }, { status: result === "inserted" ? 201 : 200 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Import failed";
    const status = /^GitHub 4\d\d/.test(message) ? 400 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
