const OPENROUTER_API_URL = 'https://openrouter.ai/api/v1/chat/completions';
// output_modalities=text,image filters OpenRouter's OUTPUT side only (it adds
// back image-generation models that are hidden by default) — it says nothing
// about INPUT modality, so we still check input_modalities.includes('image')
// ourselves to confirm a model actually accepts an image (needed for OCR).
const OPENROUTER_MODELS_URL = 'https://openrouter.ai/api/v1/models?output_modalities=text,image';

const OPENROUTER_API_KEY_KEY = 'openrouter-api-key';
const OPENROUTER_SELECTED_MODEL_KEY = 'openrouter-selected-model';
const OPENROUTER_CACHED_MODELS_KEY = 'openrouter-cached-models';
const OPENROUTER_MODELS_CACHE_TIME_KEY = 'openrouter-models-cache-time';
const OPENROUTER_AUTO_SELECT_KEY = 'openrouter-auto-select-model';

const CACHE_DURATION_MS = 24 * 60 * 60 * 1000; // 24 hours
const OCR_TIMEOUT_MS = 60 * 1000;

const DEFAULT_MODEL_ID = 'minimax/minimax-m3:free';

export interface OpenRouterModel {
  id: string;
  name: string;
  context: number;
  pricing?: { prompt: number; completion: number };
}

export function getOpenRouterApiKey(): string | null {
  try {
    return window.localStorage.getItem(OPENROUTER_API_KEY_KEY);
  } catch {
    return null;
  }
}

export function setOpenRouterApiKey(key: string): void {
  try {
    window.localStorage.setItem(OPENROUTER_API_KEY_KEY, key);
  } catch {
    // localStorage may be unavailable
  }
}

export function clearOpenRouterApiKey(): void {
  try {
    window.localStorage.removeItem(OPENROUTER_API_KEY_KEY);
  } catch {
    // localStorage may be unavailable
  }
}

export function hasOpenRouterApiKey(): boolean {
  return !!getOpenRouterApiKey();
}

export function getSelectedOpenRouterModel(): string {
  try {
    return window.localStorage.getItem(OPENROUTER_SELECTED_MODEL_KEY) || DEFAULT_MODEL_ID;
  } catch {
    return DEFAULT_MODEL_ID;
  }
}

export function setSelectedOpenRouterModel(modelId: string): void {
  try {
    window.localStorage.setItem(OPENROUTER_SELECTED_MODEL_KEY, modelId);
  } catch {
    // localStorage may be unavailable
  }
}

export function getAutoSelectModel(): boolean {
  try {
    return window.localStorage.getItem(OPENROUTER_AUTO_SELECT_KEY) === 'true';
  } catch {
    return false;
  }
}

export function setAutoSelectModel(enabled: boolean): void {
  try {
    window.localStorage.setItem(OPENROUTER_AUTO_SELECT_KEY, String(enabled));
  } catch {
    // localStorage may be unavailable
  }
}

export interface ModelValidationResult {
  valid: boolean;
  reason?: string;
  supportsVision?: boolean;
  name?: string;
}

function supportsTextAndImage(model: { architecture?: { input_modalities?: string[]; output_modalities?: string[] } }): boolean {
  const input = model.architecture?.input_modalities || [];
  const output = model.architecture?.output_modalities || [];
  return input.includes('image') && input.includes('text') && output.includes('text');
}

// Content-safety classifiers (Nemotron Safety/Content Safety, Llama Guard, ...)
// accept images but reply with labels like "User Safety: safe", not OCR text.
function isSafetyModel(model: { id: string; name?: string }): boolean {
  return /safety|guard|moderation/i.test(`${model.id} ${model.name ?? ''}`);
}

export function isFreeModel(model: { pricing?: Record<string, unknown> }): boolean {
  // Pricing values come back as strings (e.g. "0"); reject if any pricing
  // field (image, image_output, web_search, etc.) is non-zero. Missing or
  // empty pricing tells us nothing, so don't assume free.
  const values = Object.values(model.pricing || {});
  return values.length > 0 && values.every((v) => Number(v) === 0);
}

