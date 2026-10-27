import {
  GroceryItem,
  GoogleSheetsRow,
  SyncState,
} from './types';

/**
 * Get the last updated timestamp for a GroceryItem
 * Uses updatedAt if available, otherwise checkedAt if checked, otherwise addedAt as fallback.
 * If the resolved value is not a finite number (e.g. a garbage/unparseable remote
 * timestamp slipped through as NaN), treat it as the oldest possible timestamp (0)
 * rather than letting it win a last-write-wins comparison by accident - an unknown
 * history must always lose to a real local edit, never look "freshest".
 */
function getItemUpdatedAt(item: GroceryItem): number {
  const resolved = item.updatedAt ?? item.checkedAt ?? item.addedAt;
  return Number.isFinite(resolved) ? resolved : 0;
}

/**
 * Merge local and remote items using pure last-write-wins by updatedAt.
 * Tombstones (deletions) always win regardless of timestamp.
 * There is no conflict-detection step: an ordinary edit/timestamp difference
 * after a sheet round-trip is expected and resolved silently by LWW - it is
 * never reported as a conflict requiring user resolution.
 */
export function mergeLocalAndRemote(
  localItems: GroceryItem[],
  remoteItems: GroceryItem[]
): { merged: GroceryItem[] } {
  const localMap = new Map(localItems.map(item => [item.id, item]));
  const remoteMap = new Map(remoteItems.map(item => [item.id, item]));
  const allIds = new Set([...localMap.keys(), ...remoteMap.keys()]);

  const merged: GroceryItem[] = [];

  for (const id of allIds) {
    const localItem = localMap.get(id);
    const remoteItem = remoteMap.get(id);

    if (localItem && remoteItem) {
      const localIsTombstone = isTombstone(localItem);
      const remoteIsTombstone = isTombstone(remoteItem);
      // Both exist - check if either is a tombstone
      if (localIsTombstone || remoteIsTombstone) {
        // Tombstone wins - deletion takes precedence
        if (localIsTombstone && remoteIsTombstone) {
          // Both are tombstones - pick either
          merged.push(localItem);
        } else if (localIsTombstone) {
          // Local deleted, remote has item - deletion wins
          merged.push(localItem);
        } else {
          // Remote deleted, local has item - deletion wins
          merged.push(remoteItem);
        }
      } else {
        // Both are regular items - compare timestamps, newer wins
        const localUpdatedAt = getItemUpdatedAt(localItem);
        const remoteUpdatedAt = getItemUpdatedAt(remoteItem);

        if (localUpdatedAt === remoteUpdatedAt) {
          // Same timestamp - prefer local (arbitrary but consistent)
          merged.push(localItem);
        } else if (localUpdatedAt > remoteUpdatedAt) {
          // Local is newer
          merged.push(localItem);
        } else {
          // Remote is newer
          merged.push(remoteItem);
        }
      }
    } else if (localItem && !remoteItem) {
      // Only in local - new item added locally (or tombstone for deletion)
      merged.push(localItem);
    } else if (!localItem && remoteItem) {
      // Only in remote - new item added remotely (or tombstone for deletion)
      merged.push(remoteItem);
    }
  }

  return { merged };
}

/**
 * Convert GroceryItem array to GoogleSheetsRow array
 */
export function itemsToRows(items: GroceryItem[], userEmail: string): GoogleSheetsRow[] {
  const now = Date.now();
  return items.map(item => ({
    id: item.id,
    name: item.name,
    checked: item.checked,
    checkedAt: item.checkedAt ?? '',
    addedAt: item.addedAt,
    category: item.category ?? '',
    quantity: item.quantity ?? '',
    updatedAt: item.updatedAt ?? getItemUpdatedAt(item),
    updatedBy: item.updatedBy ?? userEmail,
    isTombstone: item.isTombstone === true,
  }));
}

/**
 * Convert GoogleSheetsRow array to GroceryItem array
 */
export function rowsToItems(rows: GoogleSheetsRow[]): GroceryItem[] {
  return rows.map(row => ({
    id: row.id,
    name: row.name,
    checked: row.checked,
    checkedAt: typeof row.checkedAt === 'number' ? row.checkedAt : undefined,
    addedAt: row.addedAt,
    category: row.category || undefined,
    quantity: typeof row.quantity === 'number' ? row.quantity : undefined,
    updatedAt: typeof row.updatedAt === 'number' ? row.updatedAt : undefined,
    updatedBy: row.updatedBy || undefined,
    isTombstone: row.isTombstone === true,
  }));
}

/**
 * Create initial sync state
 */
export function createInitialSyncState(): SyncState {
  return {
    status: 'disconnected',
    pendingWrites: 0,
  };
}

/**
 * Detect if an item was deleted (tombstone) vs never existed
 */
export function isTombstone(item: GroceryItem): boolean {
  return item.isTombstone === true;
}

/**
 * Create a tombstone for a deleted item
 */
export function createTombstone(item: GroceryItem, userId: string): GroceryItem {
  return {
    ...item,
    isTombstone: true,
    updatedAt: Date.now(),
    updatedBy: userId,
  };
}

/**
 * How long a tombstone is kept (and actively written to the sheet) after
 * deletion before it's purged for good.
 */
export const TOMBSTONE_RETENTION_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

/**
 * Drop tombstones once they're old enough that every device has almost
 * certainly already synced and seen the deletion. Without this, tombstones
 * (and the sheet rows/local-storage entries backing them) would accumulate
 * forever.
 *
 * ponytail: a device that's been offline longer than the retention window,
 * and still holds its pre-deletion copy of the item, can resurrect it once
 * the tombstone is gone everywhere else (there's no longer anything to tell
 * it "this was deleted"). Upgrade path: a longer window, or a separate
 * append-only "known deleted ids" ledger that never expires.
 */
export function purgeStaleTombstones(
  items: GroceryItem[],
  maxAgeMs: number = TOMBSTONE_RETENTION_MS,
  now: number = Date.now()
): GroceryItem[] {
  return items.filter(item => !(isTombstone(item) && now - getItemUpdatedAt(item) > maxAgeMs));
}
