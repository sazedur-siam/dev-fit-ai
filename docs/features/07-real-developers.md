# 07 · Real developers imported from GitHub

**Size:** L · **Needs:** 05, 06 · **Cost:** free

## Why

This is the biggest gap. OMAV scores about 257k **real** profiles built from
GitHub data. DevFit ranks **10 made-up developers** from
[src/data/developers.ts](../../src/data/developers.ts). No matter how good the
scoring is, the output describes nobody.

[docs/real-git-data-feasibility.md](../real-git-data-feasibility.md) has already
done the research. **Read it first.** This file is the build plan; that one
explains the attribution traps (squash merges, multiple emails per person,
lockfiles).

## Two ways in. Build A first.

### A · Import by GitHub username (start here)

An admin types `octocat`, and DevFit builds that person's profile from their
public GitHub activity. This uses only the GitHub API, needs no worker, and fits
in a request.

1. **New route `POST /api/admin/developers`**, admin only (`requireAdmin()`),
   body `{ login, archetype }`. Ask for the archetype rather than guessing it, or
   pre-fill a guess from the language mix for the admin to confirm.
2. **New `src/lib/githubProfile.ts`.** One GraphQL query
   (`POST https://api.github.com/graphql`) fetches:
   - `contributionsCollection` → total commits in the last year
   - the user's own non-fork repositories (first 50): name, `languages`
     (with sizes), `pushedAt`
   - for each repo, framework detection: read `package.json`,
     `requirements.txt`, `composer.json`, `go.mod` and look up dependency names
     in the alias table from 06 (`react`, `next`, `django`, …)
3. **Map onto the existing `MockDeveloper` shape.** Fill in `repos[].languages`,
   `repos[].frameworks`, `totalCommits` and `recentCommitMessages` (the latest 5
   commit messages from their most recent repo). For `linesAdded`/`linesDeleted`,
   use `GET /repos/{o}/{r}/stats/contributors`. It returns **202 at first** and
   needs a retry; the feasibility doc confirmed this.
4. **Add `source: "seed" | "github"` and `importedAt`** to developer documents,
   so mock and real developers can be told apart in the UI.
5. **The GitHub token:** use the admin's stored GitHub key via
   `resolveCredentials()`. Never use a self-service account's env fallback.
6. **UI:** an "Import from GitHub" form on the admin page, plus a "Real" or
   "Sample" badge on each developer card.
7. **Removing the samples:** an admin action to delete `source: "seed"`
   developers once enough real ones exist. `experienceDepth` is ranked relative
   to the cohort, so expect everyone's numbers to shift when the cohort changes.
   CLAUDE.md says this is expected.

### B · Import from your organisation's repos (later)

This builds profiles from `git log --numstat` across the org's own
repositories. It's more accurate for "who on *our* team fits," but it needs:

- **A worker, not a request.** Cloning and parsing takes minutes. Run it from
  GitHub Actions (see 08), not a Next.js route.
- **An answer to the squash-merge question** in the feasibility doc, §2.1, before
  you trust any number. It blocks this path.
- An `email → developer` mapping table.

Use the `developerProfiles` shape proposed in the feasibility doc, §5.

## How it stays free

The GitHub API is free with a token at 5,000 requests an hour. Importing one
person costs about 1 GraphQL query plus a few REST calls per repo, so a team of
30 costs a few hundred requests. Profiles are a few KB each, far inside Atlas
M0's 512 MB.

## Things to be careful about

- **Privacy.** You're profiling real people. Import only people who know about
  it (your team), and keep the "decision support, not a verdict on a person"
  disclaimer CLAUDE.md requires.
- **Public activity is a partial picture.** Someone whose work is all in private
  repos will look weak. OMAV adds a boost for mostly-private profiles for this
  reason. At least show "public activity only" on imported profiles.

## Done when

- An admin can import a GitHub username, and that developer appears in the cohort
  and is ranked by `/api/fit`.
- Imported developers have real frameworks, so 06's framework score means
  something.
- The UI marks sample developers apart from real ones.
