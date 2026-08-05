# Feasibility: building developer skill profiles from real git history

**Question.** For an organisation of ~30 developers across ~10 repositories, with
people contributing to several projects each — can we determine what they wrote,
infer a skill profile and score, persist it, and reuse it later when checking fit
against a new repository?

**Answer.** Yes for *what* they wrote, with real caveats. Partly for *how well* —
several useful proxies are computable, but skill itself is not measurable. The main
risks are not technical limits of the APIs; they are attribution problems that
silently produce confident, wrong numbers.

Everything below marked **verified** was executed against this repository.

---

## 1. Which data source

### GitHub REST API — insufficient on its own

**Verified.** `GET /repos/{owner}/{repo}/stats/contributors` returns per-contributor
weekly commit and line counts:

```
sazedur-strativ  commits=27  +14680/-623
```

Volume only — there is **no language dimension**, and no way to ask for one.

**Verified.** `GET /repos/{owner}/{repo}/languages` is **repo-wide**, never
per-author:

```json
{ "TypeScript": 186757, "JavaScript": 6506, "CSS": 1228 }
```

Two further constraints:

- The `stats/*` endpoints are computed asynchronously. The first call returns `202`
  with an empty body — **verified**, it returned `{}` and only produced data on a
  later retry. Any ingestion needs a retry loop.
- `stats/contributors` covers the default branch only and excludes merge commits.
- Getting language attribution per author via the API means one request per commit
  (`GET /repos/{o}/{r}/commits/{sha}` for the file list). Against a 5,000 req/hour
  budget, a few thousand commits is an hour of wall-clock and a fragile job.

### Local git history — the right source

**Verified.** Cloning and parsing `git log --numstat` produced a complete profile in
one pass, no rate limit:

```
git log --no-merges --pretty=format:'@@%H|%aN|%aE|%ad' --date=short --numstat
```

```
sazedur-strativ  <sazedur.rahman@strativ.se>
  commits=27   files touched=62   active 2026-08-04 -> 2026-08-05
  TypeScript  +6099/-501
  Markdown    +991/-120
  JavaScript  +195/-0
  JSON        +74/-1
  CSS         +48/-0
```

This gives author, email, date, file path and added/deleted lines per file per
commit — everything needed to aggregate by developer, language, repository and time.

**Conclusion:** clone the repositories and parse git locally. Use the REST/GraphQL
API only for what git does not know: pull requests, reviews, and the mapping from
commit email to GitHub account.

### Scale

10 repositories and 30 developers is comfortably small. A full history parse is
minutes; nightly incremental syncs use `git log <lastSyncedSha>..HEAD`. Store
aggregates, never raw history.

---

## 2. The four things that break attribution

These matter more than the choice of data source. Each one produces plausible
numbers that are wrong, which is worse than an error.

### 2.1 Squash merges destroy authorship — **decide this first**

If the org squash-merges pull requests, every commit on a branch collapses into a
single commit attributed to whoever performed the merge. Commit-based attribution
then measures who clicked Merge.

Mitigations, in order of preference:

1. Attribute via **pull request author** (`GET /repos/{o}/{r}/pulls`), treating the
   PR as the unit of work rather than the commit.
2. Parse `Co-authored-by:` trailers, which survive squashing when present.
3. Change the merge strategy for future work (does nothing for history).

**Check the org's merge settings before trusting any commit-derived number.**

### 2.2 Identity fragmentation

One person appears as several authors: work email, personal email, GitHub
`noreply` address, plus name spelling variants. Commits whose email is not linked
to a GitHub account report `author: null` from the API.

Required: an explicit `email → developer` mapping table, seeded from
`git shortlog -sne` per repo and reviewed by hand. A `.mailmap` in each repository
helps and is worth adding. Without this, 30 developers become dozens of phantoms
and every aggregate is wrong.

### 2.3 Generated and vendored files

Lockfiles, migrations, build output, `dist/`, vendored dependencies. A single
`package-lock.json` change is tens of thousands of lines. Unfiltered, the ranking
measures who ran `npm install`.

The exclusion list in [src/lib/github.ts](../src/lib/github.ts) (`IGNORED_DIRS`,
`IGNORED_FILE_PATTERNS`) already encodes most of this and should be reused rather
than reinvented.

### 2.4 Access

- Private repositories need `repo` scope; a fine-grained token needs explicit
  per-repository access.
