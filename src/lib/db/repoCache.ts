import { REPO_CACHE_TTL_DAYS } from "@/lib/config";
import type { RepoDigest } from "@/lib/github";
import { COLLECTIONS, getDb } from "@/lib/mongodb";
import type { RepoRequirement } from "@/lib/types";

/**
 * Per-commit cache for public repositories: the built digest, and Gemini's
 * RepoRequirement for it. Keys always include the commit SHA, so a new push is a
 * miss rather than a stale hit. **Never call these for a private repo**: the key
 * has no user in it, so a cached private digest would be served to anyone who
 * asked for the same URL.
 */

interface DigestDoc {
  key: string;
  digest: RepoDigest;
  expiresAt: Date;
}

interface RequirementDoc {
  key: string;
  requirement: RepoRequirement;
  fileCount: number;
  expiresAt: Date;
}

/** GitHub owner/repo names are case-insensitive, so the key is lowercased. */
export function digestCacheKey(owner: string, repo: string, sha: string): string {
  return `${owner}/${repo}@${sha}`.toLowerCase();
}

export function requirementCacheKey(
  owner: string,
  repo: string,
  sha: string,
  model: string,
  promptVersion: string
): string {
  return `${digestCacheKey(owner, repo, sha)}|${model}|p${promptVersion}`;
}

const expiry = () => new Date(Date.now() + REPO_CACHE_TTL_DAYS * 24 * 60 * 60 * 1000);

let indexesReady: Promise<unknown> | null = null;

async function collections() {
  const db = await getDb();
  const digests = db.collection<DigestDoc>(COLLECTIONS.repoDigests);
  const requirements = db.collection<RequirementDoc>(COLLECTIONS.repoRequirements);
  indexesReady ??= Promise.all(
    [digests, requirements].flatMap((col) => [
      col.createIndex({ key: 1 }, { unique: true }),
      col.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 }),
    ])
  ).catch((err) => {
    indexesReady = null;
    throw err;
  });
  await indexesReady;
  return { digests, requirements };
}

export async function getCachedDigest(key: string): Promise<RepoDigest | null> {
  const { digests } = await collections();
  const doc = await digests.findOne({ key, expiresAt: { $gt: new Date() } });
  return doc?.digest ?? null;
}

export async function saveDigest(key: string, digest: RepoDigest): Promise<void> {
  const { digests } = await collections();
  await digests.updateOne(
    { key },
    { $set: { digest, expiresAt: expiry() } },
    { upsert: true }
  );
}

export async function getCachedRequirement(
  key: string
): Promise<{ requirement: RepoRequirement; fileCount: number } | null> {
  const { requirements } = await collections();
  const doc = await requirements.findOne({ key, expiresAt: { $gt: new Date() } });
  return doc ? { requirement: doc.requirement, fileCount: doc.fileCount } : null;
}

export async function saveRequirement(
  key: string,
  requirement: RepoRequirement,
  fileCount: number
): Promise<void> {
  const { requirements } = await collections();
  await requirements.updateOne(
    { key },
    { $set: { requirement, fileCount, expiresAt: expiry() } },
    { upsert: true }
  );
}
