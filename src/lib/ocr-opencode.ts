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

export function isVisionModel(model: { modalities?: { input?: string[] } }): boolean {
  const input = model.modalities?.input || [];
  return input.some((modality) => modality.startsWith('image/'));
}

function toOpenCodeModel(model: RawOpenCodeModel): OpenCodeModel {
  return {
    id: model.id,
    name: model.name || model.id,
    context: model.limit?.context ?? 4096,
  };
}

async function fetchModelsFromOpenCode(): Promise<OpenCodeModel[]> {
  try {
    const response = await fetch(`${getOpenCodeEndpoint()}/models`, {
      headers: {
        'x-opencode-session': getOpenCodeSessionId(),
      },
    });

    if (!response.ok) {
      console.warn('Failed to fetch OpenCode models:', response.status);
      return [];
    }

    const data = await response.json();
    return ((data.data || []) as RawOpenCodeModel[])
      .filter(isVisionModel)
      .map(toOpenCodeModel);
  } catch (error) {
    console.warn('Failed to fetch OpenCode models:', error);
    return [];
  }
}

export async function getAvailableOpenCodeModels(forceRefresh = false): Promise<OpenCodeModel[]> {
  if (!forceRefresh) {
    try {
      const cached = read(CACHED_MODELS_KEY);
      const cacheTime = read(MODELS_CACHE_TIME_KEY);

      if (cached && cacheTime) {
        const age = Date.now() - parseInt(cacheTime, 10);
        if (age < CACHE_DURATION_MS) {
          return JSON.parse(cached) as OpenCodeModel[];
        }
      }
    } catch {
      // Ignore cache errors
    }
  }

  const models = await fetchModelsFromOpenCode();

  // Only cache a list that genuinely came back, so one failed fetch can't pin
  // the app to a stale list for 24 hours.
  if (models.length > 0) {
    write(CACHED_MODELS_KEY, JSON.stringify(models));
    write(MODELS_CACHE_TIME_KEY, Date.now().toString());
  }

  return models;
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

  const models = await getAvailableOpenCodeModels();
  if (models.length === 0) {
    return { valid: false, reason: 'Could not load models from the OpenCode endpoint' };
  }

  const match = models.find((model) => model.id === id);
  if (!match) {
    const exact = models.some((model) => model.id.toLowerCase() === id.toLowerCase());
    return {
      valid: false,
      reason: exact ? 'Model id must match exactly' : 'Model is not available with image input',
    };
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
