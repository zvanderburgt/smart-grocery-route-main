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
import { createSheetsApi } from '@/lib/sheets-api';
import { createSyncEngine, type SyncEngine } from '@/lib/sync-engine';
import { getDeviceId } from '@/lib/device-id';
import { markItemRevived } from '@/lib/item-mutations';
import {
  AuthRequiredError,
  getAccessToken,
  handleOAuthRedirect,
  initGoogleAuth,
  isSignedIn as isGoogleSignedIn,
  redirectToGoogleOAuth,
  signOut as signOutGoogle,
} from '@/lib/google-auth';
import { toast } from 'sonner';

const CONFIG_KEY = 'google-sheets-config';
const PENDING_DELETIONS_KEY = 'google-sheets-pending-deletions';
/** Legacy "ids only" format written by older builds; migrated on read. */
const LEGACY_PENDING_DELETES_KEY = 'google-sheets-pending-deletes';
const DIRTY_KEY = 'google-sheets-dirty';

const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID || '';

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
  userEmail: string | null;
  connect: () => Promise<void>;
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
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const isMountedRef = useRef(true);
  const itemsRef = useRef<GroceryItem[]>(localItems);
  const configRef = useRef<GoogleSheetsConfig | null>(config ?? null);
  const userEmailRef = useRef<string>(providedUserEmail || getDeviceId());
  const deviceIdRef = useRef(getDeviceId());
  const engineRef = useRef<SyncEngine | null>(null);

  const syncPromiseRef = useRef<Promise<void> | null>(null);
  const lastSyncedRef = useRef<Map<string, string>>(new Map());
  const lastSyncAtRef = useRef(0);
  const debounceRef = useRef<number | null>(null);
  const retryRef = useRef<number | null>(null);
  const quotaReschedulesRef = useRef(0);
  const errorToastedRef = useRef(false);

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

  const getEngine = useCallback((): SyncEngine => {
    if (!engineRef.current) {
      engineRef.current = createSyncEngine({
        api: createSheetsApi({ getToken: (options) => getAccessToken(options) }),
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

  const syncNow = useCallback(async (): Promise<void> => {
    const currentConfig = configRef.current;
    if (!currentConfig?.sheetId || !currentConfig.syncEnabled) return;

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

        // A header that does not match this build is reported, not rewritten.
        // ensureSheets() is memoized per engine, so this is a cached read.
        const structure = await getEngine().ensureSheets();
        if (structure.headerWarning) setError(structure.headerWarning);

        setSyncState({
          status: 'synced',
          lastSyncAt: lastSyncAtRef.current,
          pendingWrites: 0,
          lastError: structure.headerWarning,
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

        if (err instanceof AuthRequiredError) {
          setSignedInState(false);
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

  // Bootstrap auth once and consume an OAuth redirect return.
  useEffect(() => {
    isMountedRef.current = true;
    if (!GOOGLE_CLIENT_ID) return;

    initGoogleAuth(GOOGLE_CLIENT_ID)
      .then(() => {
        const redirect = handleOAuthRedirect();
        if (!isMountedRef.current) return;

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
          return;
        }

        setSignedInState(isGoogleSignedIn());
      })
      .catch((err) => {
        if (!isMountedRef.current) return;
        setError(err instanceof Error ? err.message : 'Failed to initialize Google Sign-In');
      });

    return () => {
      isMountedRef.current = false;
    };
  }, [setConfigState]);

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
    if (!config?.sheetId) {
      setError('Please enter a Google Sheet ID first');
      toast.error('Please enter a Google Sheet ID first');
      throw new Error('No sheet ID');
    }
    if (!GOOGLE_CLIENT_ID) {
      setError('Google Client ID not configured');
      toast.error('Google Sign-In not configured');
      throw new Error('No Client ID');
    }

    setSyncState((prev) => ({ ...prev, status: 'connecting', lastError: undefined }));
    setError(null);

    // Navigates away. The promise resolves rather than hanging forever, so a
    // caller awaiting connect() does not stall when navigation is blocked.
    redirectToGoogleOAuth(GOOGLE_CLIENT_ID, {
      sheetId: config.sheetId,
      sheetName: config.sheetName || 'GroceryList',
    });
  }, [config?.sheetId, config?.sheetName]);

  const disconnect = useCallback(() => {
    signOutGoogle();
    setSignedInState(false);
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

  return {
    config: config ?? null,
    setConfig,
    syncState,
    isConnected: syncState.status === 'synced' || syncState.status === 'syncing',
    isSignedIn: signedIn,
    userEmail,
    connect,
    disconnect,
    syncNow: syncNow as () => Promise<void>,
    createDeletionTombstone,
    deleteItemsPermanently,
    restoreItems,
    lastSyncTime: syncState.lastSyncAt || null,
    error,
  };
}
