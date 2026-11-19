import type { LlmProvider } from "@/lib/types";

/**
 * The AI providers a user can bring a key for, and a short list of suggested
 * models for each. Client-safe: no env, no I/O, so the model picker imports it.
 *
 * **Model names rot.** These lists are suggestions, not the source of truth: the
 * picker also loads the live list from the provider with the user's own key, and
 * accepts any custom model id. Listing a model is not proof it works, which is
 * why the picker has a "Test" button that makes a real call.
 */
export interface LlmModelOption {
  id: string;
  label: string;
  /** One short phrase shown under the label, e.g. "fast, cheap". */
  note?: string;
}

export interface LlmProviderMeta {
  /** Product name shown in the UI. */
  label: string;
  /** Who makes it. */
  vendor: string;
  keyLabel: string;
  keyPlaceholder: string;
  keyLink: string;
  /** Server env var used as a fallback for admin-created accounts. */
  envVar: string;
  /** Used when the user hasn't picked a model for this provider. */
  defaultModel: string;
  models: LlmModelOption[];
}

export const PROVIDER_META: Record<LlmProvider, LlmProviderMeta> = {
  gemini: {
    label: "Gemini",
    vendor: "Google",
    keyLabel: "Gemini API key",
    keyPlaceholder: "AQ.Ab8… or AIza…",
    keyLink: "https://aistudio.google.com/app/apikey",
    envVar: "GEMINI_API_KEY",
    defaultModel: "gemini-3.6-flash",
    models: [
      { id: "gemini-3.6-flash", label: "Gemini 3.6 Flash", note: "fast, the default" },
      { id: "gemini-flash-latest", label: "Gemini Flash (latest)", note: "alias, follows new releases" },
    ],
  },
  openai: {
    label: "OpenAI",
    vendor: "OpenAI",
    keyLabel: "OpenAI API key",
    keyPlaceholder: "sk-…",
    keyLink: "https://platform.openai.com/api-keys",
    envVar: "OPENAI_API_KEY",
    defaultModel: "gpt-6.2-sol",
    models: [
      { id: "gpt-6.2-sol", label: "GPT-6.2 Sol", note: "balanced" },
      { id: "gpt-6.2-astra", label: "GPT-6.2 Astra", note: "most capable, slower" },
      { id: "gpt-6.1-terra", label: "GPT-6.1 Terra", note: "fast, efficient" },
      { id: "gpt-6-luna", label: "GPT-6 Luna", note: "cheapest" },
    ],
  },
  anthropic: {
    label: "Claude",
    vendor: "Anthropic",
    keyLabel: "Anthropic API key",
    keyPlaceholder: "sk-ant-…",
    keyLink: "https://platform.claude.com/settings/keys",
    envVar: "ANTHROPIC_API_KEY",
    defaultModel: "claude-opus-5-5",
    models: [
      { id: "claude-opus-5-5", label: "Claude Opus 5.5", note: "most capable Opus" },
      { id: "claude-sonnet-5-5", label: "Claude Sonnet 5.5", note: "balanced" },
      { id: "claude-haiku-5-5", label: "Claude Haiku 5.5", note: "fast, cheapest" },
      { id: "claude-fable-5-2", label: "Claude Fable 5.2", note: "top tier, priciest" },
    ],
  },
};

/**
 * What a model id may look like. Permissive on purpose (providers use dots,
 * slashes and colons), but it rules out whitespace, `?`, `#` and `..`, since the
 * Gemini id is interpolated into a request path.
 */
const MODEL_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,99}$/;

export function isValidModelId(value: string): boolean {
  return MODEL_ID_PATTERN.test(value) && !value.includes("..");
}

/** The friendly label for a known id, otherwise "Claude · some-custom-id". */
export function describeModel(provider: LlmProvider, model: string): string {
  const meta = PROVIDER_META[provider];
  const known = meta.models.find((m) => m.id === model);
  return known ? known.label : `${meta.label} · ${model}`;
}
