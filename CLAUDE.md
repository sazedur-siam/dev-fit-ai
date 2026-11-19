@AGENTS.md

# DevFit

Paste a public GitHub repo URL → the app builds a
digest of the repo, asks Gemini what kind of developer it needs, scores 10 seeded
developers against that requirement with **deterministic** sub-scores, and returns
a ranked fit list with plain-language explanations.

Sign-in is **email + password** (NextAuth v4 Credentials) plus optional **Google**.
**Every page is behind the login** — the only public routes are `/login` and
`/register`. One `admin` is bootstrapped from env; everyone else is a
`project_manager`, self-registered or created by the admin.
Users store their **own** Gemini/GitHub credentials, encrypted at rest. MongoDB
holds users, encrypted keys, the developer cohort and per-user analysis history.

## Commands

```bash
npm install
cp .env.local.example .env.local   # then fill it in — see Environment below
npm run seed       # load the developer cohort into MongoDB (required once)
npm run dev        # http://localhost:3000 (Turbopack)
npm run build      # prod build; also typechecks
npm run typecheck  # tsc --noEmit
npm run lint       # eslint . (flat config)
npm test           # vitest run (unit tests, no network, no DB)
npm run refresh    # re-import GitHub developers that are due (nightly in CI)
```

`npm run seed` is **not optional** — the cohort lives in MongoDB, and without it
`/` shows an empty state and `/api/fit` returns 503. It is idempotent (upserts on
the business `id`), so re-running it updates rather than duplicating.

