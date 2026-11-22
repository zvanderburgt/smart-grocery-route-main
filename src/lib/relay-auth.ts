/**
 * Password gate for relay mode.
 *
 * Google sign-in cannot happen in the places this app is used (iframe panels,
 * Android webviews), so the relay is protected by a shared password instead.
 * `/api/auth/login` verifies it and hands back a signed token; the token lives
 * in this origin's localStorage and travels as a bearer header.
 *
 * localStorage, not a cookie, is deliberate: in a cross-origin iframe (the Home
 * Assistant dashboard card) third-party cookies are blocked by default, but the
 * iframe keeps its own storage partition, so the token survives there and the
 * panel can sync.
 */

export const RELAY_TOKEN_KEY = 'breadcrumb-relay-token';

export interface RelaySession {
  token: string;
  expiresAt: number;
}

export interface RelayLoginResult {
  ok: boolean;
  error?: string;
}

function readSession(): RelaySession | null {
  try {
    const raw = window.localStorage.getItem(RELAY_TOKEN_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<RelaySession> | null;
    if (!parsed || typeof parsed.token !== 'string' || typeof parsed.expiresAt !== 'number') return null;
    return { token: parsed.token, expiresAt: parsed.expiresAt };
  } catch {
    return null;
  }
}

/** The bearer token to send, or '' when there is none (or it has expired). */
export function getRelayToken(now: number = Date.now()): string {
  const session = readSession();
  if (!session) return '';
  if (session.expiresAt <= now) {
    clearRelaySession();
    return '';
  }
  return session.token;
}

export function setRelaySession(session: RelaySession): void {
  try {
    window.localStorage.setItem(RELAY_TOKEN_KEY, JSON.stringify(session));
  } catch {
    // Storage full or blocked: the caller still gets this session in memory
    // through the sync call, it just will not survive a reload.
  }
}

export function clearRelaySession(): void {
  try {
    window.localStorage.removeItem(RELAY_TOKEN_KEY);
  } catch {
    // ignore
  }
}

/**
 * Trade the password for a token. Never throws: a refused password, a missing
 * deployment setting and a dead network all come back as `{ ok: false }` with
 * something worth showing the user.
 */
export async function relayLogin(password: string, endpoint = '/api/auth/login'): Promise<RelayLoginResult> {
  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ password }),
    });

    const body = (await response.json().catch(() => null)) as
      | { ok?: boolean; token?: string; expiresAt?: number; error?: string }
      | null;

    if (!response.ok || !body?.ok || typeof body.token !== 'string') {
      return { ok: false, error: body?.error || `Sign-in failed (${response.status})` };
    }

    setRelaySession({
      token: body.token,
      expiresAt: typeof body.expiresAt === 'number' ? body.expiresAt : Date.now() + 24 * 60 * 60 * 1000,
    });
    return { ok: true };
  } catch {
    return { ok: false, error: 'Could not reach the server — check your connection' };
  }
}
