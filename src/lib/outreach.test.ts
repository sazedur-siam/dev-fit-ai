import { beforeEach, describe, expect, it, vi } from "vitest";
import type { DeveloperView, RepoRequirement } from "@/lib/types";

vi.mock("@/lib/llm", () => ({ llmJSON: vi.fn() }));
const llm = await import("@/lib/llm");
const { buildOutreachPrompt, draftOutreach, mentionsNumbers, outreachFacts } = await import(
  "@/lib/outreach"
);

const dev: DeveloperView = {
  id: "kwame-osei",
  name: "Kwame Osei",
  archetype: "backend",
  totalCommits: 1180,
  linesAdded: 92410,
  linesDeleted: 31220,
  repos: [
    { name: "boo-energi-api", commits: 500, additions: 1, deletions: 0, languages: ["Python", "SQL"], frameworks: ["Django REST Framework"] },
    { name: "event-bus", commits: 200, additions: 1, deletions: 0, languages: ["Python", "YAML"], frameworks: ["Celery"] },
    { name: "unrelated", commits: 50, additions: 1, deletions: 0, languages: ["Go"], frameworks: [] },
  ],
  recentCommitMessages: [],
  languages: ["Python", "SQL", "YAML", "Go"],
  frameworks: ["Django REST Framework", "Celery"],
  netLines: 61190,
  aiFluency: null,
};
const requirement: RepoRequirement = {
  languages: ["Python"],
  stack: ["Django", "Celery"],
  primaryArchetypeNeeded: "backend",
  domain: "energy billing",
  complexity: "high",
  summary: "An API for energy invoices.",
};
const creds = {
  llm: { provider: "gemini", model: "gemini-test", apiKey: "k" },
  llmSource: "user",
  githubToken: null,
  githubSource: "none",
} as const;

beforeEach(() => vi.mocked(llm.llmJSON).mockReset());

describe("outreachFacts", () => {
  it("keeps only skills and repos relevant to the work, via aliases and implications", () => {
    const f = outreachFacts(dev, requirement);
    expect(f.firstName).toBe("Kwame");
    // DRF implies Django, so it matches the "Django" requirement.
    expect(f.matchingSkills).toEqual(["Python", "Django REST Framework", "Celery"]);
    expect(f.relevantRepos).toEqual(["boo-energi-api", "event-bus"]);
  });

  it("never carries scores or commit counts to the model", () => {
    const prompt = buildOutreachPrompt(outreachFacts(dev, requirement), {
      tone: "friendly",
      senderName: "Sam",
    });
    expect(prompt).not.toMatch(/1180|92410|overall|verdict/i);
    expect(prompt).toContain("Do not mention scores");
    expect(prompt).toContain('"Sam"');
  });

  it("uses a placeholder signature when the PM has no name", () => {
    const prompt = buildOutreachPrompt(outreachFacts(dev, requirement), { tone: "formal", senderName: null });
    expect(prompt).toContain('"[Your name]"');
    expect(prompt).toContain("formal");
  });
});

describe("mentionsNumbers", () => {
  it.each([
    "You scored 82 on our fit check",
    "a 75% match",
    "rated 8/10",
    "you got 90 points",
    "Your score of 74.9",
  ])("flags %j", (t) => expect(mentionsNumbers(t)).toBe(true));

  it.each([
    "Starting in 2026",
    "your work on boo-energi-api",
    "Would you be open to a short chat?",
    "Python 3 and Django",
  ])("allows %j", (t) => expect(mentionsNumbers(t)).toBe(false));
});

describe("draftOutreach", () => {
  const input = { dev, requirement, score: { verdict: "fit" as const }, tone: "friendly" as const, senderName: "Sam" };

  it("returns a clean draft with no warnings", async () => {
    vi.mocked(llm.llmJSON).mockResolvedValue({ subject: "Energy billing API", body: "Hi Kwame, …" });
    const out = await draftOutreach(input, creds);
    expect(out).toEqual({ subject: "Energy billing API", body: "Hi Kwame, …", warnings: [] });
    expect(llm.llmJSON).toHaveBeenCalledOnce();
  });

  it("retries once, strictly, when the first draft mentions a score", async () => {
    vi.mocked(llm.llmJSON)
      .mockResolvedValueOnce({ subject: "Hi", body: "You were a 92% match!" })
      .mockResolvedValueOnce({ subject: "Hi", body: "Your Django work stood out." });
    const out = await draftOutreach(input, creds);
    expect(out.body).toBe("Your Django work stood out.");
    expect(out.warnings).toEqual([]);
    expect(vi.mocked(llm.llmJSON).mock.calls[1][0]).toContain("Use NO numbers");
  });

  it("warns instead of hiding it when a number survives the retry", async () => {
    vi.mocked(llm.llmJSON).mockResolvedValue({ subject: "Hi", body: "Rated 9/10 for this." });
    const out = await draftOutreach(input, creds);
    expect(out.warnings[0]).toMatch(/mentions a number/);
  });

  it("warns when reaching out to a 'not fit' developer", async () => {
    vi.mocked(llm.llmJSON).mockResolvedValue({ subject: "Hi", body: "Hello Kwame." });
    const out = await draftOutreach({ ...input, score: { verdict: "not fit" } }, creds);
    expect(out.warnings.some((w) => w.includes("not fit"))).toBe(true);
  });

  it("errors on an empty draft and fills a missing subject", async () => {
    vi.mocked(llm.llmJSON).mockResolvedValue({ subject: "", body: "" });
    await expect(draftOutreach(input, creds)).rejects.toThrow(/empty draft/);
    vi.mocked(llm.llmJSON).mockResolvedValue({ body: "Hello." });
    expect((await draftOutreach(input, creds)).subject).toBe("A energy billing project you might like");
  });
});
