/**
 * React wrapper around the Sheets sync engine.
 *
 * The hook owns React state, persistence and scheduling; merging and write
 * planning live in `sync-engine.ts` / `sync-model.ts` so they can be tested
 * without rendering React.
 *
 * What is persisted (localStorage) is the user's *intent*, not in-flight state:
 *   - `google-sheets-pending-deletions` — ids deleted here that the sheet has
 *     not confirmed yet, with delete timestamps.
 *   - `google-sheets-dirty` — "local changes were never pushed", so a reload
 *     still syncs them.
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { useLocalStorage } from './use-local-storage';
import type { GoogleSheetsConfig, SyncState, GroceryItem } from '@/lib/types';
import { mergeItems, type DeletionRecord } from '@/lib/sync-model';
import { createSheetsApi, SheetsError } from '@/lib/sheets-api';
import { createSyncEngine, type SyncEngine } from '@/lib/sync-engine';
import { RELAY_BASE_URL, probeRelay } from '@/lib/sync-relay';
import { getRelayToken, relayLogin as requestRelayLogin } from '@/lib/relay-auth';
import { getDeviceId } from '@/lib/device-id';
import { markItemRevived } from '@/lib/item-mutations';
import {
  clearPairedSession,
  claimPairingCode,
  getPairedAccessToken,
  getPairedSession,
  type PairedSession,
} from '@/lib/paired-auth';
import {
  AuthRequiredError,
  getAccessToken,
  handleOAuthCodeRedirect,
  handleOAuthRedirect,
  initGoogleAuth,
  isInitialized as isGoogleAuthInitialized,
  isSignedIn as isGoogleSignedIn,
  redirectToGoogleOAuth,
  redirectToGoogleOAuthCode,
  signOut as signOutGoogle,
  trySilentSignIn,
} from '@/lib/google-auth';
import { toast } from 'sonner';

const CONFIG_KEY = 'google-sheets-config';
const PENDING_DELETIONS_KEY = 'google-sheets-pending-deletions';
/** Legacy "ids only" format written by older builds; migrated on read. */
const LEGACY_PENDING_DELETES_KEY = 'google-sheets-pending-deletes';
const DIRTY_KEY = 'google-sheets-dirty';

/**
 * Read at call time, not module load: the value is baked in at build, but a
 * function keeps it stubbable in tests and stops the constant from being the
 * thing that decides whether the hook ever touches Google.
 */
function getGoogleClientId(): string {
  return import.meta.env.VITE_GOOGLE_CLIENT_ID || '';
}

const MIN_SYNC_INTERVAL_MS = 5000;
const LOCAL_CHANGE_DEBOUNCE_MS = 1000;
const MAX_QUOTA_RESCHEDULE_MS = 60000;

export function readPendingDeletions(): DeletionRecord[] {
  try {
    const raw = window.localStorage.getItem(PENDING_DELETIONS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        return parsed
          .filter((entry): entry is DeletionRecord => !!entry && typeof entry === 'object' && typeof entry.id === 'string')
          .map((entry) => ({
            id: entry.id,
            deletedAt: Number.isFinite(entry.deletedAt) ? entry.deletedAt : Date.now(),
            deviceId: entry.deviceId,
          }));
      }
    }

    // Migration from the old ids-only format. Without a timestamp we cannot
    // distinguish a delete from a later revive, so treat them as deleted now.
    const legacy = window.localStorage.getItem(LEGACY_PENDING_DELETES_KEY);
    if (legacy) {
      const parsed = JSON.parse(legacy);
      if (Array.isArray(parsed)) {
        const migrated = parsed
          .filter((id): id is string => typeof id === 'string')
          .map((id) => ({ id, deletedAt: Date.now() }));
        writePendingDeletions(migrated);
        window.localStorage.removeItem(LEGACY_PENDING_DELETES_KEY);
        return migrated;
      }
    }
  } catch {
    // Malformed storage means "nothing pending", never a throw.
  }
  return [];
}

export function writePendingDeletions(records: DeletionRecord[]): void {
  try {
    window.localStorage.setItem(PENDING_DELETIONS_KEY, JSON.stringify(records));
  } catch {
    // Storage may be full; the sheet write still happens this session.
  }
}

export function addPendingDeletions(
  ids: string[],
  deviceId: string,
  now: number = Date.now()
): DeletionRecord[] {
  const byId = new Map(readPendingDeletions().map((record) => [record.id, record]));
  for (const id of ids) byId.set(id, { id, deletedAt: now, deviceId });
  const merged = [...byId.values()];
  writePendingDeletions(merged);
  return merged;
}

export function removePendingDeletions(ids: string[]): void {
  if (ids.length === 0) return;
  const remove = new Set(ids);
  writePendingDeletions(readPendingDeletions().filter((record) => !remove.has(record.id)));
}

