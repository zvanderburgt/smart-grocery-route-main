import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

const ENV = {
  SHEET_ID: 'sheet-abc',
  GOOGLE_CLIENT_ID: 'client-1',
  GOOGLE_CLIENT_SECRET: 'secret-1',
  GOOGLE_REFRESH_TOKEN: 'refresh-1',
};

interface HandlerModule {
  default: (request: Request) => Promise<Response>;
}

type GlobalWithProcess = { process?: { env: Record<string, string | undefined> } };

function env(): Record<string, string | undefined> {
  const holder = globalThis as unknown as GlobalWithProcess;
  if (!holder.process) holder.process = { env: {} };
  return holder.process.env;
}

function hit(path: string, init: RequestInit = {}): Request {
  return new Request(`https://breadcrumbapp.netlify.app/api/sheets-relay/${path}`, init);
}

/** Token endpoint answers first, then the Sheets API. */
function stubGoogle(upstream: Response): ReturnType<typeof vi.fn> {
  const mock = vi.fn((input: RequestInfo | URL) => {
    const url = String(input);
    if (url.includes('oauth2.googleapis.com/token')) {
      return Promise.resolve(
        new Response(JSON.stringify({ access_token: 'at-1', expires_in: 3599 }), { status: 200 })
      );
    }
    return Promise.resolve(upstream.clone());
  });
  globalThis.fetch = mock as unknown as typeof fetch;
  return mock;
}

describe('sheets relay function', () => {
  let relay: HandlerModule;

  beforeEach(async () => {
    relay = (await import('../../netlify/functions/sheets-relay.mts')) as unknown as HandlerModule;
  });

  afterEach(() => {
    const e = env();
    for (const key of Object.keys(ENV)) delete e[key];
    vi.restoreAllMocks();
  });

  it('reports "not configured" until every env var exists', async () => {
    Object.assign(env(), { SHEET_ID: ENV.SHEET_ID });
    const response = await relay.default(hit('health'));
    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({ ok: false });
  });

  it('advertises the sheet it serves once configured', async () => {
    Object.assign(env(), ENV);
    const response = await relay.default(hit('health'));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true, sheetId: ENV.SHEET_ID });
  });

  it('refuses any spreadsheet other than the configured one', async () => {
    Object.assign(env(), ENV);
    const response = await relay.default(hit('v4/spreadsheets/somebody-elses-sheet/values/A1:B2'));
    expect(response.status).toBe(403);
  });

  it('refuses cross-site callers', async () => {
    Object.assign(env(), ENV);
    const response = await relay.default(
      hit(`v4/spreadsheets/${ENV.SHEET_ID}/values/A1:B2`, { headers: { 'sec-fetch-site': 'cross-site' } })
    );
    expect(response.status).toBe(403);
  });

  it('refuses verbs the Sheets values API does not need', async () => {
    Object.assign(env(), ENV);
    const response = await relay.default(
      hit(`v4/spreadsheets/${ENV.SHEET_ID}/values/A1:B2`, { method: 'DELETE' })
    );
    expect(response.status).toBe(405);
  });

  it('proxies a read with a freshly refreshed access token', async () => {
    Object.assign(env(), ENV);
    const fetchMock = stubGoogle(
      new Response(JSON.stringify({ values: [['id', 'name']] }), { status: 200 })
    );

    const response = await relay.default(
      hit(`v4/spreadsheets/${ENV.SHEET_ID}/values/GroceryList!A1:J2?majorDimension=ROWS`, {
        headers: { 'sec-fetch-site': 'same-origin' },
      })
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ values: [['id', 'name']] });

    const upstreamCall = fetchMock.mock.calls.find((call) =>
      String(call[0]).startsWith('https://sheets.googleapis.com/')
    );
    expect(upstreamCall).toBeTruthy();
    const [url, init] = upstreamCall as [string, RequestInit];
    expect(url).toContain(`/v4/spreadsheets/${ENV.SHEET_ID}/values/GroceryList!A1:J2`);
    expect(url).toContain('majorDimension=ROWS');
    expect((init.headers as Record<string, string>).authorization).toBe('Bearer at-1');
  });

  it('forwards writes with their body intact', async () => {
    Object.assign(env(), ENV);
    const fetchMock = stubGoogle(new Response(JSON.stringify({}), { status: 200 }));
    const body = JSON.stringify({ values: [['a', 'b']] });

    const response = await relay.default(
      hit(`v4/spreadsheets/${ENV.SHEET_ID}/values/GroceryList!A1:B1:append?valueInputOption=RAW`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'sec-fetch-site': 'same-origin' },
        body,
      })
    );

    expect(response.status).toBe(200);
    const upstreamCall = fetchMock.mock.calls.find((call) =>
      String(call[0]).startsWith('https://sheets.googleapis.com/')
    ) as [string, RequestInit];
    expect(upstreamCall[1].method).toBe('POST');
    expect(upstreamCall[1].body).toBe(body);
  });

  it('surfaces a dead refresh token as 401 so the app can show it', async () => {
    Object.assign(env(), ENV);
    // A fresh module instance so the access-token cache from earlier tests is
    // not reused; otherwise the refresh never happens and this asserts nothing.
    vi.resetModules();
    const fresh = (await import('../../netlify/functions/sheets-relay.mts')) as unknown as HandlerModule;
    globalThis.fetch = vi.fn(() =>
      Promise.resolve(
        new Response(JSON.stringify({ error: 'invalid_grant', error_description: 'Token has been expired or revoked.' }), {
          status: 400,
        })
      )
    ) as unknown as typeof fetch;

    const response = await fresh.default(
      hit(`v4/spreadsheets/${ENV.SHEET_ID}/values/A1:B2`, { headers: { 'sec-fetch-site': 'same-origin' } })
    );
    expect(response.status).toBe(401);
    expect(JSON.stringify(await response.json())).toContain('expired or revoked');
  });
});
