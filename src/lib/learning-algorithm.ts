import type {
  GroceryItem,
  ItemRelationship,
  LearnedBrand,
  Section,
  ShoppingTrip,
  StoreCategory,
} from "./types";
import { categorizeItem, getCategoryInfo } from "./category-mapper";

const BULK_CHECKOFF_WINDOW_MS = 2000;
const MIN_ITEM_APPEARANCES_FOR_REASSIGNMENT = 2;
const MIN_RELATIONSHIP_OCCURRENCES = 2;
const MIN_REASSIGNMENT_SCORE = 0.6;
const REASSIGNMENT_MARGIN = 1.5;

export class GroceryLearningAlgorithm {
  private relationships: Map<string, ItemRelationship[]>;
  private trips: ShoppingTrip[];

  constructor(
    relationships: ItemRelationship[] = [],
    trips: ShoppingTrip[] = [],
  ) {
    this.relationships = new Map();
    relationships.forEach((rel) => {
      // rel.item1 is already normalized when stored; re-normalizing here
      // would corrupt keys for names ending in "s" on every import.
      const key = rel.item1;
      if (!this.relationships.has(key)) {
        this.relationships.set(key, []);
      }
      this.relationships.get(key)!.push(rel);
    });
    this.trips = trips;
  }

  normalizeItemName(name: string): string {
    const normalized = name.toLowerCase().trim();
    // Strip a plural "s" only when it is safe: short words ("gas") and
    // words ending in "ss"/"us" ("swiss", "hummus") must stay intact so
    // the result is idempotent and still matches category keywords.
    if (
      normalized.length > 3 &&
      normalized.endsWith("s") &&
      !normalized.endsWith("ss") &&
      !normalized.endsWith("us")
    ) {
      return normalized.slice(0, -1);
    }
    return normalized;
  }

  recordCheckoff(items: GroceryItem[]): void {
    const checkedItems = items
      .filter((item) => item.checked && item.checkedAt)
      .sort((a, b) => a.checkedAt! - b.checkedAt!);

    if (checkedItems.length < 2) return;

    const trip: ShoppingTrip = {
      id: `trip-${Date.now()}`,
      date: Date.now(),
      items: checkedItems.map((item, index) => ({
        name: this.normalizeItemName(item.name),
        checkedAt: item.checkedAt!,
        position: index,
      })),
    };

    // Guard against duplicate recording when multiple UI paths submit
    // the same completed list snapshot.
    if (this.isDuplicateOfMostRecentTrip(trip)) {
      return;
    }

    this.trips.push(trip);

    for (let i = 0; i < checkedItems.length - 1; i++) {
      const item1 = checkedItems[i];
      const item2 = checkedItems[i + 1];

      const burstSize = this.getBurstSize(checkedItems, item1.checkedAt!);
      if (burstSize >= 6) {
        continue;
      }

      const burstPenalty = burstSize > 1 ? 1 / burstSize : 1;
      this.updateRelationship(item1.name, item2.name, burstPenalty);
    }
  }

  private isDuplicateOfMostRecentTrip(nextTrip: ShoppingTrip): boolean {
    const lastTrip = this.trips[this.trips.length - 1];
    if (!lastTrip) {
      return false;
    }

    if (lastTrip.items.length !== nextTrip.items.length) {
      return false;
    }

    for (let i = 0; i < nextTrip.items.length; i++) {
      const prev = lastTrip.items[i];
      const curr = nextTrip.items[i];
      if (
        prev.name !== curr.name ||
        prev.checkedAt !== curr.checkedAt ||
        prev.position !== curr.position
      ) {
        return false;
      }
    }

    return true;
  }

  private getBurstSize(items: GroceryItem[], timestamp: number): number {
    return items.filter(
      (item) =>
        item.checkedAt !== undefined &&
        Math.abs(item.checkedAt - timestamp) <= BULK_CHECKOFF_WINDOW_MS,
    ).length;
  }

  private updateRelationship(
    name1: string,
    name2: string,
    weightMultiplier = 1,
  ): void {
    if (weightMultiplier <= 0) {
      return;
    }

    const normalized1 = this.normalizeItemName(name1);
    const normalized2 = this.normalizeItemName(name2);

    if (normalized1 === normalized2) {
      return;
    }

    const [item1, item2] = [normalized1, normalized2].sort();

    if (!this.relationships.has(item1)) {
      this.relationships.set(item1, []);
    }

    const existing = this.relationships
      .get(item1)!
      .find((rel) => rel.item2 === item2);

    if (existing) {
      existing.strength = existing.strength * 0.75 + weightMultiplier * 0.25;
      existing.lastUpdated = Date.now();
      existing.coOccurrences = (existing.coOccurrences ?? 1) + 1;
    } else {
      this.relationships.get(item1)!.push({
        item1,
        item2,
        strength: weightMultiplier * 0.6,
        lastUpdated: Date.now(),
        coOccurrences: 1,
      });
    }
  }