export function readDirtyFlag(): boolean {
  try {
    return window.localStorage.getItem(DIRTY_KEY) === 'true';
  } catch {
    return false;
  }
}

export function writeDirtyFlag(dirty: boolean): void {
  try {
    if (dirty) window.localStorage.setItem(DIRTY_KEY, 'true');
    else window.localStorage.removeItem(DIRTY_KEY);
  } catch {
    // ignore
  }
}

interface UseGoogleSheetsSyncOptions {
  localItems: GroceryItem[];
  onItemsChange: (items: GroceryItem[] | ((prev: GroceryItem[] | undefined) => GroceryItem[])) => void;
  userEmail?: string;
  autoSync?: boolean;
  syncInterval?: number;
}

interface UseGoogleSheetsSyncReturn {
  config: GoogleSheetsConfig | null;
  setConfig: (config: Partial<GoogleSheetsConfig>) => void;
  syncState: SyncState;
  isConnected: boolean;
  isSignedIn: boolean;
  /** True when the deployment serves /api/sheets-relay: no Google session needed. */
  usingRelay: boolean;
  /** The relay wants the shared password before it will sync. */
  relayNeedsAuth: boolean;
  /** Trade the relay password for a token, then sync. */
  relayLogin: (password: string) => Promise<{ ok: boolean; error?: string }>;
  /** This device holds a paired refresh token, so it needs no Google session. */
  isPaired: boolean;
  /** Code to type on the other device, after "Pair a device". */
  pairingCode: string | null;
  pairingExpiresAt: number | null;
  pairingError: string | null;
  /** Start the code flow that hands a refresh token to another device. */
  startPairing: () => void;
  /** Redeem a pairing code typed on this device. */
  submitPairingCode: (code: string) => Promise<{ ok: boolean; error?: string }>;
  dismissPairingCode: () => void;
  /** Forget the paired session on this device. */
  unpair: () => void;
  needsReconnect: boolean;
  userEmail: string | null;
  connect: () => Promise<void>;
  reconnect: () => Promise<boolean>;
  disconnect: () => void;
  syncNow: () => Promise<void>;
  createDeletionTombstone: (itemId: string) => void;
  deleteItemsPermanently: (itemIds: string[]) => void;
  restoreItems: (items: GroceryItem[]) => void;
  lastSyncTime: number | null;
  error: string | null;
}

function signatureOf(item: GroceryItem): string {
  return [
    item.name,
    item.quantity ?? '',
    item.category ?? '',
    item.checked ? '1' : '0',
    item.checkedAt ?? '',
    item.updatedAt ?? '',
    item.revivedAt ?? '',
  ].join('|');
}

function signatureMap(items: GroceryItem[]): Map<string, string> {
  return new Map(items.filter((item) => !item.isTombstone).map((item) => [item.id, signatureOf(item)]));
}

