# 06 · Score frameworks separately from languages

**Size:** M · **Needs:** 01, 05 · **Cost:** free

## Why

This is DevFit's biggest scoring problem, and it's already written up in
CLAUDE.md. `stackOverlap()` divides matches by `|languages ∪ stack|`. A
developer's `languages` only ever contains languages (`"TypeScript"`), never
frameworks (`"Next.js App Router"`). So **every `stack` entry adds to the
denominator and can never match.** On a framework-heavy repo the sub-score tops
out around 63, and a "fit" verdict is almost unreachable.
[docs/real-git-data-feasibility.md](../real-git-data-feasibility.md) observed
this on a real run.

OMAV avoids it by scoring separate dimensions (breadth, tools, ecosystem)
instead of mixing everything into one ratio. CLAUDE.md names the honest fix:
**score `stack` separately, don't reweight.**

## Plan

1. **Give developers frameworks.** Add `frameworks: string[]` to
   `DeveloperRepo` in [types.ts](../../src/lib/types.ts) and derive
   `frameworks` on `DeveloperView` in
   [developerHelpers.ts](../../src/lib/developerHelpers.ts), as a union across
   repos, the same way `languages` is derived. Fill it in for the 10 seed
   developers in [src/data/developers.ts](../../src/data/developers.ts) and
   re-run `npm run seed`.
2. **Normalize names with a fixed alias table.** Gemini writes
   `"Next.js App Router"`, `"NextJS"`, `"next"`, and the seeds might say
   `"Next.js"`. Add `src/lib/skills.ts`:
   ```ts
   const ALIASES: Record<string, string> = {
     "next.js app router": "nextjs", "next.js": "nextjs", "nextjs": "nextjs",
     "django rest framework": "drf", "drf": "drf",
     "react": "react", "react.js": "react",
     "magento 2": "magento", "magento": "magento",
     // ...
   };
   export function canonicalSkill(s: string): string { ... }
   ```
   This is a **plain lookup table, not an AI call**, so scoring stays
   deterministic. Anything not in the table falls back to lowercase and trimmed.
3. **Split the sub-score** in [scoring.ts](../../src/lib/scoring.ts):
   - `languageOverlap(dev.languages, requirement.languages)`
   - `frameworkOverlap(dev.frameworks, requirement.stack)`. If the requirement
     has no stack, return neutral (50), as `stackOverlap` does today.
   - Keep `stackOverlap` as a blend so the response shape doesn't change, or add
     both as new fields. Adding fields is cleaner but needs the UI's
     `SubScoreBar` list updated.
4. **Re-balance weights in `config.ts`**, for example language 0.25 /
   framework 0.20 / archetype 0.30 / experience 0.25. **Bump
   `SCORING_VERSION`** (05).
5. **Prompt:** in `analyzeRepo()`, ask Gemini to use short framework names
   ("Next.js", not "Next.js App Router") to keep the alias table small. The table
   still has to handle variations, because the model won't always follow.
6. **Tests:** a frontend developer with React and Next.js against a Next.js repo
   now reaches "fit"; unknown frameworks don't crash; alias matching ignores case.
7. **Update CLAUDE.md:** remove the "genuine wart" paragraph and describe the new
   sub-scores.

## How it stays free

It's pure TypeScript with no new services.

## Done when

- A seed developer whose frameworks match the repo can reach a "fit" verdict.
- Running the same input twice gives identical scores (determinism test from 01).
- CLAUDE.md's Scoring section matches the code.
