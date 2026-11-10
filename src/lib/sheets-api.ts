/**
 * Minimal, typed Google Sheets v4 client.
 *
 * Design notes:
 *  - **One retry layer.** Only this module retries (429 / 5xx / network, with
 *    Retry-After support and jittered exponential backoff). Callers must not
 *    wrap it in their own retry loop: stacked retries used to multiply a single
 *    quota error into ~16 requests while holding the sync lock.
 *  - **Errors are classified**, not string-matched. Google's message wording is
 *    not an API contract; status codes and `errors[].reason` are.
 *  - **RAW value input.** `USER_ENTERED` makes Sheets parse what we write the
 *    way a human keystroke would: an item named "1/2" became a date, "00123"
 *    lost its zeros, and a name starting with "=" became a live formula in a
 *    sheet two people share. RAW stores exactly what we send.
 */

export type SheetsErrorKind =
  | 'auth'
  | 'quota'
  | 'not_found'
  | 'permission'
  | 'server'
  | 'network'
  | 'other';

export class SheetsError extends Error {
  readonly kind: SheetsErrorKind;
  readonly status?: number;
  readonly retryable: boolean;

  constructor(message: string, kind: SheetsErrorKind, status?: number, retryable = false) {
    super(message);
    this.name = 'SheetsError';
    this.kind = kind;
    this.status = status;
    this.retryable = retryable;
  }
}

export interface ValuesUpdate {
  /** A1 range, e.g. `GroceryList!A2:K2`. */
  range: string;
  values: unknown[][];
}

export type ValueInputOption = 'RAW' | 'USER_ENTERED';

export interface SheetsApiOptions {
  /** Resolves a bearer token. `forceRefresh` asks the auth layer to bypass its cache. */
  getToken: (options?: { forceRefresh?: boolean }) => Promise<string>;
  fetchImpl?: typeof fetch;
  /** Injected for tests. */
  sleep?: (ms: number) => Promise<void>;
  random?: () => number;
  maxAttempts?: number;
  baseUrl?: string;
}

export interface SheetsApi {
  getValues(sheetId: string, range: string): Promise<unknown[][]>;
  batchUpdateValues(
    sheetId: string,
    updates: ValuesUpdate[],
    options?: { valueInputOption?: ValueInputOption }
  ): Promise<void>;
  appendValues(
    sheetId: string,
    range: string,
    values: unknown[][],
    options?: { valueInputOption?: ValueInputOption }
  ): Promise<void>;
  clearValues(sheetId: string, range: string): Promise<void>;
  getSpreadsheet(sheetId: string, fields: string): Promise<SheetMetadata>;
  batchUpdate(sheetId: string, requests: unknown[]): Promise<{ replies?: unknown[] }>;
}

export interface SheetMetadata {
  sheets?: Array<{ properties?: { sheetId?: number; title?: string } }>;
}

const DEFAULT_BASE_URL = 'https://sheets.googleapis.com/v4/spreadsheets';

function reasonsFrom(body: unknown): string[] {
  const error = (body as { error?: { status?: string; errors?: Array<{ reason?: string }>; message?: string } })
    ?.error;
  if (!error) return [];
  const reasons = (error.errors ?? []).map((entry) => entry.reason ?? '').filter(Boolean);
  if (error.status) reasons.push(error.status);
  return reasons;
}

export function classifySheetsError(status: number, body: unknown): SheetsError {
  const errorBody = (body as { error?: { message?: string } })?.error;
  const message = errorBody?.message || `Google Sheets request failed (HTTP ${status})`;
  const reasons = reasonsFrom(body);
  const has = (needle: string) => reasons.some((reason) => reason.toLowerCase().includes(needle));

  if (status === 401) return new SheetsError(message, 'auth', status, false);
  if (status === 403 && (has('ratelimit') || has('quota'))) {
    return new SheetsError(message, 'quota', status, true);
  }
  if (status === 403) return new SheetsError(message, 'permission', status, false);
  if (status === 404) return new SheetsError(message, 'not_found', status, false);
  if (status === 429 || has('ratelimit') || has('quota')) {
    return new SheetsError(message, 'quota', status, true);
  }
  if (status >= 500) return new SheetsError(message, 'server', status, true);

  return new SheetsError(message, 'other', status, false);
}

