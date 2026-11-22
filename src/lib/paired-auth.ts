/**
 * Paired-device auth.
 *
 * A device that has been paired holds the user's own OAuth refresh token — it
 * was handed over by a device that could actually show Google's consent screen,
 * and redeemed with a typed one-time code. From then on this device refreshes
 * access tokens itself (through `/api/oauth/token`, which adds the client
 * secret) and talks to Sheets directly with the user's own credentials.
 *
 * Nothing here depends on a Google session in the browser, which is the whole
 * point: it works inside an Android webview where the consent screen would
 * leave for the system browser.
 */

export const PAIRED_SESSION_KEY = 'breadcrumb-paired-session';
export const PAIRED_ACCESS_KEY = 'breadcrumb-paired-access';

/** Refresh a little early so a token cannot expire mid-request. */
const EXPIRY_SKEW_MS = 120_000;

export interface PairedSession {
  refreshToken: string;
  sheetId?: string;
  sheetName?: string;
  pairedAt: number;
}

interface CachedAccess {
  accessToken: string;
  expiresAt: number;
}

/**
 * A refresh token Google will not honor any more (expired, revoked, or the app
 * is back in Testing). Distinct from a network failure: this one needs pairing
 * again, and saying so is the only useful message.
 */
export class PairedAuthError extends Error {
  constructor(message = 'This device needs to be paired again') {
    super(message);
    this.name = 'PairedAuthError';
  }
}

function readJson<T>(key: string): T | null {
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return null;
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

function writeJson(key: string, value: unknown): void {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Storage blocked or full: the session still works for this page's lifetime.
  }
}

export function getPairedSession(): PairedSession | null {
  const session = readJson<Partial<PairedSession>>(PAIRED_SESSION_KEY);
  if (!session || typeof session.refreshToken !== 'string' || !session.refreshToken) return null;
  return {
    refreshToken: session.refreshToken,
    sheetId: typeof session.sheetId === 'string' ? session.sheetId : undefined,
    sheetName: typeof session.sheetName === 'string' ? session.sheetName : undefined,
    pairedAt: typeof session.pairedAt === 'number' ? session.pairedAt : 0,
  };
}

export function setPairedSession(session: Omit<PairedSession, 'pairedAt'> & { pairedAt?: number }): PairedSession {
  const stored: PairedSession = {
    refreshToken: session.refreshToken,
    sheetId: session.sheetId,
    sheetName: session.sheetName,
    pairedAt: session.pairedAt ?? Date.now(),
  };
  writeJson(PAIRED_SESSION_KEY, stored);
  return stored;
}

export function clearPairedSession(): void {
  try {
    window.localStorage.removeItem(PAIRED_SESSION_KEY);
    window.localStorage.removeItem(PAIRED_ACCESS_KEY);
  } catch {
    // ignore
  }
}

function cachedAccess(now: number): CachedAccess | null {
  const cached = readJson<CachedAccess>(PAIRED_ACCESS_KEY);
  if (!cached || typeof cached.accessToken !== 'string' || typeof cached.expiresAt !== 'number') return null;
  if (cached.expiresAt - EXPIRY_SKEW_MS <= now) return null;
  return cached;
}

export interface AccessTokenResult {
  accessToken: string;
  expiresAt: number;
}

/**
 * Trade the stored refresh token for an access token, reusing the cached one
 * while it is still good. Throws `PairedAuthError` when Google refuses the
 * refresh, and a plain `Error` for transport problems — callers distinguish the
 * two because only one of them is fixed by pairing again.
 */
export async function getPairedAccessToken(
  options: { forceRefresh?: boolean; now?: number; endpoint?: string } = {}
): Promise<AccessTokenResult> {
  const now = options.now ?? Date.now();
  const session = getPairedSession();
  if (!session) throw new PairedAuthError('This device is not paired');

  if (!options.forceRefresh) {
    const cached = cachedAccess(now);
    if (cached) return { accessToken: cached.accessToken, expiresAt: cached.expiresAt };
  }

  const endpoint = options.endpoint ?? '/api/oauth/token';
  let response: Response;
  try {
    response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ refreshToken: session.refreshToken }),
    });
  } catch {
    throw new Error('Could not reach the sync server');
  }

  const body = (await response.json().catch(() => null)) as
    | { ok?: boolean; accessToken?: string; expiresIn?: number; error?: string }
    | null;

  if (response.status === 401) {
    clearPairedSession();
    throw new PairedAuthError(body?.error || 'This device needs to be paired again');
  }

  if (!response.ok || !body?.ok || typeof body.accessToken !== 'string') {
    throw new Error(body?.error || `Token refresh failed (${response.status})`);
  }

  const expiresIn = typeof body.expiresIn === 'number' && body.expiresIn > 0 ? body.expiresIn : 3600;
  const expiresAt = now + expiresIn * 1000;
  writeJson(PAIRED_ACCESS_KEY, { accessToken: body.accessToken, expiresAt } satisfies CachedAccess);
  return { accessToken: body.accessToken, expiresAt };
}

export interface ClaimResult {
  ok: boolean;
  error?: string;
  session?: PairedSession;
}

/** Redeem a pairing code typed on this device. Never throws. */
export async function claimPairingCode(
  code: string,
  options: { endpoint?: string; sheetId?: string; sheetName?: string } = {}
): Promise<ClaimResult> {
  const trimmed = code.trim();
  if (!trimmed) return { ok: false, error: 'Enter the pairing code' };

  const endpoint = options.endpoint ?? '/api/oauth/claim';
  let response: Response;
  try {
    response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ code: trimmed }),
    });
  } catch {
    return { ok: false, error: 'Could not reach the sync server — check your connection' };
  }

  const body = (await response.json().catch(() => null)) as
    | { ok?: boolean; refreshToken?: string; sheetId?: string; sheetName?: string; error?: string }
    | null;

  if (!response.ok || !body?.ok || typeof body.refreshToken !== 'string') {
    return { ok: false, error: body?.error || `Pairing failed (${response.status})` };
  }

  const session = setPairedSession({
    refreshToken: body.refreshToken,
    sheetId: body.sheetId || options.sheetId,
    sheetName: body.sheetName || options.sheetName,
  });
  return { ok: true, session };
}
