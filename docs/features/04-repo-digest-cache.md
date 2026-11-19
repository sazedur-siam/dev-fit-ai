# 04 · Faster repo digest and a digest cache

**Size:** S · **Needs:** none · **Cost:** free

## Why

OMAV caches GitHub responses (`RepoCache`, `ProfileSnapshot`) so the same data is
never fetched twice. DevFit rebuilds the whole repo digest on every `/api/fit`
call. It also fetches up to 20 files **one after another**, which CLAUDE.md
names as the main reason a request takes 5–20 seconds. Analysing the same repo
twice costs the same both times.

## What exists today

[src/lib/github.ts](../../src/lib/github.ts) `buildRepoDigest()`:

```ts
for (const p of picks) {
  const content = await fetchRawFile(owner, repo, defaultBranch, p.path, token);
  if (content) filesInlined.push({ path: p.path, content });
}
```

## Plan

### Part A: fetch the files in parallel (about an hour)

1. Replace the loop with batched `Promise.all`. Use batches of 5, not all 20 at
   once, to stay polite to GitHub's secondary rate limit:
   ```ts
   for (let i = 0; i < picks.length; i += 5) {
     const batch = await Promise.all(
       picks.slice(i, i + 5).map((p) =>
         fetchRawFile(owner, repo, defaultBranch, p.path, token)
           .then((content) => (content ? { path: p.path, content } : null))
       )
     );
     filesInlined.push(...batch.filter((x) => x !== null));
   }
   ```
   Keep the order of `picks`, because the order of the digest affects what Gemini
   sees first.
2. Fetch `/languages` in parallel with the tree, not after it.

### Part B: cache the digest by commit (half a day)

1. Look up the default branch's **head commit SHA** (one cheap call:
   `GET /repos/{o}/{r}/commits/{branch}` with `Accept: application/vnd.github.sha`).
2. Add a `repoDigests` collection, keyed by `{ owner, repo, sha }`, storing the
   built `RepoDigest`. Add a **TTL index** of 7 days.
3. In `buildRepoDigest`: on a cache hit, return the stored digest. On a miss,
   build it and save it.
4. **Optionally** also cache the `RepoRequirement` from the first Gemini call
   under the same key plus `GEMINI_MODEL`. The same commit and model then skip
   Gemini call #1 entirely. Saving Gemini calls matters because the free tier has
   a daily limit.
5. **Private repos:** the cache key must include *which user* fetched it, or one
   user's private digest could be served to another. The simplest rule is to
   cache only public repos (`meta.private === false`).

## How it stays free

The cache lives in the existing Mongo cluster, and the TTL index keeps it small.
Fewer GitHub and Gemini calls also mean you're less likely to hit free-tier
limits.

## Done when

- A cold request is noticeably faster (measure before and after).
- Analysing the same public repo a second time skips GitHub file fetches, and
  with step 4 also skips Gemini call #1.
- A private repo is never served from another user's cache.
