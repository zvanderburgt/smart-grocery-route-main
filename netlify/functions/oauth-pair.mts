/**
 * Step 1 of device pairing: turn an authorization code into a refresh token,
 * then hand back a short code the other device can type.
 *
 * Why the server touches this at all: Google refuses a token exchange from a
 * public client ("client_secret is missing"), and PKCE does not exempt a Web
 * client. So the code is exchanged here, where the secret already lives, and
 * the long-lived refresh token is stored for ten minutes against a typed code
 * instead of being shown to a human.
 *
 * The response never contains the refresh token — only the short code.
 *
 * Env: GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET.
 */

export const config = { path: '/api/oauth/pair' };

const TOKEN_ENDPOINT = 'https://oauth2.googleapis.com/token';
const PAIRING_TTL_MS = 10 * 60 * 1000;
/** No 0/O/1/I: this gets typed on a tablet keyboard. */
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

export interface PairingRecord {
  refreshToken: string;
  sheetId?: string;
  sheetName?: string;
  expiresAt: number;
}

export interface PairingStore {
  set(key: string, value: PairingRecord): Promise<void>;
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
  });
}

function readEnvVar(name: string): string {
  // Netlify injects env vars into process.env at runtime. Typed locally because
  // tsconfig includes only src/ and has no node types.
  const runtime = globalThis as { process?: { env?: Record<string, string | undefined> } };
  return (runtime.process?.env?.[name] || '').trim();
}

/** Random pairing code, formatted `XXXX-XXXX` for reading off a screen. */
export function mintPairingCode(random: () => number = cryptoRandom): string {
  const bytes = new Uint8Array(8);
  for (let i = 0; i < bytes.length; i += 1) {
    bytes[i] = Math.floor(random() * 256) % ALPHABET.length;
  }
  const raw = Array.from(bytes, (byte) => ALPHABET[byte]).join('');
  return `${raw.slice(0, 4)}-${raw.slice(4)}`;
}

/** Strip the dash and case so `abcd efgh` typed on a tablet still matches. */
export function normalizePairingCode(value: string): string {
  return value.toUpperCase().replace(/[^A-Z0-9]/g, '');
}

function cryptoRandom(): number {
  const buffer = new Uint32Array(1);
  crypto.getRandomValues(buffer);
  return buffer[0] / 2 ** 32;
}

export function makePairHandler(store: PairingStore, now: () => number = Date.now) {
  return async function handler(request: Request): Promise<Response> {
    if (request.method !== 'POST') return json({ ok: false, error: 'Method not allowed' }, 405);

    const clientId = readEnvVar('GOOGLE_CLIENT_ID');
    const clientSecret = readEnvVar('GOOGLE_CLIENT_SECRET');
    if (!clientId || !clientSecret) {
      return json({ ok: false, error: 'Pairing is not configured on this deployment' }, 503);
    }

    let body: {
      code?: unknown;
      redirectUri?: unknown;
      sheetId?: unknown;
      sheetName?: unknown;
    };
    try {
      body = (await request.json()) as typeof body;
    } catch {
      return json({ ok: false, error: 'Malformed request' }, 400);
    }

    const code = typeof body.code === 'string' ? body.code : '';
    const redirectUri = typeof body.redirectUri === 'string' ? body.redirectUri : '';
    if (!code || !redirectUri) return json({ ok: false, error: 'code and redirectUri are required' }, 400);

    const form = new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
      grant_type: 'authorization_code',
    });

    let tokenBody: {
      refresh_token?: string;
      error?: string;
      error_description?: string;
    };
    try {
      const response = await fetch(TOKEN_ENDPOINT, {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: form.toString(),
      });
      tokenBody = (await response.json()) as typeof tokenBody;
      if (!response.ok || !tokenBody.refresh_token) {
        return json(
          {
            ok: false,
            error: tokenBody.error_description || tokenBody.error || `Google refused the code (${response.status})`,
          },
          400
        );
      }
    } catch {
      return json({ ok: false, error: 'Could not reach Google' }, 502);
    }

    const expiresAt = now() + PAIRING_TTL_MS;
    const pairingCode = mintPairingCode();
    const record: PairingRecord = {
      refreshToken: tokenBody.refresh_token,
      sheetId: typeof body.sheetId === 'string' && body.sheetId ? body.sheetId : undefined,
      sheetName: typeof body.sheetName === 'string' && body.sheetName ? body.sheetName : undefined,
      expiresAt,
    };

    try {
      await store.set(normalizePairingCode(pairingCode), record);
    } catch {
      // A missing code store means the second device cannot redeem anything;
      // say so instead of showing a code that is already dead.
      return json({ ok: false, error: 'Could not store the pairing code' }, 503);
    }

    return json({ ok: true, code: pairingCode, expiresAt });
  };
}

/** Blobs-backed store. In the Netlify runtime the store is auto-configured. */
async function blobStore(): Promise<PairingStore> {
  const { getStore } = await import('@netlify/blobs');
  const store = getStore('breadcrumb-pairings');
  return {
    async set(key, value) {
      await store.setJSON(key, value);
    },
  };
}

export default async function handler(request: Request): Promise<Response> {
  let store: PairingStore;
  try {
    store = await blobStore();
  } catch {
    return json({ ok: false, error: 'Pairing storage is unavailable' }, 503);
  }
  return makePairHandler(store)(request);
}
