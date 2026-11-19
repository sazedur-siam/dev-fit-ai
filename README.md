# DevFit — Find the Best-Fit Developer

Paste a public GitHub repo URL. DevFit builds a digest of the repository, asks
Gemini what kind of developer it needs, scores a seeded team against that
requirement with **deterministic** sub-scores, and returns a ranked fit list with
plain-language explanations for every developer.

The core idea: **the maths decides, the AI only narrates.** Ranking happens in
pure TypeScript before the model is ever asked to write an explanation, so any
result can be recomputed and audited by hand.

### Try it with the demo account

Seed a local database with the `DEMO_*` vars set (see [Demo account](#demo-account)),
then sign in at `/login` as a project manager:

| Email | Password |
| --- | --- |
| `demo@devfit.local` | `devfit-demo` |

For local testing only. Don't set `DEMO_*` on a deployed instance. There, people
can [register](#accounts-login-register) their own account instead.

---

## Contents

- [Try it with the demo account](#try-it-with-the-demo-account)
- [Features](#features)
- [Stack](#stack)
- [Setup](#setup)
  - [Demo account](#demo-account)
- [Authentication & roles](#authentication--roles)
- [How API keys are stored](#how-api-keys-are-stored)
- [Data model](#data-model)
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

### Accounts (`/login`, `/register`)
- **Email + password** sign-in (NextAuth v4 Credentials, bcrypt cost 12), plus
  optional **Continue with Google** when `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET`
  are set.
- **Self-registration** at `/register`: email, password, confirm password — or sign
  up with Google. New accounts are always project managers.
- **Every page sits behind the login** — `/login` and `/register` are the only routes
  reachable while signed out. Each role lands on its own page: admin → `/admin`,
  project manager → `/fit`.
- Two roles: one **Admin** (bootstrapped from `ADMIN_EMAIL` / `ADMIN_PASSWORD`) and
  any number of **Project managers** — self-registered or created by the admin.
- **Self-registered accounts bring their own keys.** They never fall back to the
  server's `GEMINI_API_KEY` / `GITHUB_TOKEN`, so opening registration doesn't hand
  your keys to the public.

### Navigation
- **Collapsible sidebar** instead of a top nav — icon + label when expanded,
  icon-only when collapsed, with the toggle at the top of the sidebar.
- The collapse preference is stored in a cookie and read **server-side**, so the
  sidebar paints at the right width on first load rather than flashing open.
- Nav adapts to role: project managers see Developers / Check fit / History /
  Settings; admins additionally see Admin.
- On mobile it becomes an off-canvas drawer with a scrim, closes on navigation, and
  dismisses with `Escape`. Active route is marked with `aria-current="page"`.

### Your API keys (`/settings`)
- Save, update and delete your **own** `GEMINI_API_KEY` and `GITHUB_TOKEN`.
- Stored **encrypted (AES-256-GCM)**; the app shows only a masked preview
  (`github…OP`) and never returns a stored value to the browser.
- Your usage counts against your own quota, not a shared key.

### Admin dashboard (`/admin`)
- **Create project-manager accounts** — email, optional name, and a password (with a
  generator). The password is shown once, to be passed on securely; there is no
  reset-by-email flow.
- **Reset any user's password**, promote/demote, and delete users. Deleting a user
  also removes their stored keys and history.
- Every user with role, join date, last login, and **whether** they have saved each
  credential — never the values, not even for admins.
- The last admin cannot be demoted or deleted, and self-demotion and self-deletion
  are refused, so the dashboard can't be locked out.
- Filter by email or name, plus roster totals.

### Analysis history (`/history`)
- Every fit run you've done, newest first, with the derived requirement and top
  pick. Scoped to your own account.

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
- **Browse your own repositories** — lists every repo *your own saved* GitHub token
  can see (newest push first), with its own filter box, language, star count, push
  date and `private` / `fork` badges. Selecting one fills the form so you can review
  before running.
- **Full-screen loader** while the request runs, with a staged message
  (*Analysing repository…* → *Ranking developers…*), a spinner, a halo and an
  indeterminate progress bar. It respects `prefers-reduced-motion` and announces
  itself to screen readers via `role="status"` / `aria-busy`.
- Results view: the derived repo requirement (domain, complexity, archetype,
  languages, stack), a highlighted top pick, and the full ranking with per-developer
  sub-score bars, verdict badges and AI explanations.

### Developer detail (`/developer/[id]`)
- Contribution totals, per-repository commit/addition/deletion breakdown and
  recent commit messages, read from MongoDB.

---

## Stack

| Layer | Choice |
| --- | --- |
| Framework | Next.js 16 (App Router, Turbopack) |
| UI | React 19, Tailwind CSS 4 |
| Language | TypeScript (strict) |
| AI | Google Gemini via REST (`gemini-3.6-flash` by default) |
| Repo data | GitHub REST API + `raw.githubusercontent.com` |
| Auth | NextAuth v4 — email + password (Credentials) + optional Google, JWT sessions, bcrypt |
| Database | MongoDB (official `mongodb` driver v7) |
| Secrets at rest | AES-256-GCM via Node `crypto` |

Requires **Node.js ≥ 20.9**.

Tailwind 4 is CSS-first: there is no `tailwind.config.ts`, and the brand palette
lives in an `@theme` block in `src/app/globals.css`.

> `typescript` and `eslint` are intentionally held one major behind latest,
> because the Next 16 lint stack cannot yet use TS 7 or ESLint 10. The full
> reasoning is in the toolchain section of [CLAUDE.md](CLAUDE.md) — please read it
> before bumping either.

---

## Setup

### 1. Install

```bash
npm install
cp .env.local.example .env.local
```

### 2. MongoDB

Either a free **Atlas M0** cluster or a local server — only the URI differs.

```ini
# Include a database name, or set MONGODB_DB — otherwise the driver
# silently falls back to a database called "test".
MONGODB_URI=mongodb+srv://user:pass@cluster.xxxxx.mongodb.net/
MONGODB_DB=devfit
```

### 3. Generate two secrets

```bash
node -e "console.log('ENCRYPTION_KEY=' + require('crypto').randomBytes(32).toString('base64'))"
node -e "console.log('NEXTAUTH_SECRET=' + require('crypto').randomBytes(32).toString('base64'))"
```

`ENCRYPTION_KEY` must be **32 bytes** (base64 or hex). Changing it later makes every
already-stored user key undecryptable — users would have to re-enter theirs.

### 4. Complete `.env.local`

```ini
MONGODB_URI=mongodb+srv://…
MONGODB_DB=devfit

ENCRYPTION_KEY=…            # 32 bytes, base64 — from step 3
NEXTAUTH_SECRET=…           # from step 3
NEXTAUTH_URL=http://localhost:3000

# The single admin account, created by `npm run seed`.
ADMIN_EMAIL=you@company.com
ADMIN_PASSWORD=choose-something-strong
ADMIN_NAME=Your Name

# Optional demo project manager, created by `npm run seed` — see "Demo account".
DEMO_EMAIL=demo@devfit.local
DEMO_PASSWORD=devfit-demo

# Optional "Continue with Google" — see "Google sign-in". Hidden when unset.
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=

# Optional server-wide fallbacks, used when a user hasn't saved their own.
# Admin-created accounts only — self-registered and Google accounts never use them.
GEMINI_API_KEY=
GITHUB_TOKEN=
GEMINI_MODEL=gemini-3.6-flash
```

### 5. Seed and run

```bash
npm run seed     # developer cohort + the admin account — required
npm run dev      # → http://localhost:3000
```

Sign in at `/login` with `ADMIN_EMAIL` / `ADMIN_PASSWORD`, add your Gemini key at
`/settings`, then create project managers from `/admin`.

> `ADMIN_PASSWORD` only applies when the account is **created**. Re-running the seed
> never overwrites a password that has since been changed — use *Reset password* in
> the dashboard for that.

### Demo account

To try the app as a **project manager** without creating one by hand, keep the two
`DEMO_*` lines above and run `npm run seed`. Then sign in at `/login` with:

| Role | Email | Password |
| --- | --- | --- |
| Project manager | `demo@devfit.local` | `devfit-demo` |

You land on `/fit`. Save a Gemini key at `/settings`, or set `GEMINI_API_KEY` in
`.env.local` so the demo account falls back to it.

> These credentials are public, because they're printed right here. They only exist in
> a database you seed with them, so they're fine for local testing. **Leave `DEMO_*`
> unset on any deployed instance**: anyone who reads this README could sign in and
> run analyses on your server-wide Gemini and GitHub keys. If a demo account already
> exists there, delete it from `/admin`.

| Script | Purpose |
| --- | --- |
| `npm run dev` | Dev server (Turbopack) |
| `npm run build` | Production build; also typechecks |
| `npm start` | Serve the production build |
| `npm run seed` | Developer cohort + admin account (+ optional demo user) in MongoDB (idempotent) |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run lint` | `eslint .` (flat config) |
| `npm test` | Vitest unit tests (`src/**/*.test.ts`) |

CI (`.github/workflows/ci.yml`) runs lint, typecheck, tests and a secret-free build on
every pull request.

---

## Authentication & roles

| | Admin | Project manager |
| --- | --- | --- |
| How the account is made | `ADMIN_EMAIL` / `ADMIN_PASSWORD` + `npm run seed` | Self-registered at `/register` (password or Google), created by the admin in `/admin`, or the optional [demo account](#demo-account) |
| Lands on after login | `/admin` | `/fit` |
| Manage users | ✅ | ❌ (403) |
| Own keys, fit runs, history | ✅ | ✅ |
| Falls back to server API keys | ✅ | Admin-created only — never self-registered or Google |

Registration can only ever create a project manager; a `role` in the request body is
ignored. `/admin` is the only way to make another admin.

Passwords are **bcrypt** hashes at cost 12 — replaceable, never readable. Sessions
are **JWT**: the Credentials provider supports no other strategy, and
`@next-auth/mongodb-adapter` peers on `mongodb ^4 || ^5` anyway, two majors behind
the v7 driver here.

**The role in the JWT is a UI hint only.** Every privileged route and page re-reads
the user from MongoDB via `requireUser()` / `requireAdmin()`, so a demotion takes
effect immediately instead of waiting for the token to expire.

**Login does not reveal whether an account exists.** An unknown email and a wrong
password produce the same message and comparable response timing, so the form can't
be used to enumerate users. A Google-only account (no password) is treated as
unknown by the password form. *Registration* does say "an account with that email
already exists" — a signup form can't hide that without sending confirmation email,
which the app doesn't do.

### Google sign-in

Optional. Create an OAuth client in Google Cloud Console (*APIs & Services →
Credentials → OAuth client ID → Web application*) and add this authorised redirect
URI for each host:

```
http://localhost:3000/api/auth/callback/google
https://your-host/api/auth/callback/google
```

Put the client ID and secret in `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET`, and set
`NEXTAUTH_URL` to the public URL in production — NextAuth builds the redirect from
it. `/api/health` reports `GOOGLE_SIGN_IN: true` once both are set.

How accounts are matched:

- Only Google accounts with a **verified email** are accepted.
- First Google sign-in with a new email creates a project manager with no password.
- If the email already has an account, Google is **linked** to it. From then on the
  account is tied to that Google identity; a different Google account with the same
  email is refused.
- **Linking wipes the password of an unverified self-registered account.**
  Registration sends no confirmation email, so anyone could register someone else's
  address first. When the real owner proves the address through Google, the
  squatter's password stops working. Admin-created accounts keep their password.
- A Google-only user who wants a password can get one via *Reset password* in
  `/admin`.

There is **no `proxy.ts`** (Next 16's rename of `middleware.ts`). Each page does its
own `getCurrentUser()` + `redirect("/login")`, which keeps the check beside what it
protects and works with DB-backed roles an edge matcher can't read.

---

## How API keys are stored

```
plaintext ──> AES-256-GCM ──> { ciphertext, iv, tag } ──> MongoDB
                  │
                  └─> maskSecret() ──> "github…OP"   (the only thing a client sees)
```

- A random 96-bit IV per write, so the same key encrypts differently every time.
- GCM is **authenticated**: a tampered document fails to decrypt rather than
  yielding garbage.
- **No endpoint returns a stored key.** Not to the owner, not to an admin.
- A failed decrypt (rotated `ENCRYPTION_KEY`, tampered document) is treated as
  "unset" rather than throwing, so the request falls back to a server key.
- Deleting a key removes it immediately.

---

## Data model

| Collection | Holds |
| --- | --- |
| `users` | `email` (unique, lowercased), `passwordHash` (bcrypt, `null` for Google-only), `name`, `role`, `source` (`bootstrap`/`admin`/`self`/`google`), `googleId`, `emailVerified`, `createdAt`, `lastLoginAt` |
| `userKeys` | `userId`, `kind` (`gemini`/`github`), `sealed {ciphertext, iv, tag}`, `preview`, `updatedAt` |
| `developers` | The cohort — unique index on the business `id` |
| `analyses` | `userId`, `repoUrl`, `owner`, `repo`, `requirement`, `ranked[]`, `topPickId`, `createdAt` |

The Mongo client is cached on `globalThis` — dev-mode HMR re-evaluates modules, and
without caching each reload would open another connection pool until the server
refused them.

---

## Folder structure

```
.
├── src/
│   ├── app/                        # Every page guards itself; all dynamic
│   │   ├── layout.tsx              # Shell: header, role-aware nav, footer
│   │   ├── page.tsx                # "/" — developers list
│   │   ├── globals.css             # Tailwind entry + @theme brand palette
│   │   ├── login/page.tsx          # Unauthenticated: sign in
│   │   ├── register/page.tsx       # Unauthenticated: self-registration
│   │   ├── settings/page.tsx       # Your own API keys
│   │   ├── admin/page.tsx          # Admin-only: user management
│   │   ├── history/page.tsx        # Your past fit runs
│   │   ├── developer/[id]/page.tsx # Per-developer detail (async params)
│   │   ├── fit/page.tsx            # Server guard, renders <FitView>
│   │   └── api/
│   │       ├── auth/[...nextauth]/ # NextAuth: credentials + Google
│   │       ├── register/route.ts   # POST → public self-registration
│   │       ├── analyze/route.ts    # POST → repo requirement only
│   │       ├── developers/route.ts # GET  → cohort
│   │       ├── fit/route.ts        # POST → ranking (+ saves history)
│   │       ├── repos/route.ts      # GET  → your GitHub repos
│   │       ├── keys/route.ts       # GET/PUT/DELETE your credentials
│   │       ├── analyses/route.ts   # GET  → your history
│   │       └── admin/users/        # GET/POST, and [id] PATCH/DELETE
│   │
│   ├── components/
│   │   ├── AppShell.tsx            # [client] collapsible sidebar + shell
│   │   ├── LoginForm.tsx           # [client] email + password
│   │   ├── RegisterForm.tsx        # [client] email + password + confirm
│   │   ├── KeyManager.tsx          # [client] save/update/delete keys
│   │   ├── AdminUserTable.tsx      # [client] create/reset/promote/delete
│   │   ├── AuthButtons.tsx         # [client] sign out
│   │   ├── FitView.tsx             # [client] the whole fit flow
│   │   ├── DeveloperBrowser.tsx    # [client] name + stack filtering
│   │   ├── RepoPicker.tsx          # [client] lists your GitHub repos
│   │   ├── FullScreenLoader.tsx    # Centered blocking loader
│   │   ├── DeveloperCard.tsx       # Grid card
│   │   ├── ArchetypeBadge.tsx      # frontend / backend / fullstack pill
│   │   ├── VerdictBadge.tsx        # fit / ramp-up / not fit pill
│   │   └── SubScoreBar.tsx         # 0–100 bar for one sub-score
│   │
│   ├── lib/
│   │   ├── types.ts                # All shared types — start here
│   │   ├── auth.ts                 # NextAuth options (Credentials provider)
│   │   ├── session.ts              # requireUser / requireAdmin — authz boundary
│   │   ├── crypto.ts               # AES-256-GCM seal/open + masking
│   │   ├── credentials.ts          # Which key a request uses (user → env)
│   │   ├── mongodb.ts              # Cached client + collection names
│   │   ├── db/                     # users, keys, developers, analyses
│   │   ├── config.ts               # Weights, thresholds, digest limits, model
│   │   ├── scoring.ts              # Pure sub-scores + ranking (no I/O, no AI)
│   │   ├── github.ts               # Repo digest, URL parsing, repo listing
│   │   ├── gemini.ts               # Gemini REST client, JSON mode + retry
│   │   ├── analyzer.ts             # Prompts + end-to-end orchestration
│   │   └── developerHelpers.ts     # MockDeveloper → DeveloperView (pure)
│   │
│   ├── types/next-auth.d.ts        # Session/JWT augmentation (id, role)
│   └── data/
│       └── developers.ts           # Seed input for `npm run seed`
│
├── scripts/seed.mjs                # Cohort + admin bootstrap
├── CLAUDE.md                       # Guide for AI coding agents
├── AGENTS.md                       # Managed block written by `next dev`
├── eslint.config.mjs               # Flat config (Next 16 removed `next lint`)
├── postcss.config.mjs              # @tailwindcss/postcss
└── .env.local.example              # Env template
```

There is no `middleware.ts`/`proxy.ts` — see [Authentication & roles](#authentication--roles).

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
| Route | Description | Access |
| --- | --- | --- |
| `/login` | Email + password, or Google | Public |
| `/register` | Create an account (email + password + confirm, or Google) | Public |
| `/` | Developers list with name + stack filters | Signed in |
| `/developer/[id]` | Per-developer detail | Signed in |
| `/fit` | Repo URL → requirement + ranked fit list | Signed in (+ Gemini key) |
| `/history` | Your past fit runs | Signed in |
| `/settings` | Your own API keys | Signed in |
| `/admin` | User management | **Admin only** |

### Endpoints
| Endpoint | Returns | Access |
| --- | --- | --- |
| `POST /api/register { email, password, confirmPassword }` | `201 { user }`; `409` if the email is taken | Public |
| `POST /api/analyze { repoUrl }` | `{ requirement, digestMeta }` | Signed in |
| `POST /api/fit { repoUrl }` | `{ requirement, ranked, topPickId, topPickRationale, analysisId, credentialSources }` | Signed in |
| `GET /api/developers` | `{ developers }` | Signed in |
| `GET /api/repos` | `{ login, repos, tokenSource }` | Signed in |
| `GET /api/keys` | `{ keys }` — masked previews only | Signed in |
| `PUT /api/keys { kind, value }` | `{ key }` — stores encrypted | Signed in |
| `DELETE /api/keys?kind=` | `{ removed, keys }` | Signed in |
| `GET /api/analyses` | `{ analyses }` — yours only | Signed in |
| `GET /api/admin/users` | `{ users }` + key **presence** | **Admin** |
| `POST /api/admin/users` | `{ user }` — create an account | **Admin** |
| `PATCH /api/admin/users/[id]` | `{ role }` or `{ password }` | **Admin** |
| `DELETE /api/admin/users/[id]` | Deletes user + keys + history | **Admin** |

Unauthenticated requests get `401`, non-admins hitting admin routes get `403`. Bad
JSON and a missing `repoUrl` return `400`; upstream GitHub `4xx` is surfaced as
`400`. Every error response is `{ error: string }`.

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
- **No email verification or registration rate limit.** Anyone can register any
  address, and a script could create accounts in bulk. Self-registered accounts
  can't use the server's API keys, so the cost is database rows, not model spend.
  Google sign-in is the only proof of email ownership (see
  [Google sign-in](#google-sign-in)).
- **No password recovery.** There is no reset-by-email flow — an admin resets a
  password from `/admin`. If the sole admin loses theirs, delete that user row in
  MongoDB and re-run `npm run seed` to recreate it from env.
- **`ENCRYPTION_KEY` is not rotatable in place.** Changing it makes every stored
  user key undecryptable; the app treats a failed decrypt as "unset", so users
  silently fall back to server keys and must re-enter theirs.
- **A public-repos-only GitHub token won't list private repos** in the picker. That
  is the token's scope, not a bug.
- **Model names rot.** The original default `gemini-2.5-flash` now 404s for new
  API keys. Note that `GET /v1beta/models` still *lists* retired models, so always
  probe a candidate with a real `generateContent` call before adopting it.
- **Nothing is statically prerendered.** Every route is dynamic, because the cohort
  and the session are both read per request.
- **GitHub rate limits.** Unauthenticated is 60 req/hr and one digest spends 3 of
  those (repo meta, tree, languages). File reads hit
  `raw.githubusercontent.com`, which doesn't draw on that quota. `GITHUB_TOKEN`
  raises the cap to 5,000/hr.
- **Unit tests only.** Vitest covers the pure modules (scoring, crypto); there are
  no end-to-end or API tests.

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

**Real data** — see
[docs/real-git-data-feasibility.md](docs/real-git-data-feasibility.md) for the
investigation, including what the GitHub API can and cannot supply and the four
attribution traps that produce confident-but-wrong numbers.

- Replace the seed file with real profiles built from git history. Clone the repos
  and parse `git log --numstat` locally — the REST API gives per-author *volume* but
  no per-author language breakdown, and doing it via the API costs one request per
  commit.
- Add `git blame` survival (how much of what someone wrote is still there) as the
  strongest available quality signal, plus recency weighting.
- Optional import from an HR or resource-planning system for the identity mapping.
- Persist cohorts and past analyses so rankings can be compared over time.

**Product**
- Optional "Sign in with GitHub" alongside email+password, so the repo picker
  works without anyone pasting a personal access token.
- Self-service password change for project managers (today only an admin can reset
  one), and an email-based reset flow.
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
