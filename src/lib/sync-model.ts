/**
 * Pure data model for Google Sheets sync.
 *
 * Everything here is side-effect free and clock-injectable so the sync rules can
 * be unit-tested and, more importantly, so two devices running the same rules
 * always converge on the same list.
 *
 * Data layout
 * -----------
 * Items live in `<sheetName>!A1:K` (one live item per row, no tombstones).
 * Deletions live in a separate append-only `Deletions` tab (`id, deletedAt,
 * deviceId`). Keeping deletions out of the item range means the shared list
 * never shows deleted rows, and a bulk clear can be recorded just as durably as
 * a single delete - which is what stops another device from resurrecting cleared
 * items.
 *
 * Merge rules
 * -----------
 * Two independent groups of fields, each resolved by its own timestamp:
 *   - content: name / quantity / category      -> `updatedAt`
 *   - checked state                            -> `checkedAt`
 * That way checking off an item on one phone no longer discards a rename made on
 * the other. Ties are broken deterministically (never "local wins"), because a
 * device-dependent tie-break makes the two devices disagree forever.
 */

import type { GroceryItem } from './types';

export const ITEM_HEADER = [
  'id',
  'name',
  'checked',
  'checkedAt',
  'addedAt',
  'category',
  'quantity',
  'updatedAt',
  'updatedBy',
  'isTombstone',
  'revivedAt',
] as const;

export const DELETION_HEADER = ['id', 'deletedAt', 'deviceId'] as const;

/** A timestamp further in the future than this is treated as clock skew. */
export const MAX_CLOCK_SKEW_MS = 5 * 60 * 1000;

/**
 * Deletions are kept far longer than any plausible offline window, and job
 * cleanup never rewrites the tab - stale rows are simply ignored on read.
 */
export const DELETION_RETENTION_MS = 30 * 24 * 60 * 60 * 1000;

export interface DeletionRecord {
  id: string;
  deletedAt: number;
  deviceId?: string;
}

/** A row as read from the sheet, with its 1-based sheet row number. */
export interface LocatedItem {
  item: GroceryItem;
  rowNumber: number;
  /** Raw cell values, so the planner can skip rows that are already correct. */
  values: unknown[];
}

function finiteOrUndefined(value: unknown): number | undefined {
  if (value === '' || value === null || value === undefined) return undefined;
  const n = Number(value);
  return Number.isFinite(n) ? n : undefined;
}

/**
 * Clamp an untrusted timestamp into a sane range. A device with a clock a year
 * ahead must not win every conflict until its clock is fixed, so anything beyond
 * `now + MAX_CLOCK_SKEW_MS` is pulled back to `now`; garbage becomes undefined
 * (which loses to any real edit rather than looking freshest).
 */
export function sanitizeTimestamp(value: unknown, now: number): number | undefined {
  const parsed = finiteOrUndefined(value);
  if (parsed === undefined || parsed <= 0) return undefined;
  return parsed > now + MAX_CLOCK_SKEW_MS ? now : parsed;
}

/**
 * When was this item last touched? Content edits carry `updatedAt`, check
 * toggles carry `checkedAt`; the newest of everything wins so an item that was
 * only ever checked still sorts correctly.
 */
export function getItemUpdatedAt(item: GroceryItem): number {
  const candidates = [item.updatedAt, item.checkedAt, item.revivedAt, item.addedAt].filter(
    (value): value is number => typeof value === 'number' && Number.isFinite(value)
  );
  return candidates.length > 0 ? Math.max(...candidates) : 0;
}

export function itemToRow(item: GroceryItem, userEmail: string, now: number = Date.now()): unknown[] {
  const checkedAt = sanitizeTimestamp(item.checkedAt, now);
  const updatedAt = sanitizeTimestamp(item.updatedAt, now) ?? getItemUpdatedAt(item);
  const revivedAt = sanitizeTimestamp(item.revivedAt, now);

  return [
    item.id,
    item.name,
    item.checked ? 'TRUE' : 'FALSE',
    checkedAt ?? '',
    sanitizeTimestamp(item.addedAt, now) ?? 0,
    item.category ?? '',
    item.quantity ?? '',
    updatedAt,
    item.updatedBy || userEmail,
    'FALSE',
    revivedAt ?? '',
  ];
}

