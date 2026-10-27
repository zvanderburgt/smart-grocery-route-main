import { describe, it, expect } from "vitest";
import { parseItemWithQuantity, toTitleCase, sanitizeInput } from "@/lib/utils";

describe("toTitleCase", () => {
  it("capitalizes each word", () => {
    expect(toTitleCase("whole milk")).toBe("Whole Milk");
  });
  it("handles single word", () => {
    expect(toTitleCase("bread")).toBe("Bread");
  });
  it("lowercases trailing letters", () => {
    expect(toTitleCase("EGGS")).toBe("Eggs");
  });
  it("handles empty string", () => {
    expect(toTitleCase("")).toBe("");
  });
});

describe("parseItemWithQuantity", () => {
  it("parses plain item with quantity 1", () => {
    expect(parseItemWithQuantity("milk")).toEqual({
      name: "milk",
      quantity: 1,
    });
  });
  it('parses "2x milk" format', () => {
    expect(parseItemWithQuantity("2x milk")).toEqual({
      name: "milk",
      quantity: 2,
    });
  });
  it('parses "milk x2" format', () => {
    expect(parseItemWithQuantity("milk x2")).toEqual({
      name: "milk",
      quantity: 2,
    });
  });
  it('parses "3 bags of chips" format', () => {
    expect(parseItemWithQuantity("3 bags of chips")).toEqual({
      name: "chips",
      quantity: 3,
    });
  });
  it("ignores implausible quantities (> 999)", () => {
    // 1000 eggs is implausible; should fall back to name="1000 eggs", quantity=1
    const result = parseItemWithQuantity("1000 eggs");
    expect(result.quantity).toBe(1);
  });
  it("trims surrounding whitespace", () => {
    expect(parseItemWithQuantity("  bread  ")).toEqual({
      name: "bread",
      quantity: 1,
    });
  });
});

describe("sanitizeInput", () => {
  it("strips HTML tags", () => {
    expect(sanitizeInput("<b>milk</b>")).toBe("milk");
  });
  it("strips script injection", () => {
    expect(sanitizeInput("<script>alert(1)</script>milk")).toBe("milk");
  });
  it("preserves normal text", () => {
    expect(sanitizeInput("whole milk 2%")).toBe("whole milk 2%");
  });
  it("trims whitespace", () => {
    expect(sanitizeInput("  bread  ")).toBe("bread");
  });
  it("handles empty string", () => {
    expect(sanitizeInput("")).toBe("");
  });
});
