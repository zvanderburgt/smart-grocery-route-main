# Google Sheets Incremental Sync Design

## Goal

Make common sync operations feel fast without weakening current correctness guarantees.

The current sync path does a full-sheet read, merge, clear, and rewrite for nearly every change. That is safe, but it makes a single checkbox toggle pay the cost of multiple serial network requests. The new design keeps the existing merge and tombstone safety model, but adds a fast incremental write path for ordinary local edits.

## Non-goals

- No backend
- No real-time push from Google Sheets to other devices
- No removal of the existing full reconcile path
- No change to the local-first UI model

## Current problems

1. A single local item mutation usually triggers a full remote read plus full-sheet rewrite.
2. Writes are serialized as clear-then-rewrite, so latency scales with the whole list, not the changed item.
3. The code has one safe path, but no cheap path for the common case.
4. Other-device freshness is limited by polling/visibility rules, so local-write speed and remote-observe speed must be treated separately.

## Recommended approach

Implement **incremental row-based sync with conservative full-reconcile fallback**.

### Summary

- Keep `id` as the stable record key.
- Maintain a cached remote snapshot and `id -> rowNumber` index from the last successful pull/reconcile.
- Convert local mutations into a small set of pending row operations.
- Flush those operations with a single `spreadsheets.values.batchUpdate` or append request when possible.
- Fall back to the existing full reconcile flow whenever state is ambiguous or safety checks fail.

This preserves current checks/balances while making the common local write path much cheaper.

## Design

### 1. Two sync modes

#### Fast path: incremental local flush

Used when all of these are true:

- user is signed in
- sheet config is valid
- last successful full reconcile produced a usable remote snapshot
- each changed item can be mapped to exactly one known sheet row, or is clearly a new append
- no duplicate ids or parse errors were seen
- no force-full-sync reason is pending

Operations:

- check/uncheck item → update that row only
- rename item → update that row only
- quantity/category edit → update that row only
- add item → append one new row, then refresh row index for that appended id
- tombstone delete → update that row to tombstone values
- explicit bulk clear/delete → may batch clear specific rows or force a full reconcile depending on implementation phase

Transport:

- use one `spreadsheets.values.batchUpdate` call for row updates
- use append only for truly new rows
- after success, update the cached remote snapshot locally so the app does not need an immediate full pull just to trust its own write

#### Safe path: full reconcile

Used on:

- app startup after auth is ready
- reconnect
- tab becomes visible
- manual `Sync now`
- periodic background pull
- missing row mapping
- duplicate ids in the sheet
- parse/schema mismatch
- append response cannot be mapped back confidently
- any failed incremental precondition

Flow:

1. fetch remote rows
2. parse rows and build `snapshot + rowIndexById`
3. merge local and remote with current LWW/tombstone rules
4. write resolved state back if needed
5. refresh local state and caches

This remains the source of truth repair mechanism.

### 2. New cached sync state

Extend the hook with in-memory cached sync metadata:

- `lastRemoteSnapshotById: Map<string, GroceryItem>`
- `rowIndexById: Map<string, number>` using 1-based sheet row numbers
- `snapshotRevision` or `snapshotAt` timestamp for bookkeeping
- `forceFullSyncReason: string | null`
- `pendingOps: SyncOp[]`

`SyncOp` should stay minimal:

- `upsertRow` for existing mapped rows
- `appendRow` for new items
- `deleteRow` or `tombstoneRow` depending on delete type
- optional `clearRows` for explicit bulk wipe if adopted

Do not persist this metadata to localStorage initially. Keep it session-local and rebuild it on reconcile. That avoids adding stale cache recovery complexity before it is needed.

### 3. Source of operations

Do not scatter sync logic across UI components.

The hook should continue to observe `localItems` and derive what changed relative to the last trusted snapshot. The UI should keep doing local-first mutations exactly as it does now.

Comparison source:

- trusted baseline = `lastRemoteSnapshotById` after last successful reconcile or fast-path flush
- current desired state = latest `itemsRef.current`

Diff rules:

- id absent in baseline, present now → append
- id present in baseline and fields changed → row update
- id present in baseline, now tombstone → tombstone row update
- id absent now because of explicit hard delete → clear row or queue full reconcile path

