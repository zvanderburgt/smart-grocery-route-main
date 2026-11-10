// OCR backend: OpenCode (opencode.ai Zen / Go gateway).
//
// The gateway speaks the OpenAI chat-completions dialect, with two extra
// requirements worth knowing about:
//   1. It wants a stable `x-opencode-session` header per conversation; a call
//      without it is rejected with 400 MissingSessionID.
//   2. Browser requests to /chat/completions are not CORS-enabled, so the app
//      talks to a relay by default (`/api/opencode`, see SETUP.md). The relay
//      forwards the request and can hold the bearer token itself, so the key
//      does not have to live in the browser. Point `opencode-endpoint` at any
//      proxy that forwards to https://opencode.ai/zen/go/v1.
//
// The model catalog (GET /models) *is* CORS-open, so model discovery and
// vision-capability filtering work straight from the browser.

import { GROCERY_PROMPT, parseItemsFromResponse, type ExtractedItem } from './ocr-shared';

const ENDPOINT_KEY = 'opencode-endpoint';
const API_KEY_KEY = 'opencode-api-key';
const SELECTED_MODEL_KEY = 'opencode-selected-model';
const CACHED_MODELS_KEY = 'opencode-cached-models';
const MODELS_CACHE_TIME_KEY = 'opencode-models-cache-time';
const SESSION_KEY = 'opencode-session-id';

export const DEFAULT_OPENCODE_ENDPOINT = '/api/opencode';
export const DEFAULT_OPENCODE_MODEL = 'glm-5.3-flash';

const CACHE_DURATION_MS = 24 * 60 * 60 * 1000; // 24 hours
const OCR_TIMEOUT_MS = 60 * 1000;
// Reasoning models emit reasoning_content before the answer, so a small cap
// truncates them to an empty message with finish_reason "length".
const MAX_OUTPUT_TOKENS = 2048;

export interface OpenCodeModel {
  id: string;
  name: string;
  context: number;
}

function read(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function write(key: string, value: string): void {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // localStorage may be unavailable
  }
}

function remove(key: string): void {
  try {
    window.localStorage.removeItem(key);
  } catch {
    // localStorage may be unavailable
  }
}

function normalizeEndpoint(endpoint: string): string {
  return endpoint.trim().replace(/\/+$/, '');
}

export function getOpenCodeEndpoint(): string {
  const stored = normalizeEndpoint(read(ENDPOINT_KEY) || '');
  return stored || DEFAULT_OPENCODE_ENDPOINT;
}

export function setOpenCodeEndpoint(endpoint: string): void {
  const normalized = normalizeEndpoint(endpoint);
  if (!normalized || normalized === DEFAULT_OPENCODE_ENDPOINT) {
    remove(ENDPOINT_KEY);
    return;
  }
  write(ENDPOINT_KEY, normalized);
}

export function getOpenCodeApiKey(): string | null {
  return read(API_KEY_KEY);
}

export function setOpenCodeApiKey(key: string): void {
  write(API_KEY_KEY, key);
}

export function clearOpenCodeApiKey(): void {
  remove(API_KEY_KEY);
}

export function hasOpenCodeApiKey(): boolean {
  return !!getOpenCodeApiKey();
}

export function getSelectedOpenCodeModel(): string {
  return read(SELECTED_MODEL_KEY) || DEFAULT_OPENCODE_MODEL;
}

export function setSelectedOpenCodeModel(modelId: string): void {
  write(SELECTED_MODEL_KEY, modelId.trim() || DEFAULT_OPENCODE_MODEL);
}

