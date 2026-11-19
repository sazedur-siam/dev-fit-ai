# Feature backlog

Features DevFit is missing compared with OMAV (`VAMO-CLON-main`, see its
`OMAV-Project-Overview.pdf`), one file per feature. Each file says why the
feature matters, what exists today, the steps with file paths, how it stays free,
and when it counts as done.

**Every feature here can be built and run at no cost.** Each one uses only
open-source libraries and services DevFit already depends on, within their free
tiers. See [Staying at $0](#staying-at-0) for what keeps it that way.

## The list

Ordered so each feature builds on the ones before it. Size: **S** is under a day,
**M** is a few days, **L** is a week or more.

When a feature ships, its row is marked ✅ and its spec file is deleted. The code,
tests and CLAUDE.md then describe it, and the merged PR holds the original spec.

| Status | # | Feature | Size | Needs | Paid service? |
| --- | --- | --- | --- | --- | --- |
| ✅ | 01 | Tests and CI | S | none | No |
| ✅ | 02 | Rate limiting on login and register | S | none | No |
| ✅ | 03 | Validate AI and GitHub responses, one fit-response type | S | 01 | No |
| ✅ | 04 | Faster repo digest and a digest cache | S | none | No |
| ✅ | 05 | Scoring version on every analysis | S | 01 | No |
| ✅ | 06 | Score frameworks separately from languages | M | 01, 05 | No |
| ✅ | 07 | Real developers imported from GitHub | L | 05, 06 | No |
| ✅ | 08 | Scheduled nightly refresh | M | 07 | No |
| ✅ | 09 | AI Fluency score | M | 07 | No |
| ✅ | 10 | Describe a need in plain text, with clarifying questions | M | 03 | No |
| ✅ | 11 | Semantic matching with embeddings (built A + B; C, embeddings in the score, deliberately not built. First real run of `npm run suggest-aliases` needs your Gemini key) | M | 06 | No |
| ⬜ | 12 | [Recruiter workspace: notes, tags, shortlists](12-recruiter-workspace.md) | M | none | No |
| ⬜ | 13 | [Outreach email drafts](13-outreach-drafts.md) | S | 12 | No |

If you only do three, do **01, 02 and 06**. They close a security gap, add a
safety net, and fix the scoring problem that makes a "fit" verdict close to
unreachable today.

## Staying at $0

Each free service below has a limit. Past it, the service either stops working
or starts charging. The rules in the right-hand column keep it on the "stops"
side.

| Service | Free allowance | Rule that keeps it free |
| --- | --- | --- |
| **Gemini API** | Free tier on an AI Studio key, rate-limited per minute and per day | Use a key from [AI Studio](https://aistudio.google.com/app/apikey) on a Google Cloud project with **no billing account attached**. Over the limit you get HTTP 429, which `gemini.ts` already retries and reports, not a bill. Note: on the free tier Google may use prompts to improve its products, so don't send anything confidential. |
| **MongoDB Atlas M0** | 512 MB storage, shared cluster, a small number of search indexes | Stay on M0 and never click "upgrade". Store aggregates, never raw git history. Feature 07 at 30–100 developers uses a few MB. |
| **GitHub API** | 5,000 REST requests/hour per token, 60/hour without one | Always send a token. Every feature here stays far below the limit. |
| **GitHub Actions** | Unlimited minutes on public repos; 2,000 minutes/month on private repos (Free plan) | CI (01) takes about 2 min per run. The nightly job (08) takes a few minutes. That comes to a few hundred minutes a month. |
| **npm packages** | Vitest, Zod: MIT licensed | No cost. |

Free-tier limits change. Check each provider's current pricing page before you
rely on a number in this table.

## Deliberately left out

These OMAV features cost money or don't fit what DevFit does:

- **Google Cloud infrastructure** (Cloud Run Jobs, Cloud SQL, Memorystore Redis,
  Terraform). These are paid services. GitHub Actions on a schedule (08) does the
  same job for DevFit's size.
- **Three AI PR reviewers** (Claude, Gemini, Codex). Every review is a paid API
  call. Tests and CI (01) are the free gate.
- **The Swedish residency filter and nationwide discovery.** OMAV *sources* unknown
  developers. DevFit ranks a *known* team, so it has no need for either.
- **Sending email.** SendGrid and similar services are paid above small quotas.
  Feature 13 produces drafts and a `mailto:` link, the same as OMAV, which doesn't
  send either.
- **A staging environment.** A second deployment roughly doubles hosting. Use
  Vercel preview deployments if you are on Vercel. Otherwise CI (01) is the gate.

## Rules every feature must follow

Taken from [CLAUDE.md](../../CLAUDE.md). A feature that breaks one of these is
wrong, even if it works:

- **Scoring is deterministic. The AI only narrates.** No feature may put a model's
  judgement into a score. Feature 11 is flagged for exactly this reason.
- **Authorization re-reads the database.** New pages and routes use
  `getCurrentUser()` / `requireUser()`.
- **Stored keys are never returned to a client.**
- **Self-service accounts never get the server's env keys.**
- **Don't bump TypeScript past 6.0.3 or ESLint past 9.39.5.**
