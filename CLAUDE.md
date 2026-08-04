@AGENTS.md

# DevFit

Internal Strativ hackathon app. Paste a public GitHub repo URL → the app builds a
digest of the repo, asks Gemini what kind of developer it needs, scores 10 seeded
developers against that requirement with **deterministic** sub-scores, and returns
a ranked fit list with plain-language explanations.

No database, no auth, no background jobs. All state is seed data + in-memory.

## Commands

```bash
npm install
cp .env.local.example .env.local   # then paste GEMINI_API_KEY
npm run dev        # http://localhost:3000 (Turbopack)
npm run build      # prod build; also typechecks and prerenders the 10 dev pages
npm run typecheck  # tsc --noEmit
npm run lint       # eslint . (flat config)
```

There is **no test runner configured** — no Jest/Vitest/Playwright, no test files.
`npm run build` + `npm run typecheck` are the only automated gates. If you add
tests, you are introducing the harness, so pick one and say so.

## The one invariant that matters

**Scoring is deterministic. The AI only narrates.**

Gemini is called exactly twice per `/api/fit` request:

1. `analyzeRepo()` — digest → `RepoRequirement` (stack, languages, archetype, complexity)
2. `explainRanking()` — writes one explanation per developer + a top-pick rationale

Ranking happens in `src/lib/scoring.ts` in pure TypeScript, **before** the second
call. The explanation prompt says "DO NOT re-rank or invent numbers." Never move
ranking into the model, and never let an explanation contradict a verdict — the
whole demo rests on the numbers being reproducible and inspectable.

## Data flow

```
repoUrl
  → parseRepoUrl()            src/lib/github.ts
  → buildRepoDigest()         3 REST calls + up to 20 raw file fetches
  → analyzeRepo()             src/lib/analyzer.ts  → Gemini #1 → RepoRequirement
  → rankCohort()              src/lib/scoring.ts   → pure, sorted by overall desc
  → explainRanking()          src/lib/analyzer.ts  → Gemini #2 → explanations
  → { requirement, ranked, topPickId, topPickRationale }
```

`analyzeAndRank()` in [src/lib/analyzer.ts](src/lib/analyzer.ts) is the end-to-end
orchestrator and the only place that composes all of the above.

## Layout

| Path | Role |
| --- | --- |
| [src/lib/types.ts](src/lib/types.ts) | All shared types. Start here. |
| [src/lib/config.ts](src/lib/config.ts) | Weights, thresholds, digest limits, model name. Tunable during a demo. |
| [src/lib/scoring.ts](src/lib/scoring.ts) | Pure sub-scores + ranking. No I/O, no AI. |
| [src/lib/github.ts](src/lib/github.ts) | Repo digest builder + URL parsing. |
| [src/lib/gemini.ts](src/lib/gemini.ts) | Raw Gemini REST client, JSON-mode + retry. |
| [src/lib/analyzer.ts](src/lib/analyzer.ts) | Prompts + orchestration. |
| [src/lib/developerHelpers.ts](src/lib/developerHelpers.ts) | `MockDeveloper` → `DeveloperView` (derives `languages`, `netLines`). |
| [src/data/developers.ts](src/data/developers.ts) | 10 seeded developers: 4 frontend, 3 backend, 3 fullstack. |
| [src/app/api/](src/app/api/) | Three route handlers, all `runtime = "nodejs"`. |
| [src/components/](src/components/) | Presentational only — no data fetching. |

Always consume developers through `getAllDevelopers()` / `getDeveloperById()`, never
by importing `DEVELOPERS` directly — the helpers derive `languages` and `netLines`
that scoring and the UI both depend on.

## Scoring

```
overall = 0.40*stackOverlap + 0.35*archetypeMatch + 0.25*experienceDepth
verdict = overall >= 75 ? "fit" : overall >= 55 ? "ramp-up" : "not fit"
```

Weights and thresholds live in [src/lib/config.ts](src/lib/config.ts). Two behaviours
that look like bugs but are deliberate, and one that is a genuine wart:

- `experienceDepth` is **cohort-relative** (percentile of `totalCommits`, blended
  70/30 with normalized net lines). Adding or removing a seed developer shifts
  everyone else's score. Expected — don't "fix" it with absolute thresholds without
  asking.
- `stackOverlap` divides hits by `|languages ∪ stack|`, but a developer's
  `languages` only ever contains languages — never framework strings like
  `"Next.js App Router"`. So every entry in `requirement.stack` is an
  unmatchable denominator term, which structurally depresses the sub-score and
  makes a `"fit"` verdict hard to reach on framework-heavy repos. If a demo needs
  higher scores, the honest fix is scoring `stack` separately, not reweighting.
- `verdictFor()` uses the unrounded `overall`, while the value returned to the
  client is rounded to 1dp. A score of `74.96` displays as `75.0` but is still
  `"ramp-up"`. Cosmetic, but don't be surprised by it.

## Environment

| Var | Required | Notes |
| --- | --- | --- |
| `GEMINI_API_KEY` | Yes, for `/api/analyze` + `/api/fit` | Missing key surfaces as a 500 with a copy-paste-able fix message. |
| `GITHUB_TOKEN` | No | Unauthenticated GitHub is **60 req/hr**. One digest costs 3 REST calls, so ~20 repos/hr. Raw file fetches go to `raw.githubusercontent.com` and don't spend that quota. |
| `GEMINI_MODEL` | No | Defaults to `gemini-2.5-flash`. |

