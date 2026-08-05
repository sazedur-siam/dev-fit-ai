@AGENTS.md

# DevFit

Paste a public GitHub repo URL → the app builds a
digest of the repo, asks Gemini what kind of developer it needs, scores 10 seeded
developers against that requirement with **deterministic** sub-scores, and returns
a ranked fit list with plain-language explanations.

Sign-in is **email + password** (NextAuth v4 Credentials). **Every page is behind
the login** — there are no public routes but `/login`. Exactly one `admin` exists,
bootstrapped from env; everyone else is a `project_manager` created by that admin.
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
```

`npm run seed` is **not optional** — the cohort lives in MongoDB, and without it
`/` shows an empty state and `/api/fit` returns 503. It is idempotent (upserts on
the business `id`), so re-running it updates rather than duplicating.

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
| [src/lib/auth.ts](src/lib/auth.ts) | NextAuth options: GitHub provider, JWT callbacks. |
| [src/lib/session.ts](src/lib/session.ts) | `requireUser` / `requireAdmin` — the authorization boundary. |
| [src/lib/crypto.ts](src/lib/crypto.ts) | AES-256-GCM seal/open + masking for stored keys. |
| [src/lib/credentials.ts](src/lib/credentials.ts) | Resolves which key a request uses (user → env). |
| [src/lib/mongodb.ts](src/lib/mongodb.ts) | Cached client + collection names. |
| [src/lib/db/](src/lib/db/) | One module per collection: `users`, `keys`, `developers`, `analyses`. |
| [src/lib/config.ts](src/lib/config.ts) | Weights, thresholds, digest limits, model name. Tunable during a demo. |
| [src/lib/scoring.ts](src/lib/scoring.ts) | Pure sub-scores + ranking. No I/O, no AI. |
| [src/lib/github.ts](src/lib/github.ts) | Repo digest builder + URL parsing. |
| [src/lib/gemini.ts](src/lib/gemini.ts) | Raw Gemini REST client, JSON-mode + retry. |
| [src/lib/analyzer.ts](src/lib/analyzer.ts) | Prompts + orchestration. |
| [src/lib/developerHelpers.ts](src/lib/developerHelpers.ts) | `MockDeveloper` → `DeveloperView` (derives `languages`, `netLines`). |
| [src/data/developers.ts](src/data/developers.ts) | 10 seeded developers: 4 frontend, 3 backend, 3 fullstack. |
| [src/app/api/](src/app/api/) | Eight route handlers, all `runtime = "nodejs"`. |
| [src/components/](src/components/) | Mostly presentational; the `"use client"` ones are listed under Conventions. |
| [src/app/globals.css](src/app/globals.css) | The entire design system — raw ramps, semantic tokens, light/dark. See Design system. |
| [src/app/icon.svg](src/app/icon.svg) | Favicon, via Next's file convention. Same artwork as `Logo.tsx`. |

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
| `MONGODB_URI` | **Yes** | Atlas `mongodb+srv://…` or local. Nothing works without it. |
| `MONGODB_DB` | Strongly recommended | If the URI has no `/dbname` path, the driver falls back to `test` — set this explicitly (e.g. `devfit`) or data lands somewhere surprising. |
| `ENCRYPTION_KEY` | **Yes** | 32 bytes, base64 or hex, for the key vault. Generate: `node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"`. **Rotating it makes every stored key undecryptable** — `readUserKey` treats a failed decrypt as "unset", so users silently fall back to env keys and must re-enter theirs. |
| `NEXTAUTH_SECRET` | **Yes** | Signs the session JWT. Same generator as above. |
| `NEXTAUTH_URL` | In production | e.g. `https://your-host`. Optional locally. |
| `ADMIN_EMAIL` / `ADMIN_PASSWORD` | **Yes** for sign-in | Bootstraps the single admin. Created by `npm run seed`, and self-healed on that email's first login attempt if seed wasn't run. **Only ever creates** — it will not overwrite a password the admin later changed, so editing these does not reset an existing account (use the dashboard's *Reset password*). |
| `ADMIN_NAME` | No | Display name for the bootstrapped admin. |
| `GEMINI_API_KEY` | No | Fallback when a user hasn't saved their own. |
| `GITHUB_TOKEN` | No | Same, for GitHub. Unauthenticated GitHub is 60 req/hr; one digest costs 3 REST calls. |
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

**Every route requires a session.** `/login` is the only unauthenticated page —
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
   way — don't add "no such user" for friendliness.

Credential resolution is user-key → env-key → none
([src/lib/credentials.ts](src/lib/credentials.ts)). The env fallback keeps a
single-operator deployment working; `credentialSources` on the `/api/fit` response
reports which one was actually used.

### Roles and account creation

There is **no self-registration**. Accounts come into existence two ways only:
the env-bootstrapped admin, and `POST /api/admin/users` (admin-only). If you add a
signup route you have changed the security model — don't do it incidentally.

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

- The **Credentials provider only supports JWT sessions**. There is no OAuth
  account record to hang a database session off.
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
  `AuthButtons`. Pages fetch and guard, clients render and mutate — `/fit`
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
- Route handlers validate input and return `{ error: string }` with a 4xx/5xx.
  Errors matching `/^GitHub 4\d\d/` map to 400, everything else to 500.
- Keep the disclaimer in the UI. Commit counts and language overlap are proxies for
  skill, not proof of it; the app is decision support for a human, not a pass/fail
  gate. Don't ship copy that overclaims.