**Tests are Vitest**, configured in [vitest.config.mts](vitest.config.mts) (`.mts`
because the package isn't `"type": "module"`), which mirrors the `@/` alias. Test
files sit next to the code as `src/**/*.test.ts` and must not touch the network or
MongoDB: mock the DB module or test the pure function. [scoring.test.ts](src/lib/scoring.test.ts)
pins the determinism guarantee and the verdict edges (including `74.96` → `"ramp-up"`).

**CI** ([.github/workflows/ci.yml](.github/workflows/ci.yml)) runs lint, typecheck,
test and build on every PR and on pushes to `main`. The build step runs with **no
secrets**, which is what enforces the "never throw at module scope for a missing env
var" rule below.

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
  → getRepoHead()             2 REST calls: metadata + head commit SHA
  → [cache]                   public repos only: requirement / digest per SHA
  → buildRepoDigest()         2 REST calls + up to 20 raw file reads, 5 at a time
  → analyzeRepo()             src/lib/analyzer.ts  → Gemini #1 → RepoRequirement
  → rankCohort()              src/lib/scoring.ts   → pure, sorted by overall desc
  → explainRanking()          src/lib/analyzer.ts  → Gemini #2 → explanations
  → { requirement, ranked, topPickId, topPickRationale }
```

`analyzeAndRank()` in [src/lib/analyzer.ts](src/lib/analyzer.ts) is the repo
orchestrator. The ranking half is `rankAndExplain()`, shared with the second entry
point:

```
needText (+ answers)
  → parseNeed()               src/lib/analyzer.ts  → Gemini #1 → RepoRequirement
                              (or up to 3 clarifying questions, first call only)
  → rankAndExplain()          same deterministic ranking + Gemini #2
```

`POST /api/need` runs it. Rules: a PM is asked **at most once**. The follow-up call
(with `answers`, or `skipQuestions: true`) tells the model not to ask and ignores any
questions it returns anyway. A described need becomes the exact `RepoRequirement`
shape a repo does, so scoring has one code path; don't fork it. History stores
`needText` with `repoUrl`/`owner`/`repo` null, and "Re-run" uses `/fit?need=`.

## Layout

| Path | Role |
| --- | --- |
| [src/lib/types.ts](src/lib/types.ts) | All shared types. Start here. |
| [src/lib/schemas.ts](src/lib/schemas.ts) | Zod schemas: lenient for Gemini output, strict for request bodies; `parseJsonBody()`. |
| [src/lib/auth.ts](src/lib/auth.ts) | NextAuth options: Credentials + optional Google provider, JWT callbacks. |
| [src/lib/session.ts](src/lib/session.ts) | `requireUser` / `requireAdmin` — the authorization boundary. |
| [src/lib/crypto.ts](src/lib/crypto.ts) | AES-256-GCM seal/open + masking for stored keys. |
| [src/lib/rateLimit.ts](src/lib/rateLimit.ts) | Login/register throttling policy; storage in `db/rateLimits.ts`. |
| [src/lib/credentials.ts](src/lib/credentials.ts) | Resolves which key a request uses (user → env). |
| [src/lib/mongodb.ts](src/lib/mongodb.ts) | Cached client + collection names. |
| [src/lib/db/](src/lib/db/) | One module per collection: `users`, `keys`, `developers`, `analyses`, `rateLimits`. |
| [src/lib/config.ts](src/lib/config.ts) | Weights, thresholds, digest limits, model name. Tunable during a demo. |
| [src/lib/scoring.ts](src/lib/scoring.ts) | Pure sub-scores + ranking. No I/O, no AI. |
| [src/lib/github.ts](src/lib/github.ts) | Repo digest builder + URL parsing. |
| [src/lib/gemini.ts](src/lib/gemini.ts) | Raw Gemini REST client, JSON-mode + retry. |
| [src/lib/analyzer.ts](src/lib/analyzer.ts) | Prompts + orchestration. |
| [src/lib/developerHelpers.ts](src/lib/developerHelpers.ts) | `MockDeveloper` → `DeveloperView` (derives `languages`, `netLines`). |
| [src/data/developers.ts](src/data/developers.ts) | 10 seeded sample developers: 4 frontend, 3 backend, 3 fullstack. |
| [src/lib/githubProfile.ts](src/lib/githubProfile.ts) | Builds a developer from public GitHub activity (admin import). No Next imports. |
| [src/lib/frameworkDetect.ts](src/lib/frameworkDetect.ts) | Dependency manifest → frameworks table (package.json, requirements, composer, …). |
| [src/app/api/](src/app/api/) | Route handlers, all `runtime = "nodejs"`. |
| [src/components/](src/components/) | Mostly presentational; the `"use client"` ones are listed under Conventions. |
| [src/app/globals.css](src/app/globals.css) | The entire design system — raw ramps, semantic tokens, light/dark. See Design system. |
| [src/app/icon.svg](src/app/icon.svg) | Favicon, via Next's file convention. Same artwork as `Logo.tsx`. |

Always consume developers through `getAllDevelopers()` / `getDeveloperById()`, never
by importing `DEVELOPERS` directly — the helpers derive `languages`, `frameworks` and `netLines`
that scoring and the UI both depend on.

## Scoring

```
overall = 0.25*languageOverlap + 0.20*frameworkOverlap
        + 0.30*archetypeMatch  + 0.25*experienceDepth
verdict = overall >= 75 ? "fit" : overall >= 55 ? "ramp-up" : "not fit"
```

- `languageOverlap`: share of `requirement.languages` the developer has written.
- `frameworkOverlap`: share of `requirement.stack` the developer has used, compared
  through the alias table in [src/lib/skills.ts](src/lib/skills.ts)
  (`"Next.js App Router"` = `"NextJS"` = `"next"`). The developer side is expanded
  with implications (Next.js ⇒ React, DRF ⇒ Django), never the requirement side.
  Stack entries that are really languages are skipped (languageOverlap already
  counts them). **skills.ts is a fixed lookup table, never a model call;** add a
  line to `ALIASES` to teach it a spelling.
- Frameworks come from `repos[].frameworks` on each developer (optional on the type,
  so documents seeded before 2.0.0 still load; they just score 0 on frameworks until
  `npm run seed` is re-run). `DeveloperView.frameworks` is their union.

Weights and thresholds live in [src/lib/config.ts](src/lib/config.ts).

**Scoring is versioned.** `SCORING_VERSION` in config.ts is stamped on every saved
analysis by `saveAnalysis()` (legacy documents read back as `"0"`) and returned on
`/api/fit`. History marks rankings from an older formula and links to a re-run
(`/fit?repo=…` pre-fills the form). **Bump it on any change to a weight, threshold,
archetype score or sub-score formula.** [config.test.ts](src/lib/config.test.ts)
fingerprints the constants per version and fails CI if they change under an
unchanged version; its failure message gives the line to add. It can't see a
formula change inside scoring.ts, so that bump is on you.

Two behaviours that look like bugs but are deliberate:

- `experienceDepth` is **cohort-relative** (percentile of `totalCommits`, blended
  70/30 with normalized net lines). Adding or removing a seed developer shifts
  everyone else's score. Expected — don't "fix" it with absolute thresholds without
  asking.
- `verdictFor()` uses the unrounded `overall`, while the value returned to the
  client is rounded to 1dp. A score of `74.96` displays as `75.0` but is still
  `"ramp-up"`. Cosmetic, but don't be surprised by it.

## Environment

| Var | Required | Notes |
| --- | --- | --- |
| `MONGODB_URI` | **Yes** | Atlas `mongodb+srv://…` or local. Nothing works without it. |
| `MONGODB_DB` | Strongly recommended | If the URI has no `/dbname` path, the driver falls back to `test` — set this explicitly (e.g. `devfit`) or data lands somewhere surprising. |
| `ENCRYPTION_KEY` | **Yes** | 32 bytes, base64 or hex, for the key vault. Generate: `node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"`. **Rotating it makes every stored key undecryptable** — `readUserKey` treats a failed decrypt as "unset", so users silently fall back to env keys and must re-enter theirs. |
| `NEXTAUTH_SECRET` | **Yes** | Signs the session JWT. Same generator as above. |
| `NEXTAUTH_URL` | In production | e.g. `https://your-host`. Optional locally. |
| `ADMIN_EMAIL` / `ADMIN_PASSWORD` | **Yes** for sign-in | Bootstraps the single admin. Created by `npm run seed`, and self-healed on that email's first login attempt if seed wasn't run. **Only ever creates** — it will not overwrite a password the admin later changed, so editing these does not reset an existing account (use the dashboard's *Reset password*). |
| `ADMIN_NAME` | No | Display name for the bootstrapped admin. |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | No | Enables "Continue with Google". The provider isn't registered and the button is hidden when unset. Redirect URI: `<NEXTAUTH_URL>/api/auth/callback/google`. |
| `GEMINI_API_KEY` | No | Fallback when a user hasn't saved their own. **Admin-created accounts only** — self-registered and Google accounts never get it. |
| `GITHUB_TOKEN` | No | Same, for GitHub (same restriction). Unauthenticated GitHub is 60 req/hr; an uncached run costs 4 REST calls (meta, SHA, tree, languages); a cached one costs 2. |
| `GEMINI_MODEL` | No | Defaults to `gemini-3.6-flash`. |

Never `throw` at module scope for a missing env var. `auth.ts` originally did, which
broke `npm run build` anywhere without secrets — checks belong at request time
(`isAuthConfigured()`).

**Model names rot.** `gemini-2.5-flash` (the original default) now returns HTTP 404
`"no longer available to new users"` on new API keys. Two traps when re-picking one:
`GET /v1beta/models` still *lists* retired models, so listing is not proof a model
works; and some models (`gemini-3.5-flash-lite`) return 200 with **empty content**,
which `geminiText()` throws on. Always probe a candidate with a real
`generateContent` call using `responseMimeType: application/json` before adopting it.
`gemini-flash-latest` is the alias to use if you'd rather not revisit this.

## Auth and the key vault

**Every route requires a session.** `/login` and `/register` are the only
unauthenticated pages —
`/` and `/developer/[id]` were public before roles existed and are not any more.
New pages must guard themselves; see the pattern below.

**Three rules that must not be relaxed.**

1. **Authorization re-reads the database; it never trusts the JWT.** The session
   token carries a `role` claim, but it is a *UI hint only* — used to decide whether
   to render the Admin nav link. Every privileged path goes through
   `requireAdmin()` / `requireUser()` in [src/lib/session.ts](src/lib/session.ts),
   which loads the user from Mongo. A JWT keeps asserting whatever role it was
   minted with, so trusting it would let a demoted admin keep admin access until
   their token expired.
2. **Stored credentials are never returned to a client.** They are sealed with
   AES-256-GCM ([src/lib/crypto.ts](src/lib/crypto.ts)) and the API exposes only
   `maskSecret()` previews (`AQ.Ab8…45`). There is deliberately no endpoint that
   reads a key back out, and admins cannot see other users' key values — only
   whether one is set. Do not add a "reveal" affordance. The same applies to
   passwords: bcrypt hashes (cost 12) that can be replaced but never read.
3. **Login must not reveal whether an account exists.** `verifyCredentials()`
   returns `null` for both an unknown email and a wrong password, and runs a dummy
   bcrypt compare on the unknown-email path so response timing doesn't leak it
   either. The form shows one message: "Incorrect email or password." Keep it that
   way — don't add "no such user" for friendliness. A Google-only account
   (`passwordHash: null`) takes the same dummy-compare path. *Registration* does
   return 409 for a taken email — unavoidable without confirmation email.

**Login and registration are rate-limited** ([src/lib/rateLimit.ts](src/lib/rateLimit.ts)):
5 wrong passwords per email and 20 attempts per IP per 15 minutes; 10 registration
attempts per IP per hour. Counters are fixed-window documents in the `rateLimits`
collection ([db/rateLimits.ts](src/lib/db/rateLimits.ts)), updated with one atomic
pipeline upsert and expired by a TTL index. Three things are deliberate:

- **Mongo, not memory.** Serverless instances don't share memory, so an in-process
  counter could be bypassed by spreading requests. Don't "simplify" it to a `Map`.
- **The email is counted before the account is looked up**, so a throttled
  unregistered email looks exactly like a throttled registered one (rule 3).
  `authorize()` throws `TooManyAttempts`, which NextAuth hands to `LoginForm` as
  `res.error`. A successful sign-in clears that email's counter.
- **It fails open.** If the counter store errors, the attempt proceeds (the
  password check needs the same DB anyway), and the driver error is logged, never
  thrown, because anything thrown in `authorize()` reaches the client as `?error=`.

Credential resolution is user-key → env-key → none
([src/lib/credentials.ts](src/lib/credentials.ts)). The env fallback keeps a
single-operator deployment working; `credentialSources` on the `/api/fit` response
reports which one was actually used. **Self-service accounts (`source` `"self"` or
`"google"`) never get the env fallback** — anyone can create one, so allowing it
would give the server's keys to the public. `resolveCredentials()` takes the user,
not just an id, for this reason; don't loosen it.

### Roles and account creation

Accounts come into existence four ways, recorded as `source` on the user document
(`AccountSource` in [types.ts](src/lib/types.ts)):

| `source` | How | Role |
| --- | --- | --- |
| `bootstrap` | `ADMIN_EMAIL` / `ADMIN_PASSWORD` via seed or first login | admin |
| `admin` | `POST /api/admin/users` (admin-only). Also the default for legacy docs with no `source`. | either |
| `self` | `POST /api/register` — public | always `project_manager` |
| `google` | First Google sign-in with a new email | always `project_manager` |

Public paths **must never create an admin** — `createUser()` forces
`project_manager` when `source` is `"self"`, and the body's `role` is ignored.

**Google linking** lives in `signInWithGoogle()` ([db/users.ts](src/lib/db/users.ts)),
called from the `signIn` callback; the `jwt` callback then maps Google's id to ours
via `getUserByGoogleId()` (on a Google sign-in `user.id` is *Google's* id, not
ours). Rules, all deliberate:

- Only `email_verified` Google profiles are admitted, because linking is by email.
- An email already tied to a *different* `googleId` is refused (→ `/login?error=AccessDenied`).
- Linking a `self` account that isn't `emailVerified` **sets its `passwordHash` to
  `null`**. There's no confirmation email, so anyone can pre-register someone
  else's address; without this, the squatter's password would keep working after
  the real owner signs in with Google. Admin-created accounts keep their password.
- There is no NextAuth adapter (see below), so no `accounts` collection — the link
  is `googleId` on the user document.

The API refuses to demote or delete the last admin, and refuses self-demotion and
self-deletion, so the dashboard cannot be locked out. `ROLE_HOME` in
[types.ts](src/lib/types.ts) decides where each role lands after login
(admin → `/admin`, project manager → `/fit`).

Every protected page follows one pattern — copy it rather than inventing another:

```ts
const user = await getCurrentUser();
if (!user) redirect("/login");
if (user.role !== "admin") redirect("/");   // admin pages only
```

`/api/repos` is genuinely per-user: it uses the signed-in user's own stored token.
A fine-grained public-repos-only token still won't list private repos — that is the
token's scope, not a bug.

### Sessions are JWT, not database-backed

Two independent reasons, so don't "upgrade" this:

- The **Credentials provider only supports JWT sessions**, and password sign-in
  has no OAuth account record to hang a database session off. Google shares the
  same JWT strategy.
- `@next-auth/mongodb-adapter@1.1.3` peers on `mongodb: ^4 || ^5`, two majors below
  the `mongodb@7` driver here, so the adapter can't be installed anyway.

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

- **Never import a plain constant from a `"use client"` module into a server
  component.** Everything a client module exports becomes a *client reference* on
  the server, not the underlying value. `SIDEBAR_COOKIE` was originally exported
  from [AppShell.tsx](src/components/AppShell.tsx) and read in
  [layout.tsx](src/app/layout.tsx) via `cookies().get(SIDEBAR_COOKIE)` — which
  never matched, so the sidebar always rendered expanded. It **typechecks and
  builds clean**; the only symptom is the feature quietly not working. Shared
  constants belong in a non-client module — this one lives in
  [types.ts](src/lib/types.ts).
- **`middleware.ts` does nothing in Next 16 — it was renamed to `proxy.ts`.** A
  root `middleware.ts` is **silently ignored**: no warning, no error, it simply
  never runs. This is an easy hour to lose, because page-level `redirect()` calls
  can make it *look* like route protection is working while the file is dead. If you
  do add one, it goes at `src/proxy.ts` (same level as `app`) and exports `proxy`.
  Confirm with `node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/proxy.md`.
  **This project has no proxy at all, deliberately** — Next 16 recommends avoiding
  it, and every protected page does its own `getCurrentUser()` + `redirect("/login")`,
  which keeps authorization next to the thing it protects and works with DB-backed
  roles that an edge matcher cannot check. Guard new protected pages the same way;
  don't reintroduce a proxy for auth.
- **`params` is a Promise.** [src/app/developer/[id]/page.tsx](src/app/developer/%5Bid%5D/page.tsx)
  is an `async` component doing `const { id } = await params`. Any new dynamic
  route must do the same — including API routes like
  [api/admin/users/[id]](src/app/api/admin/users/%5Bid%5D/route.ts).
- **Nothing is statically prerendered any more.** Every route is `ƒ (Dynamic)`.
  `generateStaticParams` was removed from `/developer/[id]` when the cohort moved to
  MongoDB, because prerendering would need a DB connection at build time and the
  cohort is now editable at runtime.
- **`next lint` no longer exists.** `npm run lint` calls `eslint .` against
  [eslint.config.mjs](eslint.config.mjs) (flat config composing
  `eslint-config-next/core-web-vitals` + `/typescript`).
- **Tailwind is CSS-first — there is no `tailwind.config.ts`.** The whole design
  system lives in [src/app/globals.css](src/app/globals.css). Add colors there,
  not in a JS config. PostCSS uses `@tailwindcss/postcss`; `autoprefixer` was
  removed (Tailwind 4 prefixes via Lightning CSS). The `amber` hexes are pinned
  to Tailwind 3's values so the v4 OKLCH palette doesn't shift the warning tone.
  See **Design system** below before restyling anything.
- **`next dev` writes `AGENTS.md` and may write `CLAUDE.md`.** The generator
  (`node_modules/next/dist/server/lib/generate-agent-files.js`) upserts a managed
  `<!-- BEGIN:nextjs-agent-rules -->` block. Because `AGENTS.md` exists and hosts
  that block, `CLAUDE.md` is **skipped** — which is why this file is safe to hand-edit.
  Keep the `@AGENTS.md` import on line 1 and leave the block in `AGENTS.md` alone;
  if you move the block into `CLAUDE.md`, `next dev` will start rewriting this file.
- Next 16 bundles its own docs at `node_modules/next/dist/docs/` — consult those
  rather than guessing at v16 API shapes.

## Real developers (GitHub import)

The cohort mixes **sample** developers (`src/data/developers.ts`, `source` absent →
`"seed"`) and **imported** ones (`source: "github"`, id `gh-<login>`). An admin
imports someone on `/admin` → `POST /api/admin/developers { login, archetype? }`,
which calls `fetchGithubDeveloper()` with the admin's resolved GitHub token (GraphQL
has no anonymous tier, so a token is required). Re-importing the same login
replaces the document; `DELETE /api/admin/developers/[id]` removes one.

What's deliberate:

- **Three GraphQL calls, not one.** User → repos with authored commits → manifests
  for the top 8 repos. The combined query 502'd after ~11s on a 20-repo account.
  Keep the repo query light (15 repos × 20 sampled commits).
- **Commits are by author id on default branches of the user's own public,
  non-fork repos.** Commits made under a different identity (a work email not
  linked to the account) are invisible. That's the identity problem from
  [docs/real-git-data-feasibility.md](docs/real-git-data-feasibility.md); the UI says
  "public activity only".
- **Line counts are estimates**: sampled commits' additions/deletions scaled to the
  author's commit total per repo. Labelled as such on the developer page.
- **Frameworks come from manifests via a fixed table** (`frameworkDetect.ts`), and the
  archetype guess from language bytes, with TS/JS attributed by the frameworks found
  (`guessArchetype()`). No model is involved, so imports are reproducible.
- `buildDeveloper()` is pure and tested; `fetchGithubDeveloper()` is the network
  half. `GITHUB_QUERIES` exposes the exact query strings so they can be run by hand
  with `gh api graphql` when GitHub's schema is in doubt.

### AI Fluency (shown, never ranked)

[src/lib/aiFluency.ts](src/lib/aiFluency.ts) scores 0–100 how much an *imported*
developer works with AI coding tools, from config files committed to their top
repos (`CLAUDE.md`/`.claude`, `.cursorrules`/`.cursor/rules`, `.aider.conf.yml`,
`.windsurfrules`, `.clinerules`, `.roo`, `.github/copilot-instructions.md`,
`AGENTS.md`). The import's manifest query probes each path for presence (~3.3s for
8 repos). Adoption = min(50, Σ tool weight × 2.5) + 10 for 3+ tools; consistency =
share of repos with any config × 40. Rules:

