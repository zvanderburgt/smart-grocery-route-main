import { describe, it, expect } from "vitest";
import { categorizeItem } from "@/lib/category-mapper";
import { CATEGORIZATION_EVAL } from "./fixtures/categorization-eval";
import { CATEGORIZATION_HOLDOUT } from "./fixtures/categorization-holdout";

// Floors, not targets. Raise them when the algorithm improves so accuracy
// can't silently regress; never lower one to make a change pass.
//
// CATEGORIZATION_EVAL: keywords were tuned against it, so its number is
// optimistic. 64.9% originally, 80.1% after word-boundary fixes.
//
// CATEGORIZATION_HOLDOUT: written blind to the keyword lists, and the
// vocabulary expansion was done blind to it. This is the honest number:
// 76.1% before vocabulary expansion, 89.1% after. Do NOT add keywords to fix its misses;
// that turns it into a second tuning set. Fix rules, or write a new blind set.
const SETS = [
  { name: "tuning set", cases: CATEGORIZATION_EVAL, floor: 0.96 },
  { name: "held-out set", cases: CATEGORIZATION_HOLDOUT, floor: 0.88 },
];

describe("categorization accuracy", () => {
  for (const { name, cases, floor } of SETS) {
    it(`meets the accuracy floor on the ${name}`, () => {
      const misses = cases
        .map(([item, expected]) => ({ item, expected, got: categorizeItem(item) }))
        .filter((c) => c.got !== c.expected);
      const other = cases.filter(([item]) => categorizeItem(item) === "other").length;
      const accuracy = (cases.length - misses.length) / cases.length;

      console.log(
        [
          `${name} accuracy: ${cases.length - misses.length}/${cases.length} (${(accuracy * 100).toFixed(1)}%)`,
          `${name} other-rate: ${other}/${cases.length}`,
          ...misses.map((m) => `  ${m.item} — expected ${m.expected}, got ${m.got}`),
        ].join("\n"),
      );

      expect(accuracy).toBeGreaterThanOrEqual(floor);
    });
  }
});