// Looks up the model id against OpenRouter's live catalog (the source of truth
// for valid ids) rather than maintaining our own list.
export async function validateOpenRouterModel(apiKey: string, modelId: string): Promise<ModelValidationResult> {
  const id = modelId.trim();
  if (!id) {
    return { valid: false, reason: 'Enter a model ID' };
  }

  try {
    const response = await fetch(OPENROUTER_MODELS_URL, {
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'HTTP-Referer': window.location.origin,
        'X-Title': 'Breadcrumb',
      },
    });

    if (!response.ok) {
      return { valid: false, reason: `Could not verify (HTTP ${response.status})` };
    }

    const data = await response.json();
    const match = (data.data || []).find((m: { id: string }) => m.id === id);

    if (!match) {
      return { valid: false, reason: 'Model not found on OpenRouter' };
    }

    if (isSafetyModel(match)) {
      return { valid: false, name: match.name || match.id, reason: 'Content-safety models cannot read text from images' };
    }

    const supportsVision = supportsTextAndImage(match);

    return {
      valid: supportsVision,
      supportsVision,
      name: match.name || match.id,
      reason: supportsVision ? undefined : 'Model exists but does not support text+image',
    };
  } catch {
    return { valid: false, reason: 'Network error while verifying model' };
  }
}

