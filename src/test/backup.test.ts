import { describe, it, expect } from 'vitest'
import {
  applyBackup,
  collectBackup,
  countBackup,
  describeCounts,
  parseBackup,
  serializeBackup,
} from '@/lib/backup'

const storage = window.localStorage

function seed(key: string, value: unknown) {
  storage.setItem(key, JSON.stringify(value))
}

function read<T>(key: string): T | undefined {
  const raw = storage.getItem(key)
  return raw === null ? undefined : (JSON.parse(raw) as T)
}

describe('backup export', () => {
  it('carries the list, the training and the trips', () => {
    seed('grocery-items', [{ id: 'a', name: 'Milk', checked: false, addedAt: 1 }])
    seed('learned-brands', [{ brand: 'Oatly', category: 'dairy', confidence: 0.8, occurrences: 3, lastSeen: 2, createdAt: 1 }])
    seed('shopping-trips', [{ id: 't1', date: 5, items: [] }])
    seed('learned-barcodes', { '0123456789012': 'Oat Milk' })

    const backup = collectBackup(storage, 1000)

    expect(backup.format).toBe('breadcrumb-backup')
    expect(backup.createdAt).toBe(1000)
    expect(backup.data['grocery-items']).toHaveLength(1)
    expect(backup.data['learned-brands']).toHaveLength(1)
    expect(countBackup(backup.data)).toMatchObject({ items: 1, brands: 1, trips: 1, barcodes: 1 })
    expect(describeCounts(countBackup(backup.data))).toContain('1 trained brand')
  })

  it('never writes credentials into the file', () => {
    seed('grocery-items', [])
    storage.setItem('openrouter-api-key', 'sk-or-secret')
    storage.setItem('opencode-api-key', 'oc-secret')
    storage.setItem('google_sheets_access_token', 'ya29.secret')
    storage.setItem('breadcrumb-paired-session', JSON.stringify({ refreshToken: '1//secret' }))
    storage.setItem('device-id', 'device-abc')

    const text = serializeBackup(collectBackup(storage))

    expect(text).not.toContain('secret')
    expect(text).not.toContain('device-abc')
    expect(text).toContain('grocery-items')
  })

  it('keeps unconfirmed deletions with the list they explain', () => {
    seed('google-sheets-pending-deletions', [{ id: 'gone', deletedAt: 9, deviceId: 'd1' }])

    const backup = collectBackup(storage)

    expect(backup.data['google-sheets-pending-deletions']).toEqual([
      { id: 'gone', deletedAt: 9, deviceId: 'd1' },
    ])
  })
})

describe('backup restore', () => {
  it('round-trips onto an empty install', () => {
    seed('grocery-items', [{ id: 'a', name: 'Milk', checked: false, addedAt: 1 }])
    seed('recipe-favorites', [{ id: 'r1', name: 'Chili', servings: 4, ingredients: [], createdAt: 1 }])
    seed('item-category-hints', { milk: 'dairy' })
    const text = serializeBackup(collectBackup(storage))

    storage.clear()

    const parsed = parseBackup(text)
    expect(parsed.ok).toBe(true)
    if (!parsed.ok) return
    const result = applyBackup(storage, parsed.backup)

    expect(result.written).toContain('grocery-items')
    expect(read<Array<{ name: string }>>('grocery-items')).toHaveLength(1)
    expect(read<Record<string, string>>('item-category-hints')).toEqual({ milk: 'dairy' })
    expect(result.counts).toMatchObject({ items: 1, favorites: 1 })
  })

  it('keeps what is already here and only adds the missing records', () => {
    seed('grocery-items', [{ id: 'a', name: 'Milk (edited here)', checked: true, addedAt: 1 }])

    const incoming = collectBackup({
      getItem: (key: string) =>
        key === 'grocery-items'
          ? JSON.stringify([
              { id: 'a', name: 'Milk', checked: false, addedAt: 1 },
              { id: 'b', name: 'Bread', checked: false, addedAt: 2 },
            ])
          : null,
      setItem: () => {},
    })

    const result = applyBackup(storage, incoming)
    const items = read<Array<{ id: string; name: string }>>('grocery-items') ?? []

    expect(items.map((item) => item.id)).toEqual(['a', 'b'])
    expect(items[0].name).toBe('Milk (edited here)')
    expect(result.written).toContain('grocery-items')
  })

  it('does not duplicate relationships, which are keyed by their pair', () => {
    seed('item-relationships', [{ item1: 'Milk', item2: 'Bread', strength: 2, lastUpdated: 5 }])

    const incoming = collectBackup({
      getItem: (key: string) =>
        key === 'item-relationships'
          ? JSON.stringify([
              { item1: 'Bread', item2: 'Milk', strength: 1, lastUpdated: 1 },
              { item1: 'Milk', item2: 'Bread', strength: 9, lastUpdated: 9 },
            ])
          : null,
      setItem: () => {},
    })

    applyBackup(storage, incoming)
    const relationships = read<Array<{ item1: string; item2: string; strength: number }>>('item-relationships') ?? []

    expect(relationships).toHaveLength(2)
    expect(relationships[0].strength).toBe(2)
  })

  it('merges hint maps key by key instead of replacing them', () => {
    seed('item-category-hints', { milk: 'dairy' })

    const incoming = collectBackup({
      getItem: (key: string) =>
        key === 'item-category-hints' ? JSON.stringify({ milk: 'other', bread: 'bakery' }) : null,
      setItem: () => {},
    })

    applyBackup(storage, incoming)

    expect(read('item-category-hints')).toEqual({ milk: 'dairy', bread: 'bakery' })
  })

  it('leaves preferences alone when this install already has one', () => {
    storage.setItem('show-suggestions', 'false')

    const incoming = collectBackup({
      getItem: (key: string) => (key === 'show-suggestions' ? 'true' : null),
      setItem: () => {},
    })

    applyBackup(storage, incoming)

    expect(storage.getItem('show-suggestions')).toBe('false')
  })

  it('is a no-op when the backup has nothing new', () => {
    seed('grocery-items', [{ id: 'a', name: 'Milk', checked: false, addedAt: 1 }])
    const text = serializeBackup(collectBackup(storage))

    const parsed = parseBackup(text)
    expect(parsed.ok).toBe(true)
    if (!parsed.ok) return

    const result = applyBackup(storage, parsed.backup)
    expect(result.written).toEqual([])
  })
})

describe('backup parsing', () => {
  it('rejects junk and empty input', () => {
    expect(parseBackup('')).toMatchObject({ ok: false })
    expect(parseBackup('not json at all')).toMatchObject({ ok: false })
    expect(parseBackup('[1,2,3]')).toMatchObject({ ok: false })
    expect(parseBackup('{"unrelated":true}')).toMatchObject({ ok: false })
  })

  it('accepts a bare snapshot of localStorage, as a recovery snippet produces', () => {
    const snapshot = JSON.stringify({
      'grocery-items': JSON.stringify([{ id: 'a', name: 'Milk', checked: false, addedAt: 1 }]),
      'learned-brands': JSON.stringify([{ brand: 'Oatly', category: 'dairy', confidence: 1, occurrences: 1, lastSeen: 1, createdAt: 1 }]),
      'openrouter-api-key': 'sk-should-be-dropped',
    })

    const parsed = parseBackup(snapshot)
    expect(parsed.ok).toBe(true)
    if (!parsed.ok) return

    expect(parsed.backup.data['grocery-items']).toEqual([
      { id: 'a', name: 'Milk', checked: false, addedAt: 1 },
    ])
    expect(parsed.backup.data['openrouter-api-key']).toBeUndefined()
  })
})
