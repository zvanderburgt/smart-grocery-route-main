import { describe, it, expect, beforeEach } from 'vitest';
import { createSyncEngine, type SyncEngine } from '@/lib/sync-engine';
import { ITEM_HEADER } from '@/lib/sync-model';
import type { GroceryItem } from '@/lib/types';
import { createFakeSheets, type FakeSheets } from './fixtures/fake-sheets';

let clock = 1000;

function item(overrides: Partial<GroceryItem>): GroceryItem {
  return {
    id: 'milk',
    name: 'Milk',
    checked: false,
    addedAt: 100,
    updatedAt: 100,
    updatedBy: 'me@example.com',
    ...overrides,
  };
}

function makeEngine(fake: FakeSheets, deviceId = 'device-a', email = 'me@example.com'): SyncEngine {
  return createSyncEngine({
    api: fake.api,
    getConfig: () => ({ sheetId: 'sheet-1', sheetName: 'GroceryList' }),
    deviceId,
    getUserEmail: () => email,
    now: () => clock,
  });
}

function dataRows(fake: FakeSheets): unknown[][] {
  return fake.state
    .rowsFor('GroceryList')
    .slice(1)
    .filter((row) => row.some((cell) => cell !== '' && cell !== undefined));
}

function deletionRows(fake: FakeSheets): unknown[][] {
  return fake.state
    .rowsFor('Deletions')
    .slice(1)
    .filter((row) => row.some((cell) => cell !== '' && cell !== undefined));
}

beforeEach(() => {
  clock = 1000;
});

describe('sync engine: sheet structure', () => {
  it('creates both tabs, writes headers once and appends local items', async () => {
    const fake = createFakeSheets();
    const engine = makeEngine(fake);

    const result = await engine.sync([item({ id: 'milk' }), item({ id: 'eggs', name: 'Eggs' })], []);

    expect(fake.state.tables.has('GroceryList')).toBe(true);
    expect(fake.state.tables.has('Deletions')).toBe(true);
    expect(fake.state.rowsFor('GroceryList')[0]).toEqual([...ITEM_HEADER]);
    expect(dataRows(fake)).toHaveLength(2);
    expect(result.appendedRows).toBe(2);
    expect(fake.state.valueInputOptions).toEqual(new Set(['RAW']));
  });

  it('writes nothing when the sheet already matches the local list', async () => {
    const fake = createFakeSheets();
    const engine = makeEngine(fake);
    const items = [item({ id: 'milk' }), item({ id: 'eggs', name: 'Eggs' })];

    await engine.sync(items, []);
    const writesAfterFirst = fake.state.writeCount();

    const second = await engine.sync(items, []);

    expect(fake.state.writeCount()).toBe(writesAfterFirst);
    expect(second.writtenRows).toBe(0);
    expect(second.appendedRows).toBe(0);
  });

  it('reports a mismatched header instead of rewriting it', async () => {
    const fake = createFakeSheets({ items: [['id', 'name', 'my-own-column'], ['milk', 'Milk', 'keep me']] });
    const engine = makeEngine(fake);

    const structure = await engine.sync([item({ id: 'milk' })], []);
    expect(structure.writtenRows).toBeGreaterThanOrEqual(0);

    const ensured = await engine.ensureSheets();
    expect(ensured.headerWarning).toMatch(/does not match/);
    expect(fake.state.rowsFor('GroceryList')[0]).toEqual(['id', 'name', 'my-own-column']);
  });

  it('keeps an item another device added instead of blanking its row', async () => {
    const fake = createFakeSheets();
    const engine = makeEngine(fake);

    await engine.sync([item({ id: 'milk' })], []);
    // The sheet gains a row this device has never seen (other phone added it).
    fake.state.rowsFor('GroceryList').push(['eggs', 'Eggs', 'FALSE', '', 150, '', '', 150, 'other@example.com', 'FALSE', '']);

    clock = 2000;
    const result = await engine.sync([item({ id: 'milk' })], []);

    expect(result.items.map((entry) => entry.id).sort()).toEqual(['eggs', 'milk']);
    expect(dataRows(fake).map((row) => row[0]).sort()).toEqual(['eggs', 'milk']);
  });
});

