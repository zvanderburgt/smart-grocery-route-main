/**
 * React Hook for Google Sheets Sync
 * Manages authentication, sync state, and automatic background sync
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { useLocalStorage } from './use-local-storage';
import type {
  GoogleSheetsConfig,
  SyncState,
  GroceryItem,
} from '@/lib/types';
import {
  initGoogleSheetsAuth,
  redirectToGoogleOAuth,
  signOut as signOutGoogle,
  isSignedIn as checkSignedIn,
  handleOAuthRedirect,
  ensureGroceryListSheet,
  getAllGroceryItems,
  syncItemsToSheets,
} from '@/lib/google-sheets';
import {
  mergeLocalAndRemote,
  createInitialSyncState,
  createTombstone,
  purgeStaleTombstones,
} from '@/lib/sync-engine';
import { toast } from 'sonner';

const CONFIG_KEY = 'google-sheets-config';
const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID || '';

/**
 * Whether the local-changes effect should even consider triggering a sync.
 * Gated on "has at least one sync completed this session" (a non-empty
 * lastSyncedItemsKey) rather than "the list currently has items" - the old
 * `localItems.length > 0` check meant a genuinely emptied list (e.g. after a
 * bulk clear) could never be pushed by this listener, since the gate blocked
 * it outright. Before any sync completes, lastSyncedItemsKey is '' and this
 * still correctly returns false, preserving the original startup-wipe
 * protection (do not push a not-yet-loaded empty list before anything has
 * been read).
 */
export function shouldConsiderAutoSync(lastSyncedItemsKey: string): boolean {
  return lastSyncedItemsKey !== '';
}

const PENDING_DELETES_KEY = 'google-sheets-pending-deletes';

/**
 * Read the set of item ids from an explicit bulk clear (deleteItemsPermanently)
 * that still need to be excluded from the sheet on the next successful sync.
 * Backed by plain localStorage (not the useLocalStorage hook's React state) so
 * it can be read/written synchronously from inside syncNow's async closure -
 * the same reasoning as itemsRef/lastSyncedItemsRef elsewhere in this file:
 * a value read across an await needs to reflect the latest write, not whatever
 * was current when the closure was created. Persisting it (instead of a bare
 * useRef Set) is what lets a reload during the sync window not lose track of
 * ids that still need to be force-deleted, so a resurrected item does not
 * silently come back from the sheet.
 */
export function readPendingDeleteIds(): Set<string> {
  try {
    const raw = window.localStorage.getItem(PENDING_DELETES_KEY);
    if (!raw) return new Set();
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return new Set();
    return new Set(parsed.filter((id): id is string => typeof id === 'string'));
  } catch {
    return new Set();
  }
}

export function writePendingDeleteIds(ids: Set<string>): void {
  try {
    window.localStorage.setItem(PENDING_DELETES_KEY, JSON.stringify(Array.from(ids)));
  } catch {
    // localStorage might be full or unavailable - fail silently, same as useLocalStorage does
  }
}