- **It is not in `overall`.** It's shown on the developer page and as a chip on fit
  results, and passed to Gemini call #2 as context. Putting it in the ranking would
  be a scoring change: a weight, a `SCORING_VERSION` bump, and a conscious decision.
- **Tier floors live only in `AI_FLUENCY_TIERS`** (config.ts). Import them; OMAV's
  tiers drifted across three files.
- `null` means *not measured*: sample developers, and imports from before detection
  (their repos lack `aiTools`; `[]` means checked, none found). Never show those as 0.

### Nightly refresh

[.github/workflows/refresh.yml](.github/workflows/refresh.yml) runs `npm run refresh`
([scripts/refresh-developers.ts](scripts/refresh-developers.ts)) at 01:00 UTC and
on demand ("Run workflow"). It re-imports `source: "github"` developers whose
`nextRefreshAt` has passed: 7 days if they committed in the last 30, 14 if in the
last 180, otherwise 30 (`nextRefreshDate()`). The loop is
[src/lib/refresh.ts](src/lib/refresh.ts), with I/O injected and tested. Rules:

- **The archetype is kept** across refreshes (an admin may have set it by hand).
- A failure (e.g. a deleted account, GitHub 404) keeps the old profile, records
  `lastRefreshError` and postpones that developer 30 days.