  async organizeList(
    items: GroceryItem[],
    learnedBrands?: LearnedBrand[],
    itemCategoryHints?: Record<string, StoreCategory>,
  ): Promise<Section[]> {
    if (items.length === 0) return [];

    return this.organizeListByCategoriesWithLearning(
      items,
      learnedBrands,
      itemCategoryHints,
    );
  }

  private organizeListByCategoriesWithLearning(
    items: GroceryItem[],
    learnedBrands?: LearnedBrand[],
    itemCategoryHints?: Record<string, StoreCategory>,
  ): Section[] {
    const categorizedItems = new Map<StoreCategory, GroceryItem[]>();
    // Keyed by normalized name: only used to look up a neighbour's category.
    const baseCategoryByItem = new Map<string, StoreCategory>();
    // Keyed by item: 'Orange' and 'Oranges' normalize alike but can carry
    // different explicit categories.
    const baseCategoryById = new Map<string, StoreCategory>();
    const lockedItemIds = new Set<string>();

    for (const item of items) {
      const normalizedName = this.normalizeItemName(item.name);
      const lockedCategory =
        (item.category as StoreCategory | undefined) ??
        this.getHintedCategory(item.name, itemCategoryHints);
      const baseCategory =
        lockedCategory ?? categorizeItem(item.name, learnedBrands);

      if (lockedCategory) lockedItemIds.add(item.id);
      baseCategoryById.set(item.id, baseCategory);
      baseCategoryByItem.set(normalizedName, baseCategory);
    }

    for (const item of items) {
      const normalizedName = this.normalizeItemName(item.name);
      const baseCategory = baseCategoryById.get(item.id)!;

      const category = lockedItemIds.has(item.id)
        ? baseCategory
        : this.getLearnedCategory(
            normalizedName,
            baseCategory,
            baseCategoryByItem,
          );

      if (!categorizedItems.has(category)) {
        categorizedItems.set(category, []);
      }
      categorizedItems.get(category)!.push(item);
    }

    const sectionOrder: StoreCategory[] = [
      "produce",
      "bakery",
      "deli",
      "meat",
      "seafood",
      "dairy",
      "frozen",
      "pantry",
      "canned",
      "condiments",
      "snacks",
      "beverages",
      "household",
      "personal-care",
      "other",
    ];

    const sections: Section[] = [];

    for (const category of sectionOrder) {
      const categoryItems = categorizedItems.get(category);
      if (!categoryItems || categoryItems.length === 0) continue;

      const categoryInfo = getCategoryInfo(category);
      const avgPos = this.getAverageCategoryPosition(category, categoryItems);
      const confidence = this.calculateCategoryConfidence(
        category,
        categoryItems,
      );

      sections.push({
        id: category,
        name: categoryInfo.name,
        icon: categoryInfo.icon,
        items: this.sortItemsWithinSection(categoryItems),
        averagePosition: avgPos,
        confidence,
        isLearned: false,
      });
    }

    if (this.trips.length >= 2) {
      sections.sort((a, b) => a.averagePosition - b.averagePosition);
    }

    return sections;
  }

  private getHintedCategory(
    itemName: string,
    itemCategoryHints?: Record<string, StoreCategory>,
  ): StoreCategory | undefined {
    if (!itemCategoryHints) {
      return undefined;
    }

    const raw = itemName.toLowerCase().trim();
    return (
      itemCategoryHints[raw] ??
      itemCategoryHints[this.normalizeItemName(itemName)]
    );
  }

  private getLearnedCategory(
    normalizedItemName: string,
    baseCategory: StoreCategory,
    baseCategoryByItem: Map<string, StoreCategory>,
  ): StoreCategory {
    if (this.trips.length < 2) {
      return baseCategory;
    }

    if (
      this.getItemAppearanceCount(normalizedItemName) <
      MIN_ITEM_APPEARANCES_FOR_REASSIGNMENT
    ) {
      return baseCategory;
    }

    const relationships = this.getRelationshipsForItem(
      normalizedItemName,
    ).filter((rel) => (rel.coOccurrences ?? 1) >= MIN_RELATIONSHIP_OCCURRENCES);

    if (relationships.length === 0) {
      return baseCategory;
    }

    const affinityByCategory = new Map<StoreCategory, number>();

    for (const rel of relationships) {
      const neighborName =
        rel.item1 === normalizedItemName ? rel.item2 : rel.item1;
      const neighborCategory =
        baseCategoryByItem.get(neighborName) ??
        this.categorizeNormalizedName(neighborName);
      const evidenceBoost = Math.min(1, (rel.coOccurrences ?? 1) / 3);
      const score = rel.strength * evidenceBoost;
      affinityByCategory.set(
        neighborCategory,
        (affinityByCategory.get(neighborCategory) ?? 0) + score,
      );
    }

    let topCategory = baseCategory;
    let topScore = affinityByCategory.get(baseCategory) ?? 0;

    for (const [category, score] of affinityByCategory.entries()) {
      if (score > topScore) {
        topCategory = category;
        topScore = score;
      }
    }

    if (topCategory === baseCategory) {
      return baseCategory;
    }

    if (topScore < MIN_REASSIGNMENT_SCORE) {
      return baseCategory;
    }

    const baseScore = affinityByCategory.get(baseCategory) ?? 0;
    if (baseScore > 0 && topScore < baseScore * REASSIGNMENT_MARGIN) {
      return baseCategory;
    }

    return topCategory;
  }

