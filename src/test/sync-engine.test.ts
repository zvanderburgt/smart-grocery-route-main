import { describe, it, expect } from 'vitest';
import {
  mergeLocalAndRemote,
  itemsToRows,
  rowsToItems,
  createInitialSyncState,
  purgeStaleTombstones,
  createTombstone,
  TOMBSTONE_RETENTION_MS,
} from '../lib/sync-engine';
import { GroceryItem, GoogleSheetsRow } from '../lib/types';

describe('sync-engine', () => {
  const createItem = (overrides: Partial<GroceryItem> = {}): GroceryItem => ({
    id: '1',
    name: 'Apples',
    checked: false,
    addedAt: Date.now(),
    ...overrides,
  });

  describe('mergeLocalAndRemote', () => {
    it('merges items with no conflicts when only in one list', () => {
      const local = [createItem({ id: '1', name: 'Apples' })];
      const remote = [createItem({ id: '2', name: 'Bananas' })];

      const { merged } = mergeLocalAndRemote(local, remote);

      expect(merged).toHaveLength(2);
      expect(merged.map(m => m.name).sort()).toEqual(['Apples', 'Bananas']);
    });

    it('uses last-write-wins when same item in both, without reporting a conflict', () => {
      const baseTime = Date.now();
      const local = [createItem({ id: '1', name: 'Apples', addedAt: baseTime, checkedAt: baseTime + 1000 })];
      const remote = [createItem({ id: '1', name: 'Apples', addedAt: baseTime, checkedAt: baseTime + 500 })];

      const { merged } = mergeLocalAndRemote(local, remote);

      expect(merged).toHaveLength(1);
      expect(merged[0].checkedAt).toBe(baseTime + 1000); // local is newer
    });

    it('prefers remote when remote is newer', () => {
      const baseTime = Date.now();
      const local = [createItem({ id: '1', name: 'Apples', addedAt: baseTime, checkedAt: baseTime + 500 })];
      const remote = [createItem({ id: '1', name: 'Apples', addedAt: baseTime, checkedAt: baseTime + 1000 })];

      const { merged } = mergeLocalAndRemote(local, remote);

      expect(merged[0].checkedAt).toBe(baseTime + 1000); // remote is newer
    });

    it('handles local-only deletion (item only in local)', () => {
      const local = [createItem({ id: '1', name: 'Apples' })];
      const remote: GroceryItem[] = [];

      const { merged } = mergeLocalAndRemote(local, remote);

      expect(merged).toHaveLength(1);
      expect(merged[0].id).toBe('1');
    });

    it('handles remote-only item (item only in remote)', () => {
      const local: GroceryItem[] = [];
      const remote = [createItem({ id: '1', name: 'Apples' })];

      const { merged } = mergeLocalAndRemote(local, remote);

      expect(merged).toHaveLength(1);
      expect(merged[0].id).toBe('1');
    });

    it('does not revert a locally checked item when remote is a stale unchecked snapshot', () => {
      // Regression test for the reported bug: user checks an item while a sync
      // using a stale (unchecked) remote snapshot is still in flight. The merge
      // must keep the newer local (checked) state, not silently flag a conflict
      // and fall back to reverting it.
      const baseTime = Date.now();
      const local = [createItem({ id: '1', name: 'Milk', checked: true, addedAt: baseTime, updatedAt: baseTime + 2000 })];
      const remote = [createItem({ id: '1', name: 'Milk', checked: false, addedAt: baseTime, updatedAt: baseTime })];

      const { merged } = mergeLocalAndRemote(local, remote);

      expect(merged).toHaveLength(1);
      expect(merged[0].checked).toBe(true);
    });

    it('does not revert a locally checked item when remote has a NaN updatedAt (Finding 11 - second mechanism behind the revert bug)', () => {
      // A hand-edited or format-mangled updatedAt cell (e.g. "abc") used to come
      // back from rowToItem as NaN, not undefined. NaN breaks both === and >
      // comparisons, so the old getItemUpdatedAt/merge logic fell through to the
      // "remote is newer" else-branch and let a garbage remote row win every
      // time - reverting the user's real edit on every subsequent sync, not just
      // during a race. getItemUpdatedAt must now treat a non-finite resolved
      // value as 0 (oldest), so local's real edit wins instead.
      const baseTime = Date.now();
      const local = [createItem({ id: '1', name: 'Milk', checked: true, addedAt: baseTime, updatedAt: baseTime + 2000 })];
      const remote = [createItem({ id: '1', name: 'Milk', checked: false, addedAt: baseTime, updatedAt: NaN })];

      const { merged } = mergeLocalAndRemote(local, remote);

      expect(merged).toHaveLength(1);
      expect(merged[0].checked).toBe(true);
    });

    it('does not revert a locally checked item when remote has no timestamps at all and addedAt of 0 (Finding 11)', () => {
      // With the Finding 11/14 rowToItem fix, a remote row with entirely unknown
      // history resolves to updatedAt=undefined, checkedAt=undefined, addedAt=0 -
      // getItemUpdatedAt must resolve that to 0, not Date.now(), so it can never
      // beat a real local edit.
      const baseTime = Date.now();
      const local = [createItem({ id: '1', name: 'Milk', checked: true, addedAt: baseTime, updatedAt: baseTime + 2000 })];
      const remote = [createItem({ id: '1', name: 'Milk', checked: false, addedAt: 0, updatedAt: undefined, checkedAt: undefined })];

      const { merged } = mergeLocalAndRemote(local, remote);

      expect(merged).toHaveLength(1);
      expect(merged[0].checked).toBe(true);
    });

    it('tombstone wins over a plain remote item regardless of timestamp', () => {
      const baseTime = Date.now();
      const local = [createItem({ id: '1', name: 'Apples', addedAt: baseTime, isTombstone: true, updatedAt: baseTime })];
      const remote = [createItem({ id: '1', name: 'Apples', addedAt: baseTime, updatedAt: baseTime + 5000 })];

      const { merged } = mergeLocalAndRemote(local, remote);

      expect(merged).toHaveLength(1);
      expect(merged[0].isTombstone).toBe(true);
    });

    it('tombstone wins over a plain local item regardless of timestamp', () => {
      const baseTime = Date.now();
      const local = [createItem({ id: '1', name: 'Apples', addedAt: baseTime, updatedAt: baseTime + 5000 })];
      const remote = [createItem({ id: '1', name: 'Apples', addedAt: baseTime, isTombstone: true, updatedAt: baseTime })];

      const { merged } = mergeLocalAndRemote(local, remote);

      expect(merged).toHaveLength(1);
      expect(merged[0].isTombstone).toBe(true);
    });

    it('passes through a tombstone that only exists on one side (merge itself never filters tombstones out)', () => {
      // Merge's job is only to resolve which side wins per item id - it always
      // keeps a tombstone tagged isTombstone so callers can decide what to do
      // with it (write it as a tombstone row, filter it from the visible list,
      // purge it once stale, etc.) rather than silently dropping it here.
      const local = [createItem({ id: '1', name: 'Apples', isTombstone: true })];
      const remote: GroceryItem[] = [];

      const { merged } = mergeLocalAndRemote(local, remote);

      expect(merged).toHaveLength(1);
      expect(merged[0].isTombstone).toBe(true);
    });
  });

  describe('purgeStaleTombstones', () => {
    it('drops a tombstone older than the retention window', () => {
      const now = Date.now();
      const items = [
        createItem({ id: '1', name: 'Milk', isTombstone: true, updatedAt: now - TOMBSTONE_RETENTION_MS - 1 }),
      ];

      const result = purgeStaleTombstones(items, TOMBSTONE_RETENTION_MS, now);

      expect(result).toHaveLength(0);
    });

    it('keeps a tombstone still within the retention window', () => {
      const now = Date.now();
      const items = [
        createItem({ id: '1', name: 'Milk', isTombstone: true, updatedAt: now - 1000 }),
      ];

      const result = purgeStaleTombstones(items, TOMBSTONE_RETENTION_MS, now);

      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('1');
    });

    it('never drops a non-tombstone item, regardless of age', () => {
      const now = Date.now();
      const items = [
        createItem({ id: '1', name: 'Milk', isTombstone: false, updatedAt: now - TOMBSTONE_RETENTION_MS * 10 }),
      ];

      const result = purgeStaleTombstones(items, TOMBSTONE_RETENTION_MS, now);

      expect(result).toHaveLength(1);
    });
  });

  describe('tombstone propagation across a sync round-trip (regression for Finding 9)', () => {
    // Simulates two devices sharing one sheet, exercising the exact sequence
    // syncNow runs: merge local+remote, purge stale tombstones, "write" the
    // result back as the new shared sheet state. Before this fix, finalItems
    // stripped every tombstone unconditionally, so a deletion never reached
    // the sheet - any other device that still had the plain item would merge
    // "only in local" and resurrect it on its own next push.
    function simulateSyncPush(deviceLocal: GroceryItem[], sheet: GroceryItem[], forceDeleteIds: Set<string> = new Set()): { newSheet: GroceryItem[]; newLocal: GroceryItem[] } {
      const { merged } = mergeLocalAndRemote(deviceLocal, sheet);
      const finalItems = purgeStaleTombstones(merged).filter(item => !forceDeleteIds.has(item.id));
      const newLocal = purgeStaleTombstones(mergeLocalAndRemote(deviceLocal, finalItems).merged).filter(item => !forceDeleteIds.has(item.id));
      return { newSheet: finalItems, newLocal };
    }

    it('propagates a deletion from device A to device B instead of B resurrecting it', () => {
      const baseTime = Date.now();
      const item = createItem({ id: '1', name: 'Milk', checked: false, addedAt: baseTime, updatedAt: baseTime });

      // Both devices, and the sheet, already have the plain item (fully synced
      // before the deletion happens).
      let sheet = [item];
      let deviceB = [item];

      // Device A deletes it locally, then syncs (pushes to the sheet).
      const deviceATombstone = createTombstone(item, 'deviceA@example.com');
      const pushA = simulateSyncPush([deviceATombstone], sheet);
      sheet = pushA.newSheet;

      // The sheet must now carry the tombstone, not an empty/absent row.
      expect(sheet).toHaveLength(1);
      expect(sheet[0].isTombstone).toBe(true);

      // Device B, still holding its stale plain copy, syncs next.
      const pushB = simulateSyncPush(deviceB, sheet);
      sheet = pushB.newSheet;
      deviceB = pushB.newLocal;

      // Device B must adopt the tombstone locally (so its own UI hides the
      // item) and must NOT push the plain item back, resurrecting it.
      expect(deviceB).toHaveLength(1);
      expect(deviceB[0].isTombstone).toBe(true);
      expect(sheet).toHaveLength(1);
      expect(sheet[0].isTombstone).toBe(true);
    });

    it('purges a tombstone from both the sheet and local state once it is stale', () => {
      const now = Date.now();
      const oldTombstone = createItem({ id: '1', name: 'Milk', isTombstone: true, updatedAt: now - TOMBSTONE_RETENTION_MS - 1 });

      const { newSheet, newLocal } = simulateSyncPush([oldTombstone], [oldTombstone]);

      expect(newSheet).toHaveLength(0);
      expect(newLocal).toHaveLength(0);
    });

    it('an explicit bulk clear (forceDeleteIds) wipes the sheet row immediately instead of leaving a tombstone row', () => {
      // Regression for "Clear List doesn't clear the sheet": bulk clear removes
      // the item from local state entirely (not a tombstone) and force-excludes
      // it from the write, so it does NOT linger in the sheet for 7 days the way
      // an ordinary single-item delete's tombstone would.
      const baseTime = Date.now();
      const item = createItem({ id: '1', name: 'Milk', addedAt: baseTime, updatedAt: baseTime });
      const sheet = [item];
      const deviceLocalAfterBulkClear: GroceryItem[] = []; // item removed outright, no tombstone

      const { newSheet, newLocal } = simulateSyncPush(deviceLocalAfterBulkClear, sheet, new Set(['1']));

      expect(newSheet).toHaveLength(0);
      expect(newLocal).toHaveLength(0);
    });

    it('without forceDeleteIds, the same hard local removal would resurrect the item from the sheet (why the mechanism exists)', () => {
      // Contrast case: a plain local removal (no tombstone, no forceDeleteIds) is
      // exactly the ORIGINAL Finding 9 bug - merge treats it as "only in remote"
      // and pushes the plain item straight back into what gets written.
      const baseTime = Date.now();
      const item = createItem({ id: '1', name: 'Milk', addedAt: baseTime, updatedAt: baseTime });
      const sheet = [item];
      const deviceLocalAfterHardRemoval: GroceryItem[] = [];

      const { newSheet } = simulateSyncPush(deviceLocalAfterHardRemoval, sheet); // no forceDeleteIds

      expect(newSheet).toHaveLength(1); // resurrected - this is why bulk clear needs forceDeleteIds
    });
  });

  describe('itemsToRows / rowsToItems', () => {
    it('converts items to rows and back', () => {
      const items = [
        createItem({ id: '1', name: 'Apples', checked: true, checkedAt: Date.now(), category: 'produce', quantity: 5 }),
        createItem({ id: '2', name: 'Bananas', checked: false, category: 'produce' }),
      ];

      const rows = itemsToRows(items, 'test@example.com');
      const back = rowsToItems(rows);

      expect(back).toHaveLength(2);
      expect(back[0].id).toBe('1');
      expect(back[0].name).toBe('Apples');
      expect(back[0].checked).toBe(true);
      expect(back[0].category).toBe('produce');
      expect(back[0].quantity).toBe(5);
      expect(back[1].id).toBe('2');
      expect(back[1].checked).toBe(false);
    });

    it('handles empty category and quantity', () => {
      const items = [createItem({ id: '1', name: 'Apples', category: undefined, quantity: undefined })];

      const rows = itemsToRows(items, 'test@example.com');
      const back = rowsToItems(rows);

      expect(back[0].category).toBeUndefined();
      expect(back[0].quantity).toBeUndefined();
    });

    it('handles checkedAt as empty string from sheets', () => {
      const rows: GoogleSheetsRow[] = [{
        id: '1',
        name: 'Apples',
        checked: true,
        checkedAt: '',
        addedAt: Date.now(),
        category: 'produce',
        quantity: 5,
        updatedAt: Date.now(),
        updatedBy: 'test@example.com',
      }];

      const items = rowsToItems(rows);
      expect(items[0].checkedAt).toBeUndefined();
    });
  });

  describe('createInitialSyncState', () => {
    it('creates initial disconnected state', () => {
      const state = createInitialSyncState();

      expect(state.status).toBe('disconnected');
      expect(state.pendingWrites).toBe(0);
      expect(state.lastSyncAt).toBeUndefined();
    });
  });
});
