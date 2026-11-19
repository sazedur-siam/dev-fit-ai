import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/llm", () => ({ llmJSON: vi.fn() }));
const llm = await import("@/lib/llm");
const { parseNeed, rankAndExplain } = await import("@/lib/analyzer");
const { NeedBodySchema, NeedQuestionsSchema } = await import("@/lib/schemas");

const creds = {
  llm: { provider: "gemini", model: "gemini-test", apiKey: "k" },
  llmSource: "user",
  githubToken: null,
  githubSource: "none",
} as const;
const requirementReply = {
  stack: ["Magento"],
  languages: ["PHP"],
  primaryArchetypeNeeded: "backend",
  domain: "B2B commerce",
  complexity: "high",
  summary: "A Magento B2B pricing module.",
};

beforeEach(() => vi.mocked(llm.llmJSON).mockReset());

describe("parseNeed", () => {
  it("returns clarifying questions on the first call when the model asks", async () => {
    vi.mocked(llm.llmJSON).mockResolvedValue({
      ...requirementReply,
      questions: [{ id: "side", question: "Frontend or backend?", options: ["Frontend", "Backend", "Both"] }],
    });
    const out = await parseNeed("We need someone for our shop", [], true, creds);
    expect(out).toEqual({
      status: "clarify",
      questions: [{ id: "side", question: "Frontend or backend?", options: ["Frontend", "Backend", "Both"] }],
    });
  });

  it("ignores questions on the follow-up call, so a PM is asked at most once", async () => {
    vi.mocked(llm.llmJSON).mockResolvedValue({
      ...requirementReply,
      questions: [{ question: "Again?", options: ["a", "b"] }],
    });
    const out = await parseNeed("We need a Magento dev", [], false, creds);
    expect(out.status).toBe("ready");
    const prompt = vi.mocked(llm.llmJSON).mock.calls[0][0];
    expect(prompt).toContain("Do NOT ask questions");
  });

  it("puts the PM's answers into the prompt", async () => {
    vi.mocked(llm.llmJSON).mockResolvedValue(requirementReply);
    await parseNeed("Shop work", [{ question: "Frontend or backend?", answer: "Backend" }], false, creds);
    expect(vi.mocked(llm.llmJSON).mock.calls[0][0]).toContain("- Frontend or backend? → Backend");
  });

  it("produces the same RepoRequirement shape a repo would", async () => {
    vi.mocked(llm.llmJSON).mockResolvedValue({ ...requirementReply, questions: [] });
    const out = await parseNeed("We need a Magento dev for B2B pricing", [], true, creds);
    expect(out).toEqual({ status: "ready", requirement: requirementReply });
  });

  it("degrades a malformed reply to defaults, using the text as the summary", async () => {
    vi.mocked(llm.llmJSON).mockResolvedValue("nonsense");
    const out = await parseNeed("Someone to help on our internal tools", [], true, creds);
    expect(out).toMatchObject({
      status: "ready",
      requirement: {
        primaryArchetypeNeeded: "fullstack",
        languages: [],
        summary: "Someone to help on our internal tools",
      },
    });
  });
});

describe("rankAndExplain (shared by repo and need runs)", () => {
  it("ranks deterministically and attaches explanations", async () => {
    vi.mocked(llm.llmJSON).mockResolvedValue({
      explanations: [{ devId: "be", explanation: "PHP + Magento." }],
      topPickRationale: "be fits.",
    });
    const base = {
      totalCommits: 10, linesAdded: 10, linesDeleted: 0, repos: [], recentCommitMessages: [],
      netLines: 10, aiFluency: null,
    };
    const cohort = [
      { ...base, id: "fe", name: "FE", archetype: "frontend" as const, languages: ["TypeScript"], frameworks: ["React"] },
      { ...base, id: "be", name: "BE", archetype: "backend" as const, languages: ["PHP"], frameworks: ["Magento"] },
    ];
    const out = await rankAndExplain(requirementReply as never, cohort, creds);
    expect(out.topPickId).toBe("be");
    expect(out.ranked[0]).toMatchObject({ devId: "be", explanation: "PHP + Magento." });
    expect(out.topPickRationale).toBe("be fits.");
  });
});

describe("NeedQuestionsSchema", () => {
  it("keeps at most 3 valid questions with 2–4 unique options", () => {
    const out = NeedQuestionsSchema.parse([
      { question: "Q1", options: ["a", "b", "c", "d", "e"] },
      { question: "", options: ["a", "b"] }, // no text
      { question: "Q3", options: ["only one"] }, // too few options
      { question: "Q4", options: ["x", "x", "y"] }, // dedupes
      { question: "Q5", options: ["a", "b"] },
      { question: "Q6", options: ["a", "b"] },
    ]);
    expect(out.map((q) => q.question)).toEqual(["Q1", "Q4", "Q5"]);
    expect(out[0].options).toHaveLength(4);
    expect(out[1].options).toEqual(["x", "y"]);
    expect(out[0].id).toBe("q1");
  });

  it("treats a missing or malformed list as no questions", () => {
    expect(NeedQuestionsSchema.parse(undefined)).toEqual([]);
    expect(NeedQuestionsSchema.parse("nope")).toEqual([]);
  });
});

describe("NeedBodySchema", () => {
  it("requires a real description and caps its length", () => {
    expect(NeedBodySchema.safeParse({ text: "short" }).error?.issues[0]?.message).toBe(
      "Describe the need in a sentence or two."
    );
    expect(NeedBodySchema.safeParse({ text: "x".repeat(2001) }).error?.issues[0]?.message).toBe(
      "Keep the description under 2,000 characters."
    );
    expect(NeedBodySchema.parse({ text: "  A Django API developer  " }).text).toBe("A Django API developer");
  });

  it("allows at most 3 answers", () => {
    const a = { question: "q", answer: "a" };
    expect(NeedBodySchema.safeParse({ text: "A Django API developer", answers: [a, a, a, a] }).success).toBe(false);
  });
});
