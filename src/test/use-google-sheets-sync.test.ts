import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import {
  addPendingDeletions,
  readDirtyFlag,
  readPendingDeletions,
  removePendingDeletions,
  useGoogleSheetsSync,
  writeDirtyFlag,
  writePendingDeletions,
} from '@/hooks/use-google-sheets-sync';
import type { GroceryItem } from '@/lib/types';

const PENDING_KEY = 'google-sheets-pending-deletions';
const LEGACY_KEY = 'google-sheets-pending-deletes';

beforeEach(() => {
  window.localStorage.clear();
});

describe('pending deletions (persisted intent)', () => {
  it('starts empty', () => {
    expect(readPendingDeletions()).toEqual([]);
  });

  it('round-trips through localStorage with timestamps', () => {
    writePendingDeletions([{ id: 'milk', deletedAt: 100, deviceId: 'device-1' }]);

    expect(readPendingDeletions()).toEqual([{ id: 'milk', deletedAt: 100, deviceId: 'device-1' }]);
  });

  it('keeps the newest record when the same id is deleted twice', () => {
    addPendingDeletions(['milk'], 'device-1', 100);
    const merged = addPendingDeletions(['milk', 'eggs'], 'device-1', 200);

    expect(merged).toEqual([
      { id: 'milk', deletedAt: 200, deviceId: 'device-1' },
      { id: 'eggs', deletedAt: 200, deviceId: 'device-1' },
    ]);
  });

  it('removes exactly the ids a successful sync pushed', () => {
    addPendingDeletions(['keep-me', 'remove-me'], 'device-1', 100);
    removePendingDeletions(['remove-me']);

    expect(readPendingDeletions().map((record) => record.id)).toEqual(['keep-me']);
  });

  it('migrates the legacy ids-only format into timed records', () => {
    window.localStorage.setItem(LEGACY_KEY, JSON.stringify(['old-1', 'old-2']));

    const migrated = readPendingDeletions();

    expect(migrated.map((record) => record.id)).toEqual(['old-1', 'old-2']);
    expect(migrated.every((record) => record.deletedAt > 0)).toBe(true);
    expect(window.localStorage.getItem(LEGACY_KEY)).toBeNull();
  });

  it('ignores malformed or non-array storage instead of throwing', () => {
    window.localStorage.setItem(PENDING_KEY, '{not json');
    expect(readPendingDeletions()).toEqual([]);

    window.localStorage.setItem(PENDING_KEY, JSON.stringify({ nope: true }));
    expect(readPendingDeletions()).toEqual([]);

    window.localStorage.setItem(PENDING_KEY, JSON.stringify([{ id: 123 }, { deletedAt: 5 }]));
    expect(readPendingDeletions()).toEqual([]);
  });
});

describe('dirty flag', () => {
  it('reflects unsynced local changes across reloads', () => {
    expect(readDirtyFlag()).toBe(false);

    writeDirtyFlag(true);
    expect(window.localStorage.getItem('google-sheets-dirty')).toBe('true');
    expect(readDirtyFlag()).toBe(true);

    writeDirtyFlag(false);
    expect(readDirtyFlag()).toBe(false);
  });
});

describe('delete and undo through the hook', () => {
  const milk: GroceryItem = {
    id: 'milk',
    name: 'Milk',
    checked: false,
    addedAt: 100,
    updatedAt: 100,
  };

  it('delete records a timed deletion instead of only hiding the item locally', () => {
    const onItemsChange = vi.fn();
    const { result } = renderHook(() =>
      useGoogleSheetsSync({ localItems: [milk], onItemsChange, userEmail: 'me@example.com' })
    );

    act(() => {
      result.current.createDeletionTombstone('milk');
    });

    const pending = readPendingDeletions();
    expect(pending).toHaveLength(1);
    expect(pending[0].id).toBe('milk');
    expect(pending[0].deletedAt).toBeGreaterThan(0);

    const updater = onItemsChange.mock.calls[0][0] as (prev: GroceryItem[]) => GroceryItem[];
    expect(updater([milk])).toEqual([]);
  });

  it('undo marks the item revived and drops the pending deletion', () => {
    const onItemsChange = vi.fn();
    addPendingDeletions(['milk'], 'device-1', 100);

    const { result } = renderHook(() =>
      useGoogleSheetsSync({ localItems: [], onItemsChange, userEmail: 'me@example.com' })
    );

    act(() => {
      result.current.restoreItems([milk]);
    });

    expect(readPendingDeletions()).toEqual([]);
    expect(onItemsChange).toHaveBeenCalledTimes(1);

    const updater = onItemsChange.mock.calls[0][0] as (prev: GroceryItem[]) => GroceryItem[];
    const next = updater([]);

    expect(next).toHaveLength(1);
    expect(next[0]).toMatchObject({ id: 'milk', isTombstone: false });
    expect(next[0].revivedAt).toBeGreaterThan(0);
  });

  it('a bulk clear records every id so another device cannot push them back', () => {
    const onItemsChange = vi.fn();
    const eggs: GroceryItem = { ...milk, id: 'eggs', name: 'Eggs' };

    const { result } = renderHook(() =>
      useGoogleSheetsSync({ localItems: [milk, eggs], onItemsChange, userEmail: 'me@example.com' })
    );

    act(() => {
      result.current.deleteItemsPermanently(['milk', 'eggs']);
    });

    expect(readPendingDeletions().map((record) => record.id).sort()).toEqual(['eggs', 'milk']);

    const updater = onItemsChange.mock.calls[0][0] as (prev: GroceryItem[]) => GroceryItem[];
    expect(updater([milk, eggs])).toEqual([]);
  });
});
