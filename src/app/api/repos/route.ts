import { NextResponse } from "next/server";
import { listViewerRepos } from "@/lib/github";
import { resolveCredentials } from "@/lib/credentials";
import { requireUser, statusForError } from "@/lib/session";
import type { AppUser } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Repositories for the signed-in user's own stored GitHub token. With per-user
 * keys this is finally genuinely per-user, rather than one shared ambient token.
 */
export async function GET() {
  let user: AppUser;
  try {
    user = await requireUser();
  } catch (err) {
    const message = err instanceof Error ? err.message : "Not signed in";
    return NextResponse.json({ error: message }, { status: statusForError(err) });
  }

  try {
    const creds = await resolveCredentials(user);
    const list = await listViewerRepos(creds.githubToken);
    return NextResponse.json({ ...list, tokenSource: creds.githubSource });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Could not list repositories";
    // A missing or rejected token is the user's setup, not a server fault.
    const status = /No GitHub token available/.test(message)
      ? 400
      : /^GitHub 401|^GitHub 403/.test(message)
        ? 401
        : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
