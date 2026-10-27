import { describe, it, expect } from "vitest";
import { categorizeItem } from "@/lib/category-mapper";

describe("categorizeItem", () => {
  it("categorizes produce items", () => {
    expect(categorizeItem("apple")).toBe("produce");
    expect(categorizeItem("spinach")).toBe("produce");
    expect(categorizeItem("avocado")).toBe("produce");
  });
  it("categorizes dairy items", () => {
    expect(categorizeItem("milk")).toBe("dairy");
    expect(categorizeItem("cheddar cheese")).toBe("dairy");
    expect(categorizeItem("eggs")).toBe("dairy");
  });
  it("categorizes meat items", () => {
    expect(categorizeItem("chicken breast")).toBe("meat");
    expect(categorizeItem("ground beef")).toBe("meat");
  });
  it("categorizes bakery items", () => {
    expect(categorizeItem("sourdough bread")).toBe("bakery");
    expect(categorizeItem("bagels")).toBe("bakery");
  });
  it("categorizes frozen items", () => {
    expect(categorizeItem("frozen pizza")).toBe("frozen");
    expect(categorizeItem("ice cream")).toBe("frozen");
  });
  it("falls back to other for unknown items", () => {
    expect(categorizeItem("xyzzy unrecognized item abc")).toBe("other");
  });
  it("is case-insensitive", () => {
    expect(categorizeItem("MILK")).toBe("dairy");
    expect(categorizeItem("Apple")).toBe("produce");
  });
});
