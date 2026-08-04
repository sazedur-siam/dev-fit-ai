import { NextResponse } from "next/server";
import { analyzeRepo } from "@/lib/analyzer";

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
    const { requirement, digestMeta } = await analyzeRepo(repoUrl);
    return NextResponse.json({ requirement, digestMeta });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Analysis failed";
    const status = /^GitHub 4\d\d/.test(message) ? 400 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
