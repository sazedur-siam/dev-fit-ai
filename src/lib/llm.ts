import Anthropic from "@anthropic-ai/sdk";
import OpenAI from "openai";
import { geminiText, listGeminiModels } from "@/lib/gemini";
import { PROVIDER_META, type LlmModelOption } from "@/lib/providers";
import type { LlmProvider } from "@/lib/types";

/**
 * One call's worth of model access: which provider, which model, whose key.
 * Built by `resolveCredentials()`. The key must never reach a client.
 */
export interface LlmConfig {
  provider: LlmProvider;
  model: string;
  apiKey: string | null;
}

export class LlmError extends Error {
  status?: number;
  constructor(message: string, status?: number) {
    super(message);
    this.name = "LlmError";
    this.status = status;
  }
}

/** Every provider is asked for JSON the same way; Gemini also gets JSON mode. */
const JSON_INSTRUCTIONS =
  "Respond with a single valid JSON object and nothing else: no prose, no markdown fences, no comments.";

/** Room for the reply plus any reasoning tokens the model spends first. */
const MAX_OUTPUT_TOKENS = 16000;

/** The SDKs retry 408/409/429/5xx and network errors with backoff on their own. */
const SDK_OPTIONS = { maxRetries: 3, timeout: 120_000 } as const;

function requireKey(provider: LlmProvider, apiKey: string | null | undefined): string {
  const key = apiKey?.trim();
  if (!key) {
    const meta = PROVIDER_META[provider];
    throw new LlmError(
      `No ${meta.keyLabel} available. Add one in Settings (AI model → Change), or pick a provider you have a key for. Get a key at ${meta.keyLink}`
    );
  }
  return key;
}

/** Turn an SDK status error into a sentence a PM can act on. */
function friendlyError(provider: LlmProvider, model: string, err: unknown): Error {
  const label = PROVIDER_META[provider].label;
  const status =
    err instanceof Anthropic.APIError || err instanceof OpenAI.APIError ? err.status : undefined;
  if (status === undefined) return err instanceof Error ? err : new LlmError(String(err));
  const detail = err instanceof Error ? err.message : "";
  if (status === 401 || status === 403) {
    return new LlmError(`${label} rejected the API key (${status}). Check or replace it in Settings.`, status);
  }
  if (status === 404) {
    return new LlmError(
      `${label} has no model "${model}" for this key (404). Pick another model in Settings.`,
      status
    );
  }
  if (status === 429) {
    return new LlmError(
      `${label} rate limit or quota reached (429). Wait a minute and retry, or check your plan's limits.`,
      status
    );
  }
  if (status >= 500) {
    return new LlmError(
      `${label} is overloaded or erroring right now (${status}). This is on the provider's side; try again shortly or pick another model.`,
      status
    );
  }
  return new LlmError(`${label} ${status}: ${detail}`.trim(), status);
}

/**
 * OpenAI reasoning models (the GPT-5 and GPT-6 families, o-series) take a
 * reasoning effort; older chat models reject the parameter.
 */
export function isOpenAIReasoningModel(model: string): boolean {
  return /^(gpt-[5-9]|o\d)/.test(model);
}

/** Claude 5-generation models accept `output_config.effort`; Haiku 4.5 and older error on it. */
export function supportsClaudeEffort(model: string): boolean {
  return /^claude-(opus|sonnet|haiku|fable|mythos)-5/.test(model);
}

/**
 * Models that support server-side refusal fallbacks: if a safety classifier
 * declines, the API re-runs the request on a fallback model in the same call.
 * Haiku has no server-side fallback, so it isn't listed.
 */
const CLAUDE_FALLBACK_MODELS = new Set([
  "claude-fable-5-2",
  "claude-fable-5-1",
  "claude-opus-5-5",
  "claude-opus-5",
  "claude-sonnet-5-5",
]);

async function openaiText(prompt: string, cfg: LlmConfig): Promise<string> {
  const client = new OpenAI({ apiKey: requireKey("openai", cfg.apiKey), ...SDK_OPTIONS });
  const res = await client.responses.create({
    model: cfg.model,
    instructions: JSON_INSTRUCTIONS,
    input: prompt,
    text: { format: { type: "json_object" } },
    max_output_tokens: MAX_OUTPUT_TOKENS,
    // The work is extraction and narration, not hard reasoning; low keeps it quick.
    ...(isOpenAIReasoningModel(cfg.model) ? { reasoning: { effort: "low" as const } } : {}),
  });
  if (res.status === "incomplete") {
    throw new LlmError(
      `OpenAI stopped before finishing (${res.incomplete_details?.reason ?? "incomplete"}).`
    );
  }
  const text = res.output_text?.trim();
  if (!text) throw new LlmError("OpenAI returned empty content");
  return text;
}

