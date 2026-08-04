import { NextResponse } from "next/server";
import { listViewerRepos } from "@/lib/github";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    return NextResponse.json(await listViewerRepos());
  } catch (err) {
    const message = err instanceof Error ? err.message : "Could not list repositories";
    // A missing/!bad token is the user's setup, not a server fault.
    const status = /GITHUB_TOKEN is not set/.test(message)
      ? 400
      : /^GitHub 401|^GitHub 403/.test(message)
        ? 401
        : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
