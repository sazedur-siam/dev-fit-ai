import type { DeveloperView, MockDeveloper } from "@/lib/types";

/**
 * Union of the languages across a developer's repos. Case-preserving on first
 * occurrence, deduped case-insensitively so "TypeScript" and "typescript"
 * don't both show up.
 */
export function deriveLanguages(dev: MockDeveloper): string[] {
  return unionCaseInsensitive(dev.repos.map((r) => r.languages));
}

/** Union of the frameworks across a developer's repos, deduped the same way. */
export function deriveFrameworks(dev: MockDeveloper): string[] {
  return unionCaseInsensitive(dev.repos.map((r) => r.frameworks ?? []));
}

function unionCaseInsensitive(lists: string[][]): string[] {
  const seen = new Map<string, string>();
  for (const list of lists) {
    for (const item of list) {
      const key = item.trim().toLowerCase();
      if (key && !seen.has(key)) seen.set(key, item.trim());
    }
  }
  return [...seen.values()];
}

export function toView(dev: MockDeveloper): DeveloperView {
  return {
    ...dev,
    languages: deriveLanguages(dev),
    frameworks: deriveFrameworks(dev),
    netLines: dev.linesAdded - dev.linesDeleted,
  };
}

/**
 * Lookups moved to `@/lib/db/developers` when the cohort became a MongoDB
 * collection. This module is now pure derivation, so it stays trivially
 * testable and free of I/O.
 */
