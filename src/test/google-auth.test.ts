import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

interface FakeLocationState {
  origin: string;
  hash: string;
  href: string;
  pathname: string;
  search: string;
}

let fakeLocation: FakeLocationState;
let tokenCallback: ((response: Record<string, unknown>) => void) | null = null;
let errorCallback: (() => void) | null = null;
let requestAccessToken: ReturnType<typeof vi.fn>;

function installFakeLocation(): void {
  fakeLocation = { origin: 'https://app.example.com', hash: '', href: 'https://app.example.com/', pathname: '/', search: '' };
  Object.defineProperty(window, 'location', {
    configurable: true,
    value: {
      get origin() {
        return fakeLocation.origin;
      },
      get hash() {
        return fakeLocation.hash;
      },
      set hash(value: string) {
        fakeLocation.hash = value;
      },
      get href() {
        return fakeLocation.href;
      },
      set href(value: string) {
        fakeLocation.href = value;
      },
      get pathname() {
        return fakeLocation.pathname;
      },
      get search() {
        return fakeLocation.search;
      },
    },
  });
}

function installGis(): void {
  requestAccessToken = vi.fn();
  (window as unknown as { google: unknown }).google = {
    accounts: {
      oauth2: {
        initTokenClient: (config: { callback: (r: Record<string, unknown>) => void; error_callback: () => void; client_id: string; scope: string }) => {
          tokenCallback = config.callback;
          errorCallback = config.error_callback;
          expect(config.client_id).toBe('client-123');
          expect(config.scope).toContain('spreadsheets');
          return { requestAccessToken };
        },
        revoke: (_token: string, callback: () => void) => callback(),
      },
    },
  };
}

async function freshAuthModule() {
  vi.resetModules();
  return import('@/lib/google-auth');
}

beforeEach(() => {
  installFakeLocation();
  installGis();
  window.sessionStorage.clear();
  window.localStorage.clear();
});

afterEach(() => {
  tokenCallback = null;
  errorCallback = null;
  vi.restoreAllMocks();
});

describe('google auth: token handling', () => {
  it('shares one in-flight refresh between concurrent callers', async () => {
    const auth = await freshAuthModule();
    await auth.initGoogleAuth('client-123');

    const first = auth.getAccessToken();
    const second = auth.getAccessToken();
    expect(requestAccessToken).toHaveBeenCalledTimes(1);

    tokenCallback?.({ access_token: 'tok-1', expires_in: 3600 });

    await expect(first).resolves.toBe('tok-1');
    await expect(second).resolves.toBe('tok-1');
    expect(requestAccessToken).toHaveBeenCalledTimes(1);
  });

  it('caches the token and does not re-request it', async () => {
    const auth = await freshAuthModule();
    await auth.initGoogleAuth('client-123');

    const first = auth.getAccessToken();
    tokenCallback?.({ access_token: 'tok-1', expires_in: 3600 });
    await first;

    await expect(auth.getAccessToken()).resolves.toBe('tok-1');
    expect(requestAccessToken).toHaveBeenCalledTimes(1);
  });

  it('throws AuthRequiredError instead of navigating away when refresh fails', async () => {
    const auth = await freshAuthModule();
    await auth.initGoogleAuth('client-123');

    const pending = auth.getAccessToken();
    errorCallback?.();

    await expect(pending).rejects.toBeInstanceOf(auth.AuthRequiredError);
    expect(fakeLocation.href).toBe('https://app.example.com/');
  });

  it('persists the token across launches and never logs it', async () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const auth = await freshAuthModule();
    await auth.initGoogleAuth('client-123');

    const pending = auth.getAccessToken();
    tokenCallback?.({ access_token: 'secret-token', expires_in: 3600 });
    await pending;

    // localStorage, not sessionStorage: an Android launch is a new browsing
    // context, so a per-tab token means a Google prompt on every open.
    expect(window.localStorage.getItem('google_sheets_access_token')).toBe('secret-token');
    expect(window.sessionStorage.getItem('google_sheets_access_token')).toBeNull();
    const logged = logSpy.mock.calls.flat().join(' ');
    expect(logged).not.toContain('secret-token');
  });
});

