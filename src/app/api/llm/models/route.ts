import { NextResponse } from "next/server";
import { keyForProvider } from "@/lib/credentials";
import { listProviderModels } from "@/lib/llm";
import { LlmModelsBodySchema, parseJsonBody } from "@/lib/schemas";
import { requireUser, statusForError } from "@/lib/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * The models a provider offers this key, for the picker. POST rather than GET so
 * a key typed into the dialog travels in the body, never in a URL or a log line.
 * Without any key, returns `live: false` and the picker shows its suggestions.
 */
export async function POST(req: Request) {
  try {
    const user = await requireUser();
    const body = await parseJsonBody(req, LlmModelsBodySchema);
    if (!body.ok) return body.response;

    const key = await keyForProvider(user, body.data.provider, body.data.apiKey);
    if (!key) return NextResponse.json({ live: false, models: [] });

    const models = await listProviderModels(body.data.provider, key);
    return NextResponse.json({ live: true, models: models.slice(0, 200) });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Could not load models";
    const status = statusForError(err);
    // A provider-side failure (bad key, outage) is a 502 to us, not our 500.
    return NextResponse.json({ error: message }, { status: status === 500 ? 502 : status });
  }
}
