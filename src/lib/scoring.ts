import {
  ARCHETYPE_MATCH_SCORES,
  SCORING_WEIGHTS,
  VERDICT_THRESHOLDS,
} from "@/lib/config";
import type {
  Archetype,
  DeveloperView,
  FitScore,
  RepoRequirement,
  Verdict,
} from "@/lib/types";
import { canonicalSkill, expandSkills } from "@/lib/skills";

const clamp = (n: number, min = 0, max = 100) =>
  Math.max(min, Math.min(max, n));

const round = (n: number) => Math.round(n * 10) / 10;

/** Share of `target` ids found in `have`, 0–100. Empty target → neutral 50. */
function coverage(target: Set<string>, have: Set<string>): number {
  if (target.size === 0) return 50;
  let hits = 0;
  target.forEach((t) => {
    if (have.has(t)) hits += 1;
  });
  return clamp((hits / target.size) * 100);
}

/** Share of the repo's languages the developer has written. */
export function languageOverlap(
  devLangs: string[],
  requirement: RepoRequirement
): number {
  const target = new Set(requirement.languages.map(canonicalSkill).filter(Boolean));
  const have = new Set(devLangs.map(canonicalSkill));
  return coverage(target, have);
}

/**
 * Share of the repo's frameworks and libraries the developer has used, compared
 * through the alias table in skills.ts ("Next.js App Router" = "NextJS").
 *
 * Scored separately from languages on purpose. The old single `stackOverlap`
 * divided by languages ∪ stack while developers only had languages, so every
 * framework was an unmatchable denominator term and "fit" was nearly unreachable.
 *
 * Stack entries that are really languages (also in `requirement.languages`) are
 * skipped here, since languageOverlap already counts them. The developer's
 * languages still count as skills, so "GraphQL" in a stack can match either list.
 */
export function frameworkOverlap(
  dev: Pick<DeveloperView, "languages" | "frameworks">,
  requirement: RepoRequirement
): number {
  const languageIds = new Set(requirement.languages.map(canonicalSkill));
  const target = new Set(
    requirement.stack
      .map(canonicalSkill)
      .filter((id) => id && !languageIds.has(id))
  );
  return coverage(target, expandSkills([...dev.frameworks, ...dev.languages]));
}

export function archetypeMatch(
  devArchetype: Archetype,
  needed: Archetype
): number {
  if (devArchetype === needed) return ARCHETYPE_MATCH_SCORES.exact;

  if (devArchetype === "fullstack") {
    return ARCHETYPE_MATCH_SCORES.fullstackToSpecialist; // fullstack dev, specialist need
  }
  if (needed === "fullstack") {
    return ARCHETYPE_MATCH_SCORES.specialistToFullstack; // specialist dev, fullstack need
  }
  // frontend ↔ backend: opposite specialist
  return ARCHETYPE_MATCH_SCORES.oppositeSpecialist;
}

/**
 * Percentile rank of commits across the cohort, blended with a normalized
 * net-lines-added signal. Kept deterministic and cohort-relative so it stays
 * meaningful with a small seed set.
 */
export function experienceDepth(
  dev: DeveloperView,
  cohort: DeveloperView[]
): number {
  if (cohort.length <= 1) return 50;

  const commitsSorted = cohort
    .map((d) => d.totalCommits)
    .sort((a, b) => a - b);
  const rank =
    commitsSorted.findIndex((v) => v >= dev.totalCommits) === -1
      ? cohort.length - 1
      : commitsSorted.findIndex((v) => v >= dev.totalCommits);
  const commitsPct = (rank / (cohort.length - 1)) * 100;

  const linesMax = Math.max(1, ...cohort.map((d) => d.netLines));
  const linesPct = clamp((Math.max(0, dev.netLines) / linesMax) * 100);

  return clamp(0.7 * commitsPct + 0.3 * linesPct);
}

export function overallScore(sub: {
  languageOverlap: number;
  frameworkOverlap: number;
  archetypeMatch: number;
  experienceDepth: number;
}): number {
  return clamp(
    SCORING_WEIGHTS.languageOverlap * sub.languageOverlap +
      SCORING_WEIGHTS.frameworkOverlap * sub.frameworkOverlap +
      SCORING_WEIGHTS.archetypeMatch * sub.archetypeMatch +
      SCORING_WEIGHTS.experienceDepth * sub.experienceDepth
  );
}

export function verdictFor(overall: number): Verdict {
  if (overall >= VERDICT_THRESHOLDS.fit) return "fit";
  if (overall >= VERDICT_THRESHOLDS.rampUp) return "ramp-up";
  return "not fit";
}

/** Compute all sub-scores for one developer against a repo requirement. */
export function computeSubScores(
  dev: DeveloperView,
  requirement: RepoRequirement,
  cohort: DeveloperView[]
): Omit<FitScore, "explanation"> {
  const lo = languageOverlap(dev.languages, requirement);
  const fo = frameworkOverlap(dev, requirement);
  const am = archetypeMatch(dev.archetype, requirement.primaryArchetypeNeeded);
  const ed = experienceDepth(dev, cohort);
  const overall = overallScore({
    languageOverlap: lo,
    frameworkOverlap: fo,
    archetypeMatch: am,
    experienceDepth: ed,
  });
  return {
    devId: dev.id,
    languageOverlap: round(lo),
    frameworkOverlap: round(fo),
    archetypeMatch: round(am),
    experienceDepth: round(ed),
    overall: round(overall),
    verdict: verdictFor(overall),
  };
}

/** Rank the cohort against a requirement, deterministic by overall desc. */
export function rankCohort(
  cohort: DeveloperView[],
  requirement: RepoRequirement
): Omit<FitScore, "explanation">[] {
  return cohort
    .map((d) => computeSubScores(d, requirement, cohort))
    .sort((a, b) => b.overall - a.overall);
}
