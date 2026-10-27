import { describe, it, expect } from "vitest";
import { categorizeItem } from "@/lib/category-mapper";
import { BrandLearningSystem } from "@/lib/brand-learning";

function learned(name: string, category: Parameters<BrandLearningSystem["learnManualCorrection"]>[1]) {
  const s = new BrandLearningSystem();
  s.learnManualCorrection(name, category);
  return s;
}

describe("learned brand matching", () => {
  it("does not let a corrected multi-word item capture its shorter substring", () => {
    const s = learned("oat milk", "beverages");
    expect(categorizeItem("oat milk", s.getAllBrands())).toBe("beverages");
    expect(categorizeItem("milk", s.getAllBrands())).toBe("dairy");
    expect(s.getCategoryForItem("milk")).toBeNull();
  });

  it("matches whole words only, not substrings of other words", () => {
    const s = learned("Wegmans", "household");
    expect(categorizeItem("wegmans bread", s.getAllBrands())).toBe("household");
    expect(categorizeItem("wegmanshire bread", s.getAllBrands())).toBe("bakery");
  });

  it("prefers the most specific learned brand", () => {
    const s = learned("trader joes", "snacks");
    s.learnManualCorrection("trader joes frozen", "frozen");
    expect(categorizeItem("trader joes frozen pizza", s.getAllBrands())).toBe("frozen");
  });

  it("ignores untrusted learned brands", () => {
    const s = new BrandLearningSystem([
      { brand: "wegmans", category: "household", confidence: 0.3, occurrences: 1, lastSeen: 0, createdAt: 0 },
    ]);
    expect(s.getCategoryForItem("wegmans bread")).toBeNull();
  });
});
