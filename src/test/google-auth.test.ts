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

  it('keeps the token in sessionStorage (not localStorage) and never logs it', async () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const auth = await freshAuthModule();
    await auth.initGoogleAuth('client-123');

    const pending = auth.getAccessToken();
    tokenCallback?.({ access_token: 'secret-token', expires_in: 3600 });
    await pending;

    expect(window.sessionStorage.getItem('google_sheets_access_token')).toBe('secret-token');
    expect(window.localStorage.getItem('google_sheets_access_token')).toBeNull();
    const logged = logSpy.mock.calls.flat().join(' ');
    expect(logged).not.toContain('secret-token');
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
    expect(window.sessionStorage.getItem('google_sheets_access_token')).toBe('tok-9');
    expect(replaceSpy).toHaveBeenCalled();
    expect(String(replaceSpy.mock.calls[0][2])).toBe('/');
  });

  it('rejects a redirect with a mismatched state and stores nothing', async () => {
    const auth = await freshAuthModule();
    auth.redirectToGoogleOAuth('client-123', { sheetId: 'sheet-9', sheetName: 'GroceryList' });

    fakeLocation.hash = '#access_token=attacker-token&expires_in=3600&state=not-my-state';
    const result = auth.handleOAuthRedirect();

    expect(result).toBeNull();
    expect(window.sessionStorage.getItem('google_sheets_access_token')).toBeNull();
    expect(auth.readPendingOAuth()).toBeNull();
  });

  it('ignores a redirect when the device has no pending sign-in', async () => {
    const auth = await freshAuthModule();

    fakeLocation.hash = '#access_token=attacker-token&expires_in=3600&state=whatever';

    expect(auth.handleOAuthRedirect()).toBeNull();
  });
});