interface UseGoogleSheetsSyncOptions {
  localItems: GroceryItem[];
  onItemsChange: (items: GroceryItem[] | ((prev: GroceryItem[] | undefined) => GroceryItem[])) => void;
  userEmail?: string;
  autoSync?: boolean; // default: true
  syncInterval?: number; // default: 30000 (30 seconds)
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

export function useGoogleSheetsSync({
  localItems,
  onItemsChange,
  userEmail: providedUserEmail,
  autoSync = false,
  syncInterval = 30000,
}: UseGoogleSheetsSyncOptions): UseGoogleSheetsSyncReturn {
  const [config, setConfigState] = useLocalStorage<GoogleSheetsConfig | null>(CONFIG_KEY, null);
  const [syncState, setSyncState] = useState<SyncState>(createInitialSyncState());
  const [isSignedIn, setIsSignedIn] = useState(false);
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const syncIntervalRef = useRef<number | null>(null);
  const isSyncingRef = useRef(false);
  const abortControllerRef = useRef<AbortController | null>(null);
  const lastSyncedItemsRef = useRef<string>(''); // Track last synced items to avoid redundant syncs
  const userIdRef = useRef<string>(providedUserEmail || 'unknown@user.com');
  const isMountedRef = useRef(true);
  const pendingSyncTriggerRef = useRef<{ timeoutId: number; reason: string } | null>(null);
  const rateLimitedRetryRef = useRef<number | null>(null); // Timer for a sync deferred by the rate limiter
  const syncPromiseRef = useRef<Promise<void> | null>(null);
  const lastSyncTimeRef = useRef<number>(0); // Track last successful sync time
  const minSyncIntervalRef = useRef(5000); // Minimum 5 seconds between syncs
  const retryCountRef = useRef(0); // Track retry attempts for exponential backoff
  const hasSyncErrorToastedRef = useRef(false); // Only toast once per new failure, not per retry
  const itemsRef = useRef<GroceryItem[]>(localItems); // Always-current items, read inside syncNow instead of the stale closure
  const forceDeleteFollowUpPendingRef = useRef(false); // Guards against stacking more than one follow-up sync when syncNow is called again while a sync is already in flight

  // Keep itemsRef current every render so an in-flight sync reads the latest
  // local state instead of whatever localItems was when syncNow was created.
  useEffect(() => {
    itemsRef.current = localItems;
  }, [localItems]);

  // Initialize Google Auth on mount
  useEffect(() => {
    isMountedRef.current = true;
    if (!GOOGLE_CLIENT_ID) {
      console.warn('[GoogleSheets] VITE_GOOGLE_CLIENT_ID not set');
      return;
    }

    userIdRef.current = providedUserEmail || 'unknown@user.com';

    initGoogleSheetsAuth(GOOGLE_CLIENT_ID)
      .then(() => {
        // Check if we're returning from OAuth redirect
        return handleOAuthRedirect();
      })
      .then((restoredToken) => {
        if (!isMountedRef.current) return;

        if (restoredToken) {
          console.log('[GoogleSheets] Token restored from redirect');
          setIsSignedIn(true);
          if (config?.connectedAccountEmail) {
            setUserEmail(config.connectedAccountEmail);
          }
          // Ensure sheet exists (but don't sync to avoid infinite loop)
          if (config?.sheetId) {
            setSyncState(prev => ({ ...prev, status: 'connecting' }));
            ensureGroceryListSheet({ sheetId: config.sheetId, sheetName: config.sheetName || 'GroceryList', syncEnabled: true })
              .then(() => {
                if (!isMountedRef.current) return;
                console.log('[GoogleSheets] Sheet ensured after redirect');
                // Disabled syncNow to prevent infinite loop
                // return syncNow();
              })
              .catch(err => {
                if (!isMountedRef.current) return;
                console.error('[GoogleSheets] Post-redirect sync failed:', err);
                setError(err.message);
                setSyncState(prev => ({ ...prev, status: 'error', lastError: err.message }));
              });
          }
        }
        // Also check normal signed-in state
        const signedIn = checkSignedIn();
        setIsSignedIn(signedIn);
        if (signedIn && config?.connectedAccountEmail) {
          setUserEmail(config.connectedAccountEmail);
        }
      })
      .catch(err => {
        if (!isMountedRef.current) return;
        console.error('[GoogleSheets] Auth init failed:', err);
        setError('Failed to initialize Google Sign-In');
      });

    return () => {
      isMountedRef.current = false;
    };
  }, [config?.connectedAccountEmail]);

  // Update sync state when config changes
  useEffect(() => {
    if (!isMountedRef.current) return;

    if (config?.sheetId && config.syncEnabled) {
      // Check if we have valid token
      if (checkSignedIn()) {
        setIsSignedIn(true);
        // Initial sync on connect
        if (syncState.status === 'disconnected' || syncState.status === 'error') {
          setSyncState(prev => ({ ...prev, status: 'connecting' }));
          syncNow().catch(console.error);
        }
      }
    } else {
      setSyncState(createInitialSyncState());
      setIsSignedIn(false);
      setUserEmail(null);
      stopAutoSync();
    }
  }, [config?.sheetId, config?.syncEnabled]);

  // Auto-sync when local items change (write to sheets) - debounced
  useEffect(() => {
    if (!isMountedRef.current) return;

    if (config?.sheetId && config.syncEnabled && isSignedIn) {
      // Only trigger if at least one sync has already completed - this lets a
      // genuinely emptied list (e.g. after a bulk clear) still get pushed,
      // while a not-yet-loaded empty list before the first sync does not.
      if (shouldConsiderAutoSync(lastSyncedItemsRef.current)) {
        const currentItemsKey = JSON.stringify(localItems.map(i => ({
          id: i.id,
          name: i.name,
          checked: i.checked,
          quantity: i.quantity,
          category: i.category,
          checkedAt: i.checkedAt,
          updatedAt: i.updatedAt,
          updatedBy: i.updatedBy,
          isTombstone: i.isTombstone,
        })));

        if (currentItemsKey !== lastSyncedItemsRef.current) {
          // Clear any existing pending sync trigger
          if (pendingSyncTriggerRef.current) {
            clearTimeout(pendingSyncTriggerRef.current.timeoutId);
          }

          const timeoutId = window.setTimeout(() => {
            if (isMountedRef.current && !isSyncingRef.current && syncState.status !== 'syncing') {
              syncNow().catch(console.error);
            }
            pendingSyncTriggerRef.current = null;
          }, 1000);

          pendingSyncTriggerRef.current = { timeoutId, reason: 'local-changes' };
        }
      }
    }
  }, [localItems, config?.sheetId, config?.syncEnabled, isSignedIn, syncState.status]);

  // Auto-sync interval - periodic pull/push while the tab is visible.
  // Skipped silently while the tab is hidden/backgrounded (no point burning quota
  // on a list nobody's looking at); a visibilitychange listener below triggers one
  // immediate sync when the tab becomes visible again, since that's when a user
  // actually expects to see fresh data.
  useEffect(() => {
    if (!isMountedRef.current) return;

    if (autoSync && config?.syncEnabled && isSignedIn) {
      startAutoSync(syncInterval);

      const handleVisibilityChange = () => {
        if (document.visibilityState === 'visible' && isMountedRef.current && !isSyncingRef.current && syncState.status !== 'syncing') {
          syncNow().catch(console.error);
        }
      };
      document.addEventListener('visibilitychange', handleVisibilityChange);

      return () => {
        document.removeEventListener('visibilitychange', handleVisibilityChange);
        stopAutoSync();
      };
    } else {
      stopAutoSync();
    }

    return () => stopAutoSync();
  }, [autoSync, config?.syncEnabled, isSignedIn, syncInterval]);

  // Persist sync state
  useEffect(() => {
    if (!isMountedRef.current) return;
    setConfigState(prev => {
      if (!prev) return null;
      return { ...prev, lastSyncAt: syncState.lastSyncAt };
    });
  }, [syncState.lastSyncAt, setConfigState]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      isMountedRef.current = false;
      if (pendingSyncTriggerRef.current) {
        clearTimeout(pendingSyncTriggerRef.current.timeoutId);
      }
      if (rateLimitedRetryRef.current) {
        clearTimeout(rateLimitedRetryRef.current);
      }
      stopAutoSync();
    };
  }, []);

  const setConfig = useCallback((partialConfig: Partial<GoogleSheetsConfig>) => {
    setConfigState(prev => {
      if (prev) {
        return { ...prev, ...partialConfig };
      }
      // Create initial config if it doesn't exist
      return {
        sheetId: partialConfig.sheetId || '',
        sheetName: partialConfig.sheetName || 'GroceryList',
        syncEnabled: partialConfig.syncEnabled ?? true,
        ...partialConfig,
      };
    });
  }, [setConfigState]);

  const startAutoSync = useCallback((intervalMs = syncInterval) => {
    stopAutoSync();
    syncIntervalRef.current = window.setInterval(() => {
      // Skip silently while the tab is hidden/backgrounded - no point polling a
      // list nobody's looking at. A visibilitychange listener triggers a sync
      // immediately when the tab becomes visible again.
      if (document.visibilityState !== 'visible') {
        return;
      }
      if (isMountedRef.current && !isSyncingRef.current && syncState.status !== 'syncing') {
        // Check rate limiting before triggering periodic sync
        const now = Date.now();
        const timeSinceLastSync = now - lastSyncTimeRef.current;
        if (timeSinceLastSync >= minSyncIntervalRef.current || lastSyncTimeRef.current === 0) {
          syncNow().catch(console.error);
        } else {
          console.log('[GoogleSheets] Skipping periodic sync - rate limited');
        }
      }
    }, intervalMs);
  }, [syncInterval, syncState.status]);

  const stopAutoSync = useCallback(() => {
    if (syncIntervalRef.current) {
      clearInterval(syncIntervalRef.current);
      syncIntervalRef.current = null;
    }
  }, []);

  const connect = useCallback((): Promise<void> => {
    console.log('[useGoogleSheetsSync] >>> CONNECT CLICKED <<<');
    console.log('[useGoogleSheetsSync] config:', config);
    console.log('[useGoogleSheetsSync] GOOGLE_CLIENT_ID present:', !!GOOGLE_CLIENT_ID);

    if (!config?.sheetId) {
      setError('Please enter a Google Sheet ID first');
      toast.error('Please enter a Google Sheet ID first');
      return Promise.reject(new Error('No sheet ID'));
    }

    if (!GOOGLE_CLIENT_ID) {
      setError('Google Client ID not configured');
      toast.error('Google Sign-In not configured');
      return Promise.reject(new Error('No client ID'));
    }

    // Set connecting state immediately
    setSyncState(prev => ({ ...prev, status: 'connecting', lastError: undefined }));
    setError(null);

    // Store sheet config in sessionStorage for after redirect
    sessionStorage.setItem('google_sheets_sheet_id', config.sheetId);
    sessionStorage.setItem('google_sheets_sheet_name', config.sheetName || 'GroceryList');

    // For redirect mode: manually redirect to Google OAuth
    redirectToGoogleOAuth(GOOGLE_CLIENT_ID);
    console.log('[useGoogleSheetsSync] redirectToGoogleOAuth called - PAGE WILL REDIRECT TO GOOGLE');

    // Return a promise that never resolves (page will redirect)
    return new Promise(() => {});
  }, [config, providedUserEmail, setConfig]);

  const disconnect = useCallback(() => {
    stopAutoSync();
    signOutGoogle();
    setIsSignedIn(false);
    setUserEmail(null);
    setSyncState(createInitialSyncState());
    setConfig({ syncEnabled: false });
    toast.success('Disconnected from Google Sheets');
  }, [setConfig, stopAutoSync]);

  // Core sync function with proper locking and rate limiting
  const syncNow = useCallback(async () => {
    if (!config?.sheetId || !isSignedIn) {
      return;
    }

    // Rate limiting: enforce minimum interval between syncs. Instead of dropping
    // the request outright (which would silently lose whatever change triggered
    // this call until some other edit happens to retrigger it), reschedule it for
    // when the minimum interval will have elapsed.
    const now = Date.now();
    const timeSinceLastSync = now - lastSyncTimeRef.current;
    if (timeSinceLastSync < minSyncIntervalRef.current && lastSyncTimeRef.current > 0) {
      const remainingWait = minSyncIntervalRef.current - timeSinceLastSync;
      console.log('[GoogleSheets] Sync rate limited, retrying in', remainingWait, 'ms');
      if (rateLimitedRetryRef.current) {
        clearTimeout(rateLimitedRetryRef.current);
      }
      rateLimitedRetryRef.current = window.setTimeout(() => {
        rateLimitedRetryRef.current = null;
        if (isMountedRef.current) {
          syncNow().catch(console.error);
        }
      }, remainingWait);
      return;
    }

    // Use a promise-based lock to prevent concurrent syncs
    if (isSyncingRef.current) {
      // If there's already a sync in progress, return that promise. If that
      // in-flight sync already snapshotted the pending force-delete ids before
      // this call (e.g. a new bulk clear just happened), its own write can't
      // know about ids added after its snapshot - schedule exactly one follow-up
      // sync once it settles, instead of leaving those ids to wait for the next
      // periodic sync (up to 60s later). Guarded by forceDeleteFollowUpPendingRef
      // so repeated calls while still in flight only ever queue one follow-up.
      if (syncPromiseRef.current) {
        if (!forceDeleteFollowUpPendingRef.current) {
          forceDeleteFollowUpPendingRef.current = true;
          syncPromiseRef.current.finally(() => {
            forceDeleteFollowUpPendingRef.current = false;
            if (isMountedRef.current) {
              syncNow().catch(console.error);
            }
          });
        }
        return syncPromiseRef.current;
      }
      return;
    }

    // Create the sync promise and store it
    const syncPromise = (async () => {
      isSyncingRef.current = true;
      abortControllerRef.current = new AbortController();

      try {
        // Read the freshest local items via the ref, not the localItems captured
        // when this callback was created - a check made while a previous sync is
        // still in flight (network latency + the 1s debounce) must not be lost
        // to a stale snapshot.
        const currentLocalItems = itemsRef.current;

        setSyncState(prev => ({ ...prev, status: 'syncing', pendingWrites: currentLocalItems.length }));
        setError(null);

        const sheetConfig = {
          sheetId: config.sheetId,
          sheetName: config.sheetName || 'GroceryList',
          syncEnabled: true,
        };

        // 1. Fetch remote items - getAllGroceryItems already returns fully-parsed
        // GroceryItem-shaped objects, no further conversion needed.
        const remoteItems = await getAllGroceryItems(sheetConfig);

        // 2. Merge local and remote per-item, last-write-wins by updatedAt.
        // Tombstones always win regardless of timestamp - this is what lets a
        // deletion propagate to a device that still has the plain item.
        const { merged } = mergeLocalAndRemote(currentLocalItems, remoteItems);

        // 3. Purge tombstones old enough that every device has almost certainly
        // already synced past the deletion. Everything else - including recent
        // tombstones - stays in finalItems, so it gets WRITTEN to the sheet as a
        // tombstone row (not silently dropped): that's what lets another device
        // that still has the plain item learn about the deletion instead of
        // resurrecting it on its own next push.
        // Ids from an explicit bulk clear (deleteItemsPermanently) are excluded
        // outright instead of going through the tombstone-row path: the user just
        // asked for those to be gone, so the sheet should actually look empty for
        // them right away rather than showing a lingering flagged row for up to 7
        // days. Read from persisted storage (not a bare ref) so a reload during
        // the sync window doesn't lose track of which ids still need excluding -
        // snapshot it now so a *new* clear requested while this exact sync is
        // still in flight isn't cleared from storage below until its own write
        // actually happens (the in-flight-race follow-up above is what picks up
        // ids added after this snapshot).
        const idsToForceDelete = readPendingDeleteIds();
        const finalItems = purgeStaleTombstones(merged).filter(item => !idsToForceDelete.has(item.id));

        // 4. Write final items back to sheets (with retry logic for quota errors)
        const email = userEmail || providedUserEmail || 'unknown@user.com';
        await syncWithRetry(sheetConfig, finalItems, email);

        // The write above just confirmed those ids are actually gone from the
        // sheet - remove exactly the ones this sync excluded (not the whole
        // current set) from persisted storage, same success-based timing as
        // before, just backed by localStorage instead of a bare ref.
        if (idsToForceDelete.size > 0) {
          const remaining = readPendingDeleteIds();
          for (const id of idsToForceDelete) {
            remaining.delete(id);
          }
          writePendingDeleteIds(remaining);
        }

        // 5. Update last synced items to prevent redundant syncs
        lastSyncedItemsRef.current = JSON.stringify(finalItems.map(i => ({
          id: i.id,
          name: i.name,
          checked: i.checked,
          quantity: i.quantity,
          category: i.category,
          checkedAt: i.checkedAt,
          updatedAt: i.updatedAt,
          updatedBy: i.updatedBy,
          isTombstone: i.isTombstone,
        })));

        // 6. Merge the sync result into whatever the CURRENT app state is (never
        // replace wholesale with the pre-sync snapshot - a functional update reads
        // the state at commit time, so any edit made during this sync is preserved).
        // A tombstone arriving from remote (someone else deleted the item) lands in
        // local storage here too, where the app's existing `!item.isTombstone` view
        // filter hides it - and purgeStaleTombstones converges local storage to drop
        // it for good once it's old enough, rather than only purging the sheet copy.
        // Force-deleted ids are stripped here too, so a stale remote read that still
        // reports the plain item can't resurrect it into local state either.
        onItemsChange(current => purgeStaleTombstones(mergeLocalAndRemote(current ?? [], finalItems).merged).filter(item => !idsToForceDelete.has(item.id)));

        // 7. Update sync state
        const syncCompleteTime = Date.now();
        lastSyncTimeRef.current = syncCompleteTime;
        retryCountRef.current = 0; // Reset retry count on success
        hasSyncErrorToastedRef.current = false; // Next failure gets a fresh toast

        if (isMountedRef.current) {
          setSyncState(prev => ({
            ...prev,
            status: 'synced',
            lastSyncAt: syncCompleteTime,
            pendingWrites: 0,
            lastError: undefined,
          }));
        }
      } catch (err) {
        if (!isMountedRef.current) return;

        // Check if it's a quota error and we should retry
        const message = err instanceof Error ? err.message : 'Sync failed';
        const isQuotaError = message.includes('quota') || message.includes('429') || message.includes('rate limit');

        if (isQuotaError && retryCountRef.current < 3) {
          retryCountRef.current++;
          const delay = Math.min(1000 * Math.pow(2, retryCountRef.current), 30000); // Exponential backoff, max 30s
          console.log(`[GoogleSheets] Quota error, retrying in ${delay}ms (attempt ${retryCountRef.current}/3)`);

          setSyncState(prev => ({ ...prev, status: 'syncing', pendingWrites: itemsRef.current.length }));

          // Wait and retry - transient/in-progress retries stay silent, no toast
          await new Promise(resolve => setTimeout(resolve, delay));
          isSyncingRef.current = false;
          syncPromiseRef.current = null;

          // Retry the sync
          return syncNow();
        }

        setError(message);
        setSyncState(prev => ({ ...prev, status: 'error', lastError: message, pendingWrites: 0 }));
        console.error('[GoogleSheets] Sync failed:', err);

        // Sync has failed terminally (retries exhausted or non-quota error) - show
        // exactly one toast for this failure, not one per retry attempt, and don't
        // repeat it while the same error persists (the header status icon already
        // reflects the error state for as long as it's active).
        if (!hasSyncErrorToastedRef.current) {
          hasSyncErrorToastedRef.current = true;
          if (isQuotaError) {
            toast.error('Sync failed: Google Sheets API quota exceeded. Please wait a moment and try again.');
          } else {
            toast.error(`Sync failed: ${message}`);
          }
        }
      } finally {
        isSyncingRef.current = false;
        syncPromiseRef.current = null;
      }
    })();

    syncPromiseRef.current = syncPromise;
    return syncPromise;
  }, [config, isSignedIn, onItemsChange, userEmail, providedUserEmail]);


  // Helper function to sync with retry logic for API quota errors
  const syncWithRetry = useCallback(async (sheetConfig: any, items: GroceryItem[], email: string, maxRetries = 3) => {
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        await syncItemsToSheets(sheetConfig, items, email);
        return;
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Unknown error';
        const isQuotaError = message.includes('quota') || message.includes('429') || message.includes('rate limit');

        if (isQuotaError && attempt < maxRetries) {
          const delay = Math.min(1000 * Math.pow(2, attempt), 30000); // Exponential backoff
          console.log(`[GoogleSheets] Write quota error, retrying in ${delay}ms (attempt ${attempt + 1}/${maxRetries})`);
          await new Promise(resolve => setTimeout(resolve, delay));
          continue;
        }
        throw err;
      }
    }
  }, []);

  // Helper to create a tombstone for deleted items
  const createDeletionTombstone = useCallback((itemId: string) => {
    const item = localItems.find(i => i.id === itemId);
    if (!item) return;

    const tombstone = createTombstone(item, userIdRef.current);
    onItemsChange((prev: GroceryItem[] | undefined) => {
      // Replace the item with its tombstone
      return (prev ?? []).map(i => i.id === itemId ? tombstone : i);
    });
  }, [localItems, onItemsChange]);

  // Bulk/explicit clear (e.g. "Clear List", "Clear Completed"): the user made a
  // deliberate, decisive choice, so unlike a single-item delete these ids are
  // removed outright - locally right away, and excluded from the sheet on the
  // very next sync - rather than lingering as a tombstone row for up to 7 days.
  // Trade-off: if another device edited one of these exact items in the last
  // few seconds before this syncs, that edit is lost instead of preserved.
  const deleteItemsPermanently = useCallback((itemIds: string[]) => {
    if (itemIds.length === 0) return;
    const idSet = new Set(itemIds);
    const pending = readPendingDeleteIds();
    itemIds.forEach(id => pending.add(id));
    writePendingDeleteIds(pending);
    onItemsChange((prev: GroceryItem[] | undefined) => (prev ?? []).filter(item => !idSet.has(item.id)));
    syncNow().catch(console.error);
  }, [onItemsChange, syncNow]);

  // Undo for either delete path: cancel any pending force-delete for these ids
  // and put the items back with a fresh timestamp, so they beat their own
  // tombstone/deleted row when the next sync merges.
  const restoreItems = useCallback((items: GroceryItem[]) => {
    if (items.length === 0) return;

    const pending = readPendingDeleteIds();
    items.forEach(item => pending.delete(item.id));
    writePendingDeleteIds(pending);

    const restored = items.map(item => ({
      ...item,
      isTombstone: false,
      updatedAt: Date.now(),
      updatedBy: userIdRef.current,
    }));

    onItemsChange((prev: GroceryItem[] | undefined) => {
      const byId = new Map(restored.map(item => [item.id, item]));
      const existing = new Set((prev ?? []).map(item => item.id));
      return [
        ...(prev ?? []).map(item => byId.get(item.id) ?? item),
        ...restored.filter(item => !existing.has(item.id)),
      ];
    });
  }, [onItemsChange]);

  return {
    config: config ?? null,
    setConfig,
    syncState,
    isConnected: syncState.status === 'synced' || syncState.status === 'syncing',
    isSignedIn,
    userEmail,
    connect,
    disconnect: disconnect as () => void,
    syncNow,
    createDeletionTombstone,
    deleteItemsPermanently,
    restoreItems,
    lastSyncTime: syncState.lastSyncAt || null,
    error,
  };
}