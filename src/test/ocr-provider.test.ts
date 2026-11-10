import { describe, it, expect, vi, beforeEach } from "vitest";

const extractOpenRouter = vi.fn();
const extractAutoSelect = vi.fn();
const extractOpenCode = vi.fn();

vi.mock("@/lib/ocr-openrouter", () => ({
  hasOpenRouterApiKey: vi.fn(() => false),
  getAutoSelectModel: vi.fn(() => false),
  getSelectedOpenRouterModel: vi.fn(() => "minimax/minimax-m3:free"),
  extractGroceryItemsWithOpenRouter: (...args: unknown[]) => extractOpenRouter(...args),
  extractGroceryItemsWithAutoSelect: (...args: unknown[]) => extractAutoSelect(...args),
}));

vi.mock("@/lib/ocr-opencode", () => ({
  getOpenCodeEndpoint: vi.fn(() => "/api/opencode"),
  getSelectedOpenCodeModel: vi.fn(() => "glm-5.3-flash"),
  extractGroceryItemsWithOpenCode: (...args: unknown[]) => extractOpenCode(...args),
}));

import {
  OCR_PROVIDERS,
  extractGroceryItems,
  getOcrProvider,
  getOcrProviderLabel,
  isOcrProviderConfigured,
  setOcrProvider,
} from "@/lib/ocr-provider";
import { getAutoSelectModel, hasOpenRouterApiKey } from "@/lib/ocr-openrouter";

beforeEach(() => {
  vi.clearAllMocks();
  extractOpenRouter.mockResolvedValue([{ item: "milk", quantity: 1 }]);
  extractAutoSelect.mockResolvedValue([{ item: "milk", quantity: 1 }]);
  extractOpenCode.mockResolvedValue([{ item: "milk", quantity: 1 }]);
});

describe("provider selection", () => {
  it("defaults to OpenRouter so existing installs keep working", () => {
    expect(getOcrProvider()).toBe("openrouter");
    expect(getOcrProviderLabel()).toBe("OpenRouter");
  });

  it("persists and labels the OpenCode choice", () => {
    setOcrProvider("opencode");
    expect(getOcrProvider()).toBe("opencode");
    expect(getOcrProviderLabel()).toBe("OpenCode");
    expect(OCR_PROVIDERS.map((p) => p.id)).toEqual(["openrouter", "opencode"]);
  });

  it("ignores an unrecognised stored value", () => {
    window.localStorage.setItem("ocr-provider", "gemini");
    expect(getOcrProvider()).toBe("openrouter");
  });
});

describe("isOcrProviderConfigured", () => {
  it("requires an OpenRouter key for that provider", () => {
    expect(isOcrProviderConfigured("openrouter")).toBe(false);

    vi.mocked(hasOpenRouterApiKey).mockReturnValueOnce(true);
    expect(isOcrProviderConfigured("openrouter")).toBe(true);
  });

  it("treats OpenCode as configured because the relay endpoint always exists", () => {
    expect(isOcrProviderConfigured("opencode")).toBe(true);
  });
});

describe("extractGroceryItems", () => {
  it("routes to OpenRouter with the selected model", async () => {
    const items = await extractGroceryItems("data:image/jpeg;base64,AAAA");

    expect(extractOpenRouter).toHaveBeenCalledWith(
      "data:image/jpeg;base64,AAAA",
      "minimax/minimax-m3:free"
    );
    expect(extractOpenCode).not.toHaveBeenCalled();
    expect(items).toEqual([{ item: "milk", quantity: 1 }]);
  });

  it("uses OpenRouter auto-select when that setting is on", async () => {
    vi.mocked(getAutoSelectModel).mockReturnValueOnce(true);

    await extractGroceryItems("data:image/jpeg;base64,AAAA");

    expect(extractAutoSelect).toHaveBeenCalledWith("data:image/jpeg;base64,AAAA");
    expect(extractOpenRouter).not.toHaveBeenCalled();
  });

  it("routes to OpenCode with its selected model", async () => {
    setOcrProvider("opencode");

    await extractGroceryItems("data:image/jpeg;base64,AAAA");

    expect(extractOpenCode).toHaveBeenCalledWith("data:image/jpeg;base64,AAAA", "glm-5.3-flash");
    expect(extractOpenRouter).not.toHaveBeenCalled();
  });
});
