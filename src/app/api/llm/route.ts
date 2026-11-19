import { NextResponse } from "next/server";
import { getLlmSettings, hasKeyFor } from "@/lib/credentials";
import { saveUserKey } from "@/lib/db/keys";
import { setUserLlmPreference } from "@/lib/db/users";
import { PROVIDER_META } from "@/lib/providers";
import { LlmPreferenceBodySchema, parseJsonBody } from "@/lib/schemas";
import { requireUser, statusForError } from "@/lib/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** The signed-in user's AI provider, model and key statuses (previews only). */
export async function GET() {
  try {
    const user = await requireUser();
    return NextResponse.json({ settings: await getLlmSettings(user) });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Could not read AI settings";
    return NextResponse.json({ error: message }, { status: statusForError(err) });
  }
}

/**
 * Pick a provider + model, optionally saving a new key for that provider in the
 * same step. Refuses a provider the user has no usable key for, so the next fit
 * run can't fail on a choice that was never going to work.
 */
export async function PUT(req: Request) {
  try {
    const user = await requireUser();
    const body = await parseJsonBody(req, LlmPreferenceBodySchema);
    if (!body.ok) return body.response;
    const { provider, model, apiKey } = body.data;

    if (apiKey) await saveUserKey(user.id, provider, apiKey);
    if (!(await hasKeyFor(user, provider))) {
      const meta = PROVIDER_META[provider];
      return NextResponse.json(
        { error: `Add your ${meta.keyLabel} to use ${meta.label}.` },
        { status: 400 }
      );
    }

    const pref = { provider, model };
    await setUserLlmPreference(user.id, pref);
    return NextResponse.json({ settings: await getLlmSettings({ ...user, llm: pref }) });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Could not save AI settings";
    return NextResponse.json({ error: message }, { status: statusForError(err) });
  }
}
