import { describe, it, expect } from "vitest";
import fc from "fast-check";

import { rankByPriority } from "../scoring";
import type { ScoreResult } from "../scoring";

/**
 * Property 5: Ranking is stable under input reordering.
 *
 * For any set of `ScoreResult` values with distinct ZIPs, `rankByPriority`
 * applied to any permutation of that set produces the same ordered output:
 * sorted by `score` descending, with ties broken by `zip` ascending. Because
 * the ZIPs are distinct, the comparator `(score, zip)` is a total order over
 * the set, so the resulting order is a function of the set alone and never
 * depends on the input ordering.
 *
 * Validates: Requirements 5.1, 5.2, 7.6
 */
describe("Feature: risk-engine, Property 5: Ranking is stable under input reordering", () => {
  // Build a set of ScoreResult values with DISTINCT zips so the total order
  // (score desc, zip asc) is well-defined. We draw a set of unique zip strings,
  // then assign each a score; reasons/dataSources are irrelevant to ranking.
  const scoreResultsArb: fc.Arbitrary<ScoreResult[]> = fc
    .uniqueArray(
      fc
        .integer({ min: 0, max: 99999 })
        .map((n) => n.toString().padStart(5, "0")),
      { minLength: 0, maxLength: 30 },
    )
    .chain((zips) =>
      fc
        .tuple(
          ...zips.map(() =>
            // Scores may collide across ZIPs, which exercises the zip tiebreaker.
            fc.double({
              min: 0,
              max: 1_000,
              noNaN: true,
              noDefaultInfinity: true,
            }),
          ),
        )
        .map((scores) =>
          zips.map(
            (zip, i): ScoreResult => ({
              zip,
              score: scores[i],
              reasons: [],
              dataSources: [],
            }),
          ),
        ),
    );

  // A permutation of the same set: fast-check shuffles the elements.
  const withPermutationArb: fc.Arbitrary<{
    original: ScoreResult[];
    shuffled: ScoreResult[];
  }> = scoreResultsArb.chain((original) =>
    fc
      .shuffledSubarray(original, {
        minLength: original.length,
        maxLength: original.length,
      })
      .map((shuffled) => ({ original, shuffled })),
  );

  it("ranks any permutation of a distinct-ZIP set to the same zip order", () => {
    fc.assert(
      fc.property(withPermutationArb, ({ original, shuffled }) => {
        const rankedOriginal = rankByPriority(original).map((r) => r.zip);
        const rankedShuffled = rankByPriority(shuffled).map((r) => r.zip);

        // The ranked zip order must be identical regardless of input ordering.
        expect(rankedShuffled).toEqual(rankedOriginal);
      }),
      { numRuns: 200 },
    );
  });
});
