/**
 * In-memory fake of the Google Sheets values API, good enough to run the real
 * sync engine end to end.
 *
 * The point is to exercise multi-device behaviour (two engines, one sheet)
 * without a live spreadsheet: convergence, deletes, undo, concurrent writes and
 * "no destructive window" are all properties of the write plan, so they need a
 * backend that actually stores rows the way Sheets does (row-scoped ranges,
 * append at the end, trailing empty cells omitted).
 */

import type { SheetsApi, SheetMetadata, ValuesUpdate } from '@/lib/sheets-api';

interface ParsedRange {
  sheet: string;
  startRow: number | null;
  endRow: number | null;
}

function parseRange(range: string): ParsedRange {
  const match = range.match(/^'((?:[^']|'')+)'!([A-Z]+)(\d+)?(?::([A-Z]+)(\d+)?)?$/);
  if (!match) throw new Error(`FakeSheets: unsupported range "${range}"`);
  const sheet = match[1].replace(/''/g, "'");
  const hasColon = range.includes(':');
  const startRow = match[3] ? parseInt(match[3], 10) : null;
  // `A2:K` (no row after the colon) means "to the end", not "this row only".
  const endRow = !hasColon ? startRow : match[5] ? parseInt(match[5], 10) : null;
  return { sheet, startRow, endRow };
}

export interface FakeSheetsOptions {
  itemsSheet?: string;
  deletionsSheet?: string;
  items?: unknown[][];
  deletions?: unknown[][];
  /** Sheets omits trailing empty cells on read; keep that quirk available. */
  trimTrailingEmptyCells?: boolean;
}

export interface FakeSheetsState {
  tables: Map<string, unknown[][]>;
  calls: Array<{ method: string; range?: string; valueInputOption?: string; rows?: number }>;
  valueInputOptions: Set<string>;
  writeCount(): number;
  readCount(): number;
  rowsFor(sheet: string): unknown[][];
}

export interface FakeSheets {
  api: SheetsApi;
  state: FakeSheetsState;
  /** Simulate another device writing while this one is mid-sync. */
  setTable(sheet: string, rows: unknown[][]): void;
}

export function createFakeSheets(options: FakeSheetsOptions = {}): FakeSheets {
  const itemsSheet = options.itemsSheet ?? 'GroceryList';
  const deletionsSheet = options.deletionsSheet ?? 'Deletions';
  const trim = options.trimTrailingEmptyCells ?? true;

  const tables = new Map<string, unknown[][]>();
  if (options.items) tables.set(itemsSheet, options.items.map((row) => [...row]));
  if (options.deletions) tables.set(deletionsSheet, options.deletions.map((row) => [...row]));

  const calls: FakeSheetsState['calls'] = [];
  const valueInputOptions = new Set<string>();

  function table(sheet: string): unknown[][] {
    if (!tables.has(sheet)) tables.set(sheet, []);
    return tables.get(sheet)!;
  }

  function readSlice(range: ParsedRange): unknown[][] {
    const rows = table(range.sheet);
    const startIndex = (range.startRow ?? 1) - 1;
    const endIndex = range.endRow === null ? rows.length : range.endRow;
    const slice = rows.slice(startIndex, endIndex).map((row) => {
      const copy = [...row];
      if (trim) {
        while (copy.length > 0 && (copy[copy.length - 1] === '' || copy[copy.length - 1] === undefined)) {
          copy.pop();
        }
      }
      return copy;
    });
    // Sheets drops trailing blank rows from a read.
    while (slice.length > 0 && slice[slice.length - 1].length === 0) slice.pop();
    return slice;
  }

  const api: SheetsApi = {
    async getValues(_sheetId, range) {
      calls.push({ method: 'getValues', range });
      return readSlice(parseRange(range));
    },

    async batchUpdateValues(_sheetId, updates: ValuesUpdate[], opts) {
      const option = opts?.valueInputOption ?? 'USER_ENTERED';
      valueInputOptions.add(option);
      calls.push({ method: 'batchUpdateValues', rows: updates.length, valueInputOption: option });
      for (const update of updates) {
        const parsed = parseRange(update.range);
        const rows = table(parsed.sheet);
        const startIndex = (parsed.startRow ?? 1) - 1;
        update.values.forEach((rowValues, offset) => {
          const index = startIndex + offset;
          while (rows.length <= index) rows.push([]);
          rows[index] = [...rowValues];
        });
      }
    },

    async appendValues(_sheetId, range, values, opts) {
      const option = opts?.valueInputOption ?? 'USER_ENTERED';
      valueInputOptions.add(option);
      calls.push({ method: 'appendValues', range, rows: values.length, valueInputOption: option });
      const parsed = parseRange(range);
      const rows = table(parsed.sheet);
      for (const row of values) rows.push([...row]);
    },

    async clearValues(_sheetId, range) {
      calls.push({ method: 'clearValues', range });
      const parsed = parseRange(range);
      const rows = table(parsed.sheet);
      const startIndex = (parsed.startRow ?? 1) - 1;
      const endIndex = parsed.endRow === null ? rows.length : parsed.endRow;
      for (let index = startIndex; index < endIndex && index < rows.length; index += 1) {
        rows[index] = [];
      }
    },

    async getSpreadsheet(): Promise<SheetMetadata> {
      calls.push({ method: 'getSpreadsheet' });
      return {
        sheets: [...tables.keys()].map((title, index) => ({ properties: { sheetId: index, title } })),
      };
    },

    async batchUpdate(_sheetId, requests) {
      calls.push({ method: 'batchUpdate' });
      for (const request of requests as Array<{ addSheet?: { properties?: { title?: string } } }>) {
        const title = request.addSheet?.properties?.title;
        if (title) table(title);
      }
      return { replies: [] };
    },
  };

  const state: FakeSheetsState = {
    tables,
    calls,
    valueInputOptions,
    writeCount: () => calls.filter((call) => call.method === 'batchUpdateValues' || call.method === 'appendValues').length,
    readCount: () => calls.filter((call) => call.method === 'getValues').length,
    rowsFor: (sheet: string) => table(sheet),
  };

  return {
    api,
    state,
    setTable: (sheet, rows) => {
      tables.set(sheet, rows.map((row) => [...row]));
    },
  };
}
