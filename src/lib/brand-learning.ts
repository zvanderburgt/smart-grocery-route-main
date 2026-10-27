import type { LearnedBrand, StoreCategory, GroceryItem } from "./types";
import {
  recognizeBrand,
  findLearnedBrandMatch,
  BRAND_DATABASE,
} from "./brand-recognition";
import { categorizeItem } from "./category-mapper";

export class BrandLearningSystem {
  private learnedBrands: LearnedBrand[];

  private normalizeBrandKey(brand: string): string {
    return brand.toLowerCase().trim().replace(/\s+/g, " ");
  }

  constructor(existingBrands: LearnedBrand[] = []) {
    this.learnedBrands = existingBrands;
  }

  private extractPotentialBrand(itemName: string): string | null {
    const normalized = itemName.toLowerCase().trim();

    const words = normalized.split(/\s+/);

    if (words.length === 1) {
      return words[0];
    }

    const capitalizedWords = itemName.split(/\s+/).filter((word) => {
      return word[0] === word[0].toUpperCase() && word.length > 2;
    });

    if (capitalizedWords.length > 0) {
      return capitalizedWords.join(" ").toLowerCase();
    }

    const commonDescriptors = [
      "organic",
      "fresh",
      "frozen",
      "canned",
      "whole",
      "sliced",
      "chopped",
      "diced",
      "low",
      "fat",
      "free",
      "reduced",
      "light",
      "diet",
      "sugar",
      "sodium",
      "gluten",
      "pack",
      "oz",
      "lb",
      "lbs",
      "count",
      "bottle",
      "can",
      "box",
      "bag",
      "jar",
      "large",
      "small",
      "medium",
      "extra",
      "jumbo",
      "mini",
      "family",
      "size",
      "red",
      "green",
      "yellow",
      "blue",
      "white",
      "black",
      "brown",
      "pink",
      "hot",
      "cold",
      "sweet",
      "spicy",
      "mild",
      "original",
      "classic",
      "new",
    ];

    const brandCandidates = words.filter(
      (word) =>
        !commonDescriptors.includes(word) &&
        word.length > 2 &&
        !/^\d+$/.test(word),
    );

    if (brandCandidates.length > 0 && brandCandidates.length <= 3) {
      return brandCandidates.join(" ");
    }

    return null;
  }

  learnFromPattern(items: GroceryItem[], sectionCategory: StoreCategory): void {
    items.forEach((item) => {
      // Only learn names the rules cannot place. Otherwise ordinary nouns
      // ('chicken', 'cream') become "brands" that outrank every keyword, and
      // this runs on every re-organize, so occurrences count renders.
      if (categorizeItem(item.name) !== "other") {
        return;
      }

      const knownBrand = recognizeBrand(item.name);
      if (knownBrand) {
        return;
      }

      const potentialBrand = this.extractPotentialBrand(item.name);
      if (!potentialBrand) {
        return;
      }

      if (BRAND_DATABASE[potentialBrand]) {
        return;
      }

      const potentialBrandKey = this.normalizeBrandKey(potentialBrand);
      const existingBrand = this.learnedBrands.find(
        (b) => this.normalizeBrandKey(b.brand) === potentialBrandKey,
      );

      if (existingBrand) {
        if (existingBrand.category === sectionCategory) {
          existingBrand.occurrences++;
          existingBrand.confidence = Math.min(
            1.0,
            existingBrand.confidence + 0.1,
          );
          existingBrand.lastSeen = Date.now();
        } else if (existingBrand.occurrences < 3) {
          existingBrand.category = sectionCategory;
          existingBrand.occurrences++;
          existingBrand.lastSeen = Date.now();
        }
      } else {
        const newBrand: LearnedBrand = {
          brand: potentialBrand,
          category: sectionCategory,
          confidence: 0.3,
          occurrences: 1,
          lastSeen: Date.now(),
          createdAt: Date.now(),
        };
        this.learnedBrands.push(newBrand);
      }
    });
  }

  findLearnedBrand(itemName: string): LearnedBrand | null {
    return findLearnedBrandMatch(itemName, this.learnedBrands);
  }

  getCategoryForItem(itemName: string): StoreCategory | null {
    const knownBrand = recognizeBrand(itemName);
    if (knownBrand) {
      return knownBrand.category;
    }

    const learnedBrand = this.findLearnedBrand(itemName);
    if (learnedBrand) {
      return learnedBrand.category;
    }

    return null;
  }

