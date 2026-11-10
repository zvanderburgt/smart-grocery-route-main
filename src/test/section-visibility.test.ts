import { describe, it, expect } from "vitest";
import { expandSections, findSectionsWithNewItems } from "@/lib/section-visibility";
import type { Section } from "@/lib/types";

const section = (id: string, itemIds: string[]): Section =>
  ({
    id,
    name: id,
    icon: "🛒",
    items: itemIds.map((itemId) => ({ id: itemId, name: itemId, quantity: 1, checked: true })),
  }) as unknown as Section;

describe("findSectionsWithNewItems", () => {
  it("ignores sections whose items were all already on screen", () => {
    const sections = [section("produce", ["a", "b"])];

    expect(findSectionsWithNewItems(sections, new Set(["a", "b"]))).toEqual([]);
  });

  it("returns the section that gained an item", () => {
    const sections = [section("produce", ["a", "b"]), section("dairy", ["c"])];

    const found = findSectionsWithNewItems(sections, new Set(["a", "b"]));

    expect(found.map((s) => s.id)).toEqual(["dairy"]);
  });

  it("treats every section as new on a first run with no previous ids", () => {
    const sections = [section("produce", ["a"]), section("dairy", ["b"])];

    expect(findSectionsWithNewItems(sections, new Set()).map((s) => s.id)).toEqual([
      "produce",
      "dairy",
    ]);
  });
});

describe("expandSections", () => {
  it("clears only the collapsed flags it was given", () => {
    const collapsed = { produce: true, dairy: true, pantry: false };

    expect(expandSections(collapsed, ["dairy"])).toEqual({
      produce: true,
      dairy: false,
      pantry: false,
    });
  });

  it("returns null when nothing was collapsed, so no state write happens", () => {
    expect(expandSections({ produce: false }, ["produce"])).toBeNull();
    expect(expandSections({}, ["produce"])).toBeNull();
    expect(expandSections(undefined, ["produce"])).toBeNull();
  });

  it("does not mutate the input", () => {
    const collapsed = { produce: true };
    expandSections(collapsed, ["produce"]);

    expect(collapsed).toEqual({ produce: true });
  });
});
