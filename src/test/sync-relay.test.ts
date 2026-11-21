import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { probeRelay, relayInfoFrom, resetRelayProbe } from '@/lib/sync-relay';

const realFetch = globalThis.fetch;

function stubFetch(impl: (input: unknown, init?: RequestInit) => Promise<Response> | Response): void {
  globalThis.fetch = vi.fn(impl) as unknown as typeof fetch;
}

describe('sync-relay probe', () => {
  beforeEach(() => {
    resetRelayProbe();
  });

  afterEach(() => {
    globalThis.fetch = realFetch;
    resetRelayProbe();
    vi.restoreAllMocks();
  });

  it('accepts only a configured relay payload', () => {
    expect(relayInfoFrom({ ok: true, sheetId: 'abc' })).toEqual({ sheetId: 'abc', sheetName: undefined });
    expect(relayInfoFrom({ ok: true, sheetId: 'abc', sheetName: 'GroceryList' })).toEqual({
      sheetId: 'abc',
      sheetName: 'GroceryList',
    });
    expect(relayInfoFrom({ ok: false, sheetId: 'abc' })).toBeNull();
    expect(relayInfoFrom({ ok: true, sheetId: '' })).toBeNull();
    expect(relayInfoFrom({ sheetId: 'abc' })).toBeNull();
    expect(relayInfoFrom(null)).toBeNull();
    expect(relayInfoFrom('nope')).toBeNull();
  });

  it('reports no relay when the deployment answers 404 (plain static hosting)', async () => {
    stubFetch(() => new Response('Not Found', { status: 404 }));
    await expect(probeRelay()).resolves.toBeNull();
  });

  it('reports no relay when the deployment answers 503 (functions present, env missing)', async () => {
    stubFetch(() => new Response(JSON.stringify({ ok: false, reason: 'relay not configured' }), { status: 503 }));
    await expect(probeRelay()).resolves.toBeNull();
  });

  it('reports no relay when the network fails, without throwing', async () => {
    stubFetch(() => Promise.reject(new TypeError('failed to fetch')));
    await expect(probeRelay()).resolves.toBeNull();
  });

  it('returns the sheet the relay serves and caches the answer', async () => {
    const fetchMock = vi.fn(() =>
      Promise.resolve(new Response(JSON.stringify({ ok: true, sheetId: 'sheet-123' }), { status: 200 }))
    );
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    await expect(probeRelay()).resolves.toEqual({ sheetId: 'sheet-123', sheetName: undefined });
    await probeRelay();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('re-probes after the cache is reset (redeploy / config change)', async () => {
    const fetchMock = vi.fn(() =>
      Promise.resolve(new Response(JSON.stringify({ ok: true, sheetId: 'sheet-123' }), { status: 200 }))
    );
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    await probeRelay();
    resetRelayProbe();
    await probeRelay();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