async function fetchModelsFromOpenRouter(apiKey: string): Promise<OpenRouterModel[]> {
  try {
    const response = await fetch(OPENROUTER_MODELS_URL, {
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'HTTP-Referer': window.location.origin,
        'X-Title': 'Breadcrumb',
      },
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch models: ${response.status}`);
    }

    const data = await response.json();
    const models: OpenRouterModel[] = [];

    for (const model of data.data || []) {
      if (isFreeModel(model) && supportsTextAndImage(model) && !isSafetyModel(model)) {
        models.push({
          id: model.id,
          name: model.name || model.id,
          context: model.context_length || 4096,
          pricing: model.pricing,
        });
      }
    }

    return models;
  } catch (error) {
    console.warn('Failed to fetch OpenRouter models:', error);
    return [];
  }
}

export async function getAvailableOpenRouterModels(apiKey: string, forceRefresh = false): Promise<OpenRouterModel[]> {
  // Check cache first
  if (!forceRefresh) {
    try {
      const cached = window.localStorage.getItem(OPENROUTER_CACHED_MODELS_KEY);
      const cacheTime = window.localStorage.getItem(OPENROUTER_MODELS_CACHE_TIME_KEY);

      if (cached && cacheTime) {
        const age = Date.now() - parseInt(cacheTime);
        if (age < CACHE_DURATION_MS) {
          // Re-filter: caches written before the safety filter may contain them.
          return (JSON.parse(cached) as OpenRouterModel[]).filter((m) => !isSafetyModel(m));
        }
      }
    } catch {
      // Ignore cache errors
    }
  }

  // Fetch fresh models
  const models = await fetchModelsFromOpenRouter(apiKey);

  // Only cache a list that genuinely came back, so one failed fetch can't
  // pin the app to a stale list for 24 hours.
  if (models.length > 0) {
    try {
      window.localStorage.setItem(OPENROUTER_CACHED_MODELS_KEY, JSON.stringify(models));
      window.localStorage.setItem(OPENROUTER_MODELS_CACHE_TIME_KEY, Date.now().toString());
    } catch {
      // Ignore cache errors
    }
  }

  return models;
}

const GROCERY_PROMPT = `Extract all grocery/shopping items from this list image. 

Return ONLY a JSON array of objects with this exact format:
[{"item": "item name", "quantity": 1}]

Rules:
- Include quantities if shown (e.g., "2 milk" becomes {"item": "milk", "quantity": 2})
- If no quantity is shown, use quantity: 1
- Clean up the item names (remove bullets, checkboxes, prices)
- Skip titles, headers, and non-item text
- If you can't identify any items, return an empty array: []
- Do NOT include markdown, code fences, or explanations - only the JSON array`;

export interface ExtractedItem {
  item: string;
  quantity: number;
}

// Callers (auto-select) need to tell account-level failures from model-level
// ones, so the HTTP status rides along on the Error.
function apiError(message: string, status: number): Error {
  return Object.assign(new Error(message), { status });
}

export async function extractGroceryItemsWithOpenRouter(
  imageDataUrl: string,
  modelId?: string
): Promise<ExtractedItem[]> {
  const apiKey = getOpenRouterApiKey();
  if (!apiKey) {
    throw new Error('OpenRouter API key not configured');
  }

  const model = modelId || getSelectedOpenRouterModel();
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), OCR_TIMEOUT_MS);

  try {
    const response = await fetch(OPENROUTER_API_URL, {
      method: 'POST',
      signal: controller.signal,
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': window.location.origin,
        'X-Title': 'Breadcrumb',
      },
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
        max_tokens: 1024,
        temperature: 0.1,
      }),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      const errorMessage = errorData.error?.message || `HTTP ${response.status}`;
      
      if (response.status === 401) {
        throw apiError('Invalid API key. Please check your OpenRouter API key.', 401);
      }
      if (response.status === 429) {
        throw apiError('Rate limit exceeded. Please try again in a moment.', 429);
      }
      if (response.status === 402) {
        throw apiError('Insufficient credits. Please add credits to your OpenRouter account.', 402);
      }

      throw apiError(`OpenRouter API error: ${errorMessage}`, response.status);
    }

    const data = await response.json();

    const content = data.choices?.[0]?.message?.content;
    if (!content) {
      throw new Error('No response from model');
    }

    // Parse the JSON response
    const items = parseItemsFromResponse(content);

    return items;
  } catch (error) {
    if ((error as { name?: string })?.name === 'AbortError') {
      throw new Error('Request timed out. The model took too long to respond.');
    }
    if (error instanceof Error) {
      throw error;
    }
    throw new Error('Failed to connect to OpenRouter. Please check your internet connection.');
  } finally {
    clearTimeout(timeoutId);
  }
}

// Tries free models from the top of the list until one succeeds, then
// remembers it as the default. If every model in the current list fails,
// refreshes the list from OpenRouter once and retries from the top.
export async function extractGroceryItemsWithAutoSelect(
  imageDataUrl: string,
): Promise<ExtractedItem[]> {
  const apiKey = getOpenRouterApiKey();
  if (!apiKey) {
    throw new Error('OpenRouter API key not configured');
  }

  let lastError: Error | null = null;

  for (let attempt = 0; attempt < 2; attempt++) {
    const models = await getAvailableOpenRouterModels(apiKey, attempt > 0);

    for (const model of models) {
      try {
        const items = await extractGroceryItemsWithOpenRouter(imageDataUrl, model.id);
        setSelectedOpenRouterModel(model.id);
        return items;
      } catch (error) {
        // 401/402 are account-level: no other model can succeed, so stop now.
        const status = (error as { status?: number })?.status;
        if (status === 401 || status === 402) {
          throw error;
        }
        lastError = error instanceof Error ? error : new Error(String(error));
      }
    }
  }

  throw lastError ?? new Error(
    'Could not load free vision models from OpenRouter. Check your internet connection, or pick a model manually in Settings.'
  );
}

export function parseItemsFromResponse(content: string): ExtractedItem[] {
  try {
    // Try to extract JSON from the response
    let jsonStr = content.trim();
    
    // Remove markdown code fences if present
    jsonStr = jsonStr.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '');
    
    // Try to find JSON array in the response
    const arrayMatch = jsonStr.match(/\[[\s\S]*\]/);
    if (arrayMatch) {
      jsonStr = arrayMatch[0];
    }

    const parsed = JSON.parse(jsonStr);
    
    if (!Array.isArray(parsed)) {
      console.warn('OpenRouter response is not an array:', parsed);
      return [];
    }

    const items: ExtractedItem[] = [];
    
    for (const item of parsed) {
      if (typeof item === 'string' && item.trim()) {
        items.push({ item: item.trim(), quantity: 1 });
      } else if (typeof item === 'object' && item !== null) {
        const itemName = item.item || item.name || item.text;
        const quantity = Number(item.quantity || item.qty || item.count || 1) || 1;
        
        if (itemName && typeof itemName === 'string') {
          items.push({ item: itemName.trim(), quantity });
        }
      }
    }

    return items;
  } catch (parseError) {
    console.warn('Failed to parse OpenRouter response:', content, parseError);
    
    // Fallback: try to extract items from plain text
    const lines = content
      .split(/\r?\n/)
      .map(line => line.trim())
      .filter(line => line.length > 0 && !line.startsWith('{') && !line.startsWith('[') && !line.startsWith('```'));
    
    return lines.slice(0, 20).map(line => ({ item: line, quantity: 1 })); // Limit to 20 items as safety measure
  }
}