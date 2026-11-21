import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  clearPendingOAuth,
  handleOAuthCodeRedirect,
  handleOAuthRedirect,
  redirectToGoogleOAuthCode,
} from '@/lib/google-auth';

const PENDING_KEY = 'google_sheets_oauth_pending';

interface FakeLocation {
  origin: string;
  href: string;
  search: string;
  hash: string;
  pathname: string;
}

let fake: FakeLocation;

function installLocation(): void {
  fake = { origin: 'https://breadcrumbapp.netlify.app', href: '', search: '', hash: '/', pathname: '/' };
  Object.defineProperty(window, 'location', {
    configurable: true,
    value: {
      get origin() {
        return fake.origin;
      },
      get href() {
        return fake.href;
      },
      set href(value: string) {
        fake.href = value;
      },
      get search() {
        return fake.search;
      },
      get hash() {
        return fake.hash;
      },
      set hash(value: string) {
        fake.hash = value;
      },
      get pathname() {
        return fake.pathname;
      },
    },
  });
  Object.defineProperty(window, 'history', {
    configurable: true,
    value: { replaceState: () => {} },
  });
}

describe('pairing redirect', () => {
  beforeEach(() => {
    installLocation();
    window.sessionStorage.clear();
  });

  afterEach(() => {
    clearPendingOAuth();
    window.sessionStorage.clear();
  });

  it('asks Google for an offline code, not a token', () => {
    redirectToGoogleOAuthCode('client-123', { sheetId: 'sheet-1', sheetName: 'Groceries' });

    const url = new URL(fake.href);
    expect(url.hostname).toBe('accounts.google.com');
    expect(url.searchParams.get('response_type')).toBe('code');
    expect(url.searchParams.get('access_type')).toBe('offline');
    expect(url.searchParams.get('prompt')).toBe('consent');
    expect(url.searchParams.get('redirect_uri')).toBe('https://breadcrumbapp.netlify.app');
    expect(url.searchParams.get('client_id')).toBe('client-123');

    const pending = JSON.parse(window.sessionStorage.getItem(PENDING_KEY) as string);
    expect(pending).toMatchObject({ mode: 'pair', sheetId: 'sheet-1', sheetName: 'Groceries' });
    expect(pending.state).toBe(url.searchParams.get('state'));
  });

  it('consumes a matching return', () => {
    redirectToGoogleOAuthCode('client-123', { sheetId: 'sheet-1' });
    const state = JSON.parse(window.sessionStorage.getItem(PENDING_KEY) as string).state;
    fake.search = `?code=auth-code&state=${state}&scope=spreadsheets`;

    expect(handleOAuthCodeRedirect()).toEqual({ code: 'auth-code', sheetId: 'sheet-1', sheetName: undefined });
    // Single use: the pending record is gone.
    expect(window.sessionStorage.getItem(PENDING_KEY)).toBeNull();
  });

  it('ignores a code whose state was never issued here', () => {
    redirectToGoogleOAuthCode('client-123', { sheetId: 'sheet-1' });
    fake.search = '?code=auth-code&state=not-mine';
    expect(handleOAuthCodeRedirect()).toBeNull();
  });

  it('ignores a token-flow pending record', () => {
    window.sessionStorage.setItem(
      PENDING_KEY,
      JSON.stringify({ state: 's1', sheetId: 'sheet-1', mode: 'token' })
    );
    fake.search = '?code=auth-code&state=s1';
    expect(handleOAuthCodeRedirect()).toBeNull();
  });

  it('returns null when there is no code at all', () => {
    fake.search = '';
    expect(handleOAuthCodeRedirect()).toBeNull();
  });

  it('does not let the token handler eat a pairing return', () => {
    redirectToGoogleOAuthCode('client-123', { sheetId: 'sheet-1' });
    fake.hash = '#access_token=leaked&state=whatever';
    expect(handleOAuthRedirect()).toBeNull();
    // The pairing record must survive so the code can still be exchanged.
    expect(window.sessionStorage.getItem(PENDING_KEY)).not.toBeNull();
  });
});
