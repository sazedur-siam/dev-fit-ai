import { DEFAULT_LLM_MODELS } from "@/lib/config";
import { getKeyStatuses, readUserKeys } from "@/lib/db/keys";
import type { LlmConfig } from "@/lib/llm";
import { PROVIDER_META } from "@/lib/providers";
import {
  LLM_PROVIDERS,
  isSelfService,
  type AppUser,
  type CredentialSource,
  type KeyKind,
  type LlmProvider,
  type LlmSettings,
} from "@/lib/types";

export type { CredentialSource };

export interface ResolvedCredentials {
  /** Provider, model and key for the two model calls. */
  llm: LlmConfig;
  llmSource: CredentialSource;
  githubToken: string | null;
  githubSource: CredentialSource;
}

type CredentialUser = Pick<AppUser, "id" | "source" | "llm">;

/** Server env keys this user may fall back to; none for self-service accounts. */
function envKeys(user: Pick<AppUser, "source">): Partial<Record<KeyKind, string>> {
  if (isSelfService(user.source)) return {};
  const out: Partial<Record<KeyKind, string>> = {};
  for (const provider of LLM_PROVIDERS) {
    const value = process.env[PROVIDER_META[provider].envVar]?.trim();
    if (value) out[provider] = value;
  }
  const github = process.env.GITHUB_TOKEN?.trim();
  if (github) out.github = github;
  return out;
}

/**
 * Which provider and model a request uses. Pure, so the rules are testable:
 *
 * 1. The provider the user picked in Settings, with the model they picked.
 * 2. Otherwise the first provider they have saved a key for.
 * 3. Otherwise the first provider the server has a key for (if they may use it).
 * 4. Otherwise Gemini, which then fails with a clear "no key" message.
 *
 * A model only comes from the preference; otherwise it's the provider default.
 */
export function pickLlm(
  pref: AppUser["llm"],
  userKeys: Partial<Record<KeyKind, string>>,
  serverKeys: Partial<Record<KeyKind, string>>
): { provider: LlmProvider; model: string } {
  const provider: LlmProvider =
    pref?.provider ??
    LLM_PROVIDERS.find((p) => userKeys[p]) ??
    LLM_PROVIDERS.find((p) => serverKeys[p]) ??
    "gemini";
  const model = pref?.provider === provider ? pref.model : DEFAULT_LLM_MODELS[provider];
  return { provider, model };
}

/**
 * Credentials for one request, preferring the signed-in user's stored keys and
 * falling back to the process environment.
 *
 * The env fallback is deliberate: it keeps a single-operator deployment and local
 * development working without anyone having to save keys through the UI. The
 * `*Source` fields let the UI say which one was used, so a surprising result is
 * traceable to the credential behind it.
 *
 * Self-registered and Google accounts never get the fallback. Anyone can create
 * one, so letting them use the server's keys would hand those keys (and their
 * bill) to the public. They must save their own.
 *
 * Decrypted values must not leave the server.
 */
export async function resolveCredentials(user: CredentialUser): Promise<ResolvedCredentials> {
  const userKeys = await readUserKeys(user.id);
  const serverKeys = envKeys(user);
  const { provider, model } = pickLlm(user.llm, userKeys, serverKeys);

  const llmKey = userKeys[provider] ?? serverKeys[provider] ?? null;
  const githubToken = userKeys.github ?? serverKeys.github ?? null;

  return {
    llm: { provider, model, apiKey: llmKey },
    llmSource: userKeys[provider] ? "user" : serverKeys[provider] ? "env" : "none",
    githubToken,
    githubSource: userKeys.github ? "user" : serverKeys.github ? "env" : "none",
  };
}

/**
 * The key to use for one specific provider, for the picker's "load models" and
 * "test" actions: a key typed into the dialog wins, then the stored one, then
 * the server's (admin-created accounts only).
 */
export async function keyForProvider(
  user: CredentialUser,
  provider: LlmProvider,
  draftKey?: string | null
): Promise<string | null> {
  const draft = draftKey?.trim();
  if (draft) return draft;
  const userKeys = await readUserKeys(user.id);
  return userKeys[provider] ?? envKeys(user)[provider] ?? null;
}

/** Whether any key (own or server) exists for this provider. */
export async function hasKeyFor(user: CredentialUser, provider: LlmProvider): Promise<boolean> {
  return Boolean(await keyForProvider(user, provider));
}

/** The safe-to-send summary for Settings and the picker. Previews only. */
export async function getLlmSettings(user: CredentialUser): Promise<LlmSettings> {
  const [userKeys, statuses] = await Promise.all([
    readUserKeys(user.id),
    getKeyStatuses(user.id),
  ]);
  const serverKeys = envKeys(user);
  const active = pickLlm(user.llm, userKeys, serverKeys);
  return {
    active,
    activeSource: userKeys[active.provider]
      ? "user"
      : serverKeys[active.provider]
        ? "env"
        : "none",
    chosen: Boolean(user.llm),
    keys: statuses.filter((s) => s.kind !== "github"),
    serverProviders: LLM_PROVIDERS.filter((p) => serverKeys[p]),
    defaults: { ...DEFAULT_LLM_MODELS },
  };
}
