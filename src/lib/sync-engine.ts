/**
 * Google Sheets sync engine.
 *
 * Shape of a sync (two round-trips, no destructive window):
 *   1. read items + deletions in parallel
 *   2. merge (pure, see sync-model.ts)
 *   3. write only the rows that actually changed, in one `values:batchUpdate`;
 *      append genuinely new rows; blank rows for ids that no longer exist
 *   4. append any deletion records the sheet has not seen yet
 *
 * Why this replaced clear-then-rewrite: the old flow cleared `A2:J` and then
 * wrote the whole table back, so the shared sheet was empty between those two
 * calls and a failed write left it destroyed. Now every write touches only the
 * rows it owns, so two devices can sync at the same time without erasing each
 * other, and a no-op sync writes nothing at all.
 *
 * Deletions live in an append-only `Deletions` tab instead of tombstone rows in
 * the item range. That is what makes a bulk clear as durable as a single delete:
 * previously "Clear completed" just dropped the ids locally, and the next sync
 * from the other phone pushed the items straight back.
 */

import type { GroceryItem } from './types';
import type { SheetsApi, SheetMetadata } from './sheets-api';
import {
  DELETION_HEADER,
  ITEM_HEADER,
  type DeletionRecord,
  type LocatedItem,
  applyDeletions,
  dedupeDeletions,
  deletionToRow,
  deletionsFromLegacyTombstones,
  itemToRow,
  mergeItems,
  parseDeletionRows,
  rowsToLocatedItems,
} from './sync-model';

export const DEFAULT_DELETIONS_SHEET = 'Deletions';

export interface SyncEngineConfig {
  sheetId: string;
  sheetName: string;
}

export interface SyncEngineDeps {
  api: SheetsApi;
  /** Read at call time so a reconnect picks up new ids. */
  getConfig: () => SyncEngineConfig;
  deviceId: string;
  getUserEmail: () => string;
  now?: () => number;
  deletionsSheetName?: string;
}

export interface SheetStructure {
  itemsTab: boolean;
  deletionsTab: boolean;
  /** Set when a header row exists but does not match what this build expects. */
  headerWarning?: string;
}

export interface SyncResult {
  /** Merged live items, ready to become local state. */
  items: GroceryItem[];
  /** Deletion ledger after this sync (deduped, newest record per id). */
  deletions: Map<string, DeletionRecord>;
  conflicts: number;
  writtenRows: number;
  appendedRows: number;
  clearedRows: number;
  appendedDeletions: number;
}

export interface PlannedWrites {
  updates: Array<{ range: string; values: unknown[][] }>;
  appends: unknown[][];
  clearedRows: number;
  writtenRows: number;
}

function columnLetter(count: number): string {
  let n = count;
  let letters = '';
  while (n > 0) {
    const remainder = (n - 1) % 26;
    letters = String.fromCharCode(65 + remainder) + letters;
    n = Math.floor((n - 1) / 26);
  }
  return letters;
}

/** Sheet names may contain spaces or apostrophes, so always quote them. */
export function quoteSheetName(name: string): string {
  return `'${name.replace(/'/g, "''")}'`;
}

export const ITEM_LAST_COLUMN = columnLetter(ITEM_HEADER.length);
export const DELETION_LAST_COLUMN = columnLetter(DELETION_HEADER.length);

export function itemRowRange(sheetName: string, rowNumber: number): string {
  return `${quoteSheetName(sheetName)}!A${rowNumber}:${ITEM_LAST_COLUMN}${rowNumber}`;
}

export function itemTableRange(sheetName: string): string {
  return `${quoteSheetName(sheetName)}!A1:${ITEM_LAST_COLUMN}`;
}

export function deletionTableRange(deletionsSheet: string): string {
  return `${quoteSheetName(deletionsSheet)}!A1:${DELETION_LAST_COLUMN}`;
}

function rowsEqual(a: unknown[], b: unknown[]): boolean {
  const width = Math.max(a.length, b.length);
  for (let index = 0; index < width; index += 1) {
    if (String(a[index] ?? '') !== String(b[index] ?? '')) return false;
  }
  return true;
}

/**
 * Decide exactly which rows to write. Pure and exported so "no destructive
 * window" and "only write what changed" can be asserted directly.
 */
