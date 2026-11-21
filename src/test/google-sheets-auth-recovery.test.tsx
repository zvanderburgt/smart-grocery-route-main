/**
 * Regression cover for the "sign in again every time" report.
 *
 * The old flow decided `signedIn` once per page load from sessionStorage and
 * then gated every sync on it, so an empty sessionStorage (reopened PWA, new
 * tab) or a lapsed hourly token left the app waiting for a consent screen
 * nobody had been told to open. When a sync did hit the expiry it dropped the
 * session silently - no toast, no retry - and the pending push sat in
 * localStorage until the user found Connect in Settings.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';

const engine = vi.hoisted(() => ({
  sync: vi.fn(),
  ensureSheets: vi.fn(),
}));

vi.mock('@/lib/sync-engine', () => ({
  createSyncEngine: () => ({ sync: engine.sync, ensureSheets: engine.ensureSheets }),
}));

vi.mock('sonner', () => {
  const toast = Object.assign(vi.fn(), {
    error: vi.fn(),
    success: vi.fn(),
    info: vi.fn(),
  });
  return { toast };
});

vi.mock('@/lib/google-auth', () => {
  class AuthRequiredError extends Error {
    constructor(message = 'Google sign-in required') {
      super(message);
      this.name = 'AuthRequiredError';
    }
  }

  return {
    AuthRequiredError,
    initGoogleAuth: vi.fn(() => Promise.resolve()),
    isInitialized: vi.fn(() => true),
    isSignedIn: vi.fn(() => false),
    trySilentSignIn: vi.fn(() => Promise.resolve(false)),
    getAccessToken: vi.fn(() => Promise.resolve('token')),
    handleOAuthRedirect: vi.fn(() => null),
    handleOAuthCodeRedirect: vi.fn(() => null),
    redirectToGoogleOAuth: vi.fn(),
    redirectToGoogleOAuthCode: vi.fn(),
    signOut: vi.fn(),
  };
});

import { toast } from 'sonner';
import { AuthRequiredError, trySilentSignIn } from '@/lib/google-auth';
import {
  readPendingDeletions,
  useGoogleSheetsSync,
  writePendingDeletions,
} from '@/hooks/use-google-sheets-sync';
import type { GroceryItem } from '@/lib/types';
import { SheetsError } from '@/lib/sheets-api';

const CONFIG_KEY = 'google-sheets-config';

const milk: GroceryItem = { id: 'milk', name: 'Milk', checked: false, addedAt: 100, updatedAt: 100 };

function configureSheet(): void {
  window.localStorage.setItem(
    CONFIG_KEY,
    JSON.stringify({ sheetId: 'sheet-1', sheetName: 'GroceryList', syncEnabled: true })
  );
}

beforeEach(() => {
  window.localStorage.clear();
  window.sessionStorage.clear();
  engine.sync.mockReset();
  engine.ensureSheets.mockReset();
  engine.sync.mockResolvedValue({ items: [] });
  engine.ensureSheets.mockResolvedValue({ itemsTab: true, deletionsTab: true });
  vi.mocked(trySilentSignIn).mockReset();
  vi.mocked(trySilentSignIn).mockResolvedValue(false);
  vi.mocked(toast.error).mockClear();
  vi.stubEnv('VITE_GOOGLE_CLIENT_ID', 'client-123');
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('google sheets auth recovery', () => {
  it('renews from the existing Google session on mount instead of waiting for a click', async () => {
    configureSheet();
    vi.mocked(trySilentSignIn).mockResolvedValue(true);

    const { result } = renderHook(() =>
      useGoogleSheetsSync({ localItems: [milk], onItemsChange: vi.fn(), userEmail: 'me@example.com' })
    );

    await waitFor(() => expect(result.current.isSignedIn).toBe(true));
    expect(trySilentSignIn).toHaveBeenCalled();
    expect(result.current.needsReconnect).toBe(false);
  });

  it('treats a 401 that survives the refresh as a reconnect, not a generic failure', async () => {
    configureSheet();
    vi.mocked(trySilentSignIn).mockResolvedValue(true);
    engine.sync.mockRejectedValueOnce(new SheetsError('Request had invalid authentication credentials', 'auth', 401));

    const { result } = renderHook(() =>
      useGoogleSheetsSync({ localItems: [milk], onItemsChange: vi.fn(), userEmail: 'me@example.com' })
    );

    await waitFor(() => expect(result.current.needsReconnect).toBe(true));
    expect(result.current.syncState.lastError).not.toMatch(/^Sync failed/);
    expect(toast.error).toHaveBeenCalled();
  });

  it('never asks Google for a token when no sheet is configured', async () => {
    const { result } = renderHook(() =>
      useGoogleSheetsSync({ localItems: [milk], onItemsChange: vi.fn(), userEmail: 'me@example.com' })
    );

    await act(async () => {
      await Promise.resolve();
    });

    expect(trySilentSignIn).not.toHaveBeenCalled();
    expect(result.current.isSignedIn).toBe(false);
  });

  it('keeps the pending push and offers one reconnect tap when a sync loses the session', async () => {
    configureSheet();
    vi.mocked(trySilentSignIn).mockResolvedValue(true);
    engine.sync.mockRejectedValueOnce(new AuthRequiredError('Google sign-in expired'));

    const { result } = renderHook(() =>
      useGoogleSheetsSync({ localItems: [milk], onItemsChange: vi.fn(), userEmail: 'me@example.com' })
    );

    await waitFor(() => expect(engine.sync).toHaveBeenCalled());
    await waitFor(() => expect(result.current.needsReconnect).toBe(true));

    // The intent to push survives the failure, so nothing is lost while the
    // user gets a single tap back in.
    writePendingDeletions([{ id: 'milk', deletedAt: Date.now(), deviceId: 'device-1' }]);
    expect(readPendingDeletions()).toHaveLength(1);

    const toastOptions = vi.mocked(toast.error).mock.calls.at(-1)?.[1] as
      | { action?: { label?: string } }
      | undefined;
    expect(toastOptions?.action?.label).toBe('Reconnect');

    await act(async () => {
      const ok = await result.current.reconnect();
      expect(ok).toBe(true);
    });

    await waitFor(() => expect(result.current.needsReconnect).toBe(false));
    expect(readPendingDeletions()).toEqual([]);
  });

  it('reports a failed reconnect instead of dropping back to a silent dead end', async () => {
    configureSheet();
    vi.mocked(trySilentSignIn).mockResolvedValue(true);
    engine.sync.mockRejectedValueOnce(new AuthRequiredError('Google sign-in expired'));

    const { result } = renderHook(() =>
      useGoogleSheetsSync({ localItems: [milk], onItemsChange: vi.fn(), userEmail: 'me@example.com' })
    );

    await waitFor(() => expect(result.current.needsReconnect).toBe(true));

    vi.mocked(trySilentSignIn).mockResolvedValue(false);

    await act(async () => {
      const ok = await result.current.reconnect();
      expect(ok).toBe(false);
    });

    expect(result.current.needsReconnect).toBe(true);
    expect(result.current.syncState.status).toBe('error');
    expect(result.current.error).toMatch(/Connect in Settings/);
  });
});
