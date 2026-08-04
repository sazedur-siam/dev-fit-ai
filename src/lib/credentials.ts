import { readUserKey } from "@/lib/db/keys";

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
 * Decrypted values must not leave the server.
 */
export async function resolveCredentials(
  userId: string | null
): Promise<ResolvedCredentials> {
  const [userGemini, userGithub] = userId
    ? await Promise.all([
        readUserKey(userId, "gemini"),
        readUserKey(userId, "github"),
      ])
    : [null, null];

  const envGemini = process.env.GEMINI_API_KEY?.trim() || null;
  const envGithub = process.env.GITHUB_TOKEN?.trim() || null;

  const geminiApiKey = userGemini || envGemini;
  const githubToken = userGithub || envGithub;

  return {
    geminiApiKey,
    githubToken,
    geminiSource: userGemini ? "user" : envGemini ? "env" : "none",
    githubSource: userGithub ? "user" : envGithub ? "env" : "none",
  };
}