- It stops when the token's GraphQL budget drops under 500 points; the rest stay due.
- Each run writes a `refreshRuns` document; the admin Developers panel shows the last.
- **Without config it exits 0 with "Refresh skipped"**, so the schedule stays green
  until set up. Don't make missing secrets fail the job.

**One-time setup, by the repo owner** (not automatable from here):

1. Repository secrets: `MONGODB_URI`, `MONGODB_DB`, and `GH_REFRESH_TOKEN` (a
   fine-grained token, public repositories read-only; secret names can't start with
   `GITHUB_`).
2. **Atlas network access.** GitHub runners have no fixed IPs, so the cluster must
   accept `0.0.0.0/0`, protected by a strong password on a database user scoped to
   the DevFit database only. That is a real trade-off; skip this workflow rather
   than open the cluster casually.
3. GitHub disables schedules on repositories with no activity for 60 days;
   re-enable from the Actions tab.

## Implementation notes

- **The `/api/fit` contract is declared once:** `FitResponse` in
  [types.ts](src/lib/types.ts). The route builds a value of that type and
  [FitView.tsx](src/components/FitView.tsx) imports it. Change it there and both
  sides follow; never re-declare it locally. (`FitRanking`, the old dead copy, is
  gone.)
- **Public repos are cached per commit SHA** ([db/repoCache.ts](src/lib/db/repoCache.ts),
  7-day TTL): the digest, and Gemini's requirement keyed by SHA + `GEMINI_MODEL` +
  `REQUIREMENT_PROMPT_VERSION`. A requirement hit skips the file reads *and* Gemini
  call #1, which also makes repeat runs on one commit reproducible. Three rules:
  - **Bump `REQUIREMENT_PROMPT_VERSION`** in config.ts whenever the analyzeRepo
    prompt changes, or the old prompt's answers keep being served for a week.
  - **Private repos are never cached.** The key has no user in it, so a cached
    private digest would be served to anyone pasting the same URL. `getRepoHead()`
    treats a missing `private` flag as private.
  - Only a complete Gemini reply (`isCacheableReply()`) is cached; one that only
    survived through schema defaults is not pinned. Cache errors are logged and
    treated as misses, never as failed requests.
