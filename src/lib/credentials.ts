import { readUserKey } from "@/lib/db/keys";
import { isSelfService, type AppUser } from "@/lib/types";

export type CredentialSource = "user" | "env" | "none";

export interface ResolvedCredentials {
  geminiApiKey: string | null;
  githubToken: string | null;
  geminiSource: CredentialSource;
  githubSource: CredentialSource;
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
export async function resolveCredentials(
  user: Pick<AppUser, "id" | "source">
): Promise<ResolvedCredentials> {
  const [userGemini, userGithub] = await Promise.all([
    readUserKey(user.id, "gemini"),
    readUserKey(user.id, "github"),
  ]);

  const allowEnv = !isSelfService(user.source);
  const envGemini = (allowEnv && process.env.GEMINI_API_KEY?.trim()) || null;
  const envGithub = (allowEnv && process.env.GITHUB_TOKEN?.trim()) || null;

  const geminiApiKey = userGemini || envGemini;
  const githubToken = userGithub || envGithub;

  return {
    geminiApiKey,
    githubToken,
    geminiSource: userGemini ? "user" : envGemini ? "env" : "none",
    githubSource: userGithub ? "user" : envGithub ? "env" : "none",
  };
}
