import { ObjectId, type WithId } from "mongodb";
import { toView } from "@/lib/developerHelpers";
import { COLLECTIONS, getDb } from "@/lib/mongodb";
import type {
  GithubProfileInsights,
  MockDeveloper,
  ProfileReport,
  ProfileReportListItem,
  ProfileSummary,
} from "@/lib/types";

/**
 * Saved GitHub Profile Analyzer reports. Private to the user who ran them,
 * admins included, like notes and shortlists: **every query is scoped by
 * userId**, so another user's report id is a miss. One report per (user,
 * login); re-analyzing replaces it.
 */
interface ProfileReportDoc {
  userId: string;
  login: string;
  /** Lowercased login: GitHub logins are case-insensitive. */
  loginKey: string;
  /** Exactly what "Add to pool" would save, so pooling needs no second fetch. */
  developer: MockDeveloper;
  insights: GithubProfileInsights;
  summary: ProfileSummary | null;
  summaryError: string | null;
  /** Absent on reports saved before it existed. */
  developerError?: string | null;
  createdAt: Date;
  updatedAt: Date;
}

let indexed: Promise<unknown> | null = null;

async function reports() {
  const col = (await getDb()).collection<ProfileReportDoc>(COLLECTIONS.profileReports);
  indexed ??= Promise.all([
    col.createIndex({ userId: 1, loginKey: 1 }, { unique: true }),
    col.createIndex({ userId: 1, updatedAt: -1 }),
  ]).catch((e) => {
    indexed = null;
    throw e;
  });
  await indexed;
  return col;
}

const toReport = (d: WithId<ProfileReportDoc>): ProfileReport => ({
  id: d._id.toHexString(),
  login: d.login,
  developer: toView(d.developer),
  insights: d.insights,
  summary: d.summary,
  summaryError: d.summaryError,
  developerError: d.developerError ?? null,
  createdAt: d.createdAt.toISOString(),
  updatedAt: d.updatedAt.toISOString(),
});

export async function saveProfileReport(
  userId: string,
  input: Pick<ProfileReportDoc, "login" | "developer" | "insights" | "summary" | "summaryError" | "developerError">
): Promise<string> {
  const col = await reports();
  const loginKey = input.login.toLowerCase();
  const now = new Date();
  await col.updateOne(
    { userId, loginKey },
    { $set: { ...input, updatedAt: now }, $setOnInsert: { createdAt: now } },
    { upsert: true }
  );
  const doc = await col.findOne({ userId, loginKey }, { projection: { _id: 1 } });
  if (!doc) throw new Error("Saving the report failed.");
  return doc._id.toHexString();
}

export async function getProfileReport(userId: string, id: string): Promise<ProfileReport | null> {
  if (!ObjectId.isValid(id)) return null;
  const doc = await (await reports()).findOne({ _id: new ObjectId(id), userId });
  return doc ? toReport(doc) : null;
}

/**
 * The stored developer exactly as it would enter the pool: the raw shape, not
 * the derived view, so derived fields never get written into `developers`.
 */
export async function getProfileReportDeveloper(userId: string, id: string): Promise<MockDeveloper | null> {
  if (!ObjectId.isValid(id)) return null;
  const doc = await (await reports()).findOne(
    { _id: new ObjectId(id), userId },
    { projection: { developer: 1 } }
  );
  return doc?.developer ?? null;
}

export async function listProfileReports(userId: string, limit = 50): Promise<ProfileReportListItem[]> {
  const docs = await (await reports())
    .find(
      { userId },
      {
        projection: {
          login: 1,
          updatedAt: 1,
          "developer.name": 1,
          "developer.archetype": 1,
          "insights.avatarUrl": 1,
          "summary.headline": 1,
        },
      }
    )
    .sort({ updatedAt: -1 })
    .limit(limit)
    .toArray();
  return docs.map((d) => ({
    id: d._id.toHexString(),
    login: d.login,
    name: d.developer?.name ?? d.login,
    avatarUrl: d.insights?.avatarUrl ?? null,
    archetype: d.developer?.archetype ?? "fullstack",
    headline: d.summary?.headline ?? null,
    updatedAt: d.updatedAt.toISOString(),
  }));
}

export async function deleteProfileReport(userId: string, id: string): Promise<boolean> {
  if (!ObjectId.isValid(id)) return false;
  const res = await (await reports()).deleteOne({ _id: new ObjectId(id), userId });
  return res.deletedCount === 1;
}
