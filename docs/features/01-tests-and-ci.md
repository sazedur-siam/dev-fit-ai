# 01 · Tests and CI

**Size:** S · **Needs:** none · **Cost:** free

## Why

OMAV runs lint, build and 56 test files on every pull request. DevFit has no test
runner and no `.github/` folder. Today, nothing stops a change to
[src/lib/scoring.ts](../../src/lib/scoring.ts) from quietly changing every
verdict. The whole demo depends on reproducible numbers, so the scoring engine
is the most important thing to test.

## What exists today

- `npm run typecheck` and `npm run lint` are the only automated checks, and
  nothing runs them automatically.
- `scoring.ts` is pure (no I/O, no AI), so it's easy to test.

## Plan

1. **Pick Vitest as the test runner.** CLAUDE.md asks whoever adds tests to name
   the harness. Vitest is MIT licensed, fast, and works with TypeScript without
   extra setup.
   ```bash
   npm install -D vitest
   ```
   Pin the exact version, as every other dependency in `package.json` is pinned.
2. **Add `vitest.config.ts`** at the root. It maps the `@/` alias to `src/`, the
   same way `tsconfig.json` does:
   ```ts
   import { defineConfig } from "vitest/config";
   import path from "node:path";

   export default defineConfig({
     resolve: { alias: { "@": path.resolve(__dirname, "src") } },
     test: { environment: "node", include: ["src/**/*.test.ts"] },
   });
   ```
3. **Add the scripts** `"test": "vitest run"` and `"test:watch": "vitest"`.
4. **Write `src/lib/scoring.test.ts`.** Cover:
   - `stackOverlap`: an empty requirement gives 50, matching ignores case, and
     there is a test that pins down the known framework problem (see 06), so
     fixing it later shows up as an intended test change.
   - `archetypeMatch`: all four branches.
   - `experienceDepth`: a cohort of 1 gives 50; the highest committer scores
     highest; negative `netLines` is clamped.
   - `verdictFor`: the edges at 75 and 55, including **74.96 → "ramp-up"** (the
     rounding quirk in CLAUDE.md).
   - `rankCohort`: the same input twice gives identical output. This is the
     determinism guarantee.
5. **Add `src/lib/crypto.test.ts`.** Sealing then opening a value returns it
   unchanged; a tampered ciphertext fails; `maskSecret` never reveals more than its
   preview.
6. **Add `.github/workflows/ci.yml`:**
   ```yaml
   name: CI
   on: [pull_request, push]
   jobs:
     check:
       runs-on: ubuntu-latest
       steps:
         - uses: actions/checkout@v4
         - uses: actions/setup-node@v4
           with: { node-version: 22, cache: npm }
         - run: npm ci
         - run: npm run lint
         - run: npm run typecheck
         - run: npm test
         - run: npm run build
   ```
   `npm run build` has to work without secrets. It already does, because
   CLAUDE.md forbids throwing at module scope for a missing env var. Keep it that
   way.
7. **Update CLAUDE.md's "Commands" section.** It currently says there is no test
   runner.

## How it stays free

Vitest is open source. GitHub Actions is unlimited on public repositories and
gives 2,000 minutes a month on private ones. This workflow takes about 2 minutes
a run.

## Done when

- `npm test` passes locally and in CI.
- A PR that changes a scoring weight fails a test until the test is updated on
  purpose.
- CLAUDE.md no longer says "no test runner configured".