// The gateway routes and caches per session, so reuse one id for this install
// rather than minting a new one per scan.
export function getOpenCodeSessionId(): string {
  const existing = read(SESSION_KEY);
  if (existing) return existing;

  const id =
    typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID()
      : `breadcrumb-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  write(SESSION_KEY, id);
  return id;
}

interface RawOpenCodeModel {
  id: string;
  name?: string;
  modalities?: { input?: string[] };
  limit?: { context?: number };
}

/** A model in the catalog, plus whether it can take an image. */
export interface CatalogModel extends OpenCodeModel {
  vision: boolean;
}

/** The `/models` endpoint is public and CORS-enabled, so the browser fetches it
 *  straight from OpenCode. It deliberately does NOT go through the relay: the
 *  relay only proxies chat completions, and pointing discovery at it meant a
 *  deployment without a relay reported "no vision models" instead of showing
 *  the catalog. */
export const OPENCODE_CATALOG_URL = 'https://opencode.ai/zen/go/v1/models';

const CACHED_CATALOG_KEY = 'opencode-cached-catalog';

function hasImageInput(model: { modalities?: { input?: string[] } }): boolean {
  const input = model.modalities?.input || [];
  return input.some((modality) => modality.startsWith('image/'));
}

/** Retained for callers/tests that only need the capability test. */
export function isVisionModel(model: { modalities?: { input?: string[] } }): boolean {
  return hasImageInput(model);
}

function toCatalogModel(model: RawOpenCodeModel): CatalogModel {
  return {
    id: model.id,
    name: model.name || model.id,
    context: model.limit?.context ?? 4096,
    vision: hasImageInput(model),
  };
}

export interface OpenCodeCatalog {
  /** Models that can read an image, i.e. the ones worth offering for OCR. */
  models: OpenCodeModel[];
  /** Every model in the catalog, vision or not, for validation messages. */
  all: CatalogModel[];
  /** Set when the catalog could not be loaded at all. */
  error?: string;
}

async function fetchCatalog(): Promise<{ all: CatalogModel[]; error?: string }> {
  try {
    const response = await fetch(OPENCODE_CATALOG_URL, { headers: { Accept: 'application/json' } });

    if (!response.ok) {
      return {
        all: [],
        error: `Could not load the OpenCode model list (HTTP ${response.status}).`,
      };
    }

    const data = await response.json();
    const all = ((data.data || []) as RawOpenCodeModel[]).map(toCatalogModel);
    if (all.length === 0) {
      return { all: [], error: 'The OpenCode model list came back empty.' };
    }
    return { all };
  } catch (cause) {
    return {
      all: [],
      error: `Could not reach the OpenCode model list (${cause instanceof Error ? cause.message : 'network error'}).`,
    };
  }
}

function visionModelsFrom(all: CatalogModel[]): OpenCodeModel[] {
  return all
    .filter((model) => model.vision)
    .map(({ id, name, context }) => ({ id, name, context }));
}

function readCachedCatalog(): CatalogModel[] | null {
  try {
    const cached = read(CACHED_CATALOG_KEY);
    const cacheTime = read(MODELS_CACHE_TIME_KEY);
    if (!cached || !cacheTime) return null;
    if (Date.now() - parseInt(cacheTime, 10) >= CACHE_DURATION_MS) return null;
    const parsed = JSON.parse(cached);
    return Array.isArray(parsed) ? (parsed as CatalogModel[]) : null;
  } catch {
    return null;
  }
}

/** Full catalog (vision and non-vision), cached for a day. */
export async function getOpenCodeCatalog(forceRefresh = false): Promise<OpenCodeCatalog> {
  if (!forceRefresh) {
    const cached = readCachedCatalog();
    if (cached) {
      return { all: cached, models: visionModelsFrom(cached) };
    }
  }

  const { all, error } = await fetchCatalog();

  // Only cache a catalog that genuinely came back, so one failed fetch cannot
  // pin the app to an empty list for 24 hours.
  if (all.length > 0) {
    write(CACHED_CATALOG_KEY, JSON.stringify(all));
    write(MODELS_CACHE_TIME_KEY, Date.now().toString());
  }

  return { all, models: visionModelsFrom(all), error };
}

export async function getAvailableOpenCodeModels(forceRefresh = false): Promise<OpenCodeModel[]> {
  const catalog = await getOpenCodeCatalog(forceRefresh);
  return catalog.models;
}

export interface OpenCodeModelValidation {
  valid: boolean;
  reason?: string;
  name?: string;
}

export async function validateOpenCodeModel(modelId: string): Promise<OpenCodeModelValidation> {
  const id = modelId.trim();
  if (!id) {
    return { valid: false, reason: 'Enter a model ID' };
  }

  const catalog = await getOpenCodeCatalog();
  if (catalog.error) {
    return { valid: false, reason: catalog.error };
  }

  const match = catalog.all.find((model) => model.id === id);
  if (!match) {
    const caseOnly = catalog.all.find((model) => model.id.toLowerCase() === id.toLowerCase());
    return {
      valid: false,
      reason: caseOnly ? `Use the exact id: ${caseOnly.id}` : 'Not in the OpenCode model list',
    };
  }

  if (!match.vision) {
    // Real finding, not a filter artefact: this model exists but takes no image.
    return { valid: false, name: match.name, reason: 'Model exists but does not accept images' };
  }

  return { valid: true, name: match.name, reason: 'Valid vision model' };
}

function apiError(message: string, status: number): Error {
  return Object.assign(new Error(message), { status });
}

export async function extractGroceryItemsWithOpenCode(
  imageDataUrl: string,
  modelId?: string
): Promise<ExtractedItem[]> {
  const endpoint = getOpenCodeEndpoint();
  const apiKey = getOpenCodeApiKey();
  const model = modelId || getSelectedOpenCodeModel();

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), OCR_TIMEOUT_MS);

  try {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'x-opencode-session': getOpenCodeSessionId(),
    };
    // A relay can hold the key server-side; when it doesn't, the app must send it.
    if (apiKey) {
      headers.Authorization = `Bearer ${apiKey}`;
    }

    const response = await fetch(`${endpoint}/chat/completions`, {
      method: 'POST',
      signal: controller.signal,
      headers,
      body: JSON.stringify({
        model,
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'image_url',
                image_url: {
                  url: imageDataUrl,
                },
              },
              {
                type: 'text',
                text: GROCERY_PROMPT,
              },
            ],
          },
        ],
        max_tokens: MAX_OUTPUT_TOKENS,
        temperature: 0.1,
      }),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      const errorMessage = errorData.error?.message || `HTTP ${response.status}`;

      if (response.status === 404) {
        throw apiError(
          `No OCR relay at ${endpoint}. A browser cannot call opencode.ai directly, so a deployed site needs the relay (netlify/functions/opencode-ocr.mts, or the Cloudflare Worker in relay/) - or switch to OpenRouter in Settings.`,
          404
        );
      }
      if (response.status === 401) {
        throw apiError('Invalid API key. Please check your OpenCode API key.', 401);
      }
      if (response.status === 402) {
        throw apiError('Insufficient credits on your OpenCode plan.', 402);
      }
      if (response.status === 429) {
        throw apiError('Rate limit exceeded. Please try again in a moment.', 429);
      }
      if (errorData.error?.type === 'MissingSessionID') {
        throw apiError(
          'The OpenCode endpoint did not receive the session header. Use the bundled relay (see SETUP.md) instead of calling opencode.ai directly.',
          400
        );
      }

      throw apiError(`OpenCode API error: ${errorMessage}`, response.status);
    }

    const data = await response.json();
    const choice = data.choices?.[0];
    const content = choice?.message?.content;

    if (!content) {
      if (choice?.finish_reason === 'length') {
        throw new Error(
          'The model used up its output budget before answering. Pick a non-reasoning model, or raise max_tokens.'
        );
      }
      throw new Error('No response from model');
    }

    return parseItemsFromResponse(content);
  } catch (error) {
    if ((error as { name?: string })?.name === 'AbortError') {
      throw new Error('Request timed out. The model took too long to respond.');
    }
    if (error instanceof TypeError) {
      // fetch throws TypeError when the request never reached a CORS-enabled
      // endpoint — the usual symptom of pointing at opencode.ai from a browser.
      throw new Error(
        'Could not reach the OpenCode endpoint. Browser requests to opencode.ai are blocked by CORS, so this needs the OCR relay — see SETUP.md.'
      );
    }
    if (error instanceof Error) {
      throw error;
    }
    throw new Error('Failed to connect to OpenCode. Please check your internet connection.');
  } finally {
    clearTimeout(timeoutId);
  }
}