- Organisations with SAML SSO require the token to be authorised for the org.
- **Verified** in this project: a fine-grained, public-repos-only token lists zero
  private repositories — the token's scope, not a bug.

---

## 3. What "how they wrote it" can honestly mean

| Signal | Method | Value |
| --- | --- | --- |
| **Surviving code** | `git blame` — how much of what they wrote is still present months later | **Strongest single signal.** Rewards code that lasted, not volume |
| Test discipline | did their commits touch test files alongside source | Strong, cheap |
| Churn / rework | lines they wrote that were rewritten within N days | Strong |
| Breadth | distinct directories or subsystems touched | Good proxy for navigating an unfamiliar codebase |
| Framework fluency | imports and dependency manifests **in the files they changed** | Directly feeds fit scoring |
| Review signals | PR size, review turnaround, approvals, comments received | Good; needs the PR API |
| Commit hygiene | conventional-commit adherence, message quality | Weak, nearly free |
| Revert / hotfix rate | commits reverting their own | Weak, cheap |

### What is not measurable

- **Difficulty and effort.** Forty lines of careful concurrency work outrank four
  thousand lines of scaffolding, and nothing above can see the difference.
- **Design, review and mentoring load.** Often the most valuable work leaves the
  smallest git footprint, so the strongest engineers can score lowest.
- **Correctness or quality of judgement.** An LLM can review sampled diffs and say
  something qualitative, but it is expensive, noisy, and must not be turned into a
  score.

---

## 4. How this feeds the existing fit engine

It substitutes for [src/data/developers.ts](../src/data/developers.ts) — the seeded
cohort — and leaves the scoring engine's shape intact.

It also **fixes a known flaw**. Documented in [CLAUDE.md](../CLAUDE.md): `stackOverlap`
divides by `|languages ∪ stack|`, but a developer's `languages` only ever contains
languages, never framework strings like `"Next.js App Router"`. Every `stack` entry
is therefore an unmatchable denominator term, which caps a realistic score near 63
and makes a `"fit"` verdict effectively unreachable — observed on a real run.

Real ingestion supplies per-developer **framework** signals, derived from imports in
files they actually touched, so `stack` becomes matchable and the sub-score starts
meaning something.

Two additions worth making at the same time:

- **Recency weighting.** Python used last month should outrank Python last touched
  three years ago. The dates are already in `git log`.
- **Repository relevance**, not just volume — contribution to a similar domain
  should count for more than raw lines elsewhere.

---

## 5. Proposed shape

```
nightly worker  (minutes, not a request path)
  fetch/clone the repository list
  → git log --numstat since last synced SHA (per repo)
  → resolve author emails to developers via the mapping table
  → drop vendored/generated paths
  → aggregate: developer × repo × language × month
  → derive: blame survival, test ratio, churn, breadth, frameworks
  → write profiles to MongoDB

fit request  (unchanged, fast)
  read profiles → existing deterministic scoring
```

Ingestion must not live in a request handler: it is minutes of work and would blow
any serverless timeout. A scheduled job or a long-running worker, writing profiles
the request path only reads.

Suggested collection, alongside the existing four:

```
developerProfiles {
  developerId, name, emails[],
  languages:  [{ name, linesAdded, linesSurviving, lastTouched, byMonth }],
  frameworks: [{ name, evidence, weight, lastTouched }],
  repos:      [{ repo, commits, linesAdded, share, firstSeen, lastSeen }],
  quality:    { survivalRate, testRatio, churnRate, breadth },
  syncedAt, lastShaByRepo
}
```

---

## 6. Open questions before building

1. **Does the org squash-merge?** Decides commit-based vs PR-based attribution.
   Blocking — the wrong choice invalidates every number.
2. Which repositories are in scope, and does the token reach the private ones?
3. Is a canonical `email → person` list available (HR/IdP export), or does the
   mapping need to be built from `git shortlog` and reviewed manually?
4. Where does the worker run — CI on a schedule, or a small always-on box? Vercel
   functions cannot hold a clone-and-parse job.
5. Is history depth bounded (e.g. last 24 months) or full? Affects clone size and
   how much recency weighting matters.

---

## 7. A note on use

These numbers work well for *"who should we staff on this repository"* and badly for
*"who is performing"*. Once per-developer line counts are visible to management they
tend to become a target, and they are both gameable and contestable.

The UI already carries a disclaimer that the output is decision support for a human
rather than a pass/fail gate; that should stay, and the developers being measured
should know what is collected and why.