`/` and `/developer/[id]` need no keys at all — they render from seed data, so the
UI is always demoable even with no network.

## Toolchain — read before bumping anything

Current: **Next 16.3.0 · React 19.2.8 · Tailwind 4.3.3 · TypeScript 6.0.3 · ESLint 9.39.5**

Two dependencies are **deliberately held below their latest published version**
because the Next 16 lint stack cannot use them. Do not "helpfully" bump these:

- **TypeScript is pinned to 6.0.3, not 7.0.2.** `typescript-eslint@8.66.0` (latest,
  vendored inside `eslint-config-next@16.3.0`) hard-throws
  `"typescript-eslint does not support TS 7.0"` and its peer range is
  `>=4.8.4 <6.1.0`. On TS 7, `npm run lint` fails outright while `npm run typecheck`
  still passes — so a bump looks fine until CI lints. `eslint-config-next@16.3.0`
  itself devDepends on `typescript@6.0.2`.
- **ESLint is pinned to 9.39.5, not 10.8.0.** `eslint-plugin-react@7.37.5` (latest
  published) still calls the `context.getFilename()` API that ESLint 10 removed, and
  its peer range stops at `^9.7`. On ESLint 10, linting dies with
  `contextOrFilename.getFilename is not a function`.

Both unblock only when the upstream plugins ship support. Re-check with
`npm view typescript-eslint peerDependencies` and
`npm view eslint-plugin-react peerDependencies` before trying again.

## Framework specifics that differ from older Next/Tailwind

- **`params` is a Promise.** [src/app/developer/[id]/page.tsx](src/app/developer/%5Bid%5D/page.tsx)
  is an `async` component doing `const { id } = await params`. Any new dynamic
  route must do the same.
- **`next lint` no longer exists.** `npm run lint` calls `eslint .` against
  [eslint.config.mjs](eslint.config.mjs) (flat config composing
  `eslint-config-next/core-web-vitals` + `/typescript`).
- **Tailwind is CSS-first — there is no `tailwind.config.ts`.** The `pine` / `ink` /
  `brick` / `amber` palette is declared in an `@theme` block in
  [src/app/globals.css](src/app/globals.css) as `--color-<name>-<shade>`, which is
  what generates `bg-pine-600`, `text-ink-900`, `divide-ink-200`, etc. Add new
  brand colors there, not in a JS config. PostCSS uses `@tailwindcss/postcss`;
  `autoprefixer` was removed (Tailwind 4 prefixes via Lightning CSS).
  The `amber` hexes are pinned to Tailwind 3's values so the v4 OKLCH palette
  doesn't shift the warning tone.
- **`next dev` writes `AGENTS.md` and may write `CLAUDE.md`.** The generator
  (`node_modules/next/dist/server/lib/generate-agent-files.js`) upserts a managed
  `<!-- BEGIN:nextjs-agent-rules -->` block. Because `AGENTS.md` exists and hosts
  that block, `CLAUDE.md` is **skipped** — which is why this file is safe to hand-edit.
  Keep the `@AGENTS.md` import on line 1 and leave the block in `AGENTS.md` alone;
  if you move the block into `CLAUDE.md`, `next dev` will start rewriting this file.
- Next 16 bundles its own docs at `node_modules/next/dist/docs/` — consult those
  rather than guessing at v16 API shapes.

## Known drift

`FitRanking` in [src/lib/types.ts](src/lib/types.ts) is **dead** — nothing imports
it, and it's already out of date: `/api/fit` returns `analyzeAndRank()`'s shape,
which adds `topPickRationale`. The client re-declares that shape locally as
`FitResponse` in [src/app/fit/page.tsx](src/app/fit/page.tsx). So the API contract
lives in three places and only two agree. If you touch the fit response, either
delete `FitRanking` or make it the single source of truth and import it on both
sides — don't add a fourth copy.

Smaller notes:

- `buildRepoDigest()` fetches the up-to-20 files **sequentially** in a `for` loop.
  That's the main latency cost of a request (5–20s end to end). Safe to parallelize
  with `Promise.all`, just mind the rate limit.
- `/developer/[id]` is prerendered via `generateStaticParams()`, so **editing
  `src/data/developers.ts` requires a rebuild** to show up in a production build.
- [src/app/fit/page.tsx](src/app/fit/page.tsx) is the only client component. It
  fetches `/api/developers` separately from `/api/fit` purely to get names and
  archetypes for display — the fit response carries IDs only.
- Gemini JSON parsing retries **once** with a stricter "return only JSON" reminder
  (`geminiJSON()`), and both prompts have field-level fallbacks in the analyzer. A
  malformed model response degrades rather than 500s.

## Conventions

- TypeScript strict. Import via the `@/*` alias (`@/lib/...`, `@/components/...`),
  not relative paths, except within `src/components/`.
- Named exports for components and lib functions; default exports only where
  Next requires them (pages, layouts, route handlers).
- Server-first: only [src/app/fit/page.tsx](src/app/fit/page.tsx) is `"use client"`.
  Keep components in `src/components/` presentational and prop-driven.
- Route handlers validate input and return `{ error: string }` with a 4xx/5xx.
  Errors matching `/^GitHub 4\d\d/` map to 400, everything else to 500.
- Keep the disclaimer in the UI. Commit counts and language overlap are proxies for
  skill, not proof of it; the app is decision support for a human, not a pass/fail
  gate. Don't ship copy that overclaims.
