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

// Default free models that support vision (fallback if API fetch fails)
const DEFAULT_FREE_VISION_MODELS = [
  { id: 'minimax/minimax-m3:free', name: 'MiniMax M3 (Free)', context: 32768 },
  { id: 'google/gemma-3-27b-it:free', name: 'Gemma 3 27B (Free)', context: 8192 },
  { id: 'microsoft/phi-3-vision-128k-instruct:free', name: 'Phi-3 Vision 128K (Free)', context: 131072 },
  { id: 'qwen/qwen2.5-vl-32b-instruct:free', name: 'Qwen 2.5 VL 32B (Free)', context: 32768 },
  { id: 'meta-llama/llama-3.2-11b-vision-instruct:free', name: 'Llama 3.2 11B Vision (Free)', context: 131072 },
  { id: 'google/gemini-flash-1.5-8b:free', name: 'Gemini Flash 1.5 8B (Free)', context: 1048576 },
];

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
    return window.localStorage.getItem(OPENROUTER_SELECTED_MODEL_KEY) || 'minimax/minimax-m3:free';
  } catch {
    return 'minimax/minimax-m3:free';
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
export function isSafetyModel(model: { id: string; name?: string }): boolean {
  return /safety|guard|moderation/i.test(`${model.id} ${model.name ?? ''}`);
}

function isFreeModel(model: { pricing?: Record<string, unknown> }): boolean {
  // Pricing values come back as strings (e.g. "0"); reject if any pricing
  // field (image, image_output, web_search, etc.) is non-zero.
  const pricing = model.pricing || {};
  return Object.values(pricing).every((v) => Number(v) === 0);
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
  let models = await fetchModelsFromOpenRouter(apiKey);

  // Fallback to defaults if API fails or returns no models
  if (models.length === 0) {
    models = DEFAULT_FREE_VISION_MODELS;
  }

  // Cache the results
  try {
    window.localStorage.setItem(OPENROUTER_CACHED_MODELS_KEY, JSON.stringify(models));
    window.localStorage.setItem(OPENROUTER_MODELS_CACHE_TIME_KEY, Date.now().toString());
  } catch {
    // Ignore cache errors
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

export async function extractGroceryItemsWithOpenRouter(
  imageDataUrl: string,
  onProgress?: (status: string, progress: number) => void,
  modelId?: string
): Promise<string[]> {
  const apiKey = getOpenRouterApiKey();
  if (!apiKey) {
    throw new Error('OpenRouter API key not configured');
  }

  const model = modelId || getSelectedOpenRouterModel();

  onProgress?.('Connecting to cloud OCR...', 10);

  try {
    const response = await fetch(OPENROUTER_API_URL, {
      method: 'POST',
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

    onProgress?.('Processing image...', 50);

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      const errorMessage = errorData.error?.message || `HTTP ${response.status}`;
      
      if (response.status === 401) {
        throw new Error('Invalid API key. Please check your OpenRouter API key.');
      }
      if (response.status === 429) {
        throw new Error('Rate limit exceeded. Please try again in a moment.');
      }
      if (response.status === 402) {
        throw new Error('Insufficient credits. Please add credits to your OpenRouter account.');
      }
      
      throw new Error(`OpenRouter API error: ${errorMessage}`);
    }

    const data = await response.json();
    onProgress?.('Parsing results...', 90);

    const content = data.choices?.[0]?.message?.content;
    if (!content) {
      throw new Error('No response from model');
    }

    // Parse the JSON response
    const items = parseItemsFromResponse(content);
    onProgress?.('Complete', 100);

    return items;
  } catch (error) {
    if (error instanceof Error) {
      throw error;
    }
    throw new Error('Failed to connect to OpenRouter. Please check your internet connection.');
  }
}

// Tries free models from the top of the list until one succeeds, then
// remembers it as the default. If every model in the current list fails,
// refreshes the list from OpenRouter once and retries from the top.
export async function extractGroceryItemsWithAutoSelect(
  imageDataUrl: string,
  onProgress?: (status: string, progress: number) => void,
): Promise<string[]> {
  const apiKey = getOpenRouterApiKey();
  if (!apiKey) {
    throw new Error('OpenRouter API key not configured');
  }

  let lastError: Error = new Error('No free models available');

  for (let attempt = 0; attempt < 2; attempt++) {
    const models = await getAvailableOpenRouterModels(apiKey, attempt > 0);

    for (const model of models) {
      try {
        const items = await extractGroceryItemsWithOpenRouter(imageDataUrl, onProgress, model.id);
        setSelectedOpenRouterModel(model.id);
        return items;
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
      }
    }
  }

  throw lastError;
}

function parseItemsFromResponse(content: string): string[] {
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

    const items: string[] = [];
    
    for (const item of parsed) {
      if (typeof item === 'string' && item.trim()) {
        items.push(item.trim());
      } else if (typeof item === 'object' && item !== null) {
        const itemName = item.item || item.name || item.text;
        const quantity = item.quantity || item.qty || item.count || 1;
        
        if (itemName && typeof itemName === 'string') {
          const cleanName = itemName.trim();
          if (quantity > 1) {
            items.push(`${cleanName} x${quantity}`);
          } else {
            items.push(cleanName);
          }
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
    
    return lines.slice(0, 20); // Limit to 20 items as safety measure
  }
}