export function planItemWrites(
  targetItems: GroceryItem[],
  remoteRows: LocatedItem[],
  options: {
    sheetName: string;
    userEmail: string;
    now: number;
    /** Rows holding legacy tombstones or otherwise stale ids, to blank out. */
    staleRowNumbers?: number[];
  }
): PlannedWrites {
  const byId = new Map<string, LocatedItem>();
  for (const row of remoteRows) {
    if (!byId.has(row.item.id)) byId.set(row.item.id, row);
  }

  const targetIds = new Set(targetItems.map((item) => item.id));
  const updates: PlannedWrites['updates'] = [];
  const appends: unknown[][] = [];
  let clearedRows = 0;
  const blankRow = ITEM_HEADER.map(() => '');

  for (const item of targetItems) {
    const serialized = itemToRow(item, options.userEmail, options.now);
    const existing = byId.get(item.id);

    if (!existing) {
      appends.push(serialized);
      continue;
    }

    if (rowsEqual(serialized, existing.values)) continue;

    updates.push({ range: itemRowRange(options.sheetName, existing.rowNumber), values: [serialized] });
  }

  for (const row of remoteRows) {
    if (targetIds.has(row.item.id)) continue;
    updates.push({ range: itemRowRange(options.sheetName, row.rowNumber), values: [blankRow] });
    clearedRows += 1;
  }

  for (const rowNumber of options.staleRowNumbers ?? []) {
    updates.push({ range: itemRowRange(options.sheetName, rowNumber), values: [blankRow] });
    clearedRows += 1;
  }

  return { updates, appends, clearedRows, writtenRows: updates.length };
}

export interface SyncEngine {
  ensureSheets(): Promise<SheetStructure>;
  sync(localItems: GroceryItem[], pendingDeletions: DeletionRecord[]): Promise<SyncResult>;
}

