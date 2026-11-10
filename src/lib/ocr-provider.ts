// Chooses which cloud OCR backend the scanner uses. OpenRouter keeps its
// existing free-model auto-select behaviour; OpenCode routes the same request
// through the OpenCode gateway (see ocr-opencode.ts).
//
// Callers (UnifiedScanDialog, Settings) should import from here rather than
// reaching for a provider module directly, so adding a backend later means
// touching one file.

import {
  extractGroceryItemsWithAutoSelect,
  extractGroceryItemsWithOpenRouter,
  getAutoSelectModel,
  getSelectedOpenRouterModel,
  hasOpenRouterApiKey,
} from './ocr-openrouter';
import {
  extractGroceryItemsWithOpenCode,
  getOpenCodeEndpoint,
  getSelectedOpenCodeModel,
} from './ocr-opencode';
import type { ExtractedItem } from './ocr-shared';

export type OcrProvider = 'openrouter' | 'opencode';

const OCR_PROVIDER_KEY = 'ocr-provider';

export const OCR_PROVIDERS: ReadonlyArray<{ id: OcrProvider; label: string; description: string }> = [
  {
    id: 'openrouter',
    label: 'OpenRouter',
    description: 'Free vision models via OpenRouter. Needs an OpenRouter API key.',
  },
  {
    id: 'opencode',
    label: 'OpenCode',
    description: 'Routes scans through an OpenCode endpoint (relay by default).',
  },
];

export function getOcrProvider(): OcrProvider {
  try {
    const stored = window.localStorage.getItem(OCR_PROVIDER_KEY);
    return stored === 'opencode' ? 'opencode' : 'openrouter';
  } catch {
    return 'openrouter';
  }
}

export function setOcrProvider(provider: OcrProvider): void {
  try {
    window.localStorage.setItem(OCR_PROVIDER_KEY, provider);
  } catch {
    // localStorage may be unavailable
  }
}

export function getOcrProviderLabel(provider: OcrProvider = getOcrProvider()): string {
  return OCR_PROVIDERS.find((entry) => entry.id === provider)?.label ?? 'OpenRouter';
}

// OpenRouter needs a key before a scan can start. OpenCode always has an
// endpoint (the relay default), so it is usable without any local secret —
// a missing key just means the relay is expected to add one.
export function isOcrProviderConfigured(provider: OcrProvider = getOcrProvider()): boolean {
  if (provider === 'opencode') {
    return !!getOpenCodeEndpoint();
  }
  return hasOpenRouterApiKey();
}

export function getActiveOcrModel(): string {
  return getOcrProvider() === 'opencode' ? getSelectedOpenCodeModel() : getSelectedOpenRouterModel();
}

export async function extractGroceryItems(imageDataUrl: string): Promise<ExtractedItem[]> {
  if (getOcrProvider() === 'opencode') {
    return extractGroceryItemsWithOpenCode(imageDataUrl, getSelectedOpenCodeModel());
  }

  return getAutoSelectModel()
    ? extractGroceryItemsWithAutoSelect(imageDataUrl)
    : extractGroceryItemsWithOpenRouter(imageDataUrl, getSelectedOpenRouterModel());
}
