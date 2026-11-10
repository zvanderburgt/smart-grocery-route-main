import { describe, it, expect, vi, afterEach } from "vitest";
import {
  DEFAULT_OPENCODE_ENDPOINT,
  DEFAULT_OPENCODE_MODEL,
  OPENCODE_CATALOG_URL,
  allowOpenCodeModel,
  getOpenCodeCatalog,
  validateOpenCodeModel,
  extractGroceryItemsWithOpenCode,
  getAvailableOpenCodeModels,
  getOpenCodeEndpoint,
  getOpenCodeSessionId,
  isVisionModel,
  setOpenCodeApiKey,
  setOpenCodeEndpoint,
} from "@/lib/ocr-opencode";

afterEach(() => {
  vi.unstubAllGlobals();
});

const catalog = {
  object: "list",
  data: [
    {
      id: "glm-5.3-flash",
      name: "GLM-5.3-Flash",
      modalities: { input: ["text", "image/png", "image/jpeg"], output: ["text"] },
      limit: { context: 1000000 },
    },
    {
      id: "deepseek-v4-pro",
      name: "DeepSeek V4 Pro",
      modalities: { input: ["text"], output: ["text"] },
      limit: { context: 1000000 },
    },
    {
      id: "minimax-m3",
      name: "MiniMax-M3",
      modalities: { input: ["text", "image/webp"], output: ["text"] },
      limit: { context: 1000000 },
    },
  ],
};

const ocrResponse = {
  choices: [
    {
      message: { role: "assistant", content: '[{"item":"milk","quantity":2}]' },
      finish_reason: "stop",
    },
  ],
};

describe("isVisionModel", () => {
  it("accepts models that declare an image input modality", () => {
    expect(isVisionModel({ modalities: { input: ["text", "image/png"] } })).toBe(true);
  });

  it("rejects text-only and modality-less models", () => {
    expect(isVisionModel({ modalities: { input: ["text"] } })).toBe(false);
    expect(isVisionModel({})).toBe(false);
  });
});

describe("endpoint handling", () => {
  it("defaults to the bundled relay", () => {
    expect(getOpenCodeEndpoint()).toBe(DEFAULT_OPENCODE_ENDPOINT);
  });

  it("strips trailing slashes and falls back to the default when cleared", () => {
    setOpenCodeEndpoint("https://relay.example.com/");
    expect(getOpenCodeEndpoint()).toBe("https://relay.example.com");

    setOpenCodeEndpoint("");
    expect(getOpenCodeEndpoint()).toBe(DEFAULT_OPENCODE_ENDPOINT);
  });
});

describe("getOpenCodeSessionId", () => {
  it("reuses one id across calls so routing and caching stay stable", () => {
    const first = getOpenCodeSessionId();
    expect(first).toBeTruthy();
    expect(getOpenCodeSessionId()).toBe(first);
  });
});

describe("getAvailableOpenCodeModels", () => {
  it("keeps only image-capable models", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => catalog })
    );

    const models = await getAvailableOpenCodeModels();

    expect(models.map((m) => m.id)).toEqual(["glm-5.3-flash", "minimax-m3"]);
    expect(models[0]).toEqual({ id: "glm-5.3-flash", name: "GLM-5.3-Flash", context: 1000000 });
  });

  it("serves the cached list instead of re-fetching", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => catalog })
      .mockRejectedValueOnce(new Error("offline"));
    vi.stubGlobal("fetch", fetchMock);

    await getAvailableOpenCodeModels();
    const models = await getAvailableOpenCodeModels();

    expect(models).toHaveLength(2);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("does not cache an empty result", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: false, status: 500, json: async () => ({}) })
    );

    expect(await getAvailableOpenCodeModels()).toEqual([]);
    expect(window.localStorage.getItem("opencode-cached-models")).toBeNull();
  });
});

