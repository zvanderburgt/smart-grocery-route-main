/**
 * Step 2 of device pairing: redeem the typed code for the refresh token.
 *
 * Single use — the record is deleted before the response is written, so a code
 * read over someone's shoulder is worthless once the intended device has used
 * it. An expired record is deleted as well and reported as expired.
 */

export const config = { path: '/api/oauth/claim' };

import type { PairingRecord, PairingStore } from './oauth-pair.mts';

const MAX_ATTEMPTS = 20;
const ATTEMPT_WINDOW_MS = 10 * 60 * 1000;

const attempts = new Map<string, { count: number; resetAt: number }>();

export interface ClaimableStore extends PairingStore {
  take(key: string): Promise<PairingRecord | null>;
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
  });
}

export function normalizePairingCode(value: string): string {
  return value.toUpperCase().replace(/[^A-Z0-9]/g, '');
}

function clientIp(request: Request): string {
  return (
    request.headers.get('x-nf-client-connection-ip') ||
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    'unknown'
  );
}

function withinBudget(ip: string, now: number): boolean {
  const entry = attempts.get(ip);
  if (!entry || entry.resetAt <= now) {
    attempts.set(ip, { count: 1, resetAt: now + ATTEMPT_WINDOW_MS });
    return true;
  }
  entry.count += 1;
  return entry.count <= MAX_ATTEMPTS;
}

export function makeClaimHandler(store: ClaimableStore, now: () => number = Date.now) {
  return async function handler(request: Request): Promise<Response> {
    if (request.method !== 'POST') return json({ ok: false, error: 'Method not allowed' }, 405);

    if (!withinBudget(clientIp(request), now())) {
      return json({ ok: false, error: 'Too many attempts — wait a few minutes' }, 429);
    }

    let submitted = '';
    try {
      const body = (await request.json()) as { code?: unknown };
      submitted = typeof body.code === 'string' ? body.code : '';
    } catch {
      return json({ ok: false, error: 'Malformed request' }, 400);
    }

    const normalized = normalizePairingCode(submitted);
    if (!normalized) return json({ ok: false, error: 'Enter the pairing code' }, 400);

    const record = await store.take(normalized);
    if (!record) return json({ ok: false, error: 'That code is not valid on this device' }, 404);
    if (record.expiresAt <= now()) {
      return json({ ok: false, error: 'That code expired — generate a new one' }, 410);
    }

    return json({
      ok: true,
      refreshToken: record.refreshToken,
      sheetId: record.sheetId,
      sheetName: record.sheetName,
    });
  };
}

async function blobStore(): Promise<ClaimableStore> {
  const { getStore } = await import('@netlify/blobs');
  const store = getStore('breadcrumb-pairings');
  return {
    async set(key, value) {
      await store.setJSON(key, value);
    },
    async take(key) {
      const record = (await store.get(key, { type: 'json' })) as PairingRecord | null;
      // Delete first, answer second: a code that was read is already spent even
      // if the reply never arrives.
      await store.delete(key);
      return record;
    },
  };
}

export default async function handler(request: Request): Promise<Response> {
  let store: ClaimableStore;
  try {
    store = await blobStore();
  } catch {
    return json({ ok: false, error: 'Pairing storage is unavailable' }, 503);
  }
  return makeClaimHandler(store)(request);
}
