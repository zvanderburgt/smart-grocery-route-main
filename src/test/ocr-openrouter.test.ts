import { describe, it, expect, vi, afterEach } from "vitest";
import {
  isFreeModel,
  getAvailableOpenRouterModels,
  extractGroceryItemsWithAutoSelect,
} from "@/lib/ocr-openrouter";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("isFreeModel", () => {
  it("rejects a model with no pricing field", () => {
    expect(isFreeModel({})).toBe(false);
  });
  it("rejects a model with empty pricing", () => {
    expect(isFreeModel({ pricing: {} })).toBe(false);
  });
  it("accepts a model with all-zero pricing", () => {
    expect(isFreeModel({ pricing: { prompt: "0", completion: "0", image: "0" } })).toBe(true);
  });
  it("rejects a model with any non-zero pricing", () => {
    expect(isFreeModel({ pricing: { prompt: "0", image: "0.005" } })).toBe(false);
  });
});

describe("getAvailableOpenRouterModels", () => {
  it("does not cache anything when the catalog fetch fails", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));

    const models = await getAvailableOpenRouterModels("sk-or-test");

    expect(models).toEqual([]);
    expect(window.localStorage.getItem("openrouter-cached-models")).toBeNull();
    expect(window.localStorage.getItem("openrouter-models-cache-time")).toBeNull();
  });
});

describe("extractGroceryItemsWithAutoSelect", () => {
  it("stops after the first model on a 401 instead of trying every model", async () => {
    window.localStorage.setItem("openrouter-api-key", "sk-or-bad");
    window.localStorage.setItem(
      "openrouter-cached-models",
      JSON.stringify([
        { id: "vendor/model-a:free", name: "A", context: 4096 },
        { id: "vendor/model-b:free", name: "B", context: 4096 },
        { id: "vendor/model-c:free", name: "C", context: 4096 },
      ])
    );
    window.localStorage.setItem("openrouter-models-cache-time", Date.now().toString());

    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      json: async () => ({ error: { message: "No auth credentials found" } }),
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(extractGroceryItemsWithAutoSelect("data:image/png;base64,xxx")).rejects.toThrow(
      /Invalid API key/
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("keeps trying other models on a model-specific failure", async () => {
    window.localStorage.setItem("openrouter-api-key", "sk-or-test");
    window.localStorage.setItem(
      "openrouter-cached-models",
      JSON.stringify([
        { id: "vendor/model-a:free", name: "A", context: 4096 },
        { id: "vendor/model-b:free", name: "B", context: 4096 },
      ])
    );
    window.localStorage.setItem("openrouter-models-cache-time", Date.now().toString());

    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: false, status: 404, json: async () => ({}) })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          choices: [{ message: { content: '[{"item":"milk","quantity":2}]' } }],
        }),
      });
    vi.stubGlobal("fetch", fetchMock);

    const items = await extractGroceryItemsWithAutoSelect("data:image/png;base64,xxx");

    expect(items).toEqual([{ item: "milk", quantity: 2 }]);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(window.localStorage.getItem("openrouter-selected-model")).toBe("vendor/model-b:free");
  });

  it("explains that no models could be loaded when the catalog is empty", async () => {
    window.localStorage.setItem("openrouter-api-key", "sk-or-test");
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));

    await expect(extractGroceryItemsWithAutoSelect("data:image/png;base64,xxx")).rejects.toThrow(
      /Could not load free vision models/
    );
  });
});