  private categorizeNormalizedName(name: string): StoreCategory {
    const direct = categorizeItem(name);
    if (direct !== "other") {
      return direct;
    }
    // Normalization strips a plural "s", which can break keyword matches
    // (e.g. "pea" no longer contains keyword "peas"). Retry the plural form.
    return categorizeItem(`${name}s`);
  }

  private getRelationshipsForItem(itemName: string): ItemRelationship[] {
    const normalized = this.normalizeItemName(itemName);
    const matches: ItemRelationship[] = [];

    for (const rels of this.relationships.values()) {
      for (const rel of rels) {
        if (rel.item1 === normalized || rel.item2 === normalized) {
          matches.push(rel);
        }
      }
    }

    return matches;
  }

  private getItemAppearanceCount(itemName: string): number {
    const normalized = this.normalizeItemName(itemName);
    let count = 0;

    for (const trip of this.trips) {
      if (trip.items.some((ti) => ti.name === normalized)) {
        count++;
      }
    }

    return count;
  }

  private sortItemsWithinSection(items: GroceryItem[]): GroceryItem[] {
    const unchecked = items.filter((item) => !item.checked);
    const checked = items.filter((item) => item.checked);

    if (this.trips.length < 2) {
      return [
        ...unchecked.sort((a, b) => a.name.localeCompare(b.name)),
        ...checked.sort((a, b) => a.name.localeCompare(b.name)),
      ];
    }

    const sortedUnchecked = unchecked.sort((a, b) => {
      const posA = this.getItemAveragePosition(a.name);
      const posB = this.getItemAveragePosition(b.name);

      if (posA === posB) {
        return a.name.localeCompare(b.name);
      }

      return posA - posB;
    });

    return [...sortedUnchecked, ...checked];
  }

  private getItemAveragePosition(itemName: string): number {
    const normalized = this.normalizeItemName(itemName);
    const positions: number[] = [];

    for (const trip of this.trips) {
      const tripItem = trip.items.find((ti) => ti.name === normalized);
      if (tripItem) {
        positions.push(tripItem.position);
      }
    }

    if (positions.length === 0) return 999;
    return positions.reduce((sum, pos) => sum + pos, 0) / positions.length;
  }

  private getAverageCategoryPosition(
    category: StoreCategory,
    items: GroceryItem[],
  ): number {
    let totalPosition = 0;
    let count = 0;

    for (const item of items) {
      const pos = this.getItemAveragePosition(item.name);
      if (pos < 999) {
        totalPosition += pos;
        count++;
      }
    }

    return count > 0
      ? totalPosition / count
      : this.getDefaultCategoryPosition(category);
  }

  private getDefaultCategoryPosition(category: StoreCategory): number {
    const defaultOrder: Record<StoreCategory, number> = {
      produce: 1,
      bakery: 2,
      deli: 3,
      meat: 4,
      seafood: 5,
      dairy: 6,
      frozen: 7,
      pantry: 8,
      canned: 9,
      condiments: 10,
      snacks: 11,
      beverages: 12,
      household: 13,
      "personal-care": 14,
      other: 15,
    };

    return defaultOrder[category] || 999;
  }

  private calculateCategoryConfidence(
    category: StoreCategory,
    items: GroceryItem[],
  ): number {
    if (this.trips.length < 2) return 0.3;

    let hasHistory = 0;
    for (const item of items) {
      const normalized = this.normalizeItemName(item.name);
      const inTrips = this.trips.filter((trip) =>
        trip.items.some((ti) => ti.name === normalized),
      ).length;

      if (inTrips >= 2) hasHistory++;
    }

    const ratio = hasHistory / items.length;
    return Math.min(1, 0.3 + ratio * 0.7);
  }

  exportData() {
    const allRelationships: ItemRelationship[] = [];
    for (const rels of this.relationships.values()) {
      allRelationships.push(...rels);
    }
    return {
      relationships: allRelationships,
      trips: this.trips,
    };
  }
}