describe('sync engine: write shape', () => {
  it('updates only the changed rows, in a single batch, and never clears', async () => {
    const fake = createFakeSheets();
    const engine = makeEngine(fake);
    const items = [
      item({ id: 'a', name: 'Apples' }),
      item({ id: 'b', name: 'Bread' }),
      item({ id: 'c', name: 'Cheese' }),
    ];
    await engine.sync(items, []);

    const before = fake.state.calls.length;
    clock = 2000;
    await engine.sync([items[0], { ...items[1], checked: true, checkedAt: 2000 }, items[2]], []);

    const newCalls = fake.state.calls.slice(before);
    const writes = newCalls.filter((call) => call.method === 'batchUpdateValues');
    expect(writes).toHaveLength(1);
    expect(writes[0].rows).toBe(1);
    expect(newCalls.some((call) => call.method === 'clearValues')).toBe(false);
  });
});

describe('sync engine: deletes converge', () => {
  it('propagates a single delete to the other device', async () => {
    const fake = createFakeSheets();
    const deviceA = makeEngine(fake, 'device-a');
    const deviceB = makeEngine(fake, 'device-b');

    await deviceA.sync([item({ id: 'milk' })], []);
    await deviceB.sync([item({ id: 'milk' })], []);

    clock = 2000;
    const deleted = await deviceA.sync([], [{ id: 'milk', deletedAt: clock, deviceId: 'device-a' }]);
    expect(deleted.items).toEqual([]);
    expect(deletionRows(fake)).toHaveLength(1);

    // Device B still holds the item locally; its sync must drop it, not re-add it.
    clock = 2100;
    const staleB = await deviceB.sync([item({ id: 'milk' })], []);
    expect(staleB.items).toEqual([]);
    expect(dataRows(fake)).toHaveLength(0);
  });

  it('does not resurrect a bulk-cleared list from the other device (regression)', async () => {
    const fake = createFakeSheets();
    const deviceA = makeEngine(fake, 'device-a');
    const deviceB = makeEngine(fake, 'device-b');
    const shared = [item({ id: 'milk' }), item({ id: 'eggs', name: 'Eggs' })];

    await deviceA.sync(shared, []);
    await deviceB.sync(shared, []);

    clock = 3000;
    await deviceA.sync(
      [],
      [
        { id: 'milk', deletedAt: clock, deviceId: 'device-a' },
        { id: 'eggs', deletedAt: clock, deviceId: 'device-a' },
      ]
    );
    expect(dataRows(fake)).toHaveLength(0);

    clock = 3100;
    const staleB = await deviceB.sync(shared, []);
    expect(staleB.items).toEqual([]);
    expect(dataRows(fake)).toHaveLength(0);
  });

  it('an undo outranks the deletion and sticks on both devices', async () => {
    const fake = createFakeSheets();
    const deviceA = makeEngine(fake, 'device-a');
    const deviceB = makeEngine(fake, 'device-b');

    await deviceA.sync([item({ id: 'milk' })], []);
    await deviceB.sync([item({ id: 'milk' })], []);

    clock = 4000;
    await deviceA.sync([], [{ id: 'milk', deletedAt: clock, deviceId: 'device-a' }]);

    clock = 5000;
    const revived = await deviceB.sync([item({ id: 'milk', revivedAt: clock, updatedAt: clock })], []);
    expect(revived.items.map((entry) => entry.id)).toEqual(['milk']);
    expect(dataRows(fake)).toHaveLength(1);

    // Device A re-reads: the revive must survive its own view of the deletion.
    clock = 5100;
    const deviceAAfter = await deviceA.sync([], []);
    expect(deviceAAfter.items.map((entry) => entry.id)).toEqual(['milk']);
  });

  it('migrates legacy tombstone rows into deletion records and blanks them', async () => {
    const fake = createFakeSheets({
      items: [
        [...ITEM_HEADER],
        ['milk', 'Milk', 'FALSE', '', 100, '', '', 100, 'me', 'FALSE', ''],
        ['eggs', 'Eggs', 'FALSE', '', 100, '', '', 150, 'me', 'TRUE', ''],
      ],
    });
    const engine = makeEngine(fake);

    clock = 2000;
    const result = await engine.sync([item({ id: 'milk' })], []);

    expect(result.items.map((entry) => entry.id)).toEqual(['milk']);
    expect(deletionRows(fake).map((row) => row[0])).toEqual(['eggs']);
    expect(fake.state.rowsFor('GroceryList')[2]).toEqual(ITEM_HEADER.map(() => ''));
  });
});

