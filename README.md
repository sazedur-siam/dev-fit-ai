# DevFit — Find the Best-Fit Developer

Internal Strativ hackathon project. Paste a public GitHub repo URL; DevFit
analyses the repo with Gemini, scores 10 mock developers against it with
transparent sub-scores, and returns a ranked fit list with plain-language
explanations.

## Stack
- Next.js 16 (App Router, Turbopack) + React 19 + TypeScript
- Tailwind CSS 4 (CSS-first — theme lives in `src/app/globals.css`, no `tailwind.config.ts`)
- Google Gemini (free tier) for repo analysis and explanations
- GitHub REST API (unauthenticated by default) for the repo digest
- No database, no auth, no background jobs — all state is in-memory + seed data

Requires Node.js ≥ 20.9. `typescript` and `eslint` are intentionally held one
major behind latest — see the toolchain section of [CLAUDE.md](CLAUDE.md).

## Setup

```bash
# 1. Install deps
npm install

# 2. Copy env template and fill in keys
cp .env.local.example .env.local
# then edit .env.local:
#   GEMINI_API_KEY=...       (required — https://aistudio.google.com/app/apikey)
#   GITHUB_TOKEN=...         (optional — raises rate limit 60→5000/hr)

# 3. Run
npm run dev
# → http://localhost:3000
```

Other scripts: `npm run build`, `npm start`, `npm run typecheck`, `npm run lint`.

## Routes
- `/` — dashboard of 10 seed developers
- `/developer/[id]` — per-developer detail
- `/fit` — paste a repo URL → requirement profile + ranked fit list

## API
- `POST /api/analyze { repoUrl }` → `{ requirement, digestMeta }`
- `POST /api/fit     { repoUrl }` → `{ requirement, ranked, topPickId, topPickRationale }`
- `GET  /api/developers` → `{ developers }` — the seed list

## Scoring
Deterministic sub-scores over the seed data:
- `stackOverlap`     — dev languages ∩ (repo languages ∪ stack) / repo set size
- `archetypeMatch`   — exact = 100; fullstack↔specialist = 60–75; opposite = 25
- `experienceDepth`  — percentile of totalCommits, blended with net lines added

```
overall = 0.40*stackOverlap + 0.35*archetypeMatch + 0.25*experienceDepth
verdict = overall ≥75 fit | 55–74 ramp-up | <55 not fit
```

Weights and thresholds live in `src/lib/config.ts` — tunable during the demo.

## Notes / limits
- The repo digest inlines up to 20 files at 15 KB each. Larger repos are
  truncated to fit inside Gemini's context.
- Commit counts and LOC are noisy proxies. Output is **decision support**,
  not proven competence. The UI carries this disclaimer.
- Unauthenticated GitHub is capped at 60 req/hr, and one digest spends 3 of those
  (repo meta, tree, languages). The up-to-20 file reads go to
  `raw.githubusercontent.com`, which doesn't draw on that quota. Set
  `GITHUB_TOKEN` anyway if you'll be hammering it — it raises the cap to 5,000/hr.

## Rollback
Stateless. Stop the dev server or `git revert`.
