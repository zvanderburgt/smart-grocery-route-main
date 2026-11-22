/**
 * Backup & restore for everything this install owns in localStorage.
 *
 * All of the app's own data lives per browser origin. Move the app to a new
 * address — a renamed Netlify site, a new domain, a reinstall on a new phone —
 * and the new origin starts empty: the list, the trained brands, the barcode
 * catalog and the shopping trips are all still sitting in the old origin, where
 * nothing on the server can see them. A JSON snapshot is the only bridge.
 *
 * Two rules shape this module:
 *
 *  - **Credentials never travel.** API keys, OAuth/paired tokens and the
 *    in-flight auth state are excluded by name, so a backup file can be pasted
 *    into a chat or dropped in a drive folder without leaking anything.
 *  - **Restore merges, it does not overwrite.** The typical destination is a
 *    fresh install, but a restore onto a working install must not erase what is
 *    already there: existing records win, imported records fill the gaps.
 *
 * The storage layer is passed in (a `Pick<Storage, ...>`) so the whole module
 * is testable without a DOM.
 */

export const BACKUP_FORMAT = 'breadcrumb-backup'
export const BACKUP_VERSION = 1

/** Everything the user would miss. Kept in one list so export, restore and the
 *  "what will I get back" summary can never drift apart. */
export const BACKUP_DATA_KEYS = [
  'grocery-items',
  'item-relationships',
  'shopping-trips',
  'recipe-favorites',
  'learned-brands',
  'learned-barcodes',
  'item-category-hints',
  'section-custom-names',
  'section-order',
  'collapsed-sections',
] as const

/**
 * Preferences. Restored only where the target install has no value yet, so a
 * restore cannot quietly flip a switch the user already set on this device.
 */
export const BACKUP_SETTING_KEYS = [
  'show-learning-tip',
  'show-suggestions',
  'show-confidence-indicators',
  'ocr-provider',
  'opencode-endpoint',
  'opencode-selected-model',
  'openrouter-selected-model',
  // Which spreadsheet to sync with. Carries no token — the new install still
  // has to sign in — but it saves retyping the sheet id.
  'google-sheets-config',
] as const

/**
 * Deletions the sheet has not confirmed yet. They travel because the imported
 * list may have been pruned offline: without the ledger the other side of the
 * sync would hand those items straight back.
 */
export const BACKUP_SYNC_KEYS = [
  'google-sheets-pending-deletions',
  'google-sheets-dirty',
] as const

export const BACKUP_KEYS = [
  ...BACKUP_DATA_KEYS,
  ...BACKUP_SETTING_KEYS,
  ...BACKUP_SYNC_KEYS,
] as const

/**
 * Never written into a backup. Matched against the whole key so a future
 * `*-api-key` is excluded without anyone remembering to add it here.
 */
export const EXCLUDED_KEY_PATTERN =
  /token|api[-_]key|paired|oauth|device-id|password|secret/i

export type BackupData = Record<string, unknown>

export interface BackupFile {
  format: typeof BACKUP_FORMAT
  version: number
  createdAt: number
  app: string
  data: BackupData
}

export interface BackupCounts {
  items: number
  relationships: number
  trips: number
  favorites: number
  brands: number
  barcodes: number
  categoryHints: number
  sections: number
}

export interface RestoreResult {
  written: string[]
  counts: BackupCounts
}

export type ParseResult =
  | { ok: true; backup: BackupFile }
  | { ok: false; error: string }

type StorageLike = Pick<Storage, 'getItem' | 'setItem'>

const APP_NAME = 'Breadcrumb'

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function parseStored(raw: string | null): unknown {
  if (raw === null) return undefined
  try {
    return JSON.parse(raw)
  } catch {
    // A value that is not JSON (a bare string written by an older build) is
    // still data. Treat it as the string it is.
    return raw
  }
}

function readKey(storage: StorageLike, key: string): unknown {
  return parseStored(storage.getItem(key))
}

/**
 * A stable identity for one entry, used to decide whether an imported record is
 * already present. Relationships have no id of their own — they are keyed by
 * the pair they join.
 */
function identityOf(entry: unknown): string | null {
  if (!isRecord(entry)) return null
  if (typeof entry.id === 'string') return `id:${entry.id}`
  if (typeof entry.item1 === 'string' && typeof entry.item2 === 'string') {
    return `pair:${entry.item1}\u0000${entry.item2}`
  }
  return null
}

function mergeArrays(current: unknown[], incoming: unknown[]): unknown[] {
  const seen = new Set<string>()
  const merged: unknown[] = []

  const add = (entry: unknown) => {
    const identity = identityOf(entry)
    // Entries with no identity (a bare string) fall back to their serialized
    // form so [1, 1] still collapses to one entry.
    const key = identity ?? `json:${JSON.stringify(entry)}`
    if (seen.has(key)) return
    seen.add(key)
    merged.push(entry)
  }

  current.forEach(add)
  incoming.forEach(add)
  return merged
}

/**
 * Existing value wins, imported value fills the gaps. Arrays union by identity,
 * records merge key by key, scalars keep the local value once it exists.
 */
