import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  ARCHETYPE_MATCH_SCORES,
  SCORING_VERSION,
  SCORING_WEIGHTS,
  VERDICT_THRESHOLDS,
} from "@/lib/config";

/**
 * Every scoring constant, hashed. If this test fails you changed how scores are
 * computed: **bump SCORING_VERSION in config.ts and add a new line below**. Don't
 * edit an existing line; old versions must keep describing the old numbers.
 */
const KNOWN_FINGERPRINTS: Record<string, string> = {
  "1.0.0": "aa72009b25695be8",
  "2.0.0": "31932ce5bd206c1b", // languages and frameworks scored separately
};

function scoringFingerprint(): string {
  const payload = JSON.stringify({
    weights: SCORING_WEIGHTS,
    thresholds: VERDICT_THRESHOLDS,
    archetype: ARCHETYPE_MATCH_SCORES,
  });
  return createHash("sha256").update(payload).digest("hex").slice(0, 16);
}

describe("SCORING_VERSION", () => {
  it("matches the scoring constants it claims to describe", () => {
    expect(
      KNOWN_FINGERPRINTS[SCORING_VERSION],
      `Scoring constants changed under version ${SCORING_VERSION}. Bump SCORING_VERSION ` +
        `and add "${"<new version>"}": "${scoringFingerprint()}" to KNOWN_FINGERPRINTS.`
    ).toBe(scoringFingerprint());
  });

  it("weights still sum to 1", () => {
    const sum = Object.values(SCORING_WEIGHTS).reduce((a, b) => a + b, 0);
    expect(sum).toBeCloseTo(1, 10);
  });
});
