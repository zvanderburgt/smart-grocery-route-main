import { describe, expect, it } from "vitest";
import { GroceryLearningAlgorithm } from "@/lib/learning-algorithm";
import type { GroceryItem, StoreCategory } from "@/lib/types";

function createItem(name: string, options?: Partial<GroceryItem>): GroceryItem {
  return {
    id: `${name}-${Math.random()}`,
    name,
    checked: false,
    addedAt: Date.now(),
    ...options,
  };
}

function createCheckedTripItems(
  names: string[],
  start: number,
  step = 10000,
): GroceryItem[] {
  return names.map((name, index) =>
    createItem(name, {
      checked: true,
      checkedAt: start + index * step,
    }),
  );
}

function findItemSectionId(
  sections: Array<{ id: string; items: GroceryItem[] }>,
  itemName: string,
): string | undefined {
  return sections.find((section) =>
    section.items.some(
      (item) => item.name.toLowerCase() === itemName.toLowerCase(),
    ),
  )?.id;
}

describe("GroceryLearningAlgorithm", () => {
  it("keeps meaningful category separation even after multiple trips", async () => {
    const algorithm = new GroceryLearningAlgorithm();

    algorithm.recordCheckoff(
      createCheckedTripItems(["apples", "milk", "ground beef", "bread"], 1_000),
    );
    algorithm.recordCheckoff(
      createCheckedTripItems(
        ["spinach", "cheddar cheese", "chicken breast", "bagels"],
        10_000,
      ),
    );
    algorithm.recordCheckoff(
      createCheckedTripItems(
        ["oranges", "eggs", "ground turkey", "sourdough bread"],
        20_000,
      ),
    );

    const items = [
      createItem("ground beef"),
      createItem("chicken breast"),
      createItem("milk"),
      createItem("cheddar cheese"),
      createItem("apples"),
    ];

    const sections = await algorithm.organizeList(items);

    expect(sections.length).toBeGreaterThan(1);
    expect(findItemSectionId(sections, "ground beef")).toBe("meat");
    expect(findItemSectionId(sections, "chicken breast")).toBe("meat");
    expect(findItemSectionId(sections, "milk")).toBe("dairy");
    expect(findItemSectionId(sections, "cheddar cheese")).toBe("dairy");
    expect(findItemSectionId(sections, "apples")).toBe("produce");
  });

  it("reassigns feta from dairy to deli when co-occurrence evidence is strong", async () => {
    const algorithm = new GroceryLearningAlgorithm();

    algorithm.recordCheckoff(
      createCheckedTripItems(["hummus", "feta", "olives"], 1_000),
    );
    algorithm.recordCheckoff(
      createCheckedTripItems(["hummus", "feta", "olives"], 11_000),
    );
    algorithm.recordCheckoff(
      createCheckedTripItems(["hummus", "feta", "olives"], 21_000),
    );

    const sections = await algorithm.organizeList([
      createItem("feta"),
      createItem("hummus"),
      createItem("olives"),
      createItem("milk"),
    ]);

    expect(findItemSectionId(sections, "feta")).toBe("deli");
  });

  it("moves an outlier into the surrounding category even when the checkoff gaps are large", async () => {
    const algorithm = new GroceryLearningAlgorithm();

    algorithm.recordCheckoff(
      createCheckedTripItems(
        ["milk", "rice", "cheddar cheese"],
        1_000,
        4_000_000,
      ),
    );
    algorithm.recordCheckoff(
      createCheckedTripItems(
        ["milk", "rice", "cheddar cheese"],
        2_000,
        4_000_000,
      ),
    );

    const sections = await algorithm.organizeList([
      createItem("rice"),
      createItem("milk"),
      createItem("cheddar cheese"),
    ]);

    expect(findItemSectionId(sections, "rice")).toBe("dairy");
  });

  it("keeps a single relationship entry across export/import round-trips", () => {
    const first = new GroceryLearningAlgorithm();
    first.recordCheckoff(createCheckedTripItems(["swiss", "yogurt"], 1_000));
    const exported = first.exportData();

    const second = new GroceryLearningAlgorithm(
      exported.relationships,
      exported.trips,
    );
    second.recordCheckoff(createCheckedTripItems(["swiss", "yogurt"], 500_000));

    const data = second.exportData();
    expect(data.relationships).toHaveLength(1);
    expect(data.relationships[0].coOccurrences).toBe(2);
  });

  it("reassigns using trip neighbors even when they are not on the current list", async () => {
    const algorithm = new GroceryLearningAlgorithm();

    algorithm.recordCheckoff(
      createCheckedTripItems(["hummus", "feta", "olives"], 1_000),
    );
    algorithm.recordCheckoff(
      createCheckedTripItems(["hummus", "feta", "olives"], 11_000),
    );
    algorithm.recordCheckoff(
      createCheckedTripItems(["hummus", "feta", "olives"], 21_000),
    );

    const sections = await algorithm.organizeList([
      createItem("feta"),
      createItem("milk"),
    ]);

    expect(findItemSectionId(sections, "feta")).toBe("deli");
  });

  it("keeps hinted categories over learned reassignment", async () => {
    const algorithm = new GroceryLearningAlgorithm();

    algorithm.recordCheckoff(
      createCheckedTripItems(["hummus", "feta", "olives"], 1_000),
    );
    algorithm.recordCheckoff(
      createCheckedTripItems(["hummus", "feta", "olives"], 11_000),
    );
    algorithm.recordCheckoff(
      createCheckedTripItems(["hummus", "feta", "olives"], 21_000),
    );

    const hints: Record<string, StoreCategory> = {
      feta: "dairy",
    };

    const sections = await algorithm.organizeList(
      [createItem("feta"), createItem("hummus"), createItem("olives")],
      undefined,
      hints,
    );

    expect(findItemSectionId(sections, "feta")).toBe("dairy");
  });

  it("downweights bulk check-off relationships", () => {
    const algorithm = new GroceryLearningAlgorithm();
    const baseTime = 1_000;

    const bulkItems = [
      "milk",
      "eggs",
      "bread",
      "apples",
      "ground beef",
      "chips",
    ].map((name) =>
      createItem(name, {
        checked: true,
        checkedAt: baseTime,
      }),
    );

    algorithm.recordCheckoff(bulkItems);
    const data = algorithm.exportData();

    expect(data.relationships.length).toBe(0);
  });

  it("does not double-record the same completed trip snapshot", () => {
    const algorithm = new GroceryLearningAlgorithm();

    const completedItems = [
      createItem("hummus", { checked: true, checkedAt: 1_000 }),
      createItem("feta", { checked: true, checkedAt: 11_000 }),
      createItem("olives", { checked: true, checkedAt: 21_000 }),
    ];

    algorithm.recordCheckoff(completedItems);
    algorithm.recordCheckoff(completedItems);

    const data = algorithm.exportData();
    expect(data.trips).toHaveLength(1);
    expect(data.relationships.length).toBeGreaterThan(0);
  });

  it("returns no sections for an empty list", async () => {
    const algorithm = new GroceryLearningAlgorithm();
    const sections = await algorithm.organizeList([]);
    expect(sections).toEqual([]);
  });

  it("ignores trips with fewer than two checked items", () => {
    const algorithm = new GroceryLearningAlgorithm();

    algorithm.recordCheckoff([
      createItem("milk", { checked: true, checkedAt: 1_000 }),
      createItem("eggs"),
    ]);

    const data = algorithm.exportData();
    expect(data.trips).toHaveLength(0);
    expect(data.relationships).toHaveLength(0);
  });

  it("records a second distinct trip of the same length", () => {
    const algorithm = new GroceryLearningAlgorithm();

    algorithm.recordCheckoff(
      createCheckedTripItems(["hummus", "feta", "olives"], 1_000),
    );
    algorithm.recordCheckoff(
      createCheckedTripItems(["milk", "eggs", "bread"], 50_000),
    );

    expect(algorithm.exportData().trips).toHaveLength(2);
  });

  it("respects an explicit item category over base categorization", async () => {
    const algorithm = new GroceryLearningAlgorithm();

    const sections = await algorithm.organizeList([
      createItem("milk", { category: "snacks" }),
      createItem("apples"),
    ]);

    expect(findItemSectionId(sections, "milk")).toBe("snacks");
    expect(findItemSectionId(sections, "apples")).toBe("produce");
  });

  it("does not reassign on weak evidence below the minimum score", async () => {
    const algorithm = new GroceryLearningAlgorithm();

    algorithm.recordCheckoff(createCheckedTripItems(["hummus", "feta"], 1_000));
    algorithm.recordCheckoff(
      createCheckedTripItems(["hummus", "feta"], 50_000),
    );

    const sections = await algorithm.organizeList([
      createItem("feta"),
      createItem("hummus"),
    ]);

    expect(findItemSectionId(sections, "feta")).toBe("dairy");
  });

  it("keeps the base category when its own affinity is within the margin", async () => {
    const algorithm = new GroceryLearningAlgorithm();

    algorithm.recordCheckoff(
      createCheckedTripItems(["hummus", "feta", "olives"], 1_000),
    );
    algorithm.recordCheckoff(
      createCheckedTripItems(["hummus", "feta", "olives"], 50_000),
    );
    algorithm.recordCheckoff(createCheckedTripItems(["milk", "feta"], 100_000));
    algorithm.recordCheckoff(createCheckedTripItems(["milk", "feta"], 150_000));
    algorithm.recordCheckoff(createCheckedTripItems(["milk", "feta"], 200_000));

    const sections = await algorithm.organizeList([
      createItem("feta"),
      createItem("milk"),
    ]);

    expect(findItemSectionId(sections, "feta")).toBe("dairy");
  });

  it("orders sections by learned store layout after two trips", async () => {
    const algorithm = new GroceryLearningAlgorithm();

    algorithm.recordCheckoff(
      createCheckedTripItems(["milk", "eggs", "apples", "bananas"], 1_000),
    );
    algorithm.recordCheckoff(
      createCheckedTripItems(["milk", "eggs", "apples", "bananas"], 100_000),
    );

    const sections = await algorithm.organizeList([
      createItem("apples"),
      createItem("milk"),
      createItem("eggs"),
      createItem("bananas"),
    ]);

    const sectionIds = sections.map((section) => section.id);
    expect(sectionIds.indexOf("dairy")).toBeLessThan(
      sectionIds.indexOf("produce"),
    );
  });

  it("orders items within a section by historical checkoff position", async () => {
    const algorithm = new GroceryLearningAlgorithm();

    algorithm.recordCheckoff(
      createCheckedTripItems(["milk", "cheddar cheese"], 1_000),
    );
    algorithm.recordCheckoff(
      createCheckedTripItems(["milk", "cheddar cheese"], 100_000),
    );

    const sections = await algorithm.organizeList([
      createItem("cheddar cheese"),
      createItem("milk"),
    ]);

    const dairy = sections.find((section) => section.id === "dairy");
    expect(dairy?.items.map((item) => item.name)).toEqual([
      "milk",
      "cheddar cheese",
    ]);
  });

  it("applies a reduced weight to small simultaneous check-off bursts", () => {
    const algorithm = new GroceryLearningAlgorithm();

    const burstItems = ["milk", "eggs", "bread"].map((name) =>
      createItem(name, { checked: true, checkedAt: 1_000 }),
    );

    algorithm.recordCheckoff(burstItems);
    const data = algorithm.exportData();

    expect(data.relationships.length).toBeGreaterThan(0);
    for (const rel of data.relationships) {
      expect(rel.strength).toBeLessThan(0.6);
    }
  });

  it("does not create self-relationships for names that normalize identically", () => {
    const algorithm = new GroceryLearningAlgorithm();

    algorithm.recordCheckoff([
      createItem("apple", { checked: true, checkedAt: 1_000 }),
      createItem("Apples", { checked: true, checkedAt: 11_000 }),
    ]);

    const data = algorithm.exportData();
    expect(data.trips).toHaveLength(1);
    expect(data.relationships).toHaveLength(0);
  });
});