describe('sync engine: field-level merge', () => {
  it('keeps a rename made on one device and a check made on the other', async () => {
    const fake = createFakeSheets();
    const deviceA = makeEngine(fake, 'device-a');
    const deviceB = makeEngine(fake, 'device-b');

    await deviceA.sync([item({ id: 'milk' })], []);

    // A checks it off at t=2000; checking must not touch the content clock.
    clock = 2000;
    await deviceA.sync([item({ id: 'milk', checked: true, checkedAt: 2000, updatedAt: 100 })], []);

    // B renames it at t=3000 from a stale "unchecked" copy.
    clock = 3000;
    const merged = await deviceB.sync([item({ id: 'milk', name: 'Whole Milk', updatedAt: 3000 })], []);

    expect(merged.items[0].name).toBe('Whole Milk');
    expect(merged.items[0].checked).toBe(true);

    clock = 3100;
    const fromA = await deviceA.sync([item({ id: 'milk', checked: true, checkedAt: 2000, updatedAt: 100 })], []);
    expect(fromA.items[0].name).toBe('Whole Milk');
    expect(fromA.items[0].checked).toBe(true);
  });

  it('converges on equal timestamps regardless of which device syncs first', async () => {
    const fake = createFakeSheets();
    const deviceA = makeEngine(fake, 'device-a');
    const deviceB = makeEngine(fake, 'device-b');

    await deviceA.sync([item({ id: 'milk', name: 'Milk A', updatedAt: 2000 })], []);
    const bResult = await deviceB.sync([item({ id: 'milk', name: 'Milk B', updatedAt: 2000 })], []);

    clock = 2100;
    const aResult = await deviceA.sync([item({ id: 'milk', name: 'Milk A', updatedAt: 2000 })], []);

    expect(aResult.items[0].name).toBe(bResult.items[0].name);
  });

  it('clamps a remote timestamp from a device with a fast clock', async () => {
    clock = 10_000;
    const farFuture = clock + 365 * 24 * 60 * 60 * 1000;
    const fake = createFakeSheets({
      items: [
        [...ITEM_HEADER],
        ['milk', 'Milk', 'FALSE', '', 100, '', '', farFuture, 'future-device', 'FALSE', ''],
      ],
    });
    const engine = makeEngine(fake);

    const result = await engine.sync([item({ id: 'milk', name: 'Milk (local)', updatedAt: 9000 })], []);

    // A year-ahead clock is pulled back to "now" instead of winning forever.
    expect(result.items[0].updatedAt).toBeLessThanOrEqual(clock);

    // And a normal edit made after that still wins.
    clock = 11_000;
    const afterEdit = await engine.sync([item({ id: 'milk', name: 'Milk (local)', updatedAt: 11_000 })], []);
    expect(afterEdit.items[0].name).toBe('Milk (local)');
  });
});

describe('sync engine: concurrency', () => {
  it('does not erase a row another device wrote mid-sync', async () => {
    const fake = createFakeSheets();
    const deviceA = makeEngine(fake, 'device-a');
    await deviceA.sync([item({ id: 'milk' })], []);

    // Device B appends its own item between A's read and A's write.
    const originalGet = fake.api.getValues.bind(fake.api);
    let injected = false;
    fake.api.getValues = async (sheetId, range) => {
      const values = await originalGet(sheetId, range);
      if (!injected && range.includes('A2')) {
        injected = true;
        fake.state.rowsFor('GroceryList').push([
          'eggs',
          'Eggs',
          'FALSE',
          '',
          150,
          '',
          '',
          150,
          'other@example.com',
          'FALSE',
          '',
        ]);
      }
      return values;
    };

    clock = 3000;
    await deviceA.sync([item({ id: 'milk', checked: true, checkedAt: 3000 })], []);

    const ids = dataRows(fake).map((row) => row[0]);
    expect(ids).toContain('eggs');
    expect(ids).toContain('milk');
  });
});
