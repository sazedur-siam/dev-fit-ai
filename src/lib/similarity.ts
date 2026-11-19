import { canonicalSkill, expandSkills } from "@/lib/skills";
import type { DeveloperView } from "@/lib/types";

/**
 * Similarity between developers and between skill names. Two halves, both
 * outside every score:
 *
 * - **Developers** ("Similar developers" on a profile): cosine similarity of
 *   skill vectors weighted by commits. Deterministic, no model, no key. It's
 *   shown for context only and never touches a ranking or verdict.
 * - **Vectors in general** (`cosine`), also used by the offline alias suggester
 *   on Gemini embeddings.
 */

export function cosine(a: number[], b: number[]): number {
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < Math.min(a.length, b.length); i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  return na === 0 || nb === 0 ? 0 : dot / Math.sqrt(na * nb);
}

/**
 * Skill id → weight: for each repo, its commits spread over its languages and
 * frameworks (with implications, so Next.js also counts as React).
 */
export function skillVector(dev: DeveloperView): Map<string, number> {
  const v = new Map<string, number>();
  for (const repo of dev.repos) {
    const ids = expandSkills([...repo.languages, ...(repo.frameworks ?? [])]);
    if (ids.size === 0) continue;
    const share = Math.max(1, repo.commits) / ids.size;
    for (const id of ids) v.set(id, (v.get(id) ?? 0) + share);
  }
  return v;
}

function sparseCosine(a: Map<string, number>, b: Map<string, number>): number {
  let dot = 0;
  for (const [k, x] of a) dot += x * (b.get(k) ?? 0);
  const norm = (m: Map<string, number>) => Math.sqrt([...m.values()].reduce((s, x) => s + x * x, 0));
  const d = norm(a) * norm(b);
  return d === 0 ? 0 : dot / d;
}

export interface SimilarDeveloper {
  id: string;
  name: string;
  /** 0–1. */
  similarity: number;
  /** Display names of the skills both have, most shared weight first. */
  shared: string[];
}

/** The `limit` most similar other developers, best first, ties broken by name. */
export function similarDevelopers(
  target: DeveloperView,
  cohort: DeveloperView[],
  limit = 3
): SimilarDeveloper[] {
  const tv = skillVector(target);
  const label = new Map<string, string>();
  for (const s of [...target.languages, ...target.frameworks]) label.set(canonicalSkill(s), s);

  return cohort
    .filter((d) => d.id !== target.id)
    .map((d) => {
      const dv = skillVector(d);
      const shared = [...tv.keys()]
        .filter((k) => dv.has(k) && label.has(k))
        .sort((a, b) => (tv.get(b) ?? 0) * (dv.get(b) ?? 0) - (tv.get(a) ?? 0) * (dv.get(a) ?? 0))
        .map((k) => label.get(k)!);
      return { id: d.id, name: d.name, similarity: sparseCosine(tv, dv), shared };
    })
    .filter((s) => s.similarity > 0)
    .sort((a, b) => b.similarity - a.similarity || a.name.localeCompare(b.name))
    .slice(0, limit)
    .map((s) => ({ ...s, similarity: Math.round(s.similarity * 100) / 100 }));
}