function mergeValue(current: unknown, incoming: unknown): unknown {
  if (current === undefined) return incoming
  if (current === null) return incoming
  if (Array.isArray(current) && Array.isArray(incoming)) {
    return mergeArrays(current, incoming)
  }
  if (isRecord(current) && isRecord(incoming)) {
    const merged: Record<string, unknown> = { ...incoming }
    for (const [key, value] of Object.entries(current)) merged[key] = value
    return merged
  }
  return current
}

function countArray(value: unknown): number {
  return Array.isArray(value) ? value.length : 0
}

function countRecord(value: unknown): number {
  return isRecord(value) ? Object.keys(value).length : 0
}

export function countBackup(data: BackupData): BackupCounts {
  return {
    items: countArray(data['grocery-items']),
    relationships: countArray(data['item-relationships']),
    trips: countArray(data['shopping-trips']),
    favorites: countArray(data['recipe-favorites']),
    brands: countArray(data['learned-brands']),
    barcodes: countRecord(data['learned-barcodes']),
    categoryHints: countRecord(data['item-category-hints']),
    sections: countRecord(data['section-custom-names']),
  }
}

/** One line a person can read, e.g. "12 items · 41 trained brands · 6 trips". */
export function describeCounts(counts: BackupCounts): string {
  const parts: string[] = []
  if (counts.items) parts.push(`${counts.items} item${counts.items === 1 ? '' : 's'}`)
  if (counts.brands) parts.push(`${counts.brands} trained brand${counts.brands === 1 ? '' : 's'}`)
  if (counts.trips) parts.push(`${counts.trips} trip${counts.trips === 1 ? '' : 's'}`)
  if (counts.favorites) parts.push(`${counts.favorites} recipe${counts.favorites === 1 ? '' : 's'}`)
  if (counts.barcodes) parts.push(`${counts.barcodes} barcode${counts.barcodes === 1 ? '' : 's'}`)
  if (counts.categoryHints) parts.push(`${counts.categoryHints} category hint${counts.categoryHints === 1 ? '' : 's'}`)
  return parts.length ? parts.join(' · ') : 'nothing to move'
}

/** Read the current install into a backup object. Missing keys are omitted. */
export function collectBackup(storage: StorageLike, now: number = Date.now()): BackupFile {
  const data: BackupData = {}
  for (const key of BACKUP_KEYS) {
    if (EXCLUDED_KEY_PATTERN.test(key)) continue
    const value = readKey(storage, key)
    if (value !== undefined) data[key] = value
  }
  return {
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    createdAt: now,
    app: APP_NAME,
    data,
  }
}

/** The export as the text that goes in the file / on the clipboard. */
export function serializeBackup(backup: BackupFile): string {
  return JSON.stringify(backup, null, 2)
}

/**
 * Accepts the file this module writes, and — because a recovery may come from a
 * hand-pasted snippet on an old install — a bare map of localStorage keys whose
 * values are still strings.
 */
export function parseBackup(text: string): ParseResult {
  const trimmed = text.trim()
  if (!trimmed) return { ok: false, error: 'Nothing to restore yet.' }

  let parsed: unknown
  try {
    parsed = JSON.parse(trimmed)
  } catch {
    return { ok: false, error: 'That does not look like a Breadcrumb backup.' }
  }

  if (!isRecord(parsed)) {
    return { ok: false, error: 'That does not look like a Breadcrumb backup.' }
  }

  const rawData = isRecord(parsed.data) ? parsed.data : parsed
  const data: BackupData = {}
  for (const key of BACKUP_KEYS) {
    if (EXCLUDED_KEY_PATTERN.test(key)) continue
    const value = rawData[key]
    if (value === undefined) continue
    if (typeof value === 'string') {
      // A snippet scraped straight out of localStorage.
      data[key] = parseStored(value)
    } else {
      data[key] = value
    }
  }

  if (Object.keys(data).length === 0) {
    return { ok: false, error: 'No Breadcrumb data found in that backup.' }
  }

  return {
    ok: true,
    backup: {
      format: BACKUP_FORMAT,
      version: typeof parsed.version === 'number' ? parsed.version : BACKUP_VERSION,
      createdAt: typeof parsed.createdAt === 'number' ? parsed.createdAt : Date.now(),
      app: typeof parsed.app === 'string' ? parsed.app : APP_NAME,
      data,
    },
  }
}

/**
 * Merge a parsed backup into this install. Writes only keys whose merged value
 * actually changed, so a restore that brings nothing new leaves storage alone.
 */
export function applyBackup(storage: StorageLike, backup: BackupFile): RestoreResult {
  const written: string[] = []

  for (const key of BACKUP_KEYS) {
    if (EXCLUDED_KEY_PATTERN.test(key)) continue
    const incoming = backup.data[key]
    if (incoming === undefined) continue

    const current = readKey(storage, key)
    const merged = mergeValue(current, incoming)
    if (merged === current) continue

    const serialized = JSON.stringify(merged)
    if (serialized === storage.getItem(key)) continue

    storage.setItem(key, serialized)
    written.push(key)
  }

  return { written, counts: countBackup(collectMergedData(storage)) }
}

function collectMergedData(storage: StorageLike): BackupData {
  const data: BackupData = {}
  for (const key of BACKUP_KEYS) {
    const value = readKey(storage, key)
    if (value !== undefined) data[key] = value
  }
  return data
}
