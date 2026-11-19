# 09 · AI Fluency score

**Size:** M · **Needs:** 07 · **Cost:** free

## Why

OMAV's second score, **AI Fluency v3** (0–100), measures how much a developer
works with AI coding tools. It does this deterministically, by detecting tool
config files in their repos (`CLAUDE.md`, `.cursorrules`,
`.github/copilot-instructions.md`, …). This is a strong selling point that DevFit
doesn't have, and it fits DevFit's rule that the model must not score.

It only means something with real developers (07). With seed data it would be
invented.

## Plan

1. **Detection during import (07).** For each of the developer's repos, check
   the tree (already fetched) for these paths:

   | Tool | Files |
   | --- | --- |
   | Claude Code | `CLAUDE.md`, `.claude/` |
   | Cursor | `.cursorrules`, `.cursor/rules/` |
   | Copilot | `.github/copilot-instructions.md` |
   | Aider | `.aider.conf.yml` |
   | Windsurf | `.windsurfrules` |
   | Cline / Roo | `.clinerules`, `.roo/` |
   | Generic | `AGENTS.md` |

   Store `aiTools: { tool, repos: string[] }[]` on the developer. These are tree
   lookups only, with no extra file downloads, so it's cheap.
2. **`aiFluency()` in [scoring.ts](../../src/lib/scoring.ts)**, a simplified
   version of OMAV's design:
   - **Adoption (0–60):** sum of per-tool weights (OMAV uses claude-code 8,
     cursor 8, aider 7, copilot 4, other 2), scaled, +bonus for 3 or more tools.
   - **Consistency (0–40):** the share of the developer's *recent* repos (pushed
     in the last 12 months) that have any config.
   - Tiers: none / emerging / proficient / advanced, with thresholds in
     `config.ts`. OMAV's handover warns that its tier bounds live in three files
     that must match. **Keep yours in one place** and import it everywhere.
3. **Show it, but don't rank by it at first.** Display it on the developer page
   and in fit results as extra information. Only add it to `overallScore` if a
   PM asks, and then **bump `SCORING_VERSION`** (05).
4. **Prompt:** pass `aiTools` to `explainRanking()` so the explanation can
   mention it. The model narrates; it still doesn't score.
5. **Tests:** a repo with `CLAUDE.md` + `.cursorrules` scores higher than one
   with only Copilot; no configs scores 0; the same input gives the same score.

## Honest limits

A config file shows that someone *tried* a tool, not that they're good with it.
OMAV scores config quality too (length, number of rules) and discounts copied
templates by ×0.25. Copy that later if it matters. Keep the "proxy, not proof"
disclaimer in the UI.

## How it stays free

It reads tree listings that 07 already fetches, and the scoring is pure
TypeScript.

## Done when

- Imported developers show an AI Fluency score and the tools detected.
- The score is reproducible and covered by tests.
- Tier thresholds are defined in exactly one file.
