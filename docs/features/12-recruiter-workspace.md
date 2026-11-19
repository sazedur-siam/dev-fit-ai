# 12 · Recruiter workspace: notes, tags, shortlists

**Size:** M · **Needs:** none · **Cost:** free

## Why

OMAV gives recruiters a workspace: notes and tags on each developer, personal
lists, projects with candidate lists, a watchlist, and "already seen" markers.
DevFit shows a ranking, saves it to history, and stops there. A PM can't record
*"talked to Linnéa, available from March"* or keep a shortlist for a client.

## Scope: the useful core of OMAV's version

OMAV has 9 workspace tables. DevFit needs three things:

| Feature | What a PM does |
| --- | --- |
| **Notes** | Writes private notes on a developer, with timestamps |
| **Tags** | Adds short labels (`available-q1`, `wants-backend`), then filters by them |
| **Shortlists** | Named lists of developers, optionally linked to a saved analysis ("Boo Energi rewrite – shortlist") |

Leave out projects, sub-categories, the conversation log, the watchlist and the
archive until someone asks for them.

## Plan

1. **Collections** (one module each in `src/lib/db/`, as CLAUDE.md requires):
   - `notes { userId, developerId, body, createdAt, updatedAt }`
   - `tags { userId, developerId, label }` with a unique index on all three
     fields
   - `shortlists { userId, name, analysisId?, developerIds[], createdAt }`
2. **Scoped to the user, always.** Every query filters by `userId`, the same way
   `getUserAnalysis()` does, so another user's document id is a miss rather than
   a leak. Decide now whether admins can see PMs' notes. The default is **no**,
   which matches the rule that admins can't see other users' keys.
3. **Routes** (all `requireUser()`, bodies validated per 03):
   - `GET/POST /api/developers/[id]/notes`, `PATCH/DELETE /api/notes/[id]`
   - `POST/DELETE /api/developers/[id]/tags`
   - `GET/POST /api/shortlists`, `PATCH/DELETE /api/shortlists/[id]`
   - Remember that `params` is a Promise in Next 16 (`const { id } = await params`).
4. **UI:**
   - Developer page ([src/app/developer/[id]/page.tsx](../../src/app/developer/%5Bid%5D/page.tsx)):
     notes and tags panel. The page stays a server component; the editor is a new
     client component.
   - Fit results: an "Add to shortlist" button on each card.
   - New page `/shortlists`, guarded by the standard
     `getCurrentUser()` / `redirect("/login")` pattern, and added to the `NAV`
     array in [AppShell.tsx](../../src/components/AppShell.tsx).
   - Use semantic colour tokens only (`bg-surface`, `text-body`), never
     `bg-white`, or dark mode breaks.
5. **Tests:** user A can't read, edit or delete user B's note; tag labels are
   normalized (trimmed, lowercased).

## How it stays free

These are a few small collections in the existing Atlas M0 cluster. Text notes
for a team are kilobytes.

## Done when

- A PM can note, tag and shortlist developers, and see only their own.
- The shortlist page is in the sidebar and guards itself.
- Cross-user access tests pass.
