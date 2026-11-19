import { describe, expect, it } from "vitest";
import { coerceExplanations, coerceRequirement } from "@/lib/analyzer";
import {
  AdminCreateUserBodySchema,
  AdminUpdateUserBodySchema,
  KeyBodySchema,
  parseJsonBody,
  RepoUrlBodySchema,
} from "@/lib/schemas";

const ctx = {
  languageBytes: { TypeScript: 9000, CSS: 100, JavaScript: 500 },
  repoLabel: "acme/shop",
};

describe("coerceRequirement (Gemini call #1)", () => {
  it("passes a well-formed reply through", () => {
    const req = coerceRequirement(
      {
        stack: ["Next.js"],
        languages: ["TypeScript"],
        primaryArchetypeNeeded: "frontend",
        domain: "storefront",
        complexity: "high",
        summary: "A shop.",
      },
      ctx
    );
    expect(req).toEqual({
      stack: ["Next.js"],
      languages: ["TypeScript"],
      primaryArchetypeNeeded: "frontend",
      domain: "storefront",
      complexity: "high",
      summary: "A shop.",
    });
  });

  it.each([null, "not json", 42, [], {}])(
    "degrades %j to safe defaults instead of throwing",
    (raw) => {
      const req = coerceRequirement(raw, ctx);
      expect(req.stack).toEqual([]);
      // Languages fall back to the repo's byte counts, largest first.
      expect(req.languages).toEqual(["TypeScript", "JavaScript", "CSS"]);
      expect(req.primaryArchetypeNeeded).toBe("fullstack");
      expect(req.complexity).toBe("moderate");
      expect(req.domain).toBe("(unknown domain)");
      expect(req.summary).toBe("Repository acme/shop.");
    }
  );

  it("replaces invalid enum values and drops empty list entries", () => {
    const req = coerceRequirement(
      {
        stack: ["React", "", "  ", 7],
        primaryArchetypeNeeded: "devops",
        complexity: "extreme",
        domain: "   ",
      },
      ctx
    );
    expect(req.stack).toEqual(["React", "7"]);
    expect(req.primaryArchetypeNeeded).toBe("fullstack");
    expect(req.complexity).toBe("moderate");
    expect(req.domain).toBe("(unknown domain)");
  });
});

describe("coerceExplanations (Gemini call #2)", () => {
  const ranked = [{ devId: "a" }, { devId: "b" }];

  it("returns exactly one explanation per ranked developer, in rank order", () => {
    const out = coerceExplanations(
      {
        explanations: [
          { devId: "b", explanation: "B text" },
          { devId: "zzz", explanation: "unknown dev" },
          { explanation: "no id" },
          { devId: "a", explanation: "A text" },
        ],
        topPickRationale: "A is best.",
      },
      ranked
    );
    expect(out.explanations).toEqual([
      { devId: "a", explanation: "A text" },
      { devId: "b", explanation: "B text" },
    ]);
    expect(out.topPickRationale).toBe("A is best.");
  });

  it("fills defaults for a malformed reply", () => {
    const out = coerceExplanations("garbage", ranked);
    expect(out.explanations).toHaveLength(2);
    expect(out.explanations[0].explanation).toMatch(/deterministic sub-scores/);
    expect(out.topPickRationale).toBe("Top pick chosen by highest overall score.");
  });
});

describe("request body schemas", () => {
  const firstError = (r: { success: boolean; error?: { issues: { message: string }[] } }) =>
    r.error?.issues[0]?.message;

  it("repoUrl: required and trimmed", () => {
    expect(RepoUrlBodySchema.parse({ repoUrl: "  github.com/a/b " })).toEqual({
      repoUrl: "github.com/a/b",
    });
    expect(firstError(RepoUrlBodySchema.safeParse({}))).toBe("repoUrl is required");
    expect(firstError(RepoUrlBodySchema.safeParse({ repoUrl: "  " }))).toBe(
      "repoUrl is required"
    );
  });

  it("keys: keeps the existing error messages", () => {
    expect(firstError(KeyBodySchema.safeParse({ kind: "openai", value: "x" }))).toBe(
      'kind must be "gemini" or "github"'
    );
    expect(firstError(KeyBodySchema.safeParse({ kind: "gemini", value: " " }))).toBe(
      "value is required"
    );
  });

  it("admin create: anything but exactly 'admin' makes a project manager", () => {
    const base = { email: "a@b.co", password: "longenough" };
    expect(AdminCreateUserBodySchema.parse({ ...base, role: "admin" }).role).toBe("admin");
    expect(AdminCreateUserBodySchema.parse({ ...base, role: "root" }).role).toBe(
      "project_manager"
    );
    expect(AdminCreateUserBodySchema.parse(base).role).toBe("project_manager");
  });

  it("admin update: needs a password or a valid role", () => {
    expect(AdminUpdateUserBodySchema.safeParse({ password: "newpassword" }).success).toBe(true);
    expect(AdminUpdateUserBodySchema.safeParse({ role: "admin" }).success).toBe(true);
    expect(firstError(AdminUpdateUserBodySchema.safeParse({}))).toBe(
      'role must be "admin" or "project_manager"'
    );
    expect(firstError(AdminUpdateUserBodySchema.safeParse({ role: "owner" }))).toBe(
      'role must be "admin" or "project_manager"'
    );
  });
});

describe("parseJsonBody", () => {
  const post = (body: string) =>
    new Request("http://x/api", { method: "POST", body });

  it("rejects invalid JSON with a 400", async () => {
    const out = await parseJsonBody(post("{nope"), RepoUrlBodySchema);
    expect(out.ok).toBe(false);
    if (!out.ok) {
      expect(out.response.status).toBe(400);
      expect(await out.response.json()).toEqual({ error: "Invalid JSON body" });
    }
  });

  it("returns the first schema issue as { error }", async () => {
    const out = await parseJsonBody(post("{}"), RepoUrlBodySchema);
    expect(out.ok).toBe(false);
    if (!out.ok) expect(await out.response.json()).toEqual({ error: "repoUrl is required" });
  });

  it("returns parsed data on success", async () => {
    const out = await parseJsonBody(post('{"repoUrl":"github.com/a/b"}'), RepoUrlBodySchema);
    expect(out).toEqual({ ok: true, data: { repoUrl: "github.com/a/b" } });
  });
});

describe("register body", () => {
  it("lets a missing confirmPassword through to the route's mismatch check", async () => {
    const { RegisterBodySchema } = await import("@/lib/schemas");
    const out = RegisterBodySchema.parse({ email: "a@b.co", password: "pw" });
    expect(out.confirmPassword).toBeUndefined();
    expect(RegisterBodySchema.safeParse({ email: "a@b.co" }).error?.issues[0]?.message).toBe(
      "email and password are required"
    );
  });
});
