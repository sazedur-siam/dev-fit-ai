# 03 · Validate AI and GitHub responses, one fit-response type

**Size:** S · **Needs:** 01 · **Cost:** free

## Why

OMAV checks all outside data (GitHub, Gemini, request bodies) against Zod
schemas, and describes the API's response shape in exactly one place. DevFit
checks it by hand:

- [src/lib/analyzer.ts](../../src/lib/analyzer.ts) coerces Gemini's
  `RepoRequirement` field by field with `Array.isArray` / `includes` checks.
- Each route validates its own body differently.
- **The fit response shape is declared in three places that disagree.**
  `FitRanking` in [types.ts](../../src/lib/types.ts) is unused and out of date,
  `FitResponse` is declared again locally in
  [FitView.tsx](../../src/components/FitView.tsx), and the real shape is whatever
  `analyzeAndRank()` returns. CLAUDE.md "Known drift" asks for this to be fixed.

## Plan

1. `npm install zod`, pinned to an exact version.
2. **Add `src/lib/schemas.ts`** with:
   - `RepoRequirementSchema`. Use `.catch()` defaults so a malformed Gemini
     answer still degrades to a usable value, as it does today, instead of
     failing the request.
   - `ExplanationResponseSchema` for the second Gemini call.
   - `FitResponseSchema`, the **single** source of the `/api/fit` shape.
     `export type FitResponse = z.infer<typeof FitResponseSchema>`.
   - Request-body schemas for `register`, `keys`, `admin/users` and `fit`.
3. **Replace the hand-written coercion** in `analyzeRepo()` and
   `explainRanking()` with `Schema.parse()`. The defaults and the behaviour stay
   the same; the code gets shorter.
4. **Delete `FitRanking`** from `types.ts`. Import `FitResponse` in both
   `analyzer.ts` and `FitView.tsx`. A server type can be imported into a client
   component; that's fine. The reverse direction, a value exported from a
   `"use client"` module into a server one, is the trap CLAUDE.md warns about.
5. **Route bodies:** `const parsed = Schema.safeParse(body)`. On failure, return
   `400 { error }` with the first issue's message, as routes do now.
6. **Optional small logger.** Add `src/lib/log.ts` that prints one JSON line per
   event (`{ level, msg, ...fields, ts }`). Use it in route handlers in place of
   `console.error`, so a hosted log viewer can filter by field. Never log key
   values, passwords or tokens; `crypto.ts` and `session.ts` are the places to be
   careful.
7. **Update CLAUDE.md:** remove the "Known drift" section and add Zod to
   Conventions.

## How it stays free

Zod is MIT licensed. The logger is about 20 lines of your own code.

## Done when

- `grep -rn "FitRanking\|interface FitResponse" src` finds exactly one
  definition.
- Unit tests feed `analyzeRepo`'s parser a malformed Gemini JSON and get the
  fallback values back.
- Every route's request body goes through a schema.
