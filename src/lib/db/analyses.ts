import { ObjectId, type WithId } from "mongodb";
import { SCORING_VERSION } from "@/lib/config";
import { COLLECTIONS, getDb } from "@/lib/mongodb";
import type { FitScore, RepoRequirement, StoredAnalysis } from "@/lib/types";

interface AnalysisDoc {
  userId: string;
  repoUrl: string | null;
  owner: string | null;
  repo: string | null;
  /** Set for runs started from a described need; absent on older documents. */
  needText?: string | null;
  requirement: RepoRequirement;
  ranked: FitScore[];
  topPickId: string;
  topPickRationale: string;
  /** Absent on documents saved before scoring was versioned. */
  scoringVersion?: string;
  createdAt: Date;
}

async function analyses() {
  return (await getDb()).collection<AnalysisDoc>(COLLECTIONS.analyses);
}

function toStored(doc: WithId<AnalysisDoc>): StoredAnalysis {
  return {
    id: doc._id.toHexString(),
    repoUrl: doc.repoUrl,
    owner: doc.owner,
    repo: doc.repo,
    needText: doc.needText ?? null,
    requirement: doc.requirement,
    ranked: doc.ranked,
    topPickId: doc.topPickId,
    topPickRationale: doc.topPickRationale,
    scoringVersion: doc.scoringVersion ?? "0",
    createdAt: doc.createdAt.toISOString(),
  };
}

/** Stamps the current SCORING_VERSION itself, so no caller can forget it. */
export async function saveAnalysis(
  userId: string,
  input: Omit<AnalysisDoc, "userId" | "createdAt" | "scoringVersion">
): Promise<string> {
  const col = await analyses();
  const res = await col.insertOne({
    ...input,
    scoringVersion: SCORING_VERSION,
    userId,
    createdAt: new Date(),
  });
  return res.insertedId.toHexString();
}

export async function listUserAnalyses(
  userId: string,
  limit = 25
): Promise<StoredAnalysis[]> {
  const col = await analyses();
  const docs = await col
    .find({ userId })
    .sort({ createdAt: -1 })
    .limit(limit)
    .toArray();
  return docs.map(toStored);
}

export async function getUserAnalysis(
  userId: string,
  id: string
): Promise<StoredAnalysis | null> {
  if (!ObjectId.isValid(id)) return null;
  const col = await analyses();
  // Scoped by userId so an id from another account is a miss, not a leak.
  const doc = await col.findOne({ _id: new ObjectId(id), userId });
  return doc ? toStored(doc) : null;
}

export async function countUserAnalyses(userId: string): Promise<number> {
  const col = await analyses();
  return col.countDocuments({ userId });
}
