import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  initGoogleSheetsAuth,
  syncItemsToSheets,
  getAllGroceryItems,
  rowToItem,
  getAccessToken,
  signOut,
} from '../lib/google-sheets';

describe('google-sheets: GIS token refresh wiring', () => {
  beforeEach(() => {
    vi.useRealTimers();
    let initConfig: any;

    (window as any).google = {
      accounts: {
        oauth2: {
          initTokenClient: vi.fn((cfg: any) => {
            initConfig = cfg;
            return {
              requestAccessToken: vi.fn(() => {
                if (typeof initConfig?.callback !== 'function') {
                  throw new Error('missing initTokenClient callback');
                }
                initConfig.callback({
                  access_token: 'fresh-token',
                  expires_in: 3600,
                  token_type: 'Bearer',
                  scope: 'https://www.googleapis.com/auth/spreadsheets',
                });
              }),
            };
          }),
          revoke: vi.fn((_token: string, cb: () => void) => cb()),
        },
      },
    };

    signOut();
    window.localStorage.clear();
  });

  it('refreshes an expired in-memory token through the GIS init callback instead of hanging in syncing', async () => {
    vi.useFakeTimers();
    const now = new Date('2026-01-01T00:00:00Z');
    vi.setSystemTime(now);

    window.localStorage.setItem('google_sheets_access_token', 'soon-expiring-token');
    window.localStorage.setItem('google_sheets_token_expiry', String(now.getTime() + 61_000));

    await initGoogleSheetsAuth('fake-client-id');

    vi.setSystemTime(new Date(now.getTime() + 62_000));

    await expect(getAccessToken()).resolves.toBe('fresh-token');
    expect(window.localStorage.getItem('google_sheets_access_token')).toBe('fresh-token');
    expect(Number(window.localStorage.getItem('google_sheets_token_expiry'))).toBeGreaterThan(Date.now());
    const tokenClientConfig = (window as any).google.accounts.oauth2.initTokenClient.mock.calls[0][0];
    expect(typeof tokenClientConfig.callback).toBe('function');
  });
});

describe('google-sheets: syncItemsToSheets stale row cleanup', () => {
  const sheetId = 'sheet-123';
  const sheetName = 'GroceryList';
  const config = { sheetId, sheetName, syncEnabled: true };

  // In-memory fake sheet: models exactly what a real Google Sheet does -
  // clear removes cell values, write (PUT) sets a range, and reading
  // A2:J reflects whatever rows remain (including stale ones from a
  // previous larger write, unless cleared).
  let sheetRows: any[][] = [];

  beforeEach(async () => {
    sheetRows = [];

    // Minimal fake of window.google.accounts.oauth2 so getAccessToken() can
    // resolve a token without hitting real Google Identity Services.
    (window as any).google = {
      accounts: {
        oauth2: {
          initTokenClient: (_cfg: any) => ({
            requestAccessToken: (_opts: any) => {
              // not exercised in this test; a cached token is seeded below
            },
          }),
          revoke: (_token: string, cb: () => void) => cb(),
        },
      },
    };

    await initGoogleSheetsAuth('fake-client-id');
    // Seed a valid cached token directly via localStorage the same way the
    // module restores it on init - simplest way to make getAccessToken()
    // resolve without a real OAuth round trip.
    window.localStorage.setItem('google_sheets_access_token', 'fake-token');
    window.localStorage.setItem('google_sheets_token_expiry', String(Date.now() + 3600_000));
    await initGoogleSheetsAuth('fake-client-id'); // re-init picks up the seeded token

    global.fetch = vi.fn(async (url: string, opts: any) => {
      const u = String(url);

      if (u.includes(':clear')) {
        sheetRows = [];
        return { ok: true, json: async () => ({}) } as any;
      }

      if (opts?.method === 'PUT') {
        // writeSheet(range=A1:J{n}) - overwrite from row 0
        const body = JSON.parse(opts.body);
        sheetRows = body.values;
        return {
          ok: true,
          json: async () => ({
            updatedRows: body.values.length,
            updatedColumns: 10,
            updatedCells: body.values.length * 10,
          }),
        } as any;
      }

      if (opts?.method === undefined || opts?.method === 'GET') {
        // readSheet A2:J -> everything except header
        return { ok: true, json: async () => ({ values: sheetRows.slice(1) }) } as any;
      }

      throw new Error(`Unexpected fetch call: ${u} ${opts?.method}`);
    }) as any;
  });

  it('does not leave stale trailing rows readable after the list shrinks', async () => {
    const bigList = [
      { id: '1', name: 'Apples', checked: false, addedAt: 1 },
      { id: '2', name: 'Bananas', checked: false, addedAt: 2 },
      { id: '3', name: 'Carrots', checked: false, addedAt: 3 },
    ];
    await syncItemsToSheets(config, bigList, 'me@example.com');

    // Sanity: all three rows present after first sync.
    let remote = await getAllGroceryItems(config);
    expect(remote.map(i => i.id).sort()).toEqual(['1', '2', '3']);

    // List shrinks to a single item (e.g. user deleted the other two).
    const smallList = [
      { id: '1', name: 'Apples', checked: true, addedAt: 1, checkedAt: 4 },
    ];
    await syncItemsToSheets(config, smallList, 'me@example.com');

    remote = await getAllGroceryItems(config);
    // Without the clear-before-write fix, rows 3 and 4 (Bananas, Carrots)
    // would still be present in the sheet, this asserts they are gone.
    expect(remote).toHaveLength(1);
    expect(remote[0].id).toBe('1');
    expect(remote[0].checked).toBe(true);
  });

  it('calls clearSheet (via :clear) before writing on every sync', async () => {
    const items = [{ id: '1', name: 'Apples', checked: false, addedAt: 1 }];
    await syncItemsToSheets(config, items, 'me@example.com');

    const calls = (global.fetch as any).mock.calls.map((c: any[]) => String(c[0]));
    const clearIndex = calls.findIndex((u: string) => u.includes(':clear'));
    const putIndex = calls.findIndex((u: string, i: number) => calls[i] && (global.fetch as any).mock.calls[i][1]?.method === 'PUT');

    expect(clearIndex).toBeGreaterThanOrEqual(0);
    expect(putIndex).toBeGreaterThan(clearIndex);
  });
});

