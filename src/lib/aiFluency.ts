import { AI_FLUENCY_TIERS } from "@/lib/config";
import type { AiFluency, AiFluencyTier, MockDeveloper } from "@/lib/types";

/**
 * AI Fluency: how much a developer works with AI coding tools, measured from the
 * tool config files committed to their repositories. Deterministic: file presence
 * in, number out. **It is shown, never ranked**: it is not part of `overall`.
 *
 * A config file proves someone *set up* a tool, not that they're good with it.
 * The UI says so.
 */

export interface AiToolDef {
  id: string;
  label: string;
  /** Paths whose presence at the repo root marks the tool (files or folders). */
  paths: string[];
  /** Adoption weight, after OMAV's AI Fluency v3. */
  weight: number;
}

export const AI_TOOLS: AiToolDef[] = [
  { id: "claude-code", label: "Claude Code", paths: ["CLAUDE.md", ".claude"], weight: 8 },
  { id: "cursor", label: "Cursor", paths: [".cursorrules", ".cursor/rules"], weight: 8 },
  { id: "aider", label: "Aider", paths: [".aider.conf.yml"], weight: 7 },
  { id: "windsurf", label: "Windsurf", paths: [".windsurfrules"], weight: 5 },
  { id: "cline", label: "Cline", paths: [".clinerules"], weight: 5 },
  { id: "roo", label: "Roo Code", paths: [".roo", ".roomodes"], weight: 5 },
  { id: "copilot", label: "GitHub Copilot", paths: [".github/copilot-instructions.md"], weight: 4 },
  { id: "agents-md", label: "AGENTS.md", paths: ["AGENTS.md"], weight: 4 },
];

/** Every path probed during import, in a fixed order (used for GraphQL aliases). */
export const AI_CONFIG_PATHS: string[] = AI_TOOLS.flatMap((t) => t.paths);

/** Tool ids present, given which of AI_CONFIG_PATHS exist in a repository. */
export function detectAiTools(present: Set<string>): string[] {
  return AI_TOOLS.filter((t) => t.paths.some((p) => present.has(p))).map((t) => t.id);
}

export function tierFor(score: number): AiFluencyTier {
  if (score >= AI_FLUENCY_TIERS.elite) return "elite";
  if (score >= AI_FLUENCY_TIERS.advanced) return "advanced";
  if (score >= AI_FLUENCY_TIERS.proficient) return "proficient";
  if (score >= AI_FLUENCY_TIERS.emerging) return "emerging";
  return "none";
}

/**
 * Score a developer, or `null` when it can't be measured: sample developers, and
 * developers imported before detection existed (their repos have no `aiTools`).
 *
 *   adoption    0–60  = min(50, Σ tool weight × 2.5) + 10 if 3+ distinct tools
 *   consistency 0–40  = share of their repos with any AI config × 40
 */
export function computeAiFluency(dev: MockDeveloper): AiFluency | null {
  if (dev.source !== "github") return null;
  const measured = dev.repos.filter((r) => Array.isArray(r.aiTools));
  if (measured.length === 0) return null;

  const reposByTool = new Map<string, string[]>();
  for (const repo of measured) {
    for (const id of repo.aiTools ?? []) {
      reposByTool.set(id, [...(reposByTool.get(id) ?? []), repo.name]);
    }
  }
  const tools = AI_TOOLS.filter((t) => reposByTool.has(t.id));
  const weight = tools.reduce((a, t) => a + t.weight, 0);
  const adoption = Math.min(50, weight * 2.5) + (tools.length >= 3 ? 10 : 0);
  const withAny = measured.filter((r) => (r.aiTools ?? []).length > 0).length;
  const consistency = (withAny / measured.length) * 40;
  const score = Math.round(Math.min(100, adoption + consistency) * 10) / 10;

  return {
    score,
    tier: tierFor(score),
    tools: tools.map((t) => ({ id: t.id, label: t.label, repos: reposByTool.get(t.id) ?? [] })),
    reposWithConfig: withAny,
    reposMeasured: measured.length,
  };
}