export function createSyncEngine(deps: SyncEngineDeps): SyncEngine {
  const now = deps.now ?? Date.now;
  const deletionsSheetName = deps.deletionsSheetName ?? DEFAULT_DELETIONS_SHEET;
  let cachedStructure: SheetStructure | null = null;
  let cachedKey = '';

  async function loadTitles(): Promise<{ structure: SheetStructure; metadata: SheetMetadata }> {
    const { sheetId, sheetName } = deps.getConfig();
    const metadata = await deps.api.getSpreadsheet(sheetId, 'sheets(properties(sheetId,title))');
    const titles = new Set(
      (metadata.sheets ?? []).map((sheet) => sheet.properties?.title).filter((title): title is string => !!title)
    );

    return {
      metadata,
      structure: { itemsTab: titles.has(sheetName), deletionsTab: titles.has(deletionsSheetName) },
    };
  }

  async function writeHeaderIfEmpty(sheet: string, header: readonly string[], lastColumn: string): Promise<void> {
    const { sheetId } = deps.getConfig();
    const existing = await deps.api.getValues(sheetId, `${quoteSheetName(sheet)}!A1:${lastColumn}1`);
    const isEmpty = existing.length === 0 || existing[0].every((cell) => cell === '' || cell === undefined);
    if (isEmpty) {
      await deps.api.batchUpdateValues(
        sheetId,
        [{ range: `${quoteSheetName(sheet)}!A1:${lastColumn}1`, values: [[...header]] }],
        { valueInputOption: 'RAW' }
      );
      return;
    }
    if (sheet === deps.getConfig().sheetName && !headerMatches(existing[0], header)) {
      // Never rewrite a mismatched header: that used to wipe a user-added column
      // (or a localized one) with no warning. Report it instead.
      cachedStructure = {
        ...(cachedStructure ?? { itemsTab: true, deletionsTab: false }),
        headerWarning: `Header row in "${sheet}" does not match this version. Sync continues, but a column may be missing.`,
      };
    }
  }

  async function ensureSheets(): Promise<SheetStructure> {
    const { sheetId, sheetName } = deps.getConfig();
    const key = `${sheetId}:${sheetName}:${deletionsSheetName}`;
    if (cachedStructure && cachedKey === key) return cachedStructure;

    const { structure } = await loadTitles();
    const requests: unknown[] = [];
    if (!structure.itemsTab) requests.push({ addSheet: { properties: { title: sheetName } } });
    if (!structure.deletionsTab) requests.push({ addSheet: { properties: { title: deletionsSheetName } } });

    if (requests.length > 0) {
      await deps.api.batchUpdate(sheetId, requests);
      const refreshed = await loadTitles();
      structure.itemsTab = refreshed.structure.itemsTab;
      structure.deletionsTab = refreshed.structure.deletionsTab;
    }

    cachedStructure = { ...structure };
    cachedKey = key;

    await writeHeaderIfEmpty(sheetName, ITEM_HEADER, ITEM_LAST_COLUMN);
    await writeHeaderIfEmpty(deletionsSheetName, DELETION_HEADER, DELETION_LAST_COLUMN);

    return cachedStructure ?? structure;
  }

  async function sync(localItems: GroceryItem[], pendingDeletions: DeletionRecord[]): Promise<SyncResult> {
    const { sheetId, sheetName } = deps.getConfig();
    const timestamp = now();
    const userEmail = deps.getUserEmail();

    await ensureSheets();

    const [itemRows, deletionRows] = await Promise.all([
      deps.api.getValues(sheetId, `${quoteSheetName(sheetName)}!A2:${ITEM_LAST_COLUMN}`),
      deps.api.getValues(sheetId, `${quoteSheetName(deletionsSheetName)}!A2:${DELETION_LAST_COLUMN}`),
    ]);

    const located = rowsToLocatedItems(itemRows, { now: timestamp, firstRowNumber: 2 });

    // Tombstone rows from older builds are converted to deletion records and
    // blanked below, so the item range converges to "live items only" without a
    // migration step for the user.
    const legacyTombstones = deletionsFromLegacyTombstones(located.map((row) => row.item));
    const liveRemoteRows = located.filter((row) => !row.item.isTombstone);
    const staleRowNumbers = located.filter((row) => row.item.isTombstone).map((row) => row.rowNumber);

    const remoteDeletions = parseDeletionRows(deletionRows, { now: timestamp });
    const ledger = dedupeDeletions([...remoteDeletions, ...legacyTombstones, ...pendingDeletions]);

    const localLive = localItems.filter((item) => !item.isTombstone);
    const remoteLive = liveRemoteRows.map((row) => row.item);

    // Everything deleted anywhere is dropped unless it was explicitly revived
    // *after* that deletion (Undo sets revivedAt).
    const survivingLocal = applyDeletions(localLive, ledger).items;
    const survivingRemote = applyDeletions(remoteLive, ledger).items;

    const { merged, conflicts } = mergeItems(survivingLocal, survivingRemote, { now: timestamp });

    const plan = planItemWrites(merged, liveRemoteRows, {
      sheetName,
      userEmail,
      now: timestamp,
      staleRowNumbers,
    });

    if (plan.updates.length > 0) {
      await deps.api.batchUpdateValues(sheetId, plan.updates, { valueInputOption: 'RAW' });
    }
    if (plan.appends.length > 0) {
      await deps.api.appendValues(sheetId, itemTableRange(sheetName), plan.appends, {
        valueInputOption: 'RAW',
      });
    }

    const recordedIds = new Set(remoteDeletions.map((record) => record.id));
    const deletionsToAppend = [...dedupeDeletions([...pendingDeletions, ...legacyTombstones]).values()]
      .filter((record) => !recordedIds.has(record.id))
      .map(deletionToRow);

    if (deletionsToAppend.length > 0) {
      await deps.api.appendValues(sheetId, deletionTableRange(deletionsSheetName), deletionsToAppend, {
        valueInputOption: 'RAW',
      });
    }

    return {
      items: merged,
      deletions: ledger,
      conflicts,
      writtenRows: plan.writtenRows,
      appendedRows: plan.appends.length,
      clearedRows: plan.clearedRows,
      appendedDeletions: deletionsToAppend.length,
    };
  }

  return { ensureSheets, sync };
}

function headerMatches(actual: unknown[], expected: readonly string[]): boolean {
  for (let index = 0; index < expected.length; index += 1) {
    const cell = actual[index];
    if (cell === undefined || cell === '') continue;
    if (String(cell).trim() !== expected[index]) return false;
  }
  return true;
}
