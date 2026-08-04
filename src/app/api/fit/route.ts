import { NextResponse } from "next/server";
import { analyzeAndRank } from "@/lib/analyzer";
import { getAllDevelopers } from "@/lib/developerHelpers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
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
    const cohort = getAllDevelopers();
    const result = await analyzeAndRank(repoUrl, cohort);
    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Fit ranking failed";
    const status = /^GitHub 4\d\d/.test(message) ? 400 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