- Digest files are read **5 at a time** (`mapInBatches`) at the head SHA, not the
  branch name, so a push mid-build can't mix versions. That took a 20-file digest
  of this repo from ~10.7s to ~2.9s.
- `FitView` fetches `/api/developers` separately from `/api/fit` purely to get names
  and archetypes for display; the fit response carries IDs only.
- Gemini JSON parsing retries **once** with a stricter "return only JSON" reminder
  (`geminiJSON()`). The reply is then run through a lenient schema
  (`coerceRequirement()` / `coerceExplanations()` in the analyzer), so a malformed
  model response degrades to defaults rather than 500s.

## Design system

All of it is in [src/app/globals.css](src/app/globals.css), in two layers. The
split is what makes dark mode work, so keep it:

1. **Raw ramps** (`@theme`) — fixed hues. `brand` (Electric Emerald, 500 =
   `#10B981`), `iris` (Indigo), `plum`, `amber`, `brick`, `ink` (Slate).
   `brand-500` is that hex in every theme.
2. **Semantic tokens** (`@theme inline`) — roles, not hues: `surface`, `canvas`,
   `line`, `heading`, `body`, `muted`, `accent`, `accent-contrast`, `ok-*`,
   `warn-*`, `danger-*`, `role-fe-*` / `role-be-*` / `role-fs-*`. Each resolves
   through a `--df-*` variable, and `inline` makes the utility emit
   `var(--df-…)` rather than a baked hex — so redefining one variable under a
   dark scope re-themes every utility at once.

