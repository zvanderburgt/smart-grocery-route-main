import { describe, it, expect, beforeEach } from 'vitest';
import {
  shouldConsiderAutoSync,
  readPendingDeleteIds,
  writePendingDeleteIds,
} from '../hooks/use-google-sheets-sync';

describe('use-google-sheets-sync', () => {
  describe('shouldConsiderAutoSync', () => {
    it('is false before any sync has completed (empty lastSyncedItemsKey) - protects against wiping the sheet with a not-yet-loaded empty list on startup', () => {
      expect(shouldConsiderAutoSync('')).toBe(false);
    });

    it('is true once a sync has completed, even if that sync represented zero items', () => {
      // A completed sync over an empty list still serializes to a real,
      // non-empty JSON string ("[]"), not ''. This is what lets a genuinely
      // emptied list (e.g. after a bulk clear) sync normally afterward,
      // instead of being blocked forever the way a plain `length > 0` gate
      // would block it.
      expect(shouldConsiderAutoSync('[]')).toBe(true);
    });

    it('is true once a sync has completed with real items recorded', () => {
      expect(shouldConsiderAutoSync('[{"id":"1","name":"Apples"}]')).toBe(true);
    });
  });

  describe('readPendingDeleteIds / writePendingDeleteIds (Finding 12: persisted bulk-clear ids)', () => {
    beforeEach(() => {
      window.localStorage.removeItem('google-sheets-pending-deletes');
    });

    it('returns an empty set when nothing has been persisted yet', () => {
      const ids = readPendingDeleteIds();
      expect(ids.size).toBe(0);
    });

    it('round-trips a set of ids through localStorage', () => {
      writePendingDeleteIds(new Set(['a', 'b', 'c']));
      const ids = readPendingDeleteIds();
      expect(Array.from(ids).sort()).toEqual(['a', 'b', 'c']);
    });

    it('survives a simulated reload (a fresh read sees a previous write - the whole point of persisting instead of a bare useRef)', () => {
      writePendingDeleteIds(new Set(['item-1', 'item-2']));
      // Nothing in-memory carries over between these two calls other than
      // localStorage itself - simulating what a page reload would do to a
      // plain useRef (wipe it) versus this persisted set (survives).
      const idsAfterReload = readPendingDeleteIds();
      expect(idsAfterReload.has('item-1')).toBe(true);
      expect(idsAfterReload.has('item-2')).toBe(true);
    });

    it('ignores malformed localStorage content instead of throwing', () => {
      window.localStorage.setItem('google-sheets-pending-deletes', 'not valid json');
      const ids = readPendingDeleteIds();
      expect(ids.size).toBe(0);
    });

    it('ignores a persisted value that is not an array', () => {
      window.localStorage.setItem('google-sheets-pending-deletes', JSON.stringify({ not: 'an array' }));
      const ids = readPendingDeleteIds();
      expect(ids.size).toBe(0);
    });

    it('supports removing exactly the ids a successful write excluded, leaving others pending (the success-based removal timing syncNow relies on)', () => {
      writePendingDeleteIds(new Set(['keep-me', 'remove-me']));

      // Mirrors what syncNow does after a successful write: read the current
      // set, delete only the ids this particular sync just confirmed excluded,
      // write the remainder back.
      const current = readPendingDeleteIds();
      current.delete('remove-me');
      writePendingDeleteIds(current);

      const remaining = readPendingDeleteIds();
      expect(remaining.has('remove-me')).toBe(false);
      expect(remaining.has('keep-me')).toBe(true);
    });
  });
});