This keeps one sync decision point and preserves the current architecture.

### 4. Row mapping and schema

The sheet schema remains the current 10-column layout including `isTombstone`.

Rules:

- header row is row 1
- data rows begin at row 2
- cached `rowIndexById` stores actual sheet row numbers
- every incremental update writes the full 10-column row for that item, not partial columns, to keep serialization simple and deterministic

If the sheet contains duplicate ids, the fast path must stop and request a full reconcile. Duplicate ids make row-targeted updates unsafe.

### 5. Deletes and tombstones

Keep the existing semantic distinction:

- ordinary single-item delete → tombstone so deletion propagates across devices
- explicit bulk clear/delete chosen by user → may remove rows more aggressively

Recommended handling:

- ordinary delete uses incremental tombstone row update
- bulk explicit wipe can initially take the safe route: mark a force-full-sync reason and let the reconcile path perform the authoritative removal

This is slightly less optimized than possible, but avoids reintroducing resurrection bugs while incremental sync is being introduced.

### 6. Polling and freshness

Local-write speed and remote-observe speed are different problems.

This design speeds up local writes to Google Sheets. It does not make another device see changes instantly, because this app still has no server push channel.

Keep periodic reconcile/pull behavior, but separate it conceptually:

- fast path handles local writes cheaply
- periodic/manual/visibility reconcile handles remote discovery safely

Once the fast path exists, debounce and polling can be tuned with less risk.

## Error handling

If any fast-path uncertainty appears, stop being clever and fall back:

- missing row number
- duplicate id
- append ambiguity
- batch update error
- parse failure
- schema/header mismatch
- auth/token issues

Behavior:

1. set `forceFullSyncReason`
2. preserve local state
3. run full reconcile when allowed
4. clear the flag only after a successful reconcile

Do not partially apply mixed optimistic assumptions after a failed incremental write.

## Testing

### Unit tests

Add focused tests for:

- diffing baseline vs current items into `SyncOp[]`
- row-number mapping from fetched rows
- existing item toggle becomes one row update, not full rewrite intent
- new item becomes append op
- ordinary delete becomes tombstone row update
- duplicate ids disable fast path
- missing row mapping forces full reconcile
- successful incremental write updates cached snapshot
- failed incremental write sets force-full-sync state

### Hook-level behavior tests

Add tests around `use-google-sheets-sync` for:

- checkbox toggle after initial reconcile uses fast path
- manual `Sync now` uses full reconcile path
- visibility/polling path still reads remote changes
- a remote anomaly falls back safely without losing local edits

### Regression coverage

Preserve existing regressions for:

- tombstone propagation
- stale row cleanup / no resurrection
- in-flight local edit survival
- timestamp hygiene
- short hand-edited rows
- persisted bulk-delete handling

## Implementation phases

### Phase 1

Introduce fast-path internals behind the hook while keeping current external API unchanged.

- add cached snapshot/index state
- add diffing
- add batched row update writer
- keep startup/manual/polling on full reconcile
- route ordinary local edits through fast path when safe

### Phase 2

Optimize add/delete edges once Phase 1 is stable.

- robust append row mapping
- optional targeted row clears for explicit bulk delete
- skip reconcile/write entirely when diff is empty

### Phase 3

Tune UX after correctness is proven.

- shorten debounce if desired
- distinguish `syncing local changes` vs `checking remote changes`
- optionally show last local push vs last remote pull

## Why this is preferred

It fixes the real cost center: unnecessary whole-sheet rewrites for tiny mutations.

It does so without removing the safeguards that already matter in this codebase:

- local-first UI stays instant
- current merge logic stays authoritative
- tombstones keep deletion propagation
- full reconcile remains the repair path
- ambiguous situations fail closed into the safe path

## Open decisions

1. Whether explicit bulk clear should initially force full reconcile or support targeted row clears in Phase 1.
2. Whether appended-row remapping should rely on append response metadata alone or simply trigger a lightweight post-append refresh.
3. Whether sync status UI should distinguish local push latency from remote pull freshness.
