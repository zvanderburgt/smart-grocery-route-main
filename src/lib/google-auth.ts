/**
 * Google Identity Services auth for the Sheets integration.
 *
 * Changes from the previous implementation, all of them about not getting stuck
 * or leaking:
 *  - **Single-flight refresh.** Refresh used to keep one resolver slot in module
 *    state; when two calls raced (a sync's read and its write), the second
 *    overwrote the first and that promise never settled, leaving the sync locked
 *    in `syncing` forever. All callers now share one in-flight promise.
 *  - **No redirect from inside a data call.** `getAccessToken()` throws
 *    `AuthRequiredError` instead of navigating the page away mid-sync; only the
 *    explicit `connect()` action redirects, so a pending edit is never lost to a
 *    surprise navigation.
 *  - **`state` is generated, stored and verified.** It used to be written to
 *    storage and never read back, and the redirect path replaced it with sheet
 *    metadata, so the OAuth response was accepted from anyone.
 *  - **Token kept in sessionStorage, not localStorage**, and never logged. The
 *    old code console.logged the GIS token response and the full page URL
 *    (which carries `access_token` in the fragment).
 *
 * The implicit flow is kept deliberately: switching to authorization-code+PKCE
 * is the better long-term shape (refresh tokens, hourly re-consent avoided), but
 * it requires adding the redirect URI in Google Cloud Console, so it stays a
 * documented upgrade rather than a silent break of existing connections.
 */

const SCOPES = 'https://www.googleapis.com/auth/spreadsheets';
const TOKEN_STORAGE_KEY = 'google_sheets_access_token';
const TOKEN_EXPIRY_KEY = 'google_sheets_token_expiry';
const OAUTH_PENDING_KEY = 'google_sheets_oauth_pending';

const TOKEN_SAFETY_WINDOW_MS = 60_000;

export class AuthRequiredError extends Error {
  constructor(message = 'Google sign-in required') {
    super(message);
    this.name = 'AuthRequiredError';
  }
}

interface PendingOAuth {
  state: string;
  sheetId?: string;
  sheetName?: string;
}

export interface RedirectResult {
  token: string;
  sheetId?: string;
  sheetName?: string;
}

let tokenClient: unknown = null;
let accessToken: string | null = null;
let tokenExpiry = 0;
let clientId: string | null = null;
let tokenResolver: ((token: string) => void) | null = null;
let tokenRejecter: ((error: Error) => void) | null = null;
let refreshPromise: Promise<string> | null = null;

function store(): Storage {
  try {
    return window.sessionStorage;
  } catch {
    throw new Error('Browser storage unavailable');
  }
}

function saveToken(token: string, expiry: number): void {
  accessToken = token;
  tokenExpiry = expiry;
  try {
    store().setItem(TOKEN_STORAGE_KEY, token);
    store().setItem(TOKEN_EXPIRY_KEY, String(expiry));
  } catch {
    // Storage may be full or blocked; the in-memory token still works this session.
  }
}

function clearToken(): void {
  accessToken = null;
  tokenExpiry = 0;
  try {
    store().removeItem(TOKEN_STORAGE_KEY);
    store().removeItem(TOKEN_EXPIRY_KEY);
  } catch {
    // ignore
  }
}

function restoreToken(): void {
  try {
    const stored = store().getItem(TOKEN_STORAGE_KEY);
    const storedExpiry = store().getItem(TOKEN_EXPIRY_KEY);
    if (!stored || !storedExpiry) return;
    const expiry = parseInt(storedExpiry, 10);
    if (Number.isFinite(expiry) && Date.now() < expiry - TOKEN_SAFETY_WINDOW_MS) {
      accessToken = stored;
      tokenExpiry = expiry;
    }
  } catch {
    // ignore
  }
}

