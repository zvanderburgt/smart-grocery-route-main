import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

type GlobalWithProcess = { process?: { env: Record<string, string | undefined> } };

function env(): Record<string, string | undefined> {
  const holder = globalThis as unknown as GlobalWithProcess;
  if (!holder.process) holder.process = { env: {} };
  return holder.process.env;
}

interface PairingRecord {
  refreshToken: string;
  sheetId?: string;
  sheetName?: string;
  expiresAt: number;
}

/** In-memory stand-in for the Blobs store, with the same delete-on-read shape. */
function memoryStore() {
  const data = new Map<string, PairingRecord>();
  return {
    data,
    async set(key: string, value: PairingRecord) {
      data.set(key, value);
    },
    async take(key: string) {
      const value = data.get(key) ?? null;
      data.delete(key);
      return value;
    },
  };
}

async function handlers() {
  return {
    pair: (await import('../../netlify/functions/oauth-pair.mts')) as unknown as {
      makePairHandler: (store: unknown, now?: () => number) => (r: Request) => Promise<Response>;
      mintPairingCode: (random?: () => number) => string;
      normalizePairingCode: (value: string) => string;
    },
    claim: (await import('../../netlify/functions/oauth-claim.mts')) as unknown as {
      makeClaimHandler: (store: unknown, now?: () => number) => (r: Request) => Promise<Response>;
    },
    token: (await import('../../netlify/functions/oauth-token.mts')) as unknown as {
      default: (r: Request) => Promise<Response>;
      refreshAccessToken: (refresh: string, id: string, secret: string, fetchImpl?: typeof fetch) => Promise<unknown>;
    },
  };
}