**Components use the semantic layer.** `bg-surface`, not `bg-white`;
`text-body`, not `text-ink-700`; `border-line`, not `border-ink-200`. Reach for
a raw ramp only when you mean that specific hue regardless of theme (the verdict
dots, the logo gradient). A hardcoded `bg-white` is a dark-mode bug.

Two things worth knowing before you touch a colour:

- **The primary CTA is spec'd as `#10B981` with white text, which measures
  2.1:1** — under WCAG AA for body-sized text. That is a deliberate brand call,
  not an oversight. Everything else clears AA. `--df-accent` in the light block
  is the single line to change if that trade stops being acceptable (`#059669` →
  3.9:1, `#047857` → 5.3:1).
- **On dark, the accent brightens to `#34D399` and text on it goes dark**
  (`--df-accent-contrast`), which is why `text-accent-contrast` exists instead of
  a hardcoded `text-white`.

### Theming is three-state

`light`, `dark`, and `system` — where **system is the absence of a class** on
`<html>`, resolved by a `prefers-color-scheme` block in the CSS. That is the
whole reason there is no blocking inline theme script and no flash on first
paint: the server stamps `class="light"` / `class="dark"` from the
`THEME_COOKIE` cookie (same pattern as `SIDEBAR_COOKIE`, same reason), and the
unset case needs no JS at all.

