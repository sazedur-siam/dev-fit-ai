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

/**
 * Gemini's reply to a described need: requirement fields plus optional
 * clarifying questions. Malformed questions are dropped; at most 3, each with
 * 2–4 options.
 */
export const NeedQuestionsSchema = z
  .array(z.unknown())
  .catch([])
  .transform((items) =>
    items
      .flatMap((item, i) => {
        const q = asObject(item) as { id?: unknown; question?: unknown; options?: unknown };
        const question = typeof q.question === "string" ? q.question.trim() : "";
        const options = Array.isArray(q.options)
          ? [...new Set(q.options.map((o) => String(o).trim()).filter(Boolean))].slice(0, 4)
          : [];
        if (!question || options.length < 2) return [];
        const id = typeof q.id === "string" && q.id.trim() ? q.id.trim() : `q${i + 1}`;
        return [{ id, question, options }];
      })
      .slice(0, 3)
  );

export const NeedBodySchema = z.object({
  text: z
    .string({ error: "Describe the need first." })
    .trim()
    .min(10, { error: "Describe the need in a sentence or two." })
    .max(2000, { error: "Keep the description under 2,000 characters." }),
  /** Answers to the clarifying questions, echoed back as question + chosen option. */
  answers: z
    .array(z.object({ question: z.string().max(300), answer: z.string().max(300) }))
    .max(3)
    .optional(),
  /** True when the PM chose "skip, just search". */
  skipQuestions: z.boolean().optional(),
});

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

// ───────────────────────── Workspace ─────────────────────────

export const NoteBodySchema = z.object({
  body: z
    .string({ error: "Write something first." })
    .trim()
    .min(1, { error: "Write something first." })
    .max(5000, { error: "Notes are limited to 5,000 characters." }),
});

/** Tags are normalised: trimmed, lowercased, spaces become hyphens. */
export const TagBodySchema = z.object({
  label: z
    .string({ error: "Tag is required." })
    .transform((l) => l.trim().toLowerCase().replace(/\s+/g, "-"))
    .pipe(
      z
        .string()
        .min(1, { error: "Tag is required." })
        .max(40, { error: "Tags are limited to 40 characters." })
        .regex(/^[a-z0-9][a-z0-9._-]*$/, {
          error: "Tags can use letters, numbers, and - _ .",
        })
    ),
});

const shortlistName = z
  .string({ error: "Name the shortlist." })
  .trim()
  .min(1, { error: "Name the shortlist." })
  .max(80, { error: "Shortlist names are limited to 80 characters." });

export const ShortlistCreateSchema = z.object({
  name: shortlistName,
  analysisId: z.string().max(64).nullish(),
  developerIds: z.array(z.string().max(100)).max(50).optional(),
});

export const ShortlistUpdateSchema = z
  .object({
    name: shortlistName.optional(),
    add: z.string().max(100).optional(),
    remove: z.string().max(100).optional(),
  })
  .refine((b) => b.name !== undefined || b.add !== undefined || b.remove !== undefined, {
    error: "Nothing to change.",
  })
  .refine((b) => !(b.add !== undefined && b.remove !== undefined), {
    error: "Add or remove one developer at a time.",
  });

export const OutreachBodySchema = z.object({
  analysisId: z.string({ error: "analysisId is required" }).min(1, { error: "analysisId is required" }),
  developerId: z.string({ error: "developerId is required" }).min(1, { error: "developerId is required" }),
  tone: z.enum(["friendly", "formal"]).catch("friendly"),
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
