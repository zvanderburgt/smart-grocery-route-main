/**
 * Server-side Sheets relay ("relay mode").
 *
 * The app normally talks to the Sheets API with an OAuth token held in this
 * browsing context's sessionStorage. That cannot work anywhere the page is not
 * a first-class browser context: Google refuses to serve its sign-in page
 * inside a frame (`accounts.google.com` sends `x-frame-options: DENY`), and an
 * Android webview hands the consent screen off to the system browser, so the
 * token lands in a different browser and this page stays signed out forever.
 *
 * Relay mode moves the credential to the server: `/api/sheets-relay/*` holds a
 * refresh token and forwards the call to the Sheets API. The page only ever
 * fetches its own origin, so framing and storage stop mattering.
 *
 * The relay advertises itself through `/api/sheets-relay/health`. A deployment
 * without the relay env vars (and every `npm run dev` session) answers that
 * probe with a non-200, `probeRelay` returns null, and the app keeps using
 * Google sign-in — this module is inert until the server is configured.
 */

export const RELAY_BASE_URL = '/api/sheets-relay/v4/spreadsheets';

const RELAY_HEALTH_URL = '/api/sheets-relay/health';

export interface RelayInfo {
  sheetId: string;
  sheetName?: string;
  /** The deployment requires the shared password before it will sync. */
  authRequired?: boolean;
}

let probe: Promise<RelayInfo | null> | null = null;

/** Drop the cached probe result (tests, and after the server is reconfigured). */
export function resetRelayProbe(): void {
  probe = null;
}

/** True only for responses that look like a configured relay. */
export function relayInfoFrom(body: unknown): RelayInfo | null {
  const candidate = body as { ok?: unknown; sheetId?: unknown; sheetName?: unknown } | null;
  if (!candidate || candidate.ok !== true) return null;
  if (typeof candidate.sheetId !== 'string' || candidate.sheetId.length === 0) return null;
  return {
    sheetId: candidate.sheetId,
    sheetName: typeof candidate.sheetName === 'string' ? candidate.sheetName : undefined,
    authRequired: (candidate as { authRequired?: unknown }).authRequired === true,
  };
}

/**
 * Ask the deployment whether it has a relay. Never throws, never rejects: a
 * missing relay is the normal case, not an error worth surfacing.
 */
export async function probeRelay(timeoutMs = 3000): Promise<RelayInfo | null> {
  if (!probe) {
    probe = (async () => {
      const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
      const timer = controller ? setTimeout(() => controller.abort(), timeoutMs) : null;
      try {
        const response = await fetch(RELAY_HEALTH_URL, {
          headers: { accept: 'application/json' },
          signal: controller?.signal,
        });
        if (!response.ok) return null;
        return relayInfoFrom(await response.json());
      } catch {
        return null;
      } finally {
        if (timer) clearTimeout(timer);
      }
    })();
  }
  return probe;
}
