# 08 · Scheduled nightly refresh

**Size:** M · **Needs:** 07 · **Cost:** free

## Why

OMAV runs a pipeline every night at 02:00 that refreshes known profiles on a
schedule based on how active they are (every 7, 14, 30 or 90 nights). Once 07
exists, DevFit's imported profiles go stale the day after import. Someone who
learned Rust last month still shows as having no Rust.

OMAV uses Cloud Scheduler, Cloud Workflows and Cloud Run Jobs, which are paid.
DevFit can do the same with a **scheduled GitHub Actions workflow**, which is
free.

## Plan

1. **Move the import logic so it doesn't depend on Next.js.** Put the profile
   builder from 07 in `src/lib/githubProfile.ts` with no Next.js imports, so a
   plain Node script can call it.
2. **Add `scripts/refresh-developers.mts`**, run with `node --experimental-strip-types`
   or `npx tsx`:
   - Find developers with `source: "github"` and `nextRefreshAt <= now`.
   - Rebuild each profile, then set `importedAt` and `nextRefreshAt`.
   - Copy OMAV's tiers, adjusted for DevFit: committed in the last 30 days → 7
     days; otherwise → 30 days.
   - Stop cleanly when the GitHub rate limit drops below a safety margin, say 500
     requests left (from the `x-ratelimit-remaining` header). Whatever is left
     gets done the next night, as OMAV does.
   - Print a one-line summary: refreshed / skipped / failed.
3. **Add `.github/workflows/refresh.yml`:**
   ```yaml
   name: Nightly developer refresh
   on:
     schedule: [{ cron: "0 1 * * *" }]   # 01:00 UTC
     workflow_dispatch: {}               # manual "Run workflow" button
   jobs:
     refresh:
       runs-on: ubuntu-latest
       timeout-minutes: 20
       steps:
         - uses: actions/checkout@v4
         - uses: actions/setup-node@v4
           with: { node-version: 22, cache: npm }
         - run: npm ci
         - run: npx tsx scripts/refresh-developers.mts
           env:
             MONGODB_URI: ${{ secrets.MONGODB_URI }}
             MONGODB_DB: ${{ secrets.MONGODB_DB }}
             GITHUB_REFRESH_TOKEN: ${{ secrets.GH_REFRESH_TOKEN }}
   ```
   The automatic `GITHUB_TOKEN` in Actions is scoped to *this* repo. Make a
   separate fine-grained token with public read-only access for reading other
   users' profiles.
4. **Atlas network access.** GitHub runners don't have fixed IP addresses. Either
   allow `0.0.0.0/0` on the Atlas M0 access list, protected by a strong database
   password and a database user that can only reach the `devfit` database, or
   skip this feature. Decide on purpose; don't just open it to make the job pass.
5. **Run log:** write one document per run to a `refreshRuns` collection
   (started, finished, counts). Show the last run on the admin page. OMAV's
   `PipelineRun` table "stays empty" according to its handover; don't repeat
   that.
6. **Rescore on version change:** because 05 stores `scoringVersion`, the job
   doesn't need to rescore anything. Fit scores are computed per request from the
   profile, so only profile data goes stale.

## How it stays free

GitHub Actions scheduled workflows are free (unlimited on public repos, 2,000
minutes a month on private ones). A refresh of 30–100 developers takes a few
minutes. No paid scheduler, no Redis, no Cloud Run.

GitHub may delay scheduled runs at busy times and **disables schedules on repos
with no activity for 60 days.** Re-enable it from the Actions tab if that
happens.

## Done when

- The workflow runs nightly and from the "Run workflow" button.
- Profiles show an "updated N days ago" that stays fresh.
- A run that hits the rate limit stops cleanly and finishes the next night.
