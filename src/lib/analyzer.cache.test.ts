import { beforeEach, describe, expect, it, vi } from "vitest";
import type { RepoDigest, RepoHead } from "@/lib/github";

vi.mock("@/lib/github", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/github")>()),
  getRepoHead: vi.fn(),
  buildRepoDigest: vi.fn(),
}));
vi.mock("@/lib/gemini", () => ({ geminiJSON: vi.fn() }));
vi.mock("@/lib/db/repoCache", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/db/repoCache")>()),
  getCachedDigest: vi.fn(),
  saveDigest: vi.fn(),
  getCachedRequirement: vi.fn(),
  saveRequirement: vi.fn(),
}));

const github = await import("@/lib/github");
const gemini = await import("@/lib/gemini");
const cache = await import("@/lib/db/repoCache");
const { analyzeRepo } = await import("@/lib/analyzer");

const creds = {
  geminiApiKey: "k",
  githubToken: "t",
  geminiSource: "user",
  githubSource: "user",
} as const;

const head = (isPrivate: boolean): RepoHead => ({
  defaultBranch: "main",
  sha: "abc123",
  description: null,
  isPrivate,
});

const digest: RepoDigest = {
  owner: "Acme",
  repo: "Shop",
  defaultBranch: "main",
  digest: "# digest",
  fileCount: 7,
  languageBytes: { TypeScript: 100 },
};

const goodReply = {
  stack: ["Next.js"],
  languages: ["TypeScript"],
  primaryArchetypeNeeded: "frontend",
  domain: "shop",
  complexity: "moderate",
  summary: "A shop.",
};

beforeEach(() => {
  vi.mocked(github.buildRepoDigest).mockReset().mockResolvedValue(digest);
  vi.mocked(gemini.geminiJSON).mockReset().mockResolvedValue(goodReply);
  vi.mocked(cache.getCachedDigest).mockReset().mockResolvedValue(null);
  vi.mocked(cache.getCachedRequirement).mockReset().mockResolvedValue(null);
  vi.mocked(cache.saveDigest).mockReset().mockResolvedValue();
  vi.mocked(cache.saveRequirement).mockReset().mockResolvedValue();
});

describe("analyzeRepo caching", () => {
  it("cold public repo: builds, asks Gemini once, saves both caches", async () => {
    vi.mocked(github.getRepoHead).mockResolvedValue(head(false));
    const out = await analyzeRepo("https://github.com/Acme/Shop", creds);

    expect(out.requirement.primaryArchetypeNeeded).toBe("frontend");
    expect(out.digestMeta).toEqual({ owner: "Acme", repo: "Shop", fileCount: 7 });
    expect(github.buildRepoDigest).toHaveBeenCalledOnce();
    expect(gemini.geminiJSON).toHaveBeenCalledOnce();
    expect(cache.saveDigest).toHaveBeenCalledWith("acme/shop@abc123", digest);
    expect(cache.saveRequirement).toHaveBeenCalledOnce();
  });

  it("requirement hit: skips the digest and Gemini entirely", async () => {
    vi.mocked(github.getRepoHead).mockResolvedValue(head(false));
    vi.mocked(cache.getCachedRequirement).mockResolvedValue({
      requirement: { ...goodReply, primaryArchetypeNeeded: "backend" } as never,
      fileCount: 3,
    });
    const out = await analyzeRepo("github.com/acme/shop", creds);

    expect(out.requirement.primaryArchetypeNeeded).toBe("backend");
    expect(out.digestMeta.fileCount).toBe(3);
    expect(github.buildRepoDigest).not.toHaveBeenCalled();
    expect(gemini.geminiJSON).not.toHaveBeenCalled();
  });

  it("digest hit: reuses the digest but still asks Gemini", async () => {
    vi.mocked(github.getRepoHead).mockResolvedValue(head(false));
    vi.mocked(cache.getCachedDigest).mockResolvedValue(digest);
    await analyzeRepo("github.com/acme/shop", creds);

    expect(github.buildRepoDigest).not.toHaveBeenCalled();
    expect(gemini.geminiJSON).toHaveBeenCalledOnce();
  });

  it("private repo: never reads or writes the cache", async () => {
    vi.mocked(github.getRepoHead).mockResolvedValue(head(true));
    await analyzeRepo("github.com/acme/secret", creds);

    expect(cache.getCachedRequirement).not.toHaveBeenCalled();
    expect(cache.getCachedDigest).not.toHaveBeenCalled();
    expect(cache.saveDigest).not.toHaveBeenCalled();
    expect(cache.saveRequirement).not.toHaveBeenCalled();
  });

  it("a broken cache store degrades to a normal run", async () => {
    vi.mocked(github.getRepoHead).mockResolvedValue(head(false));
    vi.mocked(cache.getCachedRequirement).mockRejectedValue(new Error("db down"));
    vi.mocked(cache.getCachedDigest).mockRejectedValue(new Error("db down"));
    vi.mocked(cache.saveDigest).mockRejectedValue(new Error("db down"));
    vi.mocked(cache.saveRequirement).mockRejectedValue(new Error("db down"));
    vi.spyOn(console, "error").mockImplementation(() => {});

    const out = await analyzeRepo("github.com/acme/shop", creds);
    expect(out.requirement.languages).toEqual(["TypeScript"]);
  });

  it("does not cache a degraded Gemini reply", async () => {
    vi.mocked(github.getRepoHead).mockResolvedValue(head(false));
    vi.mocked(gemini.geminiJSON).mockResolvedValue({ stack: [] });
    const out = await analyzeRepo("github.com/acme/shop", creds);

    expect(out.requirement.primaryArchetypeNeeded).toBe("fullstack"); // default
    expect(cache.saveRequirement).not.toHaveBeenCalled();
    expect(cache.saveDigest).toHaveBeenCalledOnce(); // the digest itself is fine
  });
});

describe("cache keys", () => {
  it("are case-insensitive on owner/repo and include sha, model and prompt version", () => {
    expect(cache.digestCacheKey("Acme", "Shop", "ABC")).toBe("acme/shop@abc");
    expect(cache.requirementCacheKey("acme", "shop", "abc", "gemini-x", "2")).toBe(
      "acme/shop@abc|gemini-x|p2"
    );
  });
});

describe("mapInBatches", () => {
  it("keeps input order and never runs more than `size` at once", async () => {
    let running = 0;
    let peak = 0;
    const out = await github.mapInBatches([1, 2, 3, 4, 5, 6, 7], 3, async (n) => {
      running++;
      peak = Math.max(peak, running);
      await new Promise((r) => setTimeout(r, (8 - n) * 2)); // later items finish first
      running--;
      return n * 10;
    });
    expect(out).toEqual([10, 20, 30, 40, 50, 60, 70]);
    expect(peak).toBeLessThanOrEqual(3);
  });
});
