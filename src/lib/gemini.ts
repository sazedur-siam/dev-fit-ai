import { GEMINI_MODEL } from "@/lib/config";

const GEMINI_BASE = "https://generativelanguage.googleapis.com/v1beta";

class GeminiError extends Error {
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
      `Gemini is overloaded right now${tried} — this is on Google's side, not a problem with your key or the repo. Try again in a minute, or set GEMINI_MODEL to a less busy model.`,
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
 * The key is passed in rather than read from the environment: each signed-in user
 * stores their own credential, so there is no single ambient key to reach for.
 * Model default lives in config.ts; override with the GEMINI_MODEL env var.
 */
async function geminiText(
  prompt: string,
  apiKey: string | null | undefined,
  opts?: { jsonMode?: boolean }
) {
  const key = ensureKey(apiKey);
  const url = `${GEMINI_BASE}/models/${GEMINI_MODEL}:generateContent?key=${key}`;

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
 * Strip common markdown code fences so JSON.parse doesn't choke when the model
 * wraps output in ```json ... ``` despite responseMimeType=application/json.
 */
function stripFences(text: string): string {
  const trimmed = text.trim();
  if (trimmed.startsWith("```")) {
    return trimmed
      .replace(/^```(?:json)?\s*/i, "")
      .replace(/```\s*$/i, "")
      .trim();
  }
  return trimmed;
}

/**
 * Ask Gemini for JSON, parse it. Retries once with a stricter reminder on
 * parse failure — the fragile part of this app.
 */
export async function geminiJSON<T>(
  prompt: string,
  apiKey: string | null | undefined
): Promise<T> {
  const first = await geminiText(prompt, apiKey, { jsonMode: true });
  try {
    return JSON.parse(stripFences(first)) as T;
  } catch {
    const retryPrompt = `${prompt}

IMPORTANT: Your previous response was not valid JSON. Return ONLY a single JSON object with no prose, no markdown fences, no comments. Do not wrap it in \`\`\`. Just the JSON.`;
    const second = await geminiText(retryPrompt, apiKey, { jsonMode: true });
    return JSON.parse(stripFences(second)) as T;
  }
}
