import { NextResponse } from "next/server";
import { keyForProvider } from "@/lib/credentials";
import { llmJSON } from "@/lib/llm";
import { PROVIDER_META } from "@/lib/providers";
import { LlmTestBodySchema, parseJsonBody } from "@/lib/schemas";
import { requireUser, statusForError } from "@/lib/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * One tiny real call with the chosen provider, model and key. A provider's model
 * list is not proof a model works (retired models stay listed; some return empty
 * content), so this is the check that counts. Costs a handful of tokens.
 */
export async function POST(req: Request) {
  try {
    const user = await requireUser();
    const body = await parseJsonBody(req, LlmTestBodySchema);
    if (!body.ok) return body.response;
    const { provider, model, apiKey } = body.data;

    const key = await keyForProvider(user, provider, apiKey);
    if (!key) {
      return NextResponse.json(
        { ok: false, error: `Add your ${PROVIDER_META[provider].keyLabel} first.` },
        { status: 400 }
      );
    }

    const started = Date.now();
    try {
      const reply = await llmJSON<{ ok?: unknown }>(
        'Reply with exactly this JSON object: {"ok": true}',
        { provider, model, apiKey: key }
      );
      const ms = Date.now() - started;
      if (reply?.ok !== true) {
        return NextResponse.json({
          ok: false,
          error: "The model answered, but not with the expected JSON. It may not follow instructions well enough for DevFit.",
        });
      }
      return NextResponse.json({ ok: true, ms });
    } catch (err) {
      const message = err instanceof Error ? err.message : "The test call failed";
      return NextResponse.json({ ok: false, error: message });
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : "Could not run the test";
    return NextResponse.json({ error: message }, { status: statusForError(err) });
  }
}