describe("extractGroceryItemsWithOpenCode", () => {
  it("posts the image to the endpoint with a session header and parses the items", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue({ ok: true, status: 200, json: async () => ocrResponse });
    vi.stubGlobal("fetch", fetchMock);

    const items = await extractGroceryItemsWithOpenCode("data:image/jpeg;base64,AAAA");

    expect(items).toEqual([{ item: "milk", quantity: 2 }]);

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(`${DEFAULT_OPENCODE_ENDPOINT}/chat/completions`);
    expect(init.method).toBe("POST");
    expect(init.headers["x-opencode-session"]).toBe(getOpenCodeSessionId());
    // No key configured means the relay is expected to add one.
    expect(init.headers.Authorization).toBeUndefined();

    const body = JSON.parse(init.body);
    expect(body.model).toBe(DEFAULT_OPENCODE_MODEL);
    expect(body.max_tokens).toBeGreaterThanOrEqual(2048);
    expect(body.messages[0].content[0]).toEqual({
      type: "image_url",
      image_url: { url: "data:image/jpeg;base64,AAAA" },
    });
    expect(body.messages[0].content[1].type).toBe("text");
  });

  it("sends the bearer token when a key is configured", async () => {
    setOpenCodeApiKey("oc-test-key");
    const fetchMock = vi
      .fn()
      .mockResolvedValue({ ok: true, status: 200, json: async () => ocrResponse });
    vi.stubGlobal("fetch", fetchMock);

    await extractGroceryItemsWithOpenCode("data:image/jpeg;base64,AAAA", "minimax-m3");

    const [, init] = fetchMock.mock.calls[0];
    expect(init.headers.Authorization).toBe("Bearer oc-test-key");
    expect(JSON.parse(init.body).model).toBe("minimax-m3");
  });

  it("maps a 401 to an actionable message", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 401,
        json: async () => ({ error: { message: "unauthorized" } }),
      })
    );

    await expect(extractGroceryItemsWithOpenCode("data:image/jpeg;base64,AAAA")).rejects.toThrow(
      /Invalid API key/
    );
  });

  it("explains an empty answer that ran out of output budget", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          choices: [{ message: { content: "", reasoning_content: "thinking..." }, finish_reason: "length" }],
        }),
      })
    );

    await expect(extractGroceryItemsWithOpenCode("data:image/jpeg;base64,AAAA")).rejects.toThrow(
      /output budget/
    );
  });

  it("points at the relay when the request never leaves the browser (CORS)", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("Failed to fetch")));

    await expect(extractGroceryItemsWithOpenCode("data:image/jpeg;base64,AAAA")).rejects.toThrow(
      /CORS/
    );
  });
});

describe('catalog discovery', () => {
  it('reads the model list from opencode.ai, not through the relay', async () => {
    // Regression: discovery used to go through the configured endpoint, so any
    // deployment without a relay reported "no vision models" instead of the
    // (public, CORS-enabled) catalog.
    setOpenCodeEndpoint('https://my-relay.example.com');
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => catalog });
    vi.stubGlobal('fetch', fetchMock);

    const result = await getOpenCodeCatalog();

    expect(fetchMock.mock.calls[0][0]).toBe(OPENCODE_CATALOG_URL);
    expect(result.models.map((model) => model.id)).toEqual(['glm-5.3-flash', 'minimax-m3']);
    expect(result.error).toBeUndefined();
  });

  it('reports why the catalog is empty instead of pretending nothing is vision-capable', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 404, json: async () => ({}) }));

    const result = await getOpenCodeCatalog();

    expect(result.models).toEqual([]);
    expect(result.error).toMatch(/HTTP 404/);
  });
});

describe('model validation', () => {
  beforeEach(() => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => catalog })
    );
  });

  it('accepts a model that declares image input', async () => {
    await expect(validateOpenCodeModel('glm-5.3-flash')).resolves.toMatchObject({ valid: true });
  });

  it('distinguishes "exists but has no image input" from "not in the list"', async () => {
    // deepseek-v4-pro is in the fixture catalog with text-only input
    await expect(validateOpenCodeModel('deepseek-v4-pro')).resolves.toMatchObject({
      valid: false,
      reason: expect.stringMatching(/does not advertise image input/i),
    });

    await expect(validateOpenCodeModel('not-a-real-model')).resolves.toMatchObject({
      valid: false,
      reason: expect.stringMatching(/Not in the OpenCode model list/),
    });
  });

  it('carries a catalog failure into the validation reason', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));

    const result = await validateOpenCodeModel('glm-5.3-flash');

    expect(result.valid).toBe(false);
    expect(result.reason).toMatch(/Could not reach the OpenCode model list/);
  });
});

describe('missing relay', () => {
  it('says the deployment has no relay when the endpoint 404s', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 404,
        json: async () => ({ error: { message: 'Not Found' } }),
      })
    );

    await expect(extractGroceryItemsWithOpenCode('data:image/jpeg;base64,AAAA')).rejects.toThrow(
      /No OCR relay/
    );
  });
});

describe('manual vision override', () => {
  beforeEach(() => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => catalog })
    );
  });

  it('flags a text-only model as overridable rather than a dead end', async () => {
    // longcat-2.5-free style case: catalog omits image input but the model works
    const result = await validateOpenCodeModel('deepseek-v4-pro');

    expect(result).toMatchObject({ valid: false, overrideAllowed: true });
  });

  it('accepts the model once it has been explicitly allowed', async () => {
    allowOpenCodeModel('deepseek-v4-pro');

    const result = await validateOpenCodeModel('deepseek-v4-pro');

    expect(result).toMatchObject({ valid: true });
    expect(result.reason).toMatch(/Enabled manually/);
  });

  it('never offers the override for an id that is not in the catalog', async () => {
    const result = await validateOpenCodeModel('nope-not-a-model');

    expect(result.overrideAllowed).toBeUndefined();
  });
});
