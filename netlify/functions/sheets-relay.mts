/**
 * Sheets relay as a Netlify Function — the same-origin hop that lets a page
 * with no Google session (an iframe in a dashboard, an Android webview) read
 * and write the grocery sheet.
 *
 * Why this exists: the browser-side flow keeps the OAuth token in
 * sessionStorage, and Google will not run its consent screen inside a frame or
 * hand a webview's browser session back to the app. Moving the credential to
 * the server removes both problems: this function holds a refresh token and
 * calls the Sheets API on the app's behalf.
 *
 * Scope, deliberately narrow:
 *   - only the spreadsheet named by SHEET_ID is reachable, whatever the caller
 *     asks for;
 *   - only GET/POST/PUT, which is everything values/batchUpdate/metadata need;
 *   - cross-site callers are refused via `sec-fetch-site` (a header a page
 *     cannot forge), so the endpoint is not open to other origins.
 *
 * Env (Netlify -> Site configuration -> Environment variables):
 *   SHEET_ID, GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REFRESH_TOKEN
 * Mint the refresh token with /api/relay-setup (see SETUP.md).
 */

export const config = { path: '/api/sheets-relay/*' };

const UPSTREAM_ROOT = 'https://sheets.googleapis.com/';
const TOKEN_ENDPOINT = 'https://oauth2.googleapis.com/token';

/** Values writes use POST (append, batchUpdate) and PUT (values.update). */
const ALLOWED_METHODS = new Set(['GET', 'POST', 'PUT']);

interface RelayEnv {
  sheetId: string;
  clientId: string;
  clientSecret: string;
  refreshToken: string;
}

/** Access tokens for a refresh-token flow last an hour; keep it across warm calls. */
let cachedToken: { value: string; expiresAt: number } | null = null;

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

function readEnv(): RelayEnv | null {
  const sheetId = readEnvVar('SHEET_ID');
  const clientId = readEnvVar('GOOGLE_CLIENT_ID');
  const clientSecret = readEnvVar('GOOGLE_CLIENT_SECRET');
  const refreshToken = readEnvVar('GOOGLE_REFRESH_TOKEN');
  if (!sheetId || !clientId || !clientSecret || !refreshToken) return null;
  return { sheetId, clientId, clientSecret, refreshToken };
}

async function accessToken(env: RelayEnv): Promise<string> {
  if (cachedToken && cachedToken.expiresAt > Date.now() + 30_000) return cachedToken.value;

  const form = new URLSearchParams({
    client_id: env.clientId,
    client_secret: env.clientSecret,
    refresh_token: env.refreshToken,
    grant_type: 'refresh_token',
  });

  const response = await fetch(TOKEN_ENDPOINT, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: form.toString(),
  });

  const body = (await response.json()) as {
    access_token?: string;
    expires_in?: number;
    error?: string;
    error_description?: string;
  };

  if (!response.ok || !body.access_token) {
    const detail = body.error_description || body.error || `HTTP ${response.status}`;
    // `invalid_grant` means the refresh token was revoked or expired: say so in
    // a form the app can show instead of a generic 500.
    throw new Error(`Google token refresh failed: ${detail}`);
  }

  const expiresIn = Number.isFinite(body.expires_in) ? Number(body.expires_in) : 3600;
  cachedToken = { value: body.access_token, expiresAt: Date.now() + expiresIn * 1000 };
  return cachedToken.value;
}

export default async function handler(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const tail = url.pathname.replace(/^\/api\/sheets-relay\/?/, '');
  const env = readEnv();

  if (tail === 'health') {
    // Unauthenticated by design: it answers "is this deployment configured",
    // which the app needs before it decides between relay mode and Google
    // sign-in. It exposes the sheet id because the app has to adopt it.
    if (!env) {
      return json({ ok: false, reason: 'relay not configured' }, 503);
    }
    return json({ ok: true, sheetId: env.sheetId });
  }

  if (!env) return json({ ok: false, reason: 'relay not configured' }, 503);

  // Same-origin guard. Browsers attach sec-fetch-site to every fetch and page
  // scripts cannot set it, so cross-site callers are refused here.
  const site = request.headers.get('sec-fetch-site');
  if (site && site !== 'same-origin' && site !== 'same-site' && site !== 'none') {
    return json({ ok: false, reason: 'cross-site request refused' }, 403);
  }

  if (!ALLOWED_METHODS.has(request.method)) {
    return new Response(JSON.stringify({ error: { message: 'Method not allowed' } }), {
      status: 405,
      headers: { 'content-type': 'application/json' },
    });
  }

  // Path scoping: `v4/spreadsheets/<SHEET_ID>` and anything under it, nothing else.
  const allowed = `v4/spreadsheets/${env.sheetId}`;
  if (tail !== allowed && !tail.startsWith(`${allowed}/`)) {
    return json(
      { error: { message: 'This relay only serves the spreadsheet it was configured with' } },
      403
    );
  }

  let token: string;
  try {
    token = await accessToken(env);
  } catch (error) {
    return json(
      { error: { message: error instanceof Error ? error.message : 'Google token refresh failed' } },
      401
    );
  }

  const target = `${UPSTREAM_ROOT}${tail}${url.search}`;
  const init: RequestInit = {
    method: request.method,
    headers: {
      authorization: `Bearer ${token}`,
      'content-type': request.headers.get('content-type') || 'application/json',
    },
  };
  if (request.method !== 'GET') {
    init.body = await request.text();
  }

  const upstream = await fetch(target, init);
  const text = await upstream.text();

  return new Response(text, {
    status: upstream.status,
    headers: {
      'content-type': upstream.headers.get('content-type') || 'application/json',
      'cache-control': 'no-store',
    },
  });
}
