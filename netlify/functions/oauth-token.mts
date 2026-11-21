/**
 * Access-token refresh for a paired device.
 *
 * A paired tablet holds the user's own refresh token and calls this to turn it
 * into an access token, because Google will not refresh a Web client's token
 * without the client secret. Nothing is stored here: the refresh token comes in
 * on the request and only the short-lived access token goes back.
 *
 * A refused refresh is reported verbatim (`invalid_grant`) so the app can say
 * "pair this device again" instead of showing a generic sync failure — Google
 * expires refresh tokens after seven days while the OAuth app is in Testing.
 */

export const config = { path: '/api/oauth/token' };

const TOKEN_ENDPOINT = 'https://oauth2.googleapis.com/token';
const MAX_REFRESHES = 120;
const WINDOW_MS = 10 * 60 * 1000;

const calls = new Map<string, { count: number; resetAt: number }>();

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

function clientIp(request: Request): string {
  return (
    request.headers.get('x-nf-client-connection-ip') ||
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    'unknown'
  );
}

function withinBudget(ip: string, now: number): boolean {
  const entry = calls.get(ip);
  if (!entry || entry.resetAt <= now) {
    calls.set(ip, { count: 1, resetAt: now + WINDOW_MS });
    return true;
  }
  entry.count += 1;
  return entry.count <= MAX_REFRESHES;
}

export async function refreshAccessToken(
  refreshToken: string,
  clientId: string,
  clientSecret: string,
  fetchImpl: typeof fetch = fetch
): Promise<{ ok: true; accessToken: string; expiresIn: number } | { ok: false; error: string; status: number }> {
  const form = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    refresh_token: refreshToken,
    grant_type: 'refresh_token',
  });

  try {
    const response = await fetchImpl(TOKEN_ENDPOINT, {
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
      return {
        ok: false,
        error: body.error_description || body.error || `Google refused the refresh (${response.status})`,
        // 401 so the app can distinguish "pair again" from a transient failure.
        status: body.error === 'invalid_grant' || response.status === 400 ? 401 : 502,
      };
    }

    return {
      ok: true,
      accessToken: body.access_token,
      expiresIn: Number.isFinite(body.expires_in) ? Number(body.expires_in) : 3600,
    };
  } catch {
    return { ok: false, error: 'Could not reach Google', status: 502 };
  }
}

export default async function handler(request: Request): Promise<Response> {
  if (request.method !== 'POST') return json({ ok: false, error: 'Method not allowed' }, 405);

  const clientId = readEnvVar('GOOGLE_CLIENT_ID');
  const clientSecret = readEnvVar('GOOGLE_CLIENT_SECRET');
  if (!clientId || !clientSecret) {
    return json({ ok: false, error: 'Device pairing is not configured on this deployment' }, 503);
  }

  if (!withinBudget(clientIp(request), Date.now())) {
    return json({ ok: false, error: 'Too many refresh attempts — wait a few minutes' }, 429);
  }

  let refreshToken = '';
  try {
    const body = (await request.json()) as { refreshToken?: unknown };
    refreshToken = typeof body.refreshToken === 'string' ? body.refreshToken : '';
  } catch {
    return json({ ok: false, error: 'Malformed request' }, 400);
  }
  if (!refreshToken) return json({ ok: false, error: 'refreshToken is required' }, 400);

  const result = await refreshAccessToken(refreshToken, clientId, clientSecret);
  if (!result.ok) return json({ ok: false, error: result.error }, result.status);
  return json({ ok: true, accessToken: result.accessToken, expiresIn: result.expiresIn });
}
