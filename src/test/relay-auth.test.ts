import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { RELAY_TOKEN_KEY, clearRelaySession, getRelayToken, relayLogin, setRelaySession } from '@/lib/relay-auth';

const realFetch = globalThis.fetch;

describe('relay session storage', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  afterEach(() => {
    globalThis.fetch = realFetch;
    window.localStorage.clear();
    vi.restoreAllMocks();
  });

  it('starts empty', () => {
    expect(getRelayToken()).toBe('');
  });

  it('returns a live token', () => {
    setRelaySession({ token: 'abc.def', expiresAt: Date.now() + 60_000 });
    expect(getRelayToken()).toBe('abc.def');
  });

  it('drops an expired token instead of sending it', () => {
    setRelaySession({ token: 'abc.def', expiresAt: Date.now() - 1 });
    expect(getRelayToken()).toBe('');
    expect(window.localStorage.getItem(RELAY_TOKEN_KEY)).toBeNull();
  });

  it('ignores malformed storage', () => {
    window.localStorage.setItem(RELAY_TOKEN_KEY, '{"token":42}');
    expect(getRelayToken()).toBe('');
  });

  it('clears on demand', () => {
    setRelaySession({ token: 'abc.def', expiresAt: Date.now() + 60_000 });
    clearRelaySession();
    expect(getRelayToken()).toBe('');
  });
});

describe('relay sign-in', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  afterEach(() => {
    globalThis.fetch = realFetch;
    vi.restoreAllMocks();
  });

  it('stores the token the server hands back', async () => {
    const expiresAt = Date.now() + 86_400_000;
    globalThis.fetch = vi.fn(() =>
      Promise.resolve(new Response(JSON.stringify({ ok: true, token: 'tok.en', expiresAt }), { status: 200 }))
    ) as unknown as typeof fetch;

    await expect(relayLogin('hunter2')).resolves.toEqual({ ok: true });
    expect(getRelayToken()).toBe('tok.en');
  });

  it('surfaces the server message for a wrong password', async () => {
    globalThis.fetch = vi.fn(() =>
      Promise.resolve(new Response(JSON.stringify({ ok: false, error: 'Wrong password' }), { status: 401 }))
    ) as unknown as typeof fetch;

    await expect(relayLogin('nope')).resolves.toEqual({ ok: false, error: 'Wrong password' });
    expect(getRelayToken()).toBe('');
  });

  it('reports a network failure without throwing', async () => {
    globalThis.fetch = vi.fn(() => Promise.reject(new TypeError('failed to fetch'))) as unknown as typeof fetch;
    const result = await relayLogin('hunter2');
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/connection/i);
  });
});