export function useGoogleSheetsSync({
  localItems,
  onItemsChange,
  userEmail: providedUserEmail,
  autoSync = false,
  syncInterval = 30000,
}: UseGoogleSheetsSyncOptions): UseGoogleSheetsSyncReturn {
  const [config, setConfigState] = useLocalStorage<GoogleSheetsConfig | null>(CONFIG_KEY, null);
  const [syncState, setSyncState] = useState<SyncState>({ status: 'disconnected', pendingWrites: 0 });
  const [signedIn, setSignedInState] = useState(false);
  const [usingRelay, setUsingRelay] = useState(false);
  const [relayNeedsAuth, setRelayNeedsAuth] = useState(false);
  const [paired, setPairedState] = useState(false);
  const [pairingCode, setPairingCode] = useState<string | null>(null);
  const [pairingExpiresAt, setPairingExpiresAt] = useState<number | null>(null);
  const [pairingError, setPairingError] = useState<string | null>(null);
  const [needsReconnect, setNeedsReconnect] = useState(false);
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const isMountedRef = useRef(true);
  const itemsRef = useRef<GroceryItem[]>(localItems);
  const configRef = useRef<GoogleSheetsConfig | null>(config ?? null);
  const userEmailRef = useRef<string>(providedUserEmail || getDeviceId());
  const deviceIdRef = useRef(getDeviceId());
  const engineRef = useRef<SyncEngine | null>(null);
  /** Non-null once the deployment has proved it serves the relay. */
  const relayRef = useRef<{ sheetId: string } | null>(null);
  const relayAuthRequiredRef = useRef(false);
  /** Read inside callbacks: a paired device never asks Google for a token. */
  const pairedRef = useRef(false);

  const syncPromiseRef = useRef<Promise<void> | null>(null);
  const lastSyncedRef = useRef<Map<string, string>>(new Map());
  const lastSyncAtRef = useRef(0);
  const debounceRef = useRef<number | null>(null);
  const retryRef = useRef<number | null>(null);
  const quotaReschedulesRef = useRef(0);
  const errorToastedRef = useRef(false);
  const authToastedRef = useRef(false);
  const reconnectRef = useRef<(() => Promise<boolean>) | null>(null);

  useEffect(() => {
    itemsRef.current = localItems;
  }, [localItems]);

  useEffect(() => {
    configRef.current = config ?? null;
  }, [config]);

  useEffect(() => {
    userEmailRef.current = providedUserEmail || deviceIdRef.current;
    if (providedUserEmail) setUserEmail(providedUserEmail);
  }, [providedUserEmail]);

  /**
   * Relay adoption.
   *
   * Some deployments cannot run a Google session in the page at all: inside an
   * iframe Google refuses to serve its consent screen, and an Android webview
   * hands the flow off to the system browser, so the token lands somewhere this
   * page can never read. When the server answers `/api/sheets-relay/health` it
   * owns the credential instead, and every device — panel, webview, phone —
   * syncs with no sign-in step. The sheet id comes from the server because the
   * relay only serves the one spreadsheet it was configured with.
   *
   * Nothing happens on a deployment without the relay: the probe fails and the
   * hook keeps its original Google-sign-in behaviour.
   */
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const info = await probeRelay();
      if (!info || cancelled || !isMountedRef.current) return;

      relayRef.current = { sheetId: info.sheetId };
      relayAuthRequiredRef.current = Boolean(info.authRequired);
      // The API's baseUrl is fixed when the engine is built, so drop it and let
      // the next sync construct a relay-backed one.
      engineRef.current = null;
      setUsingRelay(true);
      // With the gate on, "signed in" means "this device holds a relay token".
      const holdsToken = !info.authRequired || Boolean(getRelayToken());
      setRelayNeedsAuth(!holdsToken);
      setSignedInState(holdsToken);
      setNeedsReconnect(false);
      setError(null);
      authToastedRef.current = false;
      setConfigState((prev) => ({
        ...(prev ?? { sheetId: info.sheetId, sheetName: 'GroceryList', syncEnabled: true }),
        sheetId: info.sheetId,
        sheetName: info.sheetName || prev?.sheetName || 'GroceryList',
        syncEnabled: true,
      }));
      setSyncState((prev) =>
        prev.status === 'disconnected' ? { ...prev, status: 'connecting', lastError: undefined } : prev
      );
    })();
    return () => {
      cancelled = true;
    };
  }, [setConfigState]);

  const getEngine = useCallback((): SyncEngine => {
    if (!engineRef.current) {
      const relay = relayRef.current;
      engineRef.current = createSyncEngine({
        // In relay mode the "token" is a constant: the server holds the real
        // credential and the request never leaves this origin. `baseUrl` is
        // pinned at construction, which is why adopting the relay resets the
        // engine rather than mutating it.
        api: createSheetsApi({
          getToken: async (options) => {
            if (relay) return getRelayToken();
            // A paired device refreshes with its own stored refresh token; the
            // browser never sees a Google session.
            if (pairedRef.current) {
              const { accessToken } = await getPairedAccessToken({ forceRefresh: options?.forceRefresh });
              return accessToken;
            }
            return getAccessToken(options);
          },
          baseUrl: relay ? RELAY_BASE_URL : undefined,
        }),
        getConfig: () => ({
          sheetId: configRef.current?.sheetId ?? '',
          sheetName: configRef.current?.sheetName || 'GroceryList',
        }),
        deviceId: deviceIdRef.current,
        getUserEmail: () => userEmailRef.current,
      });
    }
    return engineRef.current;
  }, []);

  /**
   * How many local items differ from what the sheet last confirmed. This is both
   * the "should we push?" test and the number the UI reports - it used to report
   * the list length, which said "12 pending" for a perfectly synced list.
   */
  const countPendingWrites = useCallback((): number => {
    const current = signatureMap(itemsRef.current);
    let pending = 0;
    for (const [id, signature] of current) {
      if (lastSyncedRef.current.get(id) !== signature) pending += 1;
    }
    for (const id of lastSyncedRef.current.keys()) {
      if (!current.has(id)) pending += 1;
    }
    return pending;
  }, []);

  /**
   * Ask Google for a token from whatever session the browser already has, with
   * no navigation and no throwing. Used on mount, when the app comes back
   * online, and from the "Reconnect" tap.
   *
   * Gated on a configured sheet: a user who never set up sync must never see a
   * Google account chooser.
   */
  const attemptSilentSignIn = useCallback(async (): Promise<boolean> => {
    // Relay mode has no session to renew: the server owns the credential.
    if (relayRef.current) {
      setSignedInState(true);
      setNeedsReconnect(false);
      setError(null);
      return true;
    }

    // A paired device is already authorised: the token comes from the pair.
    if (pairedRef.current) {
      setSignedInState(true);
      setNeedsReconnect(false);
      return true;
    }

    const clientId = getGoogleClientId();
    if (!clientId) return false;

    const currentConfig = configRef.current;
    if (!currentConfig?.sheetId || !currentConfig.syncEnabled) return false;

    // The GIS script is loaded async and can lose the race on a cold/offline
    // launch. Retry the init here rather than staying dead for the whole
    // session, which is what used to happen.
    if (!isGoogleAuthInitialized()) {
      try {
        await initGoogleAuth(clientId);
      } catch {
        return false;
      }
    }

    const ok = await trySilentSignIn();
    if (!isMountedRef.current) return ok;

    if (ok) {
      setSignedInState(true);
      setNeedsReconnect(false);
      setError(null);
      authToastedRef.current = false;
      setSyncState((prev) =>
        prev.status === 'disconnected' ? { ...prev, status: 'connecting', lastError: undefined } : prev
      );
    }
    return ok;
  }, []);

  const syncNow = useCallback(async (): Promise<void> => {
    const currentConfig = configRef.current;
    if (!currentConfig?.sheetId || !currentConfig.syncEnabled) return;

    // Gated relay with no token: asking would only earn a 401. Show the prompt
    // instead of an error the user cannot act on.
    if (relayAuthRequiredRef.current && !getRelayToken()) {
      setRelayNeedsAuth(true);
      return;
    }

    // Offline: keep the intent, drop the request. A visibility/online listener
    // picks it up again; hammering a dead network just produced error toasts.
    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      writeDirtyFlag(true);
      return;
    }

    if (syncPromiseRef.current) return syncPromiseRef.current;

    const sinceLast = Date.now() - lastSyncAtRef.current;
    if (lastSyncAtRef.current > 0 && sinceLast < MIN_SYNC_INTERVAL_MS) {
      // Coalesce into one run at the end of the floor instead of dropping the
      // request (a dropped request waited for the next periodic tick).
      if (retryRef.current) window.clearTimeout(retryRef.current);
      retryRef.current = window.setTimeout(() => {
        retryRef.current = null;
        if (isMountedRef.current) void syncNow();
      }, MIN_SYNC_INTERVAL_MS - sinceLast);
      return;
    }

    const deletionsSnapshot = readPendingDeletions();

    const run = (async () => {
      setSyncState((prev) => ({ ...prev, status: 'syncing', pendingWrites: countPendingWrites() }));
      setError(null);

      try {
        const result = await getEngine().sync(
          itemsRef.current.filter((item) => !item.isTombstone),
          deletionsSnapshot
        );
        if (!isMountedRef.current) return;

        // Fold the result into the list as it is *now*, so an edit made while
        // the request was in flight survives the round trip.
        onItemsChange((current) => mergeItems(current ?? [], result.items).merged);

        removePendingDeletions(deletionsSnapshot.map((record) => record.id));
        lastSyncedRef.current = signatureMap(result.items);
        lastSyncAtRef.current = Date.now();
        writeDirtyFlag(false);
        quotaReschedulesRef.current = 0;
        errorToastedRef.current = false;
        authToastedRef.current = false;
        setNeedsReconnect(false);

        // A header that does not match this build is reported, not rewritten.
        // ensureSheets() is memoized per engine, so this is a cached read.
        const structure = await getEngine().ensureSheets();
        if (structure.headerWarning) setError(structure.headerWarning);

        setSyncState({
          status: 'synced',
          lastSyncAt: lastSyncAtRef.current,
          pendingWrites: 0,
          lastError: structure.headerWarning,
          lastRun: {
            pushed: result.writtenRows + result.appendedRows,
            received: result.items.length,
          },
        });
      } catch (err) {
        if (!isMountedRef.current) return;
        const message = err instanceof Error ? err.message : 'Sync failed';

        setError(message);
        setSyncState((prev) => ({
          ...prev,
          status: 'error',
          lastError: message,
          pendingWrites: countPendingWrites(),
        }));

        // A 401 that survives the one refresh-and-retry is also "reconnect", not
        // a generic failure: the token was handed out and still refused.
        const isAuthFailure =
          err instanceof AuthRequiredError || (err instanceof SheetsError && err.kind === 'auth');

        if (isAuthFailure && relayRef.current) {
          // The relay refused the token: expired, or the password changed.
          setRelayNeedsAuth(true);
          setSignedInState(false);
          setNeedsReconnect(false);
          setError('Sign in to sync');
          setSyncState((prev) => ({ ...prev, status: 'error', lastError: 'Sign in to sync' }));
          return;
        }

        if (isAuthFailure && pairedRef.current) {
          // Google refused the paired refresh token: expired (they last seven
          // days while the OAuth app is in Testing) or revoked.
          clearPairedSession();
          pairedRef.current = false;
          setPairedState(false);
          const pairMessage = 'This device needs to be paired again';
          setError(pairMessage);
          setPairingError(pairMessage);
          setSignedInState(false);
          setSyncState((prev) => ({ ...prev, status: 'error', lastError: pairMessage }));
          return;
        }

        if (isAuthFailure) {
          // Not "signed out": the pending deletions and the dirty flag are in
          // localStorage, so nothing is lost — the session just needs one tap.
          // Silently dropping to `signedIn: false` (the old behaviour, with the
          // toast skipped) left the user to discover it in Settings and walk
          // the whole consent screen again.
          const authMessage = 'Google sign-in expired. Reconnect to resume syncing — nothing was lost.';
          setError(authMessage);
          setSignedInState(false);
          setNeedsReconnect(true);
          setSyncState((prev) => ({ ...prev, status: 'error', lastError: authMessage }));

          if (!authToastedRef.current) {
            authToastedRef.current = true;
            toast.error('Google sign-in expired — your list is saved', {
              description: 'Reconnect to finish the sync. Nothing was lost.',
              action: {
                label: 'Reconnect',
                onClick: () => {
                  void reconnectRef.current?.();
                },
              },
            });
          }
          return;
        }

        if (!errorToastedRef.current) {
          errorToastedRef.current = true;
          toast.error(`Sync failed: ${message}`);
        }

        // One reschedule for quota pressure. The API layer already spent its own
        // backoff, so this is about not hammering a saturated quota, not a retry
        // loop layered on top of another retry loop.
        const isQuota = /quota|rate limit|429/i.test(message);
        if (isQuota && quotaReschedulesRef.current < 3) {
          quotaReschedulesRef.current += 1;
          const delay = Math.min(2000 * 2 ** quotaReschedulesRef.current, MAX_QUOTA_RESCHEDULE_MS);
          if (retryRef.current) window.clearTimeout(retryRef.current);
          retryRef.current = window.setTimeout(() => {
            retryRef.current = null;
            if (isMountedRef.current) void syncNow();
          }, delay);
        }
      } finally {
        syncPromiseRef.current = null;
      }
    })();

    syncPromiseRef.current = run;
    return run;
  }, [countPendingWrites, getEngine, onItemsChange]);

  /**
   * Turn a pairing return into a code the other device can type. Deliberately
   * silent on success beyond the code itself: the refresh token stays on the
   * server until it is redeemed, never in this response.
   */
  const completePairing = useCallback(
    async (result: { code: string; sheetId?: string; sheetName?: string }) => {
      setPairingError(null);
      try {
        const response = await fetch('/api/oauth/pair', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            code: result.code,
            redirectUri: window.location.origin,
            sheetId: result.sheetId ?? configRef.current?.sheetId,
            sheetName: result.sheetName ?? configRef.current?.sheetName,
          }),
        });
        const body = (await response.json().catch(() => null)) as
          | { ok?: boolean; code?: string; expiresAt?: number; error?: string }
          | null;
        if (!isMountedRef.current) return;
        if (!response.ok || !body?.ok || !body.code) {
          setPairingError(body?.error || 'Could not create a pairing code');
          return;
        }
        setPairingCode(body.code);
        setPairingExpiresAt(typeof body.expiresAt === 'number' ? body.expiresAt : null);
      } catch {
        if (isMountedRef.current) setPairingError('Could not reach the sync server');
      }
    },
    []
  );

  // Bootstrap auth once and consume an OAuth redirect return.
  useEffect(() => {
    isMountedRef.current = true;

    // A pairing return is consumed first: it is a single-use code with a
    // ten-minute life, and it needs no GIS script to exchange.
    const pairReturn = handleOAuthCodeRedirect();
    if (pairReturn) void completePairing(pairReturn);

    // A device that already holds a paired session needs no Google work at all.
    const storedPair = getPairedSession();
    if (storedPair) {
      pairedRef.current = true;
      setPairedState(true);
      setSignedInState(true);
      setNeedsReconnect(false);
      if (storedPair.sheetId) {
        const pairedSheetId = storedPair.sheetId;
        setConfigState((prev) => ({
          ...(prev ?? { sheetId: pairedSheetId, sheetName: 'GroceryList', syncEnabled: true }),
          sheetId: pairedSheetId,
          sheetName: storedPair.sheetName || prev?.sheetName || 'GroceryList',
          syncEnabled: true,
        }));
      }
    }

    // The OAuth response itself needs no GIS script, so consume it first: a
    // slow or blocked script must not strand a token that is already in the URL.
    const redirect = handleOAuthRedirect();
    if (redirect) {
      if (redirect.sheetId) {
        setConfigState((prev) => ({
          sheetId: redirect.sheetId as string,
          sheetName: redirect.sheetName || prev?.sheetName || 'GroceryList',
          syncEnabled: true,
          connectedAccountEmail: prev?.connectedAccountEmail,
          lastSyncAt: prev?.lastSyncAt,
        }));
      }
      setSignedInState(true);
      setNeedsReconnect(false);
    }

    void (async () => {
      const clientId = getGoogleClientId();
      if (!clientId) return;

      try {
        await initGoogleAuth(clientId);
      } catch (err) {
        // A token restored from storage still works without GIS; the
        // online/visibility retry below picks the script up when it can load.
        if (!isMountedRef.current) return;
        if (redirect || isGoogleSignedIn()) {
          setSignedInState(true);
          setNeedsReconnect(false);
        } else {
          setError(err instanceof Error ? err.message : 'Failed to initialize Google Sign-In');
        }
        return;
      }

      if (!isMountedRef.current) return;
      if (redirect || isGoogleSignedIn()) {
        setSignedInState(true);
        setNeedsReconnect(false);
      }
    })();

    return () => {
      isMountedRef.current = false;
    };
  }, [completePairing, setConfigState]);

  // With a sheet configured but no live session, ask Google for a token before
  // asking the user for anything. This is the recovery the app was missing:
  // `signedIn` used to be decided exactly once per load, from sessionStorage,
  // and every sync path is gated on it — so a cold start with empty
  // sessionStorage (reopened PWA, new tab) or an hourly expiry left the app
  // waiting for a consent screen nobody had been told to open.
  useEffect(() => {
    if (!config?.sheetId || !config.syncEnabled || signedIn) return;
    // Once a sync has actually been rejected, wait for the user's tap (or for
    // them to come back to the app) instead of immediately retrying: a token
    // that is issued but still refused would otherwise ping-pong between
    // "signed in" and "sync failed" as fast as the effects can run.
    if (needsReconnect) return;
    void attemptSilentSignIn();
  }, [config?.sheetId, config?.syncEnabled, signedIn, needsReconnect, attemptSilentSignIn]);

  // Same recovery when the network or the deferred GIS script comes back.
  useEffect(() => {
    if (signedIn) return;

    const retry = () => {
      if (document.visibilityState !== 'visible') return;
      void attemptSilentSignIn();
    };

    window.addEventListener('online', retry);
    document.addEventListener('visibilitychange', retry);
    return () => {
      window.removeEventListener('online', retry);
      document.removeEventListener('visibilitychange', retry);
    };
  }, [signedIn, attemptSilentSignIn]);

  // First sync after connecting, and after any reload that left work behind.
  useEffect(() => {
    if (!config?.sheetId || !config.syncEnabled || !signedIn) return;
    if (syncState.status === 'synced' || syncState.status === 'syncing') return;

    // Baseline for "already pushed": everything on screen, unless a previous run
    // left unsynced changes behind (in which case everything counts as pending).
    if (!readDirtyFlag() && lastSyncedRef.current.size === 0) {
      lastSyncedRef.current = signatureMap(itemsRef.current);
    }

    setSyncState((prev) => ({ ...prev, status: 'connecting' }));
    void syncNow();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [config?.sheetId, config?.syncEnabled, signedIn]);

  // Local edits -> debounced push. Comparing signatures against the last
  // confirmed state is what keeps a sync's own result from looking like a new
  // local edit, which would loop forever.
  useEffect(() => {
    if (!config?.sheetId || !config.syncEnabled || !signedIn) return;

    if (countPendingWrites() === 0) {
      writeDirtyFlag(false);
      return;
    }

    writeDirtyFlag(true);

    if (debounceRef.current) window.clearTimeout(debounceRef.current);
    debounceRef.current = window.setTimeout(() => {
      debounceRef.current = null;
      if (isMountedRef.current && !syncPromiseRef.current) void syncNow();
    }, LOCAL_CHANGE_DEBOUNCE_MS);

    return () => {
      if (debounceRef.current) {
        window.clearTimeout(debounceRef.current);
        debounceRef.current = null;
      }
    };
  }, [localItems, config?.sheetId, config?.syncEnabled, signedIn, countPendingWrites, syncNow]);

  // Periodic pull while the tab is visible; immediate pull when the tab comes
  // back or the network returns.
  useEffect(() => {
    if (!autoSync || !config?.syncEnabled || !signedIn) return;

    const intervalId = window.setInterval(() => {
      if (document.visibilityState !== 'visible') return;
      if (!isMountedRef.current || syncPromiseRef.current) return;
      void syncNow();
    }, syncInterval);

    const onVisible = () => {
      if (document.visibilityState === 'visible') void syncNow();
    };
    const onOnline = () => {
      if (isMountedRef.current) void syncNow();
    };

    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('online', onOnline);

    return () => {
      window.clearInterval(intervalId);
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('online', onOnline);
    };
  }, [autoSync, config?.syncEnabled, signedIn, syncInterval, syncNow]);

  // Keep lastSyncAt on the persisted config for the settings UI.
  useEffect(() => {
    if (!syncState.lastSyncAt) return;
    setConfigState((prev) => (prev ? { ...prev, lastSyncAt: syncState.lastSyncAt } : null));
  }, [syncState.lastSyncAt, setConfigState]);

  useEffect(() => {
    return () => {
      isMountedRef.current = false;
      if (debounceRef.current) window.clearTimeout(debounceRef.current);
      if (retryRef.current) window.clearTimeout(retryRef.current);
    };
  }, []);

  const setConfig = useCallback(
    (partial: Partial<GoogleSheetsConfig>) => {
      setConfigState((prev) =>
        prev
          ? { ...prev, ...partial }
          : {
              sheetId: partial.sheetId || '',
              sheetName: partial.sheetName || 'GroceryList',
              syncEnabled: partial.syncEnabled ?? true,
              ...partial,
            }
      );
    },
    [setConfigState]
  );

  const connect = useCallback(async (): Promise<void> => {
    // Relay mode: there is nothing to authorize, so "Connect" is just
    // "enable sync and go". No navigation, which is the whole point.
    if (relayRef.current) {
      setConfig({ syncEnabled: true });
      setSignedInState(true);
      setNeedsReconnect(false);
      setError(null);
      await syncNow();
      return;
    }

    if (!config?.sheetId) {
      setError('Please enter a Google Sheet ID first');
      toast.error('Please enter a Google Sheet ID first');
      throw new Error('No sheet ID');
    }
    if (!getGoogleClientId()) {
      setError('Google Sign-In not configured for this build');
      // Name the variable: this build-time setting is the only cause, and the
      // toast is the only place a user finds out.
      toast.error('Google Sign-In not configured (VITE_GOOGLE_CLIENT_ID missing)');
      throw new Error('No Client ID');
    }

    setSyncState((prev) => ({ ...prev, status: 'connecting', lastError: undefined }));
    setError(null);

    // Navigates away. The promise resolves rather than hanging forever, so a
    // caller awaiting connect() does not stall when navigation is blocked.
    redirectToGoogleOAuth(getGoogleClientId(), {
      sheetId: config.sheetId,
      sheetName: config.sheetName || 'GroceryList',
    });
  }, [config?.sheetId, config?.sheetName]);

  /**
   * Renew in place, from the user's tap. GIS will hand back a token for the
   * existing Google session without any consent UI when it is called from a
   * gesture — which is exactly the call that fails silently from a background
   * sync. The pending push (deletions + dirty flag) is still on disk, so a
   * success here finishes the sync that failed.
   */
  const reconnect = useCallback(async (): Promise<boolean> => {
    setError(null);
    setSyncState((prev) => ({ ...prev, status: 'connecting', lastError: undefined }));

    // Relay mode has no session to renew — retrying the sync is the whole fix.
    if (relayRef.current) {
      await syncNow();
      return true;
    }

    const ok = await attemptSilentSignIn();
    if (!isMountedRef.current) return ok;

    if (!ok) {
      const message = 'Google sign-in needs one tap — press Connect in Settings.';
      setNeedsReconnect(true);
      setError(message);
      setSyncState((prev) => ({ ...prev, status: 'error', lastError: message }));
      return false;
    }

    await syncNow();
    return true;
  }, [attemptSilentSignIn, syncNow]);

  useEffect(() => {
    reconnectRef.current = reconnect;
  }, [reconnect]);

  const disconnect = useCallback(() => {
    signOutGoogle();
    setSignedInState(false);
    setNeedsReconnect(false);
    authToastedRef.current = false;
    setUserEmail(null);
    setSyncState({ status: 'disconnected', pendingWrites: 0 });
    lastSyncedRef.current = new Map();
    writeDirtyFlag(false);
    engineRef.current = null;
    setConfig({ syncEnabled: false });
    toast.success('Disconnected from Google Sheets');
  }, [setConfig]);

  const createDeletionTombstone = useCallback(
    (itemId: string) => {
      addPendingDeletions([itemId], deviceIdRef.current);
      onItemsChange((prev) => (prev ?? []).filter((item) => item.id !== itemId));
      void syncNow();
    },
    [onItemsChange, syncNow]
  );

  // "Clear list" / "Clear completed": the same durable path as a single delete
  // now that deletions are recorded in their own tab, so the other device
  // cannot push the cleared items back.
  const deleteItemsPermanently = useCallback(
    (itemIds: string[]) => {
      if (itemIds.length === 0) return;
      addPendingDeletions(itemIds, deviceIdRef.current);
      const remove = new Set(itemIds);
      onItemsChange((prev) => (prev ?? []).filter((item) => !remove.has(item.id)));
      void syncNow();
    },
    [onItemsChange, syncNow]
  );

  const restoreItems = useCallback(
    (items: GroceryItem[]) => {
      if (items.length === 0) return;
      const now = Date.now();
      removePendingDeletions(items.map((item) => item.id));

      // `revivedAt` outranks the deletion record; without it the next merge
      // would (correctly) keep the deletion and the undo would silently vanish.
      const restored = items.map((item) => markItemRevived(item, userEmailRef.current, now));

      onItemsChange((prev) => {
        const byId = new Map(restored.map((item) => [item.id, item]));
        const existing = new Set((prev ?? []).map((item) => item.id));
        return [
          ...(prev ?? []).map((item) => byId.get(item.id) ?? item),
          ...restored.filter((item) => !existing.has(item.id)),
        ];
      });

      void syncNow();
    },
    [onItemsChange, syncNow]
  );

  /**
   * Password sign-in for the relay. On success the token is in localStorage, so
   * the next sync carries it and the panel stays signed in across reloads (each
   * top-level site gets its own storage partition, hence one sign-in per embed).
   */
  const relaySignIn = useCallback(
    async (password: string): Promise<{ ok: boolean; error?: string }> => {
      const result = await requestRelayLogin(password);
      if (!result.ok) return result;
      if (!isMountedRef.current) return result;
      setRelayNeedsAuth(false);
      setSignedInState(true);
      setNeedsReconnect(false);
      setError(null);
      await syncNow();
      return result;
    },
    [syncNow]
  );

  /** Start the code flow that mints a refresh token for another device. */
  const startPairing = useCallback(() => {
    const clientId = getGoogleClientId();
    if (!clientId) {
      toast.error('Google Sign-In not configured (VITE_GOOGLE_CLIENT_ID missing)');
      return;
    }
    if (!configRef.current?.sheetId) {
      toast.error('Enter and save a Sheet ID first — the paired device inherits it');
      return;
    }
    setPairingError(null);
    try {
      redirectToGoogleOAuthCode(clientId, {
        sheetId: configRef.current.sheetId,
        sheetName: configRef.current.sheetName,
      });
    } catch (error) {
      setPairingError(error instanceof Error ? error.message : 'Could not start pairing');
    }
  }, []);

  /** Redeem a code typed on this device and start syncing with it. */
  const submitPairingCode = useCallback(
    async (code: string): Promise<{ ok: boolean; error?: string }> => {
      setPairingError(null);
      const result = await claimPairingCode(code, {
        sheetId: configRef.current?.sheetId,
        sheetName: configRef.current?.sheetName,
      });
      if (!result.ok || !result.session) {
        const message = result.error || 'Pairing failed';
        setPairingError(message);
        return { ok: false, error: message };
      }

      const session: PairedSession = result.session;
      pairedRef.current = true;
      setPairedState(true);
      setSignedInState(true);
      setNeedsReconnect(false);
      setError(null);
      setConfigState((prev) => ({
        ...(prev ?? { sheetId: session.sheetId ?? '', sheetName: 'GroceryList', syncEnabled: true }),
        sheetId: session.sheetId || prev?.sheetId || '',
        sheetName: session.sheetName || prev?.sheetName || 'GroceryList',
        syncEnabled: true,
      }));
      setSyncState((prev) => ({ ...prev, status: 'connecting', lastError: undefined }));
      return { ok: true };
    },
    [setConfigState]
  );

  const dismissPairingCode = useCallback(() => {
    setPairingCode(null);
    setPairingExpiresAt(null);
  }, []);

  /** Forget the pairing on this device; the sheet and the list stay put. */
  const unpair = useCallback(() => {
    clearPairedSession();
    pairedRef.current = false;
    setPairedState(false);
    setSignedInState(false);
    setError(null);
    setPairingError(null);
    setSyncState((prev) => ({ ...prev, status: 'disconnected', lastError: undefined }));
    toast.success('Unpaired this device');
  }, []);

  return {
    config: config ?? null,
    setConfig,
    syncState,
    isConnected: syncState.status === 'synced' || syncState.status === 'syncing',
    isSignedIn: signedIn,
    usingRelay,
    relayNeedsAuth,
    relayLogin: relaySignIn,
    isPaired: paired,
    pairingCode,
    pairingExpiresAt,
    pairingError,
    startPairing,
    submitPairingCode,
    dismissPairingCode,
    unpair,
    needsReconnect,
    userEmail,
    connect,
    reconnect,
    disconnect,
    syncNow: syncNow as () => Promise<void>,
    createDeletionTombstone,
    deleteItemsPermanently,
    restoreItems,
    lastSyncTime: syncState.lastSyncAt || null,
    error,
  };
}