describe('google auth: silent recovery', () => {
  it('renews from the existing Google session without navigating away', async () => {
    const auth = await freshAuthModule();
    await auth.initGoogleAuth('client-123');

    const pending = auth.trySilentSignIn();
    tokenCallback?.({ access_token: 'tok-silent', expires_in: 3600 });

    await expect(pending).resolves.toBe(true);
    expect(auth.isSignedIn()).toBe(true);
    expect(window.localStorage.getItem('google_sheets_access_token')).toBe('tok-silent');
    expect(fakeLocation.href).toBe('https://app.example.com/');
  });

  it('reports failure instead of throwing when Google refuses', async () => {
    const auth = await freshAuthModule();
    await auth.initGoogleAuth('client-123');

    const pending = auth.trySilentSignIn();
    errorCallback?.();

    await expect(pending).resolves.toBe(false);
    expect(auth.isSignedIn()).toBe(false);
  });

  it('gives up when a token request is never answered, and stays usable afterwards', async () => {
    const auth = await freshAuthModule();
    await auth.initGoogleAuth('client-123');

    await expect(auth.trySilentSignIn({ timeoutMs: 20 })).resolves.toBe(false);

    // The wedged resolver must be gone, or the next attempt would join a
    // promise that can never settle and the sync lock would never open.
    const next = auth.getAccessToken();
    expect(requestAccessToken).toHaveBeenCalledTimes(2);
    tokenCallback?.({ access_token: 'tok-after-timeout', expires_in: 3600 });
    await expect(next).resolves.toBe('tok-after-timeout');
  });

  it('reuses a token restored from a previous launch without asking Google', async () => {
    window.localStorage.setItem('google_sheets_access_token', 'stored-token');
    window.localStorage.setItem('google_sheets_token_expiry', String(Date.now() + 3_600_000));

    const auth = await freshAuthModule();
    await auth.initGoogleAuth('client-123');

    await expect(auth.trySilentSignIn()).resolves.toBe(true);
    expect(requestAccessToken).not.toHaveBeenCalled();
  });

  it('initializes the token client once, however many times it is called', async () => {
    const original = (
      window as unknown as { google: { accounts: { oauth2: { initTokenClient: (c: unknown) => unknown } } } }
    ).google.accounts.oauth2.initTokenClient;
    const initSpy = vi.fn((config: unknown) => original(config));
    (
      window as unknown as { google: { accounts: { oauth2: { initTokenClient: (c: unknown) => unknown } } } }
    ).google.accounts.oauth2.initTokenClient = initSpy;

    const auth = await freshAuthModule();
    await auth.initGoogleAuth('client-123');
    await auth.initGoogleAuth('client-123');

    expect(initSpy).toHaveBeenCalledTimes(1);
  });
});

describe('google auth: OAuth redirect', () => {
  it('sends a state nonce and keeps the sheet context out of the URL', async () => {
    const auth = await freshAuthModule();

    auth.redirectToGoogleOAuth('client-123', { sheetId: 'sheet-9', sheetName: 'GroceryList' });

    const pending = auth.readPendingOAuth();
    expect(pending?.sheetId).toBe('sheet-9');
    expect(fakeLocation.href).toContain('accounts.google.com');
    expect(fakeLocation.href).toContain(`state=${pending?.state}`);
    expect(fakeLocation.href).not.toContain('sheet-9');
  });

  it('accepts a redirect whose state matches and returns the sheet context', async () => {
    const auth = await freshAuthModule();
    auth.redirectToGoogleOAuth('client-123', { sheetId: 'sheet-9', sheetName: 'GroceryList' });
    const state = auth.readPendingOAuth()?.state;

    const replaceSpy = vi.spyOn(window.history, 'replaceState').mockImplementation(() => {});

    fakeLocation.hash = `#access_token=tok-9&expires_in=3600&state=${state}`;
    const result = auth.handleOAuthRedirect();

    expect(result).toEqual({ token: 'tok-9', sheetId: 'sheet-9', sheetName: 'GroceryList' });
    expect(window.localStorage.getItem('google_sheets_access_token')).toBe('tok-9');
    expect(replaceSpy).toHaveBeenCalled();
    expect(String(replaceSpy.mock.calls[0][2])).toBe('/');
  });

  it('rejects a redirect with a mismatched state and stores nothing', async () => {
    const auth = await freshAuthModule();
    auth.redirectToGoogleOAuth('client-123', { sheetId: 'sheet-9', sheetName: 'GroceryList' });

    fakeLocation.hash = '#access_token=attacker-token&expires_in=3600&state=not-my-state';
    const result = auth.handleOAuthRedirect();

    expect(result).toBeNull();
    expect(window.localStorage.getItem('google_sheets_access_token')).toBeNull();
    expect(auth.readPendingOAuth()).toBeNull();
  });

  it('ignores a redirect when the device has no pending sign-in', async () => {
    const auth = await freshAuthModule();

    fakeLocation.hash = '#access_token=attacker-token&expires_in=3600&state=whatever';

    expect(auth.handleOAuthRedirect()).toBeNull();
  });
});
