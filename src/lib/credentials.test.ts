import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db/keys", () => ({ readUserKeys: vi.fn(), getKeyStatuses: vi.fn() }));
const keys = await import("@/lib/db/keys");
const { pickLlm, resolveCredentials, keyForProvider } = await import("@/lib/credentials");
const { DEFAULT_LLM_MODELS } = await import("@/lib/config");

const ENV = ["GEMINI_API_KEY", "OPENAI_API_KEY", "ANTHROPIC_API_KEY", "GITHUB_TOKEN"];
const saved: Record<string, string | undefined> = {};

beforeEach(() => {
  for (const k of ENV) {
    saved[k] = process.env[k];
    delete process.env[k];
  }
  vi.mocked(keys.readUserKeys).mockReset().mockResolvedValue({});
});
afterEach(() => {
  for (const k of ENV) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
});

const admin = (llm: { provider: "gemini" | "openai" | "anthropic"; model: string } | null = null) =>
  ({ id: "u1", source: "admin", llm }) as const;
const selfUser = (llm: { provider: "gemini" | "openai" | "anthropic"; model: string } | null = null) =>
  ({ id: "u2", source: "self", llm }) as const;

describe("pickLlm", () => {
  it("uses the saved preference, model included", () => {
    expect(pickLlm({ provider: "anthropic", model: "claude-haiku-5-5" }, {}, {})).toEqual({
      provider: "anthropic",
      model: "claude-haiku-5-5",
    });
  });

  it("without a preference, prefers a provider the user has a key for", () => {
    expect(pickLlm(null, { openai: "sk" }, { gemini: "g" })).toEqual({
      provider: "openai",
      model: DEFAULT_LLM_MODELS.openai,
    });
  });

  it("then a server key, then Gemini", () => {
    expect(pickLlm(null, {}, { anthropic: "a" }).provider).toBe("anthropic");
    expect(pickLlm(null, {}, {})).toEqual({ provider: "gemini", model: DEFAULT_LLM_MODELS.gemini });
  });
});

describe("resolveCredentials", () => {
  it("uses the user's own key for the chosen provider", async () => {
    vi.mocked(keys.readUserKeys).mockResolvedValue({ anthropic: "sk-ant-mine", github: "gh" });
    const creds = await resolveCredentials(admin({ provider: "anthropic", model: "claude-opus-5-5" }));
    expect(creds.llm).toEqual({ provider: "anthropic", model: "claude-opus-5-5", apiKey: "sk-ant-mine" });
    expect(creds.llmSource).toBe("user");
    expect(creds.githubSource).toBe("user");
  });

  it("falls back to the server key for an admin-created account", async () => {
    process.env.OPENAI_API_KEY = "sk-server";
    const creds = await resolveCredentials(admin({ provider: "openai", model: "gpt-6-luna" }));
    expect(creds.llm.apiKey).toBe("sk-server");
    expect(creds.llmSource).toBe("env");
  });

  it("never gives a self-service account the server's keys", async () => {
    process.env.OPENAI_API_KEY = "sk-server";
    process.env.GITHUB_TOKEN = "gh-server";
    const creds = await resolveCredentials(selfUser({ provider: "openai", model: "gpt-6-luna" }));
    expect(creds.llm.apiKey).toBeNull();
    expect(creds.llmSource).toBe("none");
    expect(creds.githubToken).toBeNull();
    // Nor does a server key steer a self-service account's default provider.
    const fresh = await resolveCredentials(selfUser());
    expect(fresh.llm.provider).toBe("gemini");
  });

  it("does not borrow another provider's key", async () => {
    vi.mocked(keys.readUserKeys).mockResolvedValue({ gemini: "g-mine" });
    const creds = await resolveCredentials(admin({ provider: "anthropic", model: "claude-opus-5-5" }));
    expect(creds.llm.apiKey).toBeNull();
    expect(creds.llmSource).toBe("none");
  });
});

describe("keyForProvider", () => {
  it("prefers a key typed into the picker, then stored, then server (non-self only)", async () => {
    vi.mocked(keys.readUserKeys).mockResolvedValue({ gemini: "stored" });
    process.env.OPENAI_API_KEY = "server";
    expect(await keyForProvider(admin(), "gemini", " typed ")).toBe("typed");
    expect(await keyForProvider(admin(), "gemini")).toBe("stored");
    expect(await keyForProvider(admin(), "openai")).toBe("server");
    expect(await keyForProvider(selfUser(), "openai")).toBeNull();
  });
});
