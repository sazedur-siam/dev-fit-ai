# 10 · Describe a need in plain text, with clarifying questions

**Size:** M · **Needs:** 03 · **Cost:** free

## Why

In OMAV a recruiter types *"senior backend developer who knows Kotlin and uses AI
tools"*. Gemini turns that into a structured query. If the request is vague, the
UI asks a few short follow-up questions before searching.

In DevFit, the **only** way in is a GitHub repo URL. A PM staffing a project that
doesn't have a repo yet (a new client, a proposal, a rewrite) can't use the tool
at all.

## Key point: almost nothing new is needed

DevFit's scoring already works from a `RepoRequirement`
(`stack, languages, primaryArchetypeNeeded, domain, complexity, summary`). A
plain-text need just has to be turned into that same object, and everything after
it (`rankCohort`, `explainRanking`, history) works unchanged. Scoring stays
deterministic.

## Plan

1. **`parseNeed(text, creds)` in [analyzer.ts](../../src/lib/analyzer.ts).**
   This is the same Gemini call as `analyzeRepo()`, but the prompt input is the
   PM's text instead of a digest. Validate the output with
   `RepoRequirementSchema` (03). Add one extra field to the output:
   `missing: string[]`, which lists the facts the model couldn't infer (e.g.
   `["frontend or backend?", "which framework?"]`).
2. **Clarifying questions, OMAV's "Akinator" step:**
   - If `missing` is non-empty, `POST /api/need` returns
     `{ status: "clarify", questions: [{ id, question, options[] }] }` (at most 3
     questions, each with 2–4 options).
   - The UI shows them as buttons. The answers go back to the same endpoint with
     the original text. Gemini re-parses and the result is ranked.
   - Always offer a "skip, just search" button. Never block the PM.
3. **Ranking:** after parsing, call the same path `analyzeAndRank()` uses after
   `analyzeRepo()`. Extract that second half into a function both entry points
   share, rather than copying it.
4. **History:** store these with `repoUrl: null` and `needText: string`, and make
   `StoredAnalysis` accept either.
5. **UI:** a toggle on `/fit` in [FitView.tsx](../../src/components/FitView.tsx):
   **From repo** | **Describe the need**.
6. **Tests:** with a mocked Gemini, a vague input returns `clarify`, a complete
   input returns a ranking, and a malformed model reply falls back to defaults.

## Gemini calls per request

A repo search makes 2 calls today. A text search makes 2, or 3 when clarifying
questions are asked. That's the same order of cost, still inside the free tier.

## How it stays free

It uses the Gemini free tier the app already uses. No new services.

## Done when

- A PM can type a need and get the same ranked list a repo URL would produce.
- A vague need gets at most 3 questions, and there's always a skip.
- Both entry points share one ranking function.