async function anthropicText(prompt: string, cfg: LlmConfig): Promise<string> {
  const client = new Anthropic({ apiKey: requireKey("anthropic", cfg.apiKey), ...SDK_OPTIONS });
  const fallback = CLAUDE_FALLBACK_MODELS.has(cfg.model);
  const res = await client.beta.messages.create({
    model: cfg.model,
    max_tokens: MAX_OUTPUT_TOKENS,
    system: JSON_INSTRUCTIONS,
    messages: [{ role: "user", content: prompt }],
    // No temperature/top_p: current Claude models reject sampling parameters.
    // Low effort: this is extraction and narration, and both calls sit on the
    // request path the user is waiting on.
    ...(supportsClaudeEffort(cfg.model) ? { output_config: { effort: "low" as const } } : {}),
    ...(fallback
      ? { betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" as const }
      : {}),
  });
  if (res.stop_reason === "refusal") {
    throw new LlmError(
      "Claude declined this request. Try again, or pick another model in Settings."
    );
  }
  if (res.stop_reason === "max_tokens") {
    throw new LlmError("Claude ran out of output tokens before finishing the reply.");
  }
  const text = res.content
    .map((block) => (block.type === "text" ? block.text : ""))
    .join("")
    .trim();
  if (!text) throw new LlmError("Claude returned empty content");
  return text;
}

/** Ask the configured provider for a JSON reply and return its raw text. */
export async function llmText(prompt: string, cfg: LlmConfig): Promise<string> {
  try {
    switch (cfg.provider) {
      case "gemini":
        return await geminiText(prompt, cfg.apiKey, cfg.model, { jsonMode: true });
      case "openai":
        return await openaiText(prompt, cfg);
      case "anthropic":
        return await anthropicText(prompt, cfg);
    }
  } catch (err) {
    throw friendlyError(cfg.provider, cfg.model, err);
  }
}

/**
 * Strip markdown code fences so JSON.parse doesn't choke when a model wraps its
 * output in ```json ... ``` despite being told not to.
 */
export function stripFences(text: string): string {
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
 * Ask for JSON and parse it. Retries once with a stricter reminder on a parse
 * failure, the fragile part of this app. Callers still run the result through a
 * lenient schema, so a malformed reply degrades rather than failing.
 */
export async function llmJSON<T>(prompt: string, cfg: LlmConfig): Promise<T> {
  const first = await llmText(prompt, cfg);
  try {
    return JSON.parse(stripFences(first)) as T;
  } catch {
    const retryPrompt = `${prompt}

IMPORTANT: Your previous response was not valid JSON. Return ONLY a single JSON object with no prose, no markdown fences, no comments. Do not wrap it in \`\`\`. Just the JSON.`;
    const second = await llmText(retryPrompt, cfg);
    return JSON.parse(stripFences(second)) as T;
  }
}

/** Chat models from OpenAI's list, minus audio, image, embedding and the like. */
export function isOpenAIChatModelId(id: string): boolean {
  return (
    /^(gpt-|o\d|chatgpt-)/.test(id) &&
    !/(audio|realtime|transcribe|tts|image|embedding|search|moderation|instruct)/.test(id)
  );
}

/**
 * The models this key can see, straight from the provider. For the picker only;
 * nothing on the ranking path calls it.
 */
export async function listProviderModels(
  provider: LlmProvider,
  apiKey: string
): Promise<LlmModelOption[]> {
  try {
    switch (provider) {
      case "gemini":
        return await listGeminiModels(apiKey);
      case "openai": {
        const client = new OpenAI({ apiKey, ...SDK_OPTIONS });
        const out: LlmModelOption[] = [];
        for await (const m of client.models.list()) {
          if (isOpenAIChatModelId(m.id)) out.push({ id: m.id, label: m.id });
        }
        return out.sort((a, b) => b.id.localeCompare(a.id));
      }
      case "anthropic": {
        const client = new Anthropic({ apiKey, ...SDK_OPTIONS });
        const out: LlmModelOption[] = [];
        for await (const m of client.models.list()) {
          out.push({ id: m.id, label: m.display_name || m.id });
        }
        return out;
      }
    }
  } catch (err) {
    throw friendlyError(provider, "", err);
  }
}