function post(path: string, body: unknown): Request {
  return new Request(`https://breadcrumbapp.netlify.app${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

const realFetch = globalThis.fetch;

describe('pairing: code → refresh token', () => {
  beforeEach(() => {
    env().GOOGLE_CLIENT_ID = 'client-1';
    env().GOOGLE_CLIENT_SECRET = 'secret-1';
  });

  afterEach(() => {
    delete env().GOOGLE_CLIENT_ID;
    delete env().GOOGLE_CLIENT_SECRET;
    globalThis.fetch = realFetch;
    vi.restoreAllMocks();
  });

  it('refuses to run without the OAuth client credentials', async () => {
    delete env().GOOGLE_CLIENT_SECRET;
    const { pair } = await handlers();
    const handler = pair.makePairHandler(memoryStore());
    const response = await handler(post('/api/oauth/pair', { code: 'c', redirectUri: 'https://x' }));
    expect(response.status).toBe(503);
  });

  it('exchanges the code and returns a short code, never the refresh token', async () => {
    const { pair } = await handlers();
    const store = memoryStore();
    globalThis.fetch = vi.fn(() =>
      Promise.resolve(new Response(JSON.stringify({ refresh_token: '1//long-refresh-token' }), { status: 200 }))
    ) as unknown as typeof fetch;

    const handler = pair.makePairHandler(store);
    const response = await handler(
      post('/api/oauth/pair', { code: 'auth-code', redirectUri: 'https://breadcrumbapp.netlify.app', sheetId: 'sheet-1' })
    );

    expect(response.status).toBe(200);
    const body = (await response.json()) as { ok: boolean; code: string; expiresAt: number };
    expect(body.ok).toBe(true);
    expect(body.code).toMatch(/^[A-Z2-9]{4}-[A-Z2-9]{4}$/);
    expect(JSON.stringify(body)).not.toContain('long-refresh-token');
    expect(store.data.get(pair.normalizePairingCode(body.code))).toMatchObject({
      refreshToken: '1//long-refresh-token',
      sheetId: 'sheet-1',
    });
  });

  it('surfaces Google refusing the code (e.g. redirect_uri_mismatch)', async () => {
    const { pair } = await handlers();
    globalThis.fetch = vi.fn(() =>
      Promise.resolve(
        new Response(JSON.stringify({ error: 'invalid_grant', error_description: 'Bad Request' }), { status: 400 })
      )
    ) as unknown as typeof fetch;

    const response = await pair.makePairHandler(memoryStore())(
      post('/api/oauth/pair', { code: 'auth-code', redirectUri: 'https://breadcrumbapp.netlify.app' })
    );
    expect(response.status).toBe(400);
    expect(JSON.stringify(await response.json())).toContain('Bad Request');
  });

  it('only answers POST', async () => {
    const { pair } = await handlers();
    const response = await pair.makePairHandler(memoryStore())(
      new Request('https://breadcrumbapp.netlify.app/api/oauth/pair')
    );
    expect(response.status).toBe(405);
  });

  it('mints codes from an unambiguous alphabet and normalises typed input', async () => {
    const { pair } = await handlers();
    for (let i = 0; i < 50; i += 1) {
      expect(pair.mintPairingCode()).toMatch(/^[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}$/);
    }
    expect(pair.normalizePairingCode(' abcd-efgh ')).toBe('ABCDEFGH');
  });
});

describe('pairing: redeeming the code', () => {
  it('is single use', async () => {
    const { pair, claim } = await handlers();
    const store = memoryStore();
    await store.set('ABCDEFGH', { refreshToken: '1//r', sheetId: 's', expiresAt: Date.now() + 60_000 });

    const claimHandler = claim.makeClaimHandler(store);
    const first = await claimHandler(post('/api/oauth/claim', { code: 'abcd-efgh' }));
    expect(first.status).toBe(200);
    expect(await first.json()).toMatchObject({ ok: true, refreshToken: '1//r', sheetId: 's' });

    const second = await claimHandler(post('/api/oauth/claim', { code: 'ABCD-EFGH' }));
    expect(second.status).toBe(404);
    // Keeps the pair import used so the fixture above is not optimised away.
    expect(typeof pair.mintPairingCode).toBe('function');
  });

  it('rejects an expired code', async () => {
    const { claim } = await handlers();
    const store = memoryStore();
    await store.set('ABCDEFGH', { refreshToken: '1//r', expiresAt: Date.now() - 1 });

    const response = await claim.makeClaimHandler(store)(post('/api/oauth/claim', { code: 'ABCD-EFGH' }));
    expect(response.status).toBe(410);
  });

  it('rejects an unknown code', async () => {
    const { claim } = await handlers();
    const response = await claim.makeClaimHandler(memoryStore())(post('/api/oauth/claim', { code: 'ZZZZ-ZZZZ' }));
    expect(response.status).toBe(404);
  });
});

describe('paired device token refresh', () => {
  beforeEach(() => {
    env().GOOGLE_CLIENT_ID = 'client-1';
    env().GOOGLE_CLIENT_SECRET = 'secret-1';
  });

  afterEach(() => {
    delete env().GOOGLE_CLIENT_ID;
    delete env().GOOGLE_CLIENT_SECRET;
    globalThis.fetch = realFetch;
    vi.resetModules();
    vi.restoreAllMocks();
  });

  it('returns only an access token', async () => {
    const { token } = await handlers();
    globalThis.fetch = vi.fn(() =>
      Promise.resolve(new Response(JSON.stringify({ access_token: 'at-1', expires_in: 3599 }), { status: 200 }))
    ) as unknown as typeof fetch;

    const response = await token.default(post('/api/oauth/token', { refreshToken: '1//r' }));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true, accessToken: 'at-1', expiresIn: 3599 });
  });

  it('maps invalid_grant to 401 so the app asks to pair again', async () => {
    const { token } = await handlers();
    globalThis.fetch = vi.fn(() =>
      Promise.resolve(
        new Response(JSON.stringify({ error: 'invalid_grant', error_description: 'Token has been expired or revoked.' }), {
          status: 400,
        })
      )
    ) as unknown as typeof fetch;

    const response = await token.default(post('/api/oauth/token', { refreshToken: '1//r' }));
    expect(response.status).toBe(401);
    expect(JSON.stringify(await response.json())).toContain('expired or revoked');
  });

  it('requires the refresh token', async () => {
    const { token } = await handlers();
    const response = await token.default(post('/api/oauth/token', {}));
    expect(response.status).toBe(400);
  });

  it('is unavailable without client credentials', async () => {
    delete env().GOOGLE_CLIENT_SECRET;
    const { token } = await handlers();
    const response = await token.default(post('/api/oauth/token', { refreshToken: '1//r' }));
    expect(response.status).toBe(503);
  });
});
