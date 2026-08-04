# DevFit — Find the Best-Fit Developer

Paste a public GitHub repo URL. DevFit builds a digest of the repository, asks
Gemini what kind of developer it needs, scores a seeded team against that
requirement with **deterministic** sub-scores, and returns a ranked fit list with
plain-language explanations for every developer.

The core idea: **the maths decides, the AI only narrates.** Ranking happens in
pure TypeScript before the model is ever asked to write an explanation, so any
result can be recomputed and audited by hand.

---

## Contents

- [Features](#features)
- [Stack](#stack)
- [Setup](#setup)
- [Folder structure](#folder-structure)
- [How it works](#how-it-works)
- [Routes & API](#routes--api)
- [Scoring](#scoring)
- [Configuration](#configuration)
- [Known limitations](#known-limitations)
- [Future scope](#future-scope)
- [Troubleshooting](#troubleshooting)

---

## Features

### Developers list (`/`)
- Grid of the seeded developer cohort with archetype, commit volume, net lines
  and primary languages.
- **Filter by name** — case-insensitive substring match, accent-safe
  (`linné` matches `Linnéa Holm`).
- **Filter by stack** — toggleable chips built from the union of every language
  in the cohort. Multiple selections combine with **AND**, so each extra chip
  narrows the list further.
- Live `Showing X of Y` count, a per-archetype breakdown of the current view,
  and a dedicated empty state with a one-click *Clear filters*.
- Filtering runs entirely in the browser — the cohort is 10 records held in
  memory, so there is no round-trip or search index.

### Fit analysis (`/fit`)
- Paste any public GitHub repo URL, with inline validation before submitting.
- **Browse your own repositories** — lists every repo the configured
  `GITHUB_TOKEN` can see (newest push first), with its own filter box, language,
  star count, push date and `private` / `fork` badges. Selecting one fills the
  form so you can review before running.
- **Full-screen loader** while the request runs, with a staged message
  (*Analysing repository…* → *Ranking developers…*), a spinner, a halo and an
  indeterminate progress bar. It respects `prefers-reduced-motion` and announces
  itself to screen readers via `role="status"` / `aria-busy`.
- Results view: the derived repo requirement (domain, complexity, archetype,
  languages, stack), a highlighted top pick, and the full ranking with per-developer
  sub-score bars, verdict badges and AI explanations.

### Developer detail (`/developer/[id]`)
- Contribution totals, per-repository commit/addition/deletion breakdown and
  recent commit messages. Statically prerendered for every seeded developer.

---

## Stack

| Layer | Choice |
| --- | --- |
| Framework | Next.js 16 (App Router, Turbopack) |
| UI | React 19, Tailwind CSS 4 |
| Language | TypeScript (strict) |
| AI | Google Gemini via REST (`gemini-3.6-flash` by default) |
| Repo data | GitHub REST API + `raw.githubusercontent.com` |
| Persistence | None — seed data + in-memory only |

Requires **Node.js ≥ 20.9**.

Tailwind 4 is CSS-first: there is no `tailwind.config.ts`, and the brand palette
lives in an `@theme` block in `src/app/globals.css`.

> `typescript` and `eslint` are intentionally held one major behind latest,
> because the Next 16 lint stack cannot yet use TS 7 or ESLint 10. The full
> reasoning is in the toolchain section of [CLAUDE.md](CLAUDE.md) — please read it
> before bumping either.

---

## Setup

```bash
# 1. Install deps
npm install

# 2. Copy env template and fill in keys
cp .env.local.example .env.local
```

Then edit `.env.local`:

```ini
# Required for /api/analyze and /api/fit — https://aistudio.google.com/app/apikey
GEMINI_API_KEY=

# Optional for analysis, REQUIRED for the "browse your repositories" picker.
# Also raises the GitHub rate limit from 60 to 5,000 req/hr.
GITHUB_TOKEN=

# Optional. Defaults to gemini-3.6-flash.
GEMINI_MODEL=gemini-3.6-flash
```

```bash
# 3. Run
npm run dev
# → http://localhost:3000
```

| Script | Purpose |
| --- | --- |
| `npm run dev` | Dev server (Turbopack) |
| `npm run build` | Production build; typechecks and prerenders developer pages |
| `npm start` | Serve the production build |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run lint` | `eslint .` (flat config) |

There is no test runner configured — `build` and `typecheck` are the automated gates.

---

## Folder structure

```
.
├── src/
│   ├── app/
│   │   ├── layout.tsx              # Shell: header, nav, footer, metadata
│   │   ├── page.tsx                # "/" — server component, passes cohort down
│   │   ├── globals.css             # Tailwind entry + @theme brand palette
│   │   ├── developer/
│   │   │   └── [id]/page.tsx       # Per-developer detail (async params, SSG)
│   │   ├── fit/
│   │   │   └── page.tsx            # "/fit" — the only page-level client component
│   │   └── api/
│   │       ├── analyze/route.ts    # POST → repo requirement only
│   │       ├── developers/route.ts # GET  → seed cohort
│   │       ├── fit/route.ts        # POST → requirement + ranking + rationale
│   │       └── repos/route.ts      # GET  → repos visible to GITHUB_TOKEN
│   │
│   ├── components/
│   │   ├── DeveloperBrowser.tsx    # [client] name + stack filtering for "/"
│   │   ├── RepoPicker.tsx          # [client] lists your GitHub repos
│   │   ├── FullScreenLoader.tsx    # Centered blocking loader
│   │   ├── DeveloperCard.tsx       # Grid card
│   │   ├── ArchetypeBadge.tsx      # frontend / backend / fullstack pill
│   │   ├── VerdictBadge.tsx        # fit / ramp-up / not fit pill
│   │   └── SubScoreBar.tsx         # 0–100 bar for one sub-score
│   │
│   ├── lib/
│   │   ├── types.ts                # All shared types — start here
│   │   ├── config.ts               # Weights, thresholds, digest limits, model
│   │   ├── scoring.ts              # Pure sub-scores + ranking (no I/O, no AI)
│   │   ├── github.ts               # Repo digest, URL parsing, repo listing
│   │   ├── gemini.ts               # Gemini REST client, JSON mode + retry
│   │   ├── analyzer.ts             # Prompts + end-to-end orchestration
│   │   └── developerHelpers.ts     # MockDeveloper → DeveloperView
│   │
│   └── data/
│       └── developers.ts           # 10 seeded developers (4 FE, 3 BE, 3 FS)
│
├── CLAUDE.md                       # Guide for AI coding agents
├── AGENTS.md                       # Managed block written by `next dev`
├── eslint.config.mjs               # Flat config (Next 16 removed `next lint`)
├── postcss.config.mjs              # @tailwindcss/postcss
└── .env.local.example              # Env template
```

---

## How it works

```
repoUrl
  │
  ├─ parseRepoUrl()          validate + extract owner/repo
  ├─ buildRepoDigest()       3 REST calls + up to 20 raw file reads
  │                          → tree listing + inlined key files + language bytes
  ├─ analyzeRepo()           ── Gemini call #1 ──▶ RepoRequirement
  │                             (stack, languages, archetype, domain, complexity)
  ├─ rankCohort()            PURE TypeScript — computes and sorts every score
  ├─ explainRanking()        ── Gemini call #2 ──▶ one explanation per developer
  │                             (told explicitly not to re-rank or invent numbers)
  ▼
{ requirement, ranked, topPickId, topPickRationale }
```

`analyzeAndRank()` in `src/lib/analyzer.ts` is the only place that composes the
full pipeline. A typical request takes **5–30 seconds**, dominated by the
sequential file reads in the digest step.

Digest selection is scored, not arbitrary: config files and READMEs are ranked
above bulk source, `node_modules`/`dist`/binaries are dropped, and each file is
capped at 15 KB so the prompt stays inside the model's context.

---

## Routes & API

### Pages
| Route | Description | Needs keys? |
| --- | --- | --- |
| `/` | Developers list with name + stack filters | No |
| `/developer/[id]` | Per-developer detail (prerendered) | No |
| `/fit` | Repo URL → requirement + ranked fit list | Yes (Gemini) |

### Endpoints
| Endpoint | Returns |
| --- | --- |
| `POST /api/analyze { repoUrl }` | `{ requirement, digestMeta }` |
| `POST /api/fit { repoUrl }` | `{ requirement, ranked, topPickId, topPickRationale }` |
| `GET /api/developers` | `{ developers }` — the seed cohort |
| `GET /api/repos` | `{ login, repos }` — repos visible to `GITHUB_TOKEN` |

Bad JSON and a missing `repoUrl` return `400`. Upstream GitHub `4xx` is surfaced
as `400`; anything else is `500`. Every error response is `{ error: string }`.

---

## Scoring

Three deterministic sub-scores, each `0–100`:

| Sub-score | Weight | How |
| --- | --- | --- |
| `stackOverlap` | 0.40 | dev languages ∩ (repo languages ∪ stack), over the repo set size |
| `archetypeMatch` | 0.35 | exact = 100 · fullstack→specialist = 75 · specialist→fullstack = 60 · opposite = 25 |
| `experienceDepth` | 0.25 | commit percentile across the cohort, blended 70/30 with normalized net lines |

```
overall = 0.40*stackOverlap + 0.35*archetypeMatch + 0.25*experienceDepth
verdict = overall ≥ 75 → fit | 55–74 → ramp-up | < 55 → not fit
```

Weights, thresholds and archetype distances all live in `src/lib/config.ts` and
can be tuned without touching the engine.

---

## Configuration

`src/lib/config.ts`:

| Knob | Default | Meaning |
| --- | --- | --- |
| `SCORING_WEIGHTS` | `0.40 / 0.35 / 0.25` | Sub-score blend |
| `VERDICT_THRESHOLDS` | `fit: 75`, `rampUp: 55` | Verdict cut-offs |
| `ARCHETYPE_MATCH_SCORES` | `100 / 75 / 60 / 25` | Archetype distance |
| `DIGEST_LIMITS.maxTreePaths` | `400` | Tree paths shown to the model |
| `DIGEST_LIMITS.maxInlinedFiles` | `20` | Files inlined into the digest |
| `DIGEST_LIMITS.maxFileBytes` | `15 KB` | Per-file truncation |
| `GEMINI_MODEL` | `gemini-3.6-flash` | Override via env |

---

## Known limitations

- **Commit counts and LOC are noisy proxies for skill, not proof of it.** The
  output is decision support for a human conversation, not a pass/fail gate. The
  UI carries this disclaimer and it should stay there.
- **`stackOverlap` is structurally depressed.** Framework strings in
  `requirement.stack` (e.g. `"Next.js App Router"`) can never match a developer's
  `languages`, but they still count in the denominator. On a framework-heavy repo
  the realistic ceiling is ≈ 63, so a `"fit"` verdict is very hard to reach and
  most developers land on `ramp-up`. Scoring `stack` as its own sub-score is the
  honest fix — see [Future scope](#future-scope).
- **`experienceDepth` is cohort-relative.** Adding or removing a seeded developer
  shifts everyone else's score.
- **No auth.** `/api/repos` lists whatever `GITHUB_TOKEN` can see, so "your
  repositories" means "the token owner's repositories" for every visitor. A
  fine-grained public-repos-only token will not list private repos.
- **Model names rot.** The original default `gemini-2.5-flash` now 404s for new
  API keys. Note that `GET /v1beta/models` still *lists* retired models, so always
  probe a candidate with a real `generateContent` call before adopting it.
- **Seed edits need a rebuild.** `/developer/[id]` is prerendered via
  `generateStaticParams()`.
- **GitHub rate limits.** Unauthenticated is 60 req/hr and one digest spends 3 of
  those (repo meta, tree, languages). File reads hit
  `raw.githubusercontent.com`, which doesn't draw on that quota. `GITHUB_TOKEN`
  raises the cap to 5,000/hr.
- **No tests.** No runner is configured.

---

## Future scope

**Scoring quality**
- Split `stack` into its own sub-score so frameworks are matched against a
  developer's frameworks instead of polluting the language denominator — this is
  the highest-value fix and would make `"fit"` reachable.
- Add recency weighting, so a language used last month outranks one last touched
  three years ago.
- Weight repository *relevance* (domain similarity), not just raw volume.
- Detect frameworks per developer from their repos rather than only languages.

**Real data**
- Replace the seed file with real GitHub contribution data per developer
  (`/users/{u}/repos`, commit stats, languages).
- Optional import from an HR or resource-planning system to seed the cohort.
- Persist cohorts and past analyses in a database so rankings can be compared
  over time.

**Product**
- GitHub OAuth so each visitor sees their *own* repositories instead of the
  token owner's.
- Analyse a private repo the signed-in user has access to.
- Multi-repo / team-level fit: staff a whole project, not one slot, with
  capacity awareness.
- Explain-the-gap output: name the specific skills a `ramp-up` developer needs.
- Shareable result links and CSV/PDF export for reassignment conversations.
- Save and diff requirement profiles across repos.

**Engineering**
- Parallelize the digest file reads with `Promise.all` — the single biggest
  latency win.
- Stream results so the requirement renders before the explanations finish.
- Cache digests and requirements per commit SHA to avoid repeat model spend.
- Make `FitRanking` the single source of truth for the `/api/fit` contract
  (it is currently dead code that has already drifted).
- Add a test suite around `scoring.ts` — it is pure and trivially testable.
- Retry/backoff on Gemini `503 high demand`.

---

## Troubleshooting

| Symptom | Cause / fix |
| --- | --- |
| `GEMINI_API_KEY is not set` | Add it to `.env.local` and restart the dev server. |
| Gemini `404 … no longer available` | Your `GEMINI_MODEL` is retired. Use `gemini-3.6-flash` or `gemini-flash-latest`. |
| GitHub `401 Bad credentials` | `GITHUB_TOKEN` is invalid, expired, or holds the wrong value — check the two keys aren't swapped. |
| Repo picker says it can't list repos | `GITHUB_TOKEN` is missing or lacks repository metadata access. |
| No developer ever shows `Fit` | Expected — see the `stackOverlap` note in [Known limitations](#known-limitations). |
| Env change had no effect | Env vars are read at server start; restart `npm run dev`. |

---

## Rollback

Stateless — no database and no migrations. Stop the dev server, or `git revert`
the relevant commit.
