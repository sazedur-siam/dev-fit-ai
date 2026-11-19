# 05 · Scoring version on every analysis

**Size:** S · **Needs:** 01 · **Cost:** free

## Why

OMAV stores a `scoringVersion` on every scored row. When the formula changes,
old rows are visibly "old" and get rescored. DevFit saves analyses to history
([db/analyses.ts](../../src/lib/db/analyses.ts)) without recording which weights
produced them. Change a weight in [config.ts](../../src/lib/config.ts) today and
every old history entry silently becomes impossible to reproduce. That breaks the
"reproducible and inspectable" promise in CLAUDE.md.

## Plan

1. In `config.ts`, add:
   ```ts
   /** Bump on ANY change to weights, thresholds, or sub-score formulas. */
   export const SCORING_VERSION = "1.0.0";
   ```
2. Add `scoringVersion: string` to `AnalysisDoc` and `StoredAnalysis`, and to the
   `/api/fit` response (in the single schema from 03, if that's done).
3. Write it in `saveAnalysis()`. When reading a legacy doc that has no version,
   treat it as `"0"`.
4. **History page** ([src/app/history/page.tsx](../../src/app/history/page.tsx)):
   if a stored analysis's version differs from the current one, show a small
   "scored with an older formula" note. Optionally add a "re-run" button that
   posts the same `repoUrl` to `/api/fit`.
5. **Guard test (with 01):** a snapshot of `SCORING_WEIGHTS`,
   `VERDICT_THRESHOLDS` and `ARCHETYPE_MATCH_SCORES` that also checks
   `SCORING_VERSION`. Changing a weight without bumping the version fails CI.
6. Add one line to CLAUDE.md's Scoring section: "bump `SCORING_VERSION`".

## How it stays free

It's one field in documents you already store.

## Done when

- Every new analysis stores the version.
- Changing any weight without bumping the version fails `npm test`.
- Old analyses show the "older formula" note.