export function createSheetsApi(options: SheetsApiOptions): SheetsApi {
  const fetchImpl: typeof fetch =
    options.fetchImpl ?? ((input: RequestInfo | URL, init?: RequestInit) => fetch(input, init));
  const maxAttempts = options.maxAttempts ?? 3;
  const random = options.random ?? Math.random;
  const baseUrl = options.baseUrl ?? DEFAULT_BASE_URL;
  const sleep = options.sleep ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));

  async function request(
    method: string,
    url: string,
    body?: unknown
  ): Promise<{ status: number; json: unknown; retryAfterMs?: number }> {
    let attempt = 0;
    let forceRefresh = false;

    for (;;) {
      attempt += 1;

      let token: string;
      try {
        token = await options.getToken({ forceRefresh });
      } catch (error) {
        throw new SheetsError(
          error instanceof Error ? error.message : 'Could not obtain a Google access token',
          'auth',
          undefined,
          false
        );
      }
      forceRefresh = false;

      let response: Response;
      let payload: unknown = null;

      try {
        response = await fetchImpl(url, {
          method,
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: body === undefined ? undefined : JSON.stringify(body),
        });
      } catch (error) {
        if (attempt < maxAttempts) {
          await sleep(backoff(attempt));
          continue;
        }
        throw new SheetsError(
          error instanceof Error ? error.message : 'Network error while contacting Google Sheets',
          'network',
          undefined,
          true
        );
      }

      if (response.ok) {
        const text = await response.text().catch(() => '');
        payload = text ? safeJson(text) : null;
        return { status: response.status, json: payload };
      }

      payload = await response.json().catch(() => null);
      const classified = classifySheetsError(response.status, payload);

      // A rejected token is worth exactly one refresh-and-retry.
      if (classified.kind === 'auth' && attempt < maxAttempts) {
        forceRefresh = true;
        continue;
      }

      if (classified.retryable && attempt < maxAttempts) {
        const retryAfter = parseRetryAfter(response.headers?.get?.('retry-after') ?? null);
        await sleep(retryAfter ?? backoff(attempt));
        continue;
      }

      throw classified;
    }
  }

  function backoff(attempt: number): number {
    const exponential = Math.min(500 * Math.pow(2, attempt - 1), 15000);
    return exponential + Math.floor(random() * 250);
  }

  const valuesUrl = (sheetId: string, range: string, suffix = '') =>
    `${baseUrl}/${encodeURIComponent(sheetId)}/values/${encodeURIComponent(range)}${suffix}`;

  return {
    async getValues(sheetId, range) {
      const { json } = await request(
        'GET',
        `${valuesUrl(sheetId, range)}?valueRenderOption=UNFORMATTED_VALUE&majorDimension=ROWS`
      );
      return ((json as { values?: unknown[][] })?.values ?? []) as unknown[][];
    },

    async batchUpdateValues(sheetId, updates, opts) {
      if (updates.length === 0) return;
      await request('POST', `${baseUrl}/${encodeURIComponent(sheetId)}/values:batchUpdate`, {
        valueInputOption: opts?.valueInputOption ?? 'RAW',
        data: updates.map((update) => ({ range: update.range, values: update.values })),
      });
    },

    async appendValues(sheetId, range, values, opts) {
      if (values.length === 0) return;
      await request(
        'POST',
        `${valuesUrl(sheetId, range, ':append')}?valueInputOption=${opts?.valueInputOption ?? 'RAW'}&insertDataOption=INSERT_ROWS`,
        { values }
      );
    },

    async clearValues(sheetId, range) {
      await request('POST', `${valuesUrl(sheetId, range, ':clear')}`, {});
    },

    async getSpreadsheet(sheetId, fields) {
      const { json } = await request(
        'GET',
        `${baseUrl}/${encodeURIComponent(sheetId)}?fields=${encodeURIComponent(fields)}`
      );
      return (json ?? {}) as SheetMetadata;
    },

    async batchUpdate(sheetId, requests) {
      const { json } = await request('POST', `${baseUrl}/${encodeURIComponent(sheetId)}:batchUpdate`, {
        requests,
      });
      return (json ?? {}) as { replies?: unknown[] };
    },
  };
}

function parseRetryAfter(value: string | null): number | null {
  if (!value) return null;
  const seconds = Number(value);
  if (Number.isFinite(seconds) && seconds >= 0) return Math.min(seconds * 1000, 30000);
  return null;
}

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}