function generateState(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

export function initGoogleAuth(clientIdValue: string): Promise<void> {
  clientId = clientIdValue;
  restoreToken();

  return new Promise((resolve, reject) => {
    const deadline = Date.now() + 10_000;

    const checkGis = () => {
      const gis = (window as { google?: { accounts?: { oauth2?: unknown } } }).google?.accounts?.oauth2 as
        | {
            initTokenClient: (config: unknown) => unknown;
            revoke: (token: string, callback: () => void) => void;
          }
        | undefined;

      if (gis) {
        tokenClient = gis.initTokenClient({
          client_id: clientIdValue,
          scope: SCOPES,
          callback: (response: { access_token?: string; expires_in?: number; error?: string }) => {
            if (response.access_token) {
              saveToken(response.access_token, Date.now() + (response.expires_in ?? 3600) * 1000);
              tokenResolver?.(response.access_token);
              tokenResolver = null;
              tokenRejecter = null;
              return;
            }
            tokenRejecter?.(new Error(response.error || 'Google did not return an access token'));
            tokenResolver = null;
            tokenRejecter = null;
          },
          error_callback: () => {
            tokenRejecter?.(new Error('Google token request failed'));
            tokenResolver = null;
            tokenRejecter = null;
          },
        });
        resolve();
        return;
      }

      if (Date.now() > deadline) {
        reject(new Error('Google Identity Services did not load'));
        return;
      }
      setTimeout(checkGis, 100);
    };

    checkGis();
  });
}

function requestTokenFromGis(): Promise<string> {
  if (!tokenClient) {
    return Promise.reject(new AuthRequiredError('Google sign-in is not initialized'));
  }

  return new Promise<string>((resolve, reject) => {
    tokenResolver = resolve;
    tokenRejecter = reject;
    (tokenClient as { requestAccessToken: (options: { prompt: string }) => void }).requestAccessToken({
      prompt: '',
    });
  });
}

/** One refresh in flight at a time, shared by every caller that races it. */
function refreshToken(): Promise<string> {
  if (!refreshPromise) {
    refreshPromise = requestTokenFromGis().finally(() => {
      refreshPromise = null;
    });
  }
  return refreshPromise;
}

export function isSignedIn(): boolean {
  return !!accessToken && Date.now() < tokenExpiry - TOKEN_SAFETY_WINDOW_MS;
}

export async function getAccessToken(options: { forceRefresh?: boolean } = {}): Promise<string> {
  if (!options.forceRefresh && accessToken && Date.now() < tokenExpiry - TOKEN_SAFETY_WINDOW_MS) {
    return accessToken;
  }

  if (options.forceRefresh) {
    clearToken();
  }

  try {
    return await refreshToken();
  } catch (error) {
    throw new AuthRequiredError(
      error instanceof Error ? error.message : 'Google sign-in expired. Reconnect in Settings.'
    );
  }
}

export function signOut(): void {
  const token = accessToken;
  clearToken();
  try {
    store().removeItem(OAUTH_PENDING_KEY);
  } catch {
    // ignore
  }
  if (token) {
    const gis = (window as { google?: { accounts?: { oauth2?: { revoke?: (t: string, cb: () => void) => void } } } })
      .google?.accounts?.oauth2;
    gis?.revoke?.(token, () => {});
  }
}

export function readPendingOAuth(): PendingOAuth | null {
  try {
    const raw = store().getItem(OAUTH_PENDING_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as PendingOAuth;
    return parsed && typeof parsed.state === 'string' ? parsed : null;
  } catch {
    return null;
  }
}

export function clearPendingOAuth(): void {
  try {
    store().removeItem(OAUTH_PENDING_KEY);
  } catch {
    // ignore
  }
}

/**
 * Navigate to Google's consent screen. The sheet context travels in the stored
 * pending record (sessionStorage), not in `state`, so `state` stays a pure,
 * verifiable nonce.
 */
export function redirectToGoogleOAuth(clientIdValue: string, context: { sheetId?: string; sheetName?: string } = {}): void {
  if (!clientIdValue) throw new Error('Google Client ID not configured');

  const state = generateState();
  try {
    store().setItem(
      OAUTH_PENDING_KEY,
      JSON.stringify({ state, sheetId: context.sheetId, sheetName: context.sheetName } satisfies PendingOAuth)
    );
  } catch {
    throw new Error('Could not start Google sign-in (browser storage unavailable)');
  }

  const params = new URLSearchParams({
    client_id: clientIdValue,
    redirect_uri: window.location.origin,
    response_type: 'token',
    scope: SCOPES,
    state,
    include_granted_scopes: 'true',
    prompt: 'consent',
  });

  window.location.href = `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
}

/**
 * Parse the OAuth response on return. Rejects (returns null) unless the `state`
 * matches the value this device generated, which is what stops a forged
 * fragment from injecting someone else's token.
 */
export function handleOAuthRedirect(): RedirectResult | null {
  const hash = window.location.hash;
  if (!hash || !hash.includes('access_token=') && !hash.includes('error=')) return null;

  const params = new URLSearchParams(hash.slice(1));
  const pending = readPendingOAuth();
  const returnedState = params.get('state');
  const returnedToken = params.get('access_token');

  // Consume the pending record either way - it is single-use.
  clearPendingOAuth();
  window.history.replaceState({}, document.title, window.location.pathname + window.location.search);

  if (params.get('error')) {
    return null;
  }
  if (!pending || !returnedState || returnedState !== pending.state) {
    // A mismatched state means this fragment did not come from a sign-in this
    // device started; ignore it rather than trusting the token.
    return null;
  }
  if (!returnedToken) return null;

  const expiresIn = parseInt(params.get('expires_in') || '3600', 10);
  saveToken(returnedToken, Date.now() + (Number.isFinite(expiresIn) ? expiresIn : 3600) * 1000);

  return {
    token: returnedToken,
    sheetId: pending.sheetId,
    sheetName: pending.sheetName,
  };
}

export function getConfiguredClientId(): string | null {
  return clientId;
}