[ThemeToggle.tsx](src/components/ThemeToggle.tsx) exports a segmented control
and a single cycling button; both write the cookie and toggle the class on
`document.documentElement` directly. There is no theme context or provider —
don't add one. The dark values are written once as `--df-dark-*` and pointed at
from both activation scopes, so the two can't drift.

The `dark:` variant is wired to all three states and is available, but most
components never need it — if you're reaching for `dark:`, check whether a
semantic token already covers the case.

### Brand mark

[Logo.tsx](src/components/Logo.tsx) — angle brackets clamping a barbell, on a
rounded tile. `app/icon.svg` is the same artwork and is the favicon via Next's
file convention. The tile fill reads `--df-logo-tile` because a near-black tile
disappears against the dark canvas. [global-error.tsx](src/app/global-error.tsx)
inlines its own copy of the glyph and its own `<style>` block on purpose — the
stylesheet may not have loaded by the time it renders.

## Conventions

- TypeScript strict. Import via the `@/*` alias (`@/lib/...`, `@/components/...`),
  not relative paths, except within `src/components/`.
- Named exports for components and lib functions; default exports only where
  Next requires them (pages, layouts, route handlers).
- Server-first. Every `page.tsx` is a **server** component; interactivity lives in
  `src/components/*` client components: `AppShell`, `ThemeToggle`, `FitView`,
  `DeveloperBrowser`, `RepoPicker`, `KeyManager`, `AdminUserTable`, `LoginForm`,
  `RegisterForm`, `AuthButtons`. Pages fetch and guard, clients render and mutate — `/fit`
  follows this too (the form is `FitView`). `Logo`, `ArchetypeBadge`,
  `VerdictBadge`, `SubScoreBar`, `DeveloperCard` and `FullScreenLoader` are
  server components; keep them that way (`Logo` avoids `useId()` for exactly
  this reason).
