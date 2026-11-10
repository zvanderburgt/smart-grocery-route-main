import { describe, it, expect } from 'vitest';
import {
  ITEM_HEADER,
  MAX_CLOCK_SKEW_MS,
  applyDeletions,
  dedupeDeletions,
  deletionsFromLegacyTombstones,
  getItemUpdatedAt,
  itemToRow,
  mergeItems,
  parseDeletionRows,
  rowToItem,
  rowsToLocatedItems,
  sanitizeTimestamp,
} from '@/lib/sync-model';
import type { GroceryItem } from '@/lib/types';

const NOW = 1_000_000;

const item = (overrides: Partial<GroceryItem> = {}): GroceryItem => ({
  id: 'milk',
  name: 'Milk',
  checked: false,
  addedAt: 100,
  updatedAt: 100,
  ...overrides,
});

describe('timestamp hygiene', () => {
  it('treats blank and garbage timestamps as unknown, never as "now"', () => {
    expect(sanitizeTimestamp('', NOW)).toBeUndefined();
    expect(sanitizeTimestamp('abc', NOW)).toBeUndefined();
    expect(sanitizeTimestamp(NaN, NOW)).toBeUndefined();
    expect(sanitizeTimestamp(0, NOW)).toBeUndefined();
    expect(sanitizeTimestamp(null, NOW)).toBeUndefined();
  });

  it('pulls a far-future timestamp back to now', () => {
    const farFuture = NOW + MAX_CLOCK_SKEW_MS + 60_000;
    expect(sanitizeTimestamp(farFuture, NOW)).toBe(NOW);
  });

  it('keeps a timestamp inside the skew window', () => {
    const slightlyAhead = NOW + 60_000;
    expect(sanitizeTimestamp(slightlyAhead, NOW)).toBe(slightlyAhead);
  });

  it('orders by the newest of updatedAt / checkedAt / revivedAt / addedAt', () => {
    expect(getItemUpdatedAt(item({ addedAt: 1, updatedAt: 5, checkedAt: 9 }))).toBe(9);
    expect(getItemUpdatedAt(item({ addedAt: 1, updatedAt: 5, revivedAt: 12 }))).toBe(12);
    expect(getItemUpdatedAt({ ...item(), updatedAt: undefined, checkedAt: undefined })).toBe(100);
  });
});

describe('row serialization', () => {
  it('round-trips an item through a row', () => {
    const original = item({ quantity: 2, category: 'dairy', checked: true, checkedAt: 500 });
    const row = itemToRow(original, 'me@example.com', NOW);
    const parsed = rowToItem(row, { now: NOW, rowNumber: 4 });

    expect(row).toHaveLength(ITEM_HEADER.length);
    expect(parsed?.item).toMatchObject({
      id: 'milk',
      name: 'Milk',
      checked: true,
      checkedAt: 500,
      quantity: 2,
      category: 'dairy',
    });
    expect(parsed?.rowNumber).toBe(4);
  });

  it('never writes a tombstone flag - deletions live in their own tab', () => {
    const row = itemToRow(item({ isTombstone: true }), 'me@example.com', NOW);
    expect(row[ITEM_HEADER.indexOf('isTombstone')]).toBe('FALSE');
  });

  it('accepts a short hand-typed row with only id and name', () => {
    const parsed = rowToItem(['eggs', 'Eggs'], { now: NOW, rowNumber: 2 });
    expect(parsed?.item).toMatchObject({ id: 'eggs', name: 'Eggs', checked: false, addedAt: 0 });
    expect(parsed?.item.updatedAt).toBeUndefined();
  });

  it('parses boolean cells and keeps unknown ids out of the result', () => {
    expect(rowToItem(['x', 'X', true, '', 1, '', '', 2, 'me', false, ''], { now: NOW })?.item.checked).toBe(true);
    expect(rowToItem(['', 'No id'], { now: NOW })).toBeNull();
    expect(rowToItem([], { now: NOW })).toBeNull();
  });

  it('tracks sheet row numbers so writes stay row-scoped', () => {
    const located = rowsToLocatedItems(
      [
        ['a', 'A'],
        ['', ''],
        ['b', 'B'],
      ],
      { now: NOW, firstRowNumber: 2 }
    );

    expect(located.map((row) => [row.item.id, row.rowNumber])).toEqual([
      ['a', 2],
      ['b', 4],
    ]);
  });
});

