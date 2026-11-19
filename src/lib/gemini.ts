import { GEMINI_EMBEDDING_MODEL } from "@/lib/config";
import type { LlmModelOption } from "@/lib/providers";

const GEMINI_BASE = "https://generativelanguage.googleapis.com/v1beta";

export class GeminiError extends Error {
  status?: number;
  constructor(message: string, status?: number) {
    super(message);
    this.name = "GeminiError";
    this.status = status;
  }
}

interface GeminiPart {
  text: string;
}

interface GeminiResponse {
  candidates?: {
    content?: { parts?: GeminiPart[] };
    finishReason?: string;
  }[];
  promptFeedback?: { blockReason?: string };
}

/**
 * Statuses that mean "Google is busy", not "your request is wrong". 503 is the
 * common one — the model returns `UNAVAILABLE: high demand` during load spikes.
 */
const RETRYABLE_STATUSES = new Set([429, 500, 503, 504]);
const RETRY_DELAYS_MS = [1000, 2000, 4000];

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Pull `error.message` out of Google's JSON error body instead of dumping it raw. */
function errorDetail(body: string): string {
  try {
    const parsed = JSON.parse(body) as { error?: { message?: string } };
    if (parsed.error?.message) return parsed.error.message;
  } catch {
    // Not JSON — fall through to the raw text.
  }
  return body.slice(0, 300);
}

function geminiHttpError(status: number, body: string, attempts: number) {
  const tried = attempts > 1 ? ` (tried ${attempts} times)` : "";
  if (status === 503 || status === 500 || status === 504) {
    return new GeminiError(
      `Gemini is overloaded right now${tried} — this is on Google's side, not a problem with your key or the repo. Try again in a minute, or pick a less busy model in Settings.`,
      status
    );
  }
  if (status === 429) {
    return new GeminiError(
      `Gemini rate limit or quota reached${tried}. Wait a minute and retry, or check your key's quota at https://aistudio.google.com/app/apikey`,
      status
    );
  }
  return new GeminiError(`Gemini ${status} — ${errorDetail(body)}`, status);
}

/**
 * POST to Gemini, retrying transient failures (overload, rate limit, network)
 * with backoff. Anything else — bad key, unknown model — fails immediately.
 */
async function postWithRetry(url: string, body: string): Promise<Response> {
  for (let attempt = 0; ; attempt++) {
    const canRetry = attempt < RETRY_DELAYS_MS.length;
    let res: Response;
    try {
      res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body,
      });
    } catch (err) {
      if (!canRetry) throw err;
      await sleep(RETRY_DELAYS_MS[attempt]);
      continue;
    }

    if (res.ok) return res;
    const text = await res.text();
    if (!canRetry || !RETRYABLE_STATUSES.has(res.status)) {
      throw geminiHttpError(res.status, text, attempt + 1);
    }
    await sleep(RETRY_DELAYS_MS[attempt]);
  }
}

function ensureKey(apiKey: string | null | undefined): string {
  const key = apiKey?.trim();
  if (!key) {
    throw new GeminiError(
      "No Gemini API key available. Add one on the Settings page, or set GEMINI_API_KEY in .env.local. Get a key at https://aistudio.google.com/app/apikey"
    );
  }
  return key;
}

/**
 * Call Gemini and get the raw text back.
 *
 * The key and model are passed in rather than read from the environment: each
 * signed-in user stores their own credential and picks their own model, so there
 * is no single ambient one to reach for. JSON parsing lives in llm.ts, shared by
 * every provider.
 */
export async function geminiText(
  prompt: string,
  apiKey: string | null | undefined,
  model: string,
  opts?: { jsonMode?: boolean }
) {
  const key = ensureKey(apiKey);
  const url = `${GEMINI_BASE}/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(key)}`;

  const body: Record<string, unknown> = {
    contents: [{ role: "user", parts: [{ text: prompt }] }],
    generationConfig: {
      temperature: 0.2,
      topP: 0.95,
      maxOutputTokens: 4096,
      ...(opts?.jsonMode ? { responseMimeType: "application/json" } : {}),
    },
  };

  const res = await postWithRetry(url, JSON.stringify(body));

  const json = (await res.json()) as GeminiResponse;
  if (json.promptFeedback?.blockReason) {
    throw new GeminiError(
      `Gemini blocked the prompt: ${json.promptFeedback.blockReason}`
    );
  }
  const text = json.candidates?.[0]?.content?.parts
    ?.map((p) => p.text || "")
    .join("")
    .trim();
  if (!text) throw new GeminiError("Gemini returned empty content");
  return text;
}

/**
 * Text models this key can call, for the model picker. Listing is not proof a
 * model works (Google keeps retired models in this list), so the picker's Test
 * button makes a real call.
 */
export async function listGeminiModels(apiKey: string): Promise<LlmModelOption[]> {
  const res = await fetch(
    `${GEMINI_BASE}/models?pageSize=1000&key=${encodeURIComponent(ensureKey(apiKey))}`
  );
  if (!res.ok) throw geminiHttpError(res.status, await res.text(), 1);
  const json = (await res.json()) as {
    models?: { name?: string; displayName?: string; supportedGenerationMethods?: string[] }[];
  };
  return (json.models ?? [])
    .filter((m) => m.supportedGenerationMethods?.includes("generateContent"))
    .map((m) => ({ id: (m.name ?? "").replace(/^models\//, ""), label: m.displayName || "" }))
    .filter((m) => /^gemini-/.test(m.id) && !/embedding|image|tts|audio|live/.test(m.id))
    .map((m) => ({ id: m.id, label: m.label || m.id }));
}

/**
 * Embed texts with Gemini, 100 per request (the batch endpoint's limit). Used
 * only by offline tooling; never on a request path and never in a score.
 */
export async function geminiEmbed(
  texts: string[],
  apiKey: string | null | undefined,
  model: string = GEMINI_EMBEDDING_MODEL
): Promise<number[][]> {
  const key = ensureKey(apiKey);
  const url = `${GEMINI_BASE}/models/${model}:batchEmbedContents?key=${key}`;
  const out: number[][] = [];
  for (let i = 0; i < texts.length; i += 100) {
    const chunk = texts.slice(i, i + 100);
    const res = await postWithRetry(
      url,
      JSON.stringify({
        requests: chunk.map((text) => ({
          model: `models/${model}`,
          content: { parts: [{ text }] },
        })),
      })
    );
    const json = (await res.json()) as { embeddings?: { values?: number[] }[] };
    const vectors = (json.embeddings ?? []).map((e) => e.values ?? []);
    if (vectors.length !== chunk.length || vectors.some((v) => v.length === 0)) {
      throw new GeminiError(`Gemini returned ${vectors.length} embeddings for ${chunk.length} texts`);
    }
    out.push(...vectors);
  }
  return out;
}
