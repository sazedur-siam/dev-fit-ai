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

const clamp = (n: number, min = 0, max = 100) =>
  Math.max(min, Math.min(max, n));

const round = (n: number) => Math.round(n * 10) / 10;

/** Case-insensitive language overlap. */
export function stackOverlap(
  devLangs: string[],
  requirement: RepoRequirement
): number {
  const target = new Set(
    [...requirement.languages, ...requirement.stack].map((s) =>
      s.trim().toLowerCase()
    )
  );
  if (target.size === 0) return 50; // no signal → neutral
  const dev = new Set(devLangs.map((s) => s.trim().toLowerCase()));
  let hits = 0;
  target.forEach((t) => {
    if (dev.has(t)) hits += 1;
  });
  return clamp((hits / target.size) * 100);
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
  stackOverlap: number;
  archetypeMatch: number;
  experienceDepth: number;
}): number {
  return clamp(
    SCORING_WEIGHTS.stackOverlap * sub.stackOverlap +
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
  const so = stackOverlap(dev.languages, requirement);
  const am = archetypeMatch(dev.archetype, requirement.primaryArchetypeNeeded);
  const ed = experienceDepth(dev, cohort);
  const overall = overallScore({
    stackOverlap: so,
    archetypeMatch: am,
    experienceDepth: ed,
  });
  return {
    devId: dev.id,
    stackOverlap: round(so),
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