/**
 * Parse one sheet row. Only `id` and `name` are required: Google Sheets omits
 * trailing empty cells, so a hand-typed row legitimately arrives short. Every
 * other cell defaults safely rather than being rejected - an unknown timestamp
 * must end up undefined (oldest-losing) instead of a fresh `Date.now()` or a
 * NaN that would let the row win a comparison by accident.
 */
export function rowToItem(
  values: unknown[],
  options: { now?: number; rowNumber?: number } = {}
): LocatedItem | null {
  if (!Array.isArray(values) || values.length === 0) return null;
  const now = options.now ?? Date.now();
  const [id, name, checked, checkedAt, addedAt, category, quantity, updatedAt, updatedBy, isTombstone, revivedAt] =
    values;

  if (!id || !name) return null;

  const added = finiteOrUndefined(addedAt);

  return {
    rowNumber: options.rowNumber ?? 0,
    values,
    item: {
      id: String(id),
      name: String(name),
      checked: String(checked).toUpperCase() === 'TRUE' || checked === true,
      checkedAt: sanitizeTimestamp(checkedAt, now),
      addedAt: added !== undefined && added > 0 ? added : 0,
      category: category ? String(category) : undefined,
      quantity: finiteOrUndefined(quantity),
      updatedAt: sanitizeTimestamp(updatedAt, now),
      updatedBy: updatedBy ? String(updatedBy) : undefined,
      isTombstone: String(isTombstone).toUpperCase() === 'TRUE' || isTombstone === true,
      revivedAt: sanitizeTimestamp(revivedAt, now),
    },
  };
}

export function rowsToLocatedItems(
  rows: unknown[][],
  options: { now?: number; firstRowNumber?: number } = {}
): LocatedItem[] {
  const firstRowNumber = options.firstRowNumber ?? 2;
  const located: LocatedItem[] = [];

  rows.forEach((values, index) => {
    const parsed = rowToItem(values, {
      now: options.now,
      rowNumber: firstRowNumber + index,
    });
    if (parsed && parsed.item.id) located.push(parsed);
  });

  return located;
}

/**
 * Legacy sheets written by older builds carry deleted items as `isTombstone`
 * rows. Treat those as deletion records (and never write them back), so the
 * item range self-cleans and other devices still learn about the deletion.
 */
export function deletionsFromLegacyTombstones(items: GroceryItem[]): DeletionRecord[] {
  return items
    .filter((item) => item.isTombstone === true)
    .map((item) => ({
      id: item.id,
      deletedAt: item.updatedAt ?? item.checkedAt ?? item.addedAt ?? 0,
      deviceId: item.updatedBy,
    }));
}

export function parseDeletionRows(
  rows: unknown[][],
  options: { now?: number } = {}
): DeletionRecord[] {
  const now = options.now ?? Date.now();
  const records: DeletionRecord[] = [];

  for (const values of rows) {
    if (!Array.isArray(values)) continue;
    const [id, deletedAt, deviceId] = values;
    if (!id) continue;
    records.push({
      id: String(id),
      deletedAt: sanitizeTimestamp(deletedAt, now) ?? 0,
      deviceId: deviceId ? String(deviceId) : undefined,
    });
  }

  return records;
}

export function deletionToRow(record: DeletionRecord): unknown[] {
  return [record.id, record.deletedAt, record.deviceId ?? ''];
}

/** Newest record per id wins; duplicate ids in an append-only tab are expected. */
export function dedupeDeletions(records: DeletionRecord[]): Map<string, DeletionRecord> {
  const byId = new Map<string, DeletionRecord>();
  for (const record of records) {
    const existing = byId.get(record.id);
    if (!existing || record.deletedAt > existing.deletedAt) {
      byId.set(record.id, record);
    }
  }
  return byId;
}

/**
 * Drop items deleted on any device. An item survives a deletion record only if
 * it was explicitly restored *after* that deletion (Undo), which is why the
 * revive marker exists: without it, an edit made on a device that had not yet
 * seen the delete would silently resurrect the item.
 */
export function applyDeletions(
  items: GroceryItem[],
  deletions: Map<string, DeletionRecord>
): { items: GroceryItem[]; removed: string[] } {
  if (deletions.size === 0) return { items, removed: [] };

  const kept: GroceryItem[] = [];
  const removed: string[] = [];

  for (const item of items) {
    const deletion = deletions.get(item.id);
    if (!deletion) {
      kept.push(item);
      continue;
    }

    const revivedAfterDelete = (item.revivedAt ?? 0) > deletion.deletedAt;
    if (revivedAfterDelete) {
      kept.push(item);
    } else {
      removed.push(item.id);
    }
  }

  return { items: kept, removed };
}