- **Navigation is the collapsible sidebar in [AppShell.tsx](src/components/AppShell.tsx)**,
  which the root layout wraps around every signed-in page (signed out, `/login`
  renders bare). Nav items are one `NAV` array — add a route there, with
  `adminOnly: true` if it's privileged; that only hides the link, so the page must
  still guard itself. Icons are inline SVG using `currentColor` (no icon package).
  The collapse preference round-trips through the `SIDEBAR_COOKIE` cookie so the
  server renders the correct width on first paint instead of flashing open.
- **No `SessionProvider` is mounted.** The session is read server-side via
  `getServerSession`; `signIn`/`signOut` don't need a provider (only `useSession`
  does), so no session-polling JS ships. Don't add `useSession` without weighing
  that.
- Route handlers validate bodies with `parseJsonBody(req, Schema)` from
  [schemas.ts](src/lib/schemas.ts), which returns the parsed data or a ready 400
  with `{ error }` set to the schema's message (those messages are shown to users,
  so write them for people). Errors are `{ error: string }` with a 4xx/5xx.
  **Model output gets the opposite treatment:** every field `.catch()`es to a
  default, because a bad Gemini reply must degrade, not fail.
  Errors matching `/^GitHub 4\d\d/` map to 400, everything else to 500.
- Keep the disclaimer in the UI. Commit counts and language overlap are proxies for
  skill, not proof of it; the app is decision support for a human, not a pass/fail
  gate. Don't ship copy that overclaims.
