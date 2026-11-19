import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/gemini", () => ({ geminiText: vi.fn(), listGeminiModels: vi.fn() }));
const gemini = await import("@/lib/gemini");
const {
  isOpenAIChatModelId,
  isOpenAIReasoningModel,
  llmJSON,
  llmText,
  stripFences,
  supportsClaudeEffort,
} = await import("@/lib/llm");

const cfg = { provider: "gemini", model: "gemini-test", apiKey: "k" } as const;

beforeEach(() => vi.mocked(gemini.geminiText).mockReset());

describe("llmJSON", () => {
  it("parses fenced JSON", async () => {
    vi.mocked(gemini.geminiText).mockResolvedValue('```json\n{"a":1}\n```');
    expect(await llmJSON(" prompt", cfg)).toEqual({ a: 1 });
    expect(gemini.geminiText).toHaveBeenCalledWith(" prompt", "k", "gemini-test", { jsonMode: true });
  });

  it("retries once with a stricter reminder on invalid JSON", async () => {
    vi.mocked(gemini.geminiText).mockResolvedValueOnce("not json").mockResolvedValueOnce('{"ok":true}');
    expect(await llmJSON("p", cfg)).toEqual({ ok: true });
    expect(vi.mocked(gemini.geminiText).mock.calls[1][0]).toContain("not valid JSON");
  });
});

describe("missing keys", () => {
  it("names the provider's key and where to add it", async () => {
    await expect(llmText("p", { provider: "anthropic", model: "claude-opus-5-5", apiKey: null })).rejects.toThrow(
      /No Anthropic API key available/
    );
    await expect(llmText("p", { provider: "openai", model: "gpt-6.2-sol", apiKey: " " })).rejects.toThrow(
      /No OpenAI API key available/
    );
  });
});

describe("model capability checks", () => {
  it("sends reasoning effort only to OpenAI reasoning models", () => {
    expect(isOpenAIReasoningModel("gpt-6.2-sol")).toBe(true);
    expect(isOpenAIReasoningModel("gpt-5-mini")).toBe(true);
    expect(isOpenAIReasoningModel("o3")).toBe(true);
    expect(isOpenAIReasoningModel("gpt-4.1")).toBe(false);
  });

  it("sends Claude effort only to the 5 generation", () => {
    expect(supportsClaudeEffort("claude-opus-5-5")).toBe(true);
    expect(supportsClaudeEffort("claude-haiku-5-5")).toBe(true);
    expect(supportsClaudeEffort("claude-haiku-4-5")).toBe(false);
  });

  it("keeps chat models out of OpenAI's full list", () => {
    expect(isOpenAIChatModelId("gpt-6.2-sol")).toBe(true);
    expect(isOpenAIChatModelId("gpt-realtime")).toBe(false);
    expect(isOpenAIChatModelId("text-embedding-3-large")).toBe(false);
    expect(isOpenAIChatModelId("dall-e-3")).toBe(false);
  });
});

it("stripFences leaves bare JSON alone", () => {
  expect(stripFences('  {"a":1} ')).toBe('{"a":1}');
});