export interface MergeOptions {
  now?: number;
}

export interface MergeResult {
  merged: GroceryItem[];
  /** Number of ids whose fields came from both sides (diagnostics only). */
  conflicts: number;
}

/**
 * Deterministic tie-break: comparing device ids keeps both devices picking the
 * same winner for equal timestamps, which a "prefer local" rule never could.
 * Falls back to the serialized payload so the result is still total.
 */
function pickDeterministic(a: GroceryItem, b: GroceryItem): GroceryItem {
  const aBy = a.updatedBy ?? '';
  const bBy = b.updatedBy ?? '';
  if (aBy !== bBy) return aBy < bBy ? a : b;

  const aKey = `${a.name}|${a.quantity ?? ''}|${a.category ?? ''}|${a.checked ? '1' : '0'}`;
  const bKey = `${b.name}|${b.quantity ?? ''}|${b.category ?? ''}|${b.checked ? '1' : '0'}`;
  return aKey <= bKey ? a : b;
}

function mergeOne(local: GroceryItem, remote: GroceryItem, now: number): { item: GroceryItem; conflicted: boolean } {
  const localUpdatedAt = sanitizeTimestamp(local.updatedAt, now) ?? 0;
  const remoteUpdatedAt = sanitizeTimestamp(remote.updatedAt, now) ?? 0;
  const localCheckedAt = sanitizeTimestamp(local.checkedAt, now) ?? 0;
  const remoteCheckedAt = sanitizeTimestamp(remote.checkedAt, now) ?? 0;

  const contentTie = localUpdatedAt === remoteUpdatedAt;
  const checkedTie = localCheckedAt === remoteCheckedAt;

  const contentSide = contentTie
    ? pickDeterministic(local, remote) === local
      ? 'local'
      : 'remote'
    : localUpdatedAt > remoteUpdatedAt
      ? 'local'
      : 'remote';

  const checkedSide = checkedTie
    ? pickDeterministic(local, remote) === local
      ? 'local'
      : 'remote'
    : localCheckedAt > remoteCheckedAt
      ? 'local'
      : 'remote';

  const content = contentSide === 'local' ? local : remote;
  const checkedState = checkedSide === 'local' ? local : remote;

  const conflicted = !contentTie || !checkedTie;

  const addedCandidates = [local.addedAt, remote.addedAt].filter((value) => Number.isFinite(value) && value > 0);

  return {
    conflicted,
    item: {
      id: local.id,
      name: content.name,
      quantity: content.quantity,
      category: content.category,
      updatedAt: contentSide === 'local' ? localUpdatedAt : remoteUpdatedAt,
      updatedBy: content.updatedBy,
      checked: checkedState.checked,
      checkedAt: checkedSide === 'local' ? localCheckedAt || undefined : remoteCheckedAt || undefined,
      addedAt: addedCandidates.length > 0 ? Math.min(...addedCandidates) : 0,
      revivedAt: Math.max(local.revivedAt ?? 0, remote.revivedAt ?? 0) || undefined,
      isTombstone: false,
    },
  };
}

/**
 * Merge two live-item lists. No deletions here - callers apply the deletions tab
 * first, so this only resolves field conflicts.
 */
export function mergeItems(
  localItems: GroceryItem[],
  remoteItems: GroceryItem[],
  options: MergeOptions = {}
): MergeResult {
  const now = options.now ?? Date.now();
  const localMap = new Map(localItems.map((item) => [item.id, item]));
  const remoteMap = new Map(remoteItems.map((item) => [item.id, item]));
  const allIds = new Set([...localMap.keys(), ...remoteMap.keys()]);

  const merged: GroceryItem[] = [];
  let conflicts = 0;

  for (const id of allIds) {
    const local = localMap.get(id);
    const remote = remoteMap.get(id);

    if (local && remote) {
      const result = mergeOne(local, remote, now);
      if (result.conflicted) conflicts += 1;
      merged.push(result.item);
    } else {
      merged.push((local ?? remote) as GroceryItem);
    }
  }

  return { merged, conflicts };
}
