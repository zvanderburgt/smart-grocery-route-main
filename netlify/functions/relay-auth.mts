/**
 * Password gate for the relay.
 *
 * Why a password and not Google sign-in: the whole reason the relay exists is
 * that Google will not run its consent screen inside an iframe or hand a
 * webview's answer back to the app. So the gate has to be something the person
 * can type in place — one shared password, verified here.
 *
 * The credential is a **stateless signed token**, not a cookie, because the app
 * is usually embedded in a cross-origin iframe (Home Assistant dashboard) and
 * third-party cookies are blocked by default there. The token is stored in the
 * iframe's own localStorage and sent as `Authorization: Bearer`, which works in
 * frames and partitions.
 *
 * Env: APP_PASSWORD. The signing key is derived from it, so changing the
 * password invalidates every issued token — no extra secret to rotate.
 */

export const config = { path: '/api/auth/login' };

const TOKEN_TTL_MS = 90 * 24 * 60 * 60 * 1000;
/** Wrong-password budget per IP, per window. Keeps a shared password shared. */
const MAX_ATTEMPTS = 8;
const ATTEMPT_WINDOW_MS = 10 * 60 * 1000;

const attempts = new Map<string, { count: number; resetAt: number }>();

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

const encoder = new TextEncoder();

/** base64url without padding, usable for both payload and signature. */
function toBase64Url(bytes: ArrayBuffer | Uint8Array): string {
  const view = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let binary = '';
  for (const byte of view) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/**
 * The HMAC key is the password itself, hashed. Signing with it means the token
 * cannot outlive a password change, which is the only revocation this gate has.
 */
async function signingKey(password: string): Promise<CryptoKey> {
  const digest = await crypto.subtle.digest('SHA-256', encoder.encode(`breadcrumb-relay-v1:${password}`));
  return crypto.subtle.importKey('raw', digest, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
}

async function issueToken(password: string, now = Date.now()): Promise<{ token: string; expiresAt: number }> {
  const expiresAt = now + TOKEN_TTL_MS;
  const payload = toBase64Url(encoder.encode(JSON.stringify({ exp: expiresAt })));
  const key = await signingKey(password);
  const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(payload));
  return { token: `${payload}.${toBase64Url(signature)}`, expiresAt };
}

function clientIp(request: Request): string {
  return (
    request.headers.get('x-nf-client-connection-ip') ||
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    'unknown'
  );
}

function consumeAttempt(ip: string, now = Date.now()): { allowed: boolean; retryAfterMs: number } {
  const entry = attempts.get(ip);
  if (!entry || entry.resetAt <= now) {
    attempts.set(ip, { count: 1, resetAt: now + ATTEMPT_WINDOW_MS });
    return { allowed: true, retryAfterMs: 0 };
  }
  entry.count += 1;
  if (entry.count > MAX_ATTEMPTS) {
    return { allowed: false, retryAfterMs: entry.resetAt - now };
  }
  return { allowed: true, retryAfterMs: 0 };
}

export default async function handler(request: Request): Promise<Response> {
  if (request.method !== 'POST') {
    return json({ ok: false, error: 'Method not allowed' }, 405);
  }

  const password = readEnvVar('APP_PASSWORD');
  if (!password) {
    return json({ ok: false, error: 'Login is not configured on this deployment' }, 503);
  }

  const ip = clientIp(request);
  const budget = consumeAttempt(ip);
  if (!budget.allowed) {
    const minutes = Math.ceil(budget.retryAfterMs / 60000);
    return json({ ok: false, error: `Too many attempts — try again in ${minutes} min` }, 429);
  }

  let submitted = '';
  try {
    const body = (await request.json()) as { password?: unknown };
    submitted = typeof body.password === 'string' ? body.password : '';
  } catch {
    submitted = '';
  }

  // Compare digests rather than the raw strings so the check does not leak
  // length or prefix through timing.
  const [expected, actual] = await Promise.all([
    crypto.subtle.digest('SHA-256', encoder.encode(password)),
    crypto.subtle.digest('SHA-256', encoder.encode(submitted)),
  ]);
  const expectedBytes = new Uint8Array(expected);
  const actualBytes = new Uint8Array(actual);
  let mismatch = expectedBytes.length ^ actualBytes.length;
  for (let i = 0; i < expectedBytes.length; i += 1) {
    mismatch |= expectedBytes[i] ^ (actualBytes[i] ?? 0);
  }

  if (!submitted || mismatch !== 0) {
    return json({ ok: false, error: 'Wrong password' }, 401);
  }

  attempts.delete(ip);
  const { token, expiresAt } = await issueToken(password);
  return json({ ok: true, token, expiresAt });
}