describe('google-sheets: rowToItem (Finding 11 - timestamp hygiene, Finding 14 - short/hand-edited rows)', () => {
  it('produces finite-or-undefined timestamp fields with no Date.now() leakage for blank/non-numeric cells', () => {
    const before = Date.now();
    // Non-numeric, hand-mangled checkedAt cell; blank addedAt cell; non-numeric
    // updatedAt cell. Row shape: [id, name, checked, checkedAt, addedAt, category, quantity, updatedAt, updatedBy, isTombstone]
    const item = rowToItem(['id1', 'Milk', 'FALSE', 'not-a-number', '', '', '', 'not-a-number', '', 'FALSE']);
    const after = Date.now();

    expect(item).not.toBeNull();
    // addedAt must fall back to 0 (oldest), never Date.now() - assert it is
    // NOT inside the [before, after] window a Date.now() stamp would occupy.
    expect(item!.addedAt).toBe(0);
    expect(item!.addedAt < before || item!.addedAt > after).toBe(true);
    // A non-numeric checkedAt cell must coerce to undefined, not NaN.
    expect(item!.checkedAt).toBeUndefined();
    expect(Number.isNaN(item!.checkedAt as any)).toBe(false);
    // A non-numeric updatedAt cell must coerce to undefined, not NaN.
    expect(item!.updatedAt).toBeUndefined();
    expect(Number.isNaN(item!.updatedAt as any)).toBe(false);
  });

  it('coerces a non-numeric updatedAt cell (e.g. "abc") to undefined, not NaN', () => {
    const item = rowToItem(['id1', 'Milk', 'TRUE', 100, 1, 'produce', 2, 'abc', 'me@example.com', 'FALSE']);

    expect(item).not.toBeNull();
    expect(item!.updatedAt).toBeUndefined();
    expect(Number.isNaN(item!.updatedAt as any)).toBe(false);
  });

  it('returns a valid item for a short two-cell row containing only an id and a name (hand-added sheet row)', () => {
    // This is exactly what the setup doc's manual 9/10-column entry produces
    // once Sheets omits trailing empty cells from the read - it must survive,
    // not be silently dropped (and then erased by the next full rewrite).
    const item = rowToItem(['id1', 'Milk']);

    expect(item).not.toBeNull();
    expect(item!.id).toBe('id1');
    expect(item!.name).toBe('Milk');
    expect(item!.checked).toBe(false);
    expect(item!.addedAt).toBe(0);
    expect(item!.checkedAt).toBeUndefined();
    expect(item!.updatedAt).toBeUndefined();
    expect(item!.category).toBeUndefined();
    expect(item!.quantity).toBeUndefined();
    expect(item!.updatedBy).toBeUndefined();
    expect(item!.isTombstone).toBe(false);
  });

  it('still returns null when id or name is missing entirely', () => {
    expect(rowToItem([])).toBeNull();
    expect(rowToItem(['id1'])).toBeNull(); // id present, name missing
    expect(rowToItem(null as any)).toBeNull();
  });
});
