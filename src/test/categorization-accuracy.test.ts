import { describe, it, expect } from "vitest";
import { categorizeItem } from "@/lib/category-mapper";
import { CATEGORIZATION_EVAL } from "./fixtures/categorization-eval";

// Floor, not a target. Raise it when the algorithm improves so accuracy can't
// silently regress; never lower it to make a change pass.
// Measured on this fixture: 64.9% before the Phase 1 word-boundary /
// longest-match fixes, 80.1% after.
const ACCURACY_FLOOR = 0.94;

describe("categorization accuracy", () => {
  it("meets the accuracy floor on the labelled eval set", () => {
    const misses: Array<{ name: string; expected: string; got: string }> = [];
    let correct = 0;
    let other = 0;

    for (const [name, expected] of CATEGORIZATION_EVAL) {
      const got = categorizeItem(name);
      if (got === "other") other++;
      if (got === expected) {
        correct++;
      } else {
        misses.push({ name, expected, got });
      }
    }

    const total = CATEGORIZATION_EVAL.length;
    const accuracy = correct / total;
    const otherRate = other / total;

    const report = [
      `accuracy: ${correct}/${total} (${(accuracy * 100).toFixed(1)}%)`,
      `other-rate: ${other}/${total} (${(otherRate * 100).toFixed(1)}%)`,
      `misses (${misses.length}):`,
      ...misses.map((m) => `  ${m.name} — expected ${m.expected}, got ${m.got}`),
    ].join("\n");
    console.log(report);

    expect(accuracy).toBeGreaterThanOrEqual(ACCURACY_FLOOR);
  });
});
