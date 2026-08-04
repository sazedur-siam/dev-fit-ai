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

function ensureKey(): string {
  const key = process.env.GEMINI_API_KEY;
  if (!key) {
    throw new GeminiError(
      "GEMINI_API_KEY is not set. Copy .env.local.example → .env.local and paste your key from https://aistudio.google.com/app/apikey"
    );
  }
  return key;
}

/**
 * Call Gemini and get the raw text back. Model default is `gemini-2.5-flash`
 * (free tier); override with GEMINI_MODEL env var.
 */
async function geminiText(prompt: string, opts?: { jsonMode?: boolean }) {
  const key = ensureKey();
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

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new GeminiError(
      `Gemini ${res.status} ${res.statusText} — ${text.slice(0, 300)}`,
      res.status
    );
  }

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
export async function geminiJSON<T>(prompt: string): Promise<T> {
  const first = await geminiText(prompt, { jsonMode: true });
  try {
    return JSON.parse(stripFences(first)) as T;
  } catch {
    const retryPrompt = `${prompt}

IMPORTANT: Your previous response was not valid JSON. Return ONLY a single JSON object with no prose, no markdown fences, no comments. Do not wrap it in \`\`\`. Just the JSON.`;
    const second = await geminiText(retryPrompt, { jsonMode: true });
    return JSON.parse(stripFences(second)) as T;
  }
}
