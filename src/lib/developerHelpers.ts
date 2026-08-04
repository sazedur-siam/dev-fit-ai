import type { DeveloperView, MockDeveloper } from "@/lib/types";

/**
 * Union of the languages across a developer's repos. Case-preserving on first
 * occurrence, deduped case-insensitively so "TypeScript" and "typescript"
 * don't both show up.
 */
export function deriveLanguages(dev: MockDeveloper): string[] {
  const seen = new Map<string, string>();
  for (const repo of dev.repos) {
    for (const lang of repo.languages) {
      const key = lang.trim().toLowerCase();
      if (key && !seen.has(key)) seen.set(key, lang.trim());
    }
  }
  return [...seen.values()];
}

export function toView(dev: MockDeveloper): DeveloperView {
  return {
    ...dev,
    languages: deriveLanguages(dev),
    netLines: dev.linesAdded - dev.linesDeleted,
  };
}

/**
 * Lookups moved to `@/lib/db/developers` when the cohort became a MongoDB
 * collection. This module is now pure derivation, so it stays trivially
 * testable and free of I/O.
 */