describe('deletion records', () => {
  it('dedupes to the newest record per id', () => {
    const ledger = dedupeDeletions([
      { id: 'a', deletedAt: 10 },
      { id: 'a', deletedAt: 30 },
      { id: 'b', deletedAt: 5 },
    ]);

    expect(ledger.get('a')?.deletedAt).toBe(30);
    expect(ledger.get('b')?.deletedAt).toBe(5);
  });

  it('parses rows and ignores blank ids', () => {
    const records = parseDeletionRows([['a', 10, 'device-1'], ['', 20, 'x']], { now: NOW });
    expect(records).toEqual([{ id: 'a', deletedAt: 10, deviceId: 'device-1' }]);
  });

  it('drops deleted items but keeps ones restored afterwards', () => {
    const ledger = dedupeDeletions([{ id: 'milk', deletedAt: 500 }]);

    const { items, removed } = applyDeletions(
      [item({ id: 'milk' }), item({ id: 'eggs', revivedAt: 900 })],
      ledger
    );

    expect(removed).toEqual(['milk']);
    expect(items.map((entry) => entry.id)).toEqual(['eggs']);
  });

  it('a revive that happened before the delete does not resurrect the item', () => {
    const ledger = dedupeDeletions([{ id: 'milk', deletedAt: 500 }]);
    const { items } = applyDeletions([item({ id: 'milk', revivedAt: 400 })], ledger);
    expect(items).toEqual([]);
  });

  it('converts legacy tombstone rows into deletion records', () => {
    const records = deletionsFromLegacyTombstones([
      item({ id: 'milk', isTombstone: true, updatedAt: 777, updatedBy: 'device-9' }),
      item({ id: 'eggs' }),
    ]);

    expect(records).toEqual([{ id: 'milk', deletedAt: 777, deviceId: 'device-9' }]);
  });
});

describe('field-level merge', () => {
  it('keeps the newer content and the newer check state independently', () => {
    const local = item({ name: 'Milk', checked: true, checkedAt: 900, updatedAt: 100 });
    const remote = item({ name: 'Whole Milk', checked: false, updatedAt: 500 });

    const { merged } = mergeItems([local], [remote], { now: NOW });

    expect(merged[0].name).toBe('Whole Milk');
    expect(merged[0].checked).toBe(true);
  });

  it('includes items that exist on only one side', () => {
    const { merged } = mergeItems([item({ id: 'milk' })], [item({ id: 'eggs', name: 'Eggs' })], { now: NOW });
    expect(merged.map((entry) => entry.id).sort()).toEqual(['eggs', 'milk']);
  });

  it('breaks ties deterministically, so both devices agree', () => {
    const a = item({ name: 'Milk A', updatedAt: 500, updatedBy: 'device-a' });
    const b = item({ name: 'Milk B', updatedAt: 500, updatedBy: 'device-b' });

    const first = mergeItems([a], [b], { now: NOW }).merged[0];
    const second = mergeItems([b], [a], { now: NOW }).merged[0];

    expect(first.name).toBe(second.name);
  });

  it('counts a differing field as a resolved conflict', () => {
    const { conflicts } = mergeItems(
      [item({ name: 'Milk', updatedAt: 900 })],
      [item({ name: 'Whole Milk', updatedAt: 100 })],
      { now: NOW }
    );
    expect(conflicts).toBe(1);
  });

  it('never returns a tombstone from a merge', () => {
    const { merged } = mergeItems([item({ isTombstone: true })], [item()], { now: NOW });
    expect(merged[0].isTombstone).toBe(false);
  });
});
