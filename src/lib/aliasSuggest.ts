import { canonicalSkill, compact, isKnownSkill } from "@/lib/skills";
import { cosine } from "@/lib/similarity";

/**
 * Offline helper for growing the alias table in skills.ts. Embeds every skill
 * name DevFit has seen and proposes pairs that mean the same thing but don't yet
 * compare equal. **A human reviews and pastes them**; nothing here runs at
 * request time or feeds a score, which keeps scoring deterministic.
 */

export interface AliasSuggestion {
  /** The spelling that isn't recognised yet. */
  from: string;
  /** The name it most likely means. */
  to: string;
  similarity: number;
  /** Ready to paste into ALIASES in skills.ts. */
  line: string;
}

export type Embedder = (texts: string[]) => Promise<number[][]>;

/**
 * For each name whose canonical id is unknown to the alias table (it fell back
 * to its compact form), find the closest name with a *different* canonical id.
 * Above `threshold`, suggest mapping it there. Known ids are preferred as
 * targets, so suggestions point at existing canonical names.
 */
export async function suggestAliases(
  names: string[],
  embed: Embedder,
  threshold = 0.9
): Promise<AliasSuggestion[]> {
  // One representative spelling per canonical id.
  const byId = new Map<string, string>();
  for (const raw of names) {
    const name = raw.trim();
    const id = canonicalSkill(name);
    if (id && !byId.has(id)) byId.set(id, name);
  }
  const entries = [...byId.entries()];
  if (entries.length < 2) return [];

  const vectors = await embed(entries.map(([, name]) => name));
  const known = isKnownSkill;

  const out: AliasSuggestion[] = [];
  entries.forEach(([id, name], i) => {
    if (known(name)) return; // already in the table
    let best = { j: -1, sim: -1 };
    entries.forEach(([otherId], j) => {
      if (j === i || otherId === id) return;
      const sim = cosine(vectors[i], vectors[j]);
      // Prefer recognised targets: compare with a small bonus for known names.
      const score = sim + (known(entries[j][1]) ? 0.001 : 0);
      if (score > best.sim) best = { j, sim: score };
    });
    if (best.j < 0) return;
    const sim = cosine(vectors[i], vectors[best.j]);
    if (sim < threshold) return;
    const [targetId, targetName] = entries[best.j];
    out.push({
      from: name,
      to: targetName,
      similarity: Math.round(sim * 1000) / 1000,
      line: `${compact(name)}: "${targetId}",`,
    });
  });
  return out.sort((a, b) => b.similarity - a.similarity);
}
