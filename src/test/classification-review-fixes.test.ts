import { describe, it, expect } from "vitest";
import { categorizeItem } from "@/lib/category-mapper";
import { BrandLearningSystem } from "@/lib/brand-learning";
import { GroceryLearningAlgorithm } from "@/lib/learning-algorithm";
import type { GroceryItem } from "@/lib/types";

const item = (id: string, name: string, category?: string): GroceryItem => ({
  id, name, checked: false, addedAt: 0, ...(category ? { category } : {}),
});

describe("classification review fixes", () => {
  it("a brand taught via addManualBrand applies immediately", () => {
    const s = new BrandLearningSystem();
    s.addManualBrand("Laya", "dairy");
    expect(categorizeItem("laya 2% 1l", s.getAllBrands())).toBe("dairy");
  });

  it("learnFromPattern does not turn known nouns into brands", () => {
    const s = new BrandLearningSystem();
    for (let i = 0; i < 5; i++) s.learnFromPattern([item("1", "Chicken")], "meat");
    expect(s.getAllBrands()).toEqual([]);
    expect(categorizeItem("chicken broth", s.getAllBrands())).toBe("canned");
  });

  it("a correction of a leading word does not leak to names ending with it", () => {
    const s = new BrandLearningSystem();
    s.learnManualCorrection("Cream", "dairy");
    expect(categorizeItem("ice cream", s.getAllBrands())).toBe("frozen");
    expect(categorizeItem("shaving cream", s.getAllBrands())).toBe("personal-care");
  });

  it("matches -ies plurals of -y keywords without breaking vowel+y plurals", () => {
    expect(categorizeItem("strawberries")).toBe("produce");
    expect(categorizeItem("cherries")).toBe("produce");
    expect(categorizeItem("turkeys")).toBe("meat");
  });

  it("puts breath mints in snacks and ice cream in frozen regardless of brand", () => {
    expect(categorizeItem("breath mints")).toBe("snacks");
    expect(categorizeItem("tillamook ice cream")).toBe("frozen");
  });

  it("organizeList respects explicit categories of items that normalize alike", async () => {
    const sections = await new GroceryLearningAlgorithm().organizeList([
      item("a", "Orange", "beverages"),
      item("b", "Oranges", "produce"),
    ]);
    const sectionOf = (id: string) => sections.find((s) => s.items.some((i) => i.id === id))?.id;
    expect(sectionOf("a")).toBe("beverages");
    expect(sectionOf("b")).toBe("produce");
  });
});
