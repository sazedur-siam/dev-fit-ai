import { NextResponse } from "next/server";
import { z } from "zod";

/**
 * Runtime schemas for everything that crosses a trust boundary: the two Gemini
 * replies and every route's request body.
 *
 * The two kinds are deliberately different in strictness:
 *
 * - **Model output is lenient.** Every field has a `.catch()` default, so a
 *   malformed Gemini reply degrades to a usable value rather than failing a
 *   request the user already waited 30 seconds for.
 * - **Request bodies are strict.** A bad body is a client bug and gets a 400 with
 *   the first issue's message, which is shown to the user as-is.
 */

const ARCHETYPES = ["frontend", "backend", "fullstack"] as const;
const COMPLEXITIES = ["low", "moderate", "high"] as const;

/** Treat anything that isn't a plain object as `{}` so field defaults apply. */
const asObject = (v: unknown) =>
  v && typeof v === "object" && !Array.isArray(v) ? v : {};

/** An array of non-empty trimmed strings; anything else becomes `[]`. */
const stringList = z
  .array(z.unknown())
  .catch([])
  .transform((items) =>
    items.map((s) => String(s).trim()).filter((s) => s.length > 0)
  );

// ───────────────────────── Gemini output ─────────────────────────

/**
 * Gemini call #1. `languages` and `summary` can come back empty; the analyzer
 * fills those from repo context (language bytes, repo name) that this schema
 * doesn't have.
 */
export const RawRequirementSchema = z.preprocess(
  asObject,
  z.object({
    stack: stringList,
    languages: stringList,
    primaryArchetypeNeeded: z.enum(ARCHETYPES).catch("fullstack"),
    domain: z.string().trim().min(1).catch("(unknown domain)"),
    complexity: z.enum(COMPLEXITIES).catch("moderate"),
    summary: z.string().trim().catch(""),
  })
);

/** Gemini call #2. Entries without a string `devId` are dropped. */
export const ExplanationResponseSchema = z.preprocess(
  asObject,
  z.object({
    explanations: z
      .array(z.unknown())
      .catch([])
      .transform((items) =>
        items.flatMap((item) => {
          const e = asObject(item) as { devId?: unknown; explanation?: unknown };
          return typeof e.devId === "string"
            ? [{ devId: e.devId, explanation: String(e.explanation ?? "").trim() }]
            : [];
        })
      ),
    topPickRationale: z.string().trim().catch(""),
  })
);

// ───────────────────────── Request bodies ─────────────────────────

export const RepoUrlBodySchema = z.object({
  repoUrl: z
    .string({ error: "repoUrl is required" })
    .trim()
    .min(1, { error: "repoUrl is required" }),
});

export const KeyBodySchema = z.object({
  kind: z.enum(["gemini", "github"], { error: 'kind must be "gemini" or "github"' }),
  value: z
    .string({ error: "value is required" })
    .refine((v) => v.trim().length > 0, { error: "value is required" }),
});

export const RegisterBodySchema = z.object({
  email: z.string({ error: "email and password are required" }),
  password: z.string({ error: "email and password are required" }),
  // Optional so a missing value reaches the route's "Passwords don't match."
  // check instead of failing here with a generic message.
  confirmPassword: z.unknown().optional(),
});

export const AdminCreateUserBodySchema = z.object({
  email: z.string({ error: "email and password are required" }),
  password: z.string({ error: "email and password are required" }),
  name: z.string().nullish().catch(null),
  // Anything other than exactly "admin" makes a project manager, as before.
  role: z
    .unknown()
    .optional()
    .transform((r) => (r === "admin" ? "admin" : "project_manager") as
      | "admin"
      | "project_manager"),
});

export const ImportDeveloperBodySchema = z.object({
  login: z
    .string({ error: "GitHub username is required" })
    .trim()
    .min(1, { error: "GitHub username is required" })
    // Accept "octocat", "@octocat", or a profile URL with or without the scheme.
    .transform((l) =>
      l
        .replace(/^@/, "")
        .replace(/^(https?:\/\/)?(www\.)?github\.com\//i, "")
        .replace(/\/.*$/, "")
    ),
  /** Omitted or "auto": guess from the languages and frameworks found. */
  archetype: z.enum(["auto", "frontend", "backend", "fullstack"]).optional().catch("auto"),
});

const ROLE_ERROR = 'role must be "admin" or "project_manager"';

/** Either a password reset or a role change. */
export const AdminUpdateUserBodySchema = z
  .object({
    password: z.string().optional(),
    role: z.enum(["admin", "project_manager"], { error: ROLE_ERROR }).optional(),
  })
  .refine((b) => b.password !== undefined || b.role !== undefined, {
    error: ROLE_ERROR,
  });

/**
 * Read and validate a JSON request body. Returns the parsed data, or a ready-made
 * 400 response carrying `{ error }` with the first issue's message.
 */
export async function parseJsonBody<S extends z.ZodType>(
  req: Request,
  schema: S
): Promise<{ ok: true; data: z.output<S> } | { ok: false; response: NextResponse }> {
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return {
      ok: false,
      response: NextResponse.json({ error: "Invalid JSON body" }, { status: 400 }),
    };
  }
  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    const message = parsed.error.issues[0]?.message ?? "Invalid request body";
    return { ok: false, response: NextResponse.json({ error: message }, { status: 400 }) };
  }
  return { ok: true, data: parsed.data };
}
