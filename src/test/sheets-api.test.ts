import { describe, it, expect, vi } from 'vitest';
import { SheetsError, classifySheetsError, createSheetsApi } from '@/lib/sheets-api';

const BASE = 'https://sheets.googleapis.com/v4/spreadsheets';

function jsonResponse(status: number, body: unknown, headers: Record<string, string> = {}): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: (key: string) => headers[key.toLowerCase()] ?? null },
    text: async () => JSON.stringify(body),
    json: async () => body,
  } as unknown as Response;
}

function makeApi(handler: (url: string, init: RequestInit) => Response | Promise<Response>, overrides = {}) {
  const sleep = vi.fn(async () => {});
  const getToken = vi.fn(async () => 'token-1');
  const fetchImpl = vi.fn(handler);
  const api = createSheetsApi({
    getToken,
    fetchImpl: fetchImpl as unknown as typeof fetch,
    sleep,
    random: () => 0,
    maxAttempts: 3,
    ...overrides,
  });
  return { api, fetchImpl, getToken, sleep };
}

describe('error classification', () => {
  it('separates quota from permission on 403', () => {
    expect(classifySheetsError(403, { error: { errors: [{ reason: 'rateLimitExceeded' }] } }).kind).toBe('quota');
    expect(classifySheetsError(403, { error: { errors: [{ reason: 'insufficientPermissions' }] } }).kind).toBe(
      'permission'
    );
  });

  it('marks auth and not-found as terminal, server and quota as retryable', () => {
    expect(classifySheetsError(401, {}).retryable).toBe(false);
    expect(classifySheetsError(404, {}).kind).toBe('not_found');
    expect(classifySheetsError(500, {}).retryable).toBe(true);
    expect(classifySheetsError(429, {}).kind).toBe('quota');
  });
});

describe('createSheetsApi', () => {
  it('writes with RAW value input, not USER_ENTERED', async () => {
    const { api, fetchImpl } = makeApi(() => jsonResponse(200, {}));

    await api.batchUpdateValues('sheet-1', [
      { range: "'GroceryList'!A2:K2", values: [['milk', 'Milk', 'FALSE']] },
    ]);

    const [, init] = fetchImpl.mock.calls[0];
    const body = JSON.parse(String(init?.body));
    expect(body.valueInputOption).toBe('RAW');
    expect(body.data).toHaveLength(1);
  });

  it('retries a quota error once and then succeeds', async () => {
    let calls = 0;
    const { api, fetchImpl, sleep } = makeApi(() => {
      calls += 1;
      return calls === 1
        ? jsonResponse(429, { error: { message: 'Quota exceeded' } })
        : jsonResponse(200, { values: [['id']] });
    });

    const values = await api.getValues('sheet-1', "'GroceryList'!A1:K");

    expect(values).toEqual([['id']]);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(sleep).toHaveBeenCalledTimes(1);
  });

  it('honours Retry-After instead of the exponential delay', async () => {
    let calls = 0;
    const { api, sleep } = makeApi(() => {
      calls += 1;
      return calls === 1
        ? jsonResponse(429, { error: { message: 'slow down' } }, { 'retry-after': '3' })
        : jsonResponse(200, { values: [] });
    });

    await api.getValues('sheet-1', "'GroceryList'!A1:K");

    expect(sleep).toHaveBeenCalledWith(3000);
  });

  it('stops after maxAttempts instead of retrying forever', async () => {
    const { api, fetchImpl } = makeApi(() => jsonResponse(503, { error: { message: 'backend error' } }));

    await expect(api.getValues('sheet-1', "'GroceryList'!A1:K")).rejects.toBeInstanceOf(SheetsError);
    expect(fetchImpl).toHaveBeenCalledTimes(3);
  });

  it('refreshes the token once on 401 and retries with the new one', async () => {
    const tokens = ['stale', 'fresh'];
    let tokenCalls = 0;
    let requests = 0;
    const { api, fetchImpl } = makeApi(
      () => {
        requests += 1;
        return requests === 1 ? jsonResponse(401, { error: { message: 'Invalid Credentials' } }) : jsonResponse(200, {});
      },
      {
        getToken: vi.fn(async (options?: { forceRefresh?: boolean }) => {
          if (options?.forceRefresh) tokenCalls += 1;
          return tokens[Math.min(tokenCalls, tokens.length - 1)];
        }),
      }
    );

    await api.getValues('sheet-1', "'GroceryList'!A1:K");

    const authHeaders = fetchImpl.mock.calls.map(([, init]) => (init as RequestInit).headers as Record<string, string>);
    expect(authHeaders[0].Authorization).toBe('Bearer stale');
    expect(authHeaders[1].Authorization).toBe('Bearer fresh');
  });

  it('surfaces network failures as retryable network errors', async () => {
    const { api } = makeApi(() => {
      throw new TypeError('Failed to fetch');
    });

    await expect(api.getValues('sheet-1', "'GroceryList'!A1:K")).rejects.toMatchObject({
      kind: 'network',
    });
  });

  it('builds encoded URLs for ranges with spaces and quotes', async () => {
    const { api, fetchImpl } = makeApi(() => jsonResponse(200, { values: [] }));

    await api.getValues('sheet-1', "'My List'!A2:K");

    const [url] = fetchImpl.mock.calls[0];
    expect(String(url)).toBe(`${BASE}/sheet-1/values/${encodeURIComponent("'My List'!A2:K")}?valueRenderOption=UNFORMATTED_VALUE&majorDimension=ROWS`);
  });
});
