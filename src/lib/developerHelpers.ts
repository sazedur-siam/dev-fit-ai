import { DEVELOPERS } from "@/data/developers";
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

export function getAllDevelopers(): DeveloperView[] {
  return DEVELOPERS.map(toView);
}

export function getDeveloperById(id: string): DeveloperView | undefined {
  const raw = DEVELOPERS.find((d) => d.id === id);
  return raw ? toView(raw) : undefined;
}