  getHighConfidenceBrands(): LearnedBrand[] {
    return this.learnedBrands
      .filter((b) => b.confidence >= 0.7 && b.occurrences >= 3)
      .sort((a, b) => b.confidence - a.confidence);
  }

  exportData(): LearnedBrand[] {
    return this.learnedBrands;
  }

  cleanupOldBrands(maxAgeMs: number = 90 * 24 * 60 * 60 * 1000): void {
    const cutoffTime = Date.now() - maxAgeMs;
    this.learnedBrands = this.learnedBrands.filter(
      (brand) => brand.lastSeen > cutoffTime || brand.occurrences >= 5,
    );
  }

  getBrandStats(): {
    total: number;
    highConfidence: number;
    byCategory: Record<string, number>;
  } {
    const byCategory: Record<string, number> = {};

    this.learnedBrands.forEach((brand) => {
      byCategory[brand.category] = (byCategory[brand.category] || 0) + 1;
    });

    return {
      total: this.learnedBrands.length,
      highConfidence: this.learnedBrands.filter((b) => b.confidence >= 0.7)
        .length,
      byCategory,
    };
  }

  addManualBrand(brand: string, category: StoreCategory): void {
    const normalized = this.normalizeBrandKey(brand);
    const existing = this.learnedBrands.find(
      (b) => this.normalizeBrandKey(b.brand) === normalized,
    );

    if (existing) {
      existing.category = category;
      existing.confidence = 1.0;
      existing.occurrences = Math.max(existing.occurrences + 1, 3);
      existing.lastSeen = Date.now();
    } else {
      const newBrand: LearnedBrand = {
        brand: brand.trim(),
        category,
        confidence: 1.0,
        // Explicit user input must clear findLearnedBrandMatch's trust bar.
        occurrences: 3,
        lastSeen: Date.now(),
        createdAt: Date.now(),
      };
      this.learnedBrands.push(newBrand);
    }
  }

  updateBrandCategory(brand: string, category: StoreCategory): void {
    const normalized = this.normalizeBrandKey(brand);
    const existing = this.learnedBrands.find(
      (b) => this.normalizeBrandKey(b.brand) === normalized,
    );

    if (existing) {
      existing.category = category;
      existing.confidence = 1.0;
      existing.occurrences = Math.max(existing.occurrences, 3);
      existing.lastSeen = Date.now();
    }
  }

  deleteBrand(brand: string): boolean {
    const normalized = this.normalizeBrandKey(brand);
    const originalCount = this.learnedBrands.length;
    this.learnedBrands = this.learnedBrands.filter(
      (b) => this.normalizeBrandKey(b.brand) !== normalized,
    );
    return this.learnedBrands.length < originalCount;
  }

  getAllBrands(): LearnedBrand[] {
    return [...this.learnedBrands];
  }

  learnManualCorrection(
    itemName: string,
    newCategory: StoreCategory,
    oldCategory?: StoreCategory,
  ): void {
    // Extract the brand from the item name
    const potentialBrand = this.extractPotentialBrand(itemName);

    if (!potentialBrand) {
      return;
    }

    // Don't override known brands from the database
    const knownBrand = recognizeBrand(itemName);
    if (knownBrand) {
      return;
    }

    const potentialBrandKey = this.normalizeBrandKey(potentialBrand);
    const existingBrand = this.learnedBrands.find(
      (b) => this.normalizeBrandKey(b.brand) === potentialBrandKey,
    );

    if (existingBrand) {
      // User manually corrected this brand's category
      // High confidence (0.95) because it's explicit user feedback
      existingBrand.category = newCategory;
      existingBrand.confidence = 0.95;
      existingBrand.occurrences = Math.max(existingBrand.occurrences, 3); // Prioritize over statistical learning
      existingBrand.lastSeen = Date.now();
    } else {
      // Create a new learned brand from this manual correction
      const newBrand: LearnedBrand = {
        brand: potentialBrand,
        category: newCategory,
        confidence: 0.95, // High confidence from manual correction
        occurrences: 3, // High occurrence count to prioritize over statistical learning
        lastSeen: Date.now(),
        createdAt: Date.now(),
      };
      this.learnedBrands.push(newBrand);
    }
  }
}
