# 11 · Semantic matching with embeddings

**Size:** M · **Needs:** 06 · **Cost:** free · ⚠️ **Decide before building**

## Why

OMAV turns every profile and every query into a 768-number embedding and finds
close matches with pgvector, so "Next.js" and "React" count as related even
though the strings differ. DevFit compares exact strings, which is why it has the
framework problem fixed in 06.

## ⚠️ The decision this needs

CLAUDE.md's top rule: **"Scoring is deterministic. The AI only narrates."**

Embedding similarity comes from a model. For a fixed model version it gives the
same numbers every time, but:

- when Google updates or retires the embedding model, **every score shifts**, and
- nobody can look at a 768-number vector and see *why* two things matched.

So putting embedding similarity **into `overall`** breaks the rule. There are two
safe ways to use embeddings, and one that breaks it:

| Option | Breaks the rule? | Notes |
| --- | --- | --- |
| **A. Use embeddings only to grow the alias table (06), offline** | No | Run once by hand: embed all framework names seen so far and suggest aliases ("NextJS" ≈ "Next.js"). A human reviews them and commits them to `skills.ts`. Scoring stays a plain lookup. |
| **B. Show a "similar developers" / "related skills" panel** | No | Embeddings power information on screen only, not the score or verdict. |
| C. Add a `semanticMatch` sub-score to `overall` | **Yes** | Needs an explicit decision to change CLAUDE.md's invariant, plus storing the embedding model name with `scoringVersion` (05). |

**Recommendation: build A, then B. Don't build C** unless the project owner
explicitly changes the invariant.

## Plan (options A and B)

1. **Embedding call** in [gemini.ts](../../src/lib/gemini.ts):
   `geminiEmbed(texts: string[], apiKey)` calling the Gemini API's batch
   embedding endpoint (`:batchEmbedContents`). **Probe the model name before
   adopting it**, as CLAUDE.md requires for generation models: the models list
   includes retired ones. Put the model name in `config.ts`, overridable by env.
2. **Option A, alias suggester:** `scripts/suggest-aliases.mts` collects every
   distinct `stack` string from stored analyses plus every developer framework,
   embeds them, and prints pairs whose cosine similarity is above 0.9. A human
   copies the good ones into `skills.ts`. Nothing runs at request time.
3. **Option B, "related developers" panel:**
   - Embed each developer's profile text (archetype + languages + frameworks +
     repo names) when it's imported or refreshed (07/08). Store the vector on the
     developer document. 768 numbers is about 6 KB a developer; 100 developers is
     0.6 MB.
   - For a team of under about 1,000 people, **compute cosine similarity in
     TypeScript in memory.** You don't need a vector database at this size.
   - Atlas M0 also supports Atlas Vector Search if the cohort grows a lot. Check
     the current M0 limit on search indexes first.
4. **Never send stored keys or personal data in the embedded text.** Embed skills
   and repo names only.

## How it stays free

Gemini embeddings are available on the free-tier API key (rate-limited, no
charge without billing attached). Vectors fit easily in Atlas M0, and in-memory
cosine similarity costs nothing.

## Done when

- **A:** the alias table has grown from reviewed suggestions, and no request-time
  code calls the embedding API.
- **B:** a developer page shows "similar developers", and nothing in `overall` or
  `verdict` changed.
