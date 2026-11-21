import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  PAIRED_SESSION_KEY,
  PairedAuthError,
  claimPairingCode,
  clearPairedSession,
  getPairedAccessToken,
  getPairedSession,
  setPairedSession,
} from '@/lib/paired-auth';

const realFetch = globalThis.fetch;

function okToken(accessToken = 'at-1', expiresIn = 3599): Response {
  return new Response(JSON.stringify({ ok: true, accessToken, expiresIn }), { status: 200 });
}

describe('paired session', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  afterEach(() => {
    globalThis.fetch = realFetch;
    window.localStorage.clear();
    vi.restoreAllMocks();
  });

  it('round-trips a refresh token and its sheet', () => {
    setPairedSession({ refreshToken: '1//refresh', sheetId: 'sheet-1', sheetName: 'Groceries' });
    expect(getPairedSession()).toMatchObject({
      refreshToken: '1//refresh',
      sheetId: 'sheet-1',
      sheetName: 'Groceries',
    });
  });

  it('clears cleanly, including the cached access token', async () => {
    setPairedSession({ refreshToken: '1//refresh' });
    globalThis.fetch = vi.fn(() => Promise.resolve(okToken())) as unknown as typeof fetch;
    await getPairedAccessToken();
    clearPairedSession();
    expect(getPairedSession()).toBeNull();
  });

  it('ignores a malformed record', () => {
    window.localStorage.setItem(PAIRED_SESSION_KEY, '{"refreshToken":42}');
    expect(getPairedSession()).toBeNull();
  });
});

describe('paired access tokens', () => {
  beforeEach(() => {
    window.localStorage.clear();
    setPairedSession({ refreshToken: '1//refresh' });
  });

  afterEach(() => {
    globalThis.fetch = realFetch;
    window.localStorage.clear();
    vi.restoreAllMocks();
  });

  it('exchanges the refresh token for an access token and caches it', async () => {
    const fetchMock = vi.fn(() => Promise.resolve(okToken('at-9')));
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    await expect(getPairedAccessToken()).resolves.toMatchObject({ accessToken: 'at-9' });
    await getPairedAccessToken();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('refreshes again once the cached token is inside the skew window', async () => {
    const fetchMock = vi.fn(() => Promise.resolve(okToken('at-1', 100)));
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    await getPairedAccessToken();
    // 100s lifetime minus a 120s skew means it is already considered stale.
    await getPairedAccessToken();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('honours forceRefresh', async () => {
    const fetchMock = vi.fn(() => Promise.resolve(okToken()));
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    await getPairedAccessToken();
    await getPairedAccessToken({ forceRefresh: true });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('turns a refused refresh into PairedAuthError and forgets the session', async () => {
    globalThis.fetch = vi.fn(() =>
      Promise.resolve(new Response(JSON.stringify({ ok: false, error: 'Token has been expired or revoked.' }), { status: 401 }))
    ) as unknown as typeof fetch;

    await expect(getPairedAccessToken()).rejects.toBeInstanceOf(PairedAuthError);
    expect(getPairedSession()).toBeNull();
  });

  it('treats a transport failure as retryable, not as a lost pairing', async () => {
    globalThis.fetch = vi.fn(() => Promise.reject(new TypeError('offline'))) as unknown as typeof fetch;
    await expect(getPairedAccessToken()).rejects.toThrow(/reach the sync server/i);
    expect(getPairedSession()).not.toBeNull();
  });

  it('refuses to refresh when the device is not paired', async () => {
    clearPairedSession();
    await expect(getPairedAccessToken()).rejects.toBeInstanceOf(PairedAuthError);
  });
});

describe('claiming a pairing code', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  afterEach(() => {
    globalThis.fetch = realFetch;
    window.localStorage.clear();
    vi.restoreAllMocks();
  });

  it('stores the session the server hands back', async () => {
    globalThis.fetch = vi.fn(() =>
      Promise.resolve(
        new Response(
          JSON.stringify({ ok: true, refreshToken: '1//claimed', sheetId: 'sheet-7', sheetName: 'Groceries' }),
          { status: 200 }
        )
      )
    ) as unknown as typeof fetch;

    const result = await claimPairingCode('ABCD-EFGH');
    expect(result.ok).toBe(true);
    expect(getPairedSession()).toMatchObject({ refreshToken: '1//claimed', sheetId: 'sheet-7' });
  });

  it('reports an expired or used code', async () => {
    globalThis.fetch = vi.fn(() =>
      Promise.resolve(new Response(JSON.stringify({ ok: false, error: 'That code expired — generate a new one' }), { status: 410 }))
    ) as unknown as typeof fetch;

    const result = await claimPairingCode('ABCD-EFGH');
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/expired/i);
    expect(getPairedSession()).toBeNull();
  });

  it('does not call the server for an empty code', async () => {
    const fetchMock = vi.fn();
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    const result = await claimPairingCode('   ');
    expect(result.ok).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
