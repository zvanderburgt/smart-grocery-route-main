# Google Sheets Sync — Review Findings & Fix Plan

Review of the sync path: `src/App.tsx` → `src/hooks/use-google-sheets-sync.ts` →
`src/lib/sync-engine.ts` → `src/lib/google-sheets.ts`.

## Status: implemented (2 worker→reviewer subagent waves + follow-up manual passes for Findings 4, 9, and 10)

All 9 original findings are **done and verified** (independently re-read
file-by-file and re-run, not just taken on a subagent's word — one reviewer
child run in the first wave errored out at the platform level rather than
returning a verdict, so it was rechecked by hand below). A 10th finding
surfaced from real usage of the Finding 9 fix (see Finding 10) and has also
been fixed. The remaining un-actioned items are minor, explicitly-flagged
low-priority nice-to-haves (see Follow-ups), not gaps in the original bug
report.

**Verification run (latest, after Finding 10's bulk-clear fix):** `npx vitest
run` → 9 files, 76 tests, all passing. `npx tsc --noEmit -p tsconfig.json` →
exactly one error, in `src/components/DiagnosticsPanel.tsx:741` (`AlertDialog`
doesn't accept a `className` prop) — pre-existing, unrelated to this sync
work, not in scope.

**Part 2 (see bottom of this doc): a full parallel mutation-path audit was
run afterwards** — 3 read-only scout subagents + a reviewer synthesis, all
claims re-verified by hand. Result: every one of the 17 user mutation-path
families already routes through the existing debounced listener (no new
listener needed), but the audit surfaced 5 new findings (11–15: NaN/fresh
timestamp merge poisoning — a second mechanism for the original revert bug;
bulk-clear durability; the empty-list gate; hand-edited rows being erased;
a dead hook footgun). Those are **planned with fixes + tests, not yet
implemented.**

---

## Finding 1 (ROOT CAUSE of the check-reverts bug): sync overwrites app state from a stale snapshot — ✅ FIXED

**Where:** `use-google-sheets-sync.ts`, `syncNow` (step 5) + `onItemsChange(finalItems)`.

`syncNow` is a `useCallback` that captures `localItems` at render time. The sync is
async (network reads take hundreds of ms, plus the 1s debounce). Sequence:

1. A sync starts with a snapshot where the item is **unchecked**.
2. User checks the item while the sync is in flight.
3. Sync finishes, detects "conflicts" (see Finding 2 — it almost always does),
   and calls `onItemsChange(finalItems)` — a **wholesale replacement** of app
   state built from the stale unchecked snapshot. The checkmark is reverted.
4. Worse: `lastSyncedItemsRef` is then set to that reverted state, so the
   debounce effect sees "no change" and the user's check is **never synced** —
   the app now permanently matches the sheet's unchecked state.

**Fix:**
- Keep a `useRef` of current items (`itemsRef.current = localItems` each render)
  and read it inside `syncNow` instead of the captured `localItems`.
- Never call `onItemsChange(fullArray)`. Use a **functional update** that merges
  the sync result into whatever the current state is, per item id, keeping the
  newer `updatedAt`:
  ```ts
  onItemsChange(current => mergeLocalAndRemote(current ?? [], remoteItems).merged)
  ```
- Only call `onItemsChange` at all when the merge actually pulled in a remote
  change (compare against current, not against the pre-sync snapshot).

**Done:** `use-google-sheets-sync.ts` now keeps `itemsRef` in sync with
`localItems` via a `useEffect`, and `syncNow` reads `itemsRef.current` instead
of the closed-over `localItems`. The final `onItemsChange` call is now
`onItemsChange(current => mergeLocalAndRemote(current ?? [], finalItems).merged)`
- a functional update merged into whatever state is current at commit time,
never a wholesale replace from the pre-sync snapshot. A regression test was
added to `sync-engine.test.ts` covering "a locally checked item is not
reverted by a stale remote snapshot." This is the actual fix for the reported
bug.

## Finding 2: false conflicts on nearly every sync — ✅ FIXED

**Where:** `sync-engine.ts` `mergeLocalAndRemote` / `detectConflicts`.

Conflict = `JSON.stringify(localItem) !== JSON.stringify(remoteItem)`. This is
true almost every sync because:
- Sheet round-trips change field shapes (`undefined` vs missing, `versionVector`
  wiped to `{}` — see Finding 3, key order differences).
- Any timestamp difference at all counts.

Consequence: the conflict branch (and its state-overwrite from Finding 1, plus
the `toast.info('Auto-resolved N conflicts')` spam) runs constantly.

**Fix:** A "conflict" should require both sides changed since the last sync
cursor. For a grocery list, drop the conflict machinery entirely and rely on
per-item last-write-wins by `updatedAt` (which `mergeLocalAndRemote` already
does). Delete `detectConflicts`, the conflict UI path, and the
`JSON.stringify` comparison. LWW on a grocery item is always an acceptable
resolution; nobody wants a conflict dialog about milk.

**Done:** `mergeLocalAndRemote` now returns only `{ merged }` — pure per-item
last-write-wins by `updatedAt`, tombstone always wins, no conflict array at
all. `detectConflicts`, `resolveConflict`, and `applyResolutions` were deleted
from `sync-engine.ts` (confirmed dead: no UI component ever rendered
`pendingConflicts`). The hook's `pendingConflicts`/`resolveConflict`/
`clearConflicts` public API and the `toast.info('Auto-resolved N conflicts')`
branch were removed to match. The only remnant is the now-unused
`SyncConflict` type in `types.ts` — harmless (no importers), left alone since
deleting exported types was out of the agreed scope for this round.

## Finding 3: remote version vectors are wiped by double conversion — ✅ FIXED

**Where:** `use-google-sheets-sync.ts` step 2:

```ts
const remoteRows = await getAllGroceryItems(sheetConfig); // ALREADY returns GroceryItem[]
const remoteItems = rowsToItems(remoteRows);              // sync-engine version, re-converts
```

`getAllGroceryItems` already runs `google-sheets.ts#rowsToItems` (raw rows →
items, versionVector parsed to object). The hook then feeds those *items* into
`sync-engine.ts#rowsToItems`, which expects `versionVector` to be a JSON
*string* — it's an object, so every remote item gets `versionVector: {}`.
All vector comparisons (`concurrent`/`ancestor`/`descendant`) are therefore
meaningless.

**Fix:** delete the second conversion; use `getAllGroceryItems` output
directly. Also delete the duplicate `rowsToItems`/`itemsToRows` in
`sync-engine.ts` — one converter, in `google-sheets.ts`.

**Done:** the hook now calls `getAllGroceryItems(sheetConfig)` and uses its
output directly as `remoteItems` — no second `rowsToItems` pass. `sync-engine.ts`
still exports its own `itemsToRows`/`rowsToItems` (used by `sync-engine.test.ts`
and kept as the canonical GroceryItem⇄GoogleSheetsRow helpers for that layer);
the duplicate-converter cleanup this finding also suggested was not done since
it's not the thing causing the wiped-vector bug — deferred, low priority, no
behavioral impact now that the double-conversion call site is gone.

## Finding 4: userId is a shared constant → version vectors can't work anyway — ✅ FIXED (deleted)

**Where:** `App.tsx` (`googleSheetsSync.userEmail || 'local'`),
`use-grocery-items.ts` (`'local'`), hook (`providedUserEmail || 'unknown@user.com'`).

- `userEmail` is only ever set from `config.connectedAccountEmail`, which is
  **never written anywhere** — so it's always null. Every device edits under
  the same key `'local'` (and the hook syncs under `'unknown@user.com'`).
- Two devices sharing key `'local'` make vectors compare as ancestor/descendant
  by raw counter, so a device with a lower counter loses *all* its edits to
  stale remote data — another reversion vector.
- Bonus bug: `use-grocery-items.ts#addItemsToList` *replaces* the whole vector
  (`versionVector = { [userId]: n+1 }`), dropping other users' counters.

**Fix (lazy):** since Finding 2's fix moves resolution to timestamp LWW,
version vectors can be removed entirely (fields, column K, compare/merge
helpers). If kept: generate a stable per-device id once
(`crypto.randomUUID()` in localStorage) and use it everywhere.

**Done:** deleted outright, the lazier of the two options — traced every
consumer first to confirm it was safe:
- `computeIncrementalSyncDiff`'s only field the hook actually used was
  `toDelete`, and `toDelete` only ever fires from an explicit `isTombstone()`
  check on a single-sided item — never from the vector comparison. The hook's
  final filter was already `merged.filter(item => !isTombstone(item) &&
  !toDelete.includes(item.id))`; since `mergeLocalAndRemote`'s single-sided
  branch passes a tombstone through unchanged, `!isTombstone(item)` alone
  already excludes everything `toDelete` would have. `toDelete` was
  redundant with code already in place, not load-bearing. Verified with a new
  test (`sync-engine.test.ts`: "passes through a tombstone that only exists
  on one side").
- `toAdd`/`toUpdate` (the outputs that actually consumed the vector
  comparisons) were never destructured/used by the hook at all — fully dead.
- `cursor.lastSyncTimestamp` was written every sync and never read anywhere.
- Nothing else in the app read `versionVector` for a decision (Finding 2
  already moved resolution to `updatedAt` LWW).

With all of that confirmed dead, removed rather than repaired:
`incrementVersionVector`, `compareVersionVectors`, `mergeVersionVectors`,
`computeIncrementalSyncDiff`, `prepareItemsForSync`, both `SyncCursor`
interface declarations (one was a duplicate in `types.ts`, unused), the
cursor `useLocalStorage` state + `CURSOR_KEY` in the hook, `ItemVersionVector`,
`VersionedGroceryItem` (already fully unused), and the now-pointless
`SyncConflict` type (Finding 2 already removed its only consumers). `versionVector`
was removed from `GroceryItem`/`GoogleSheetsRow`, from `itemToRow`/`rowToItem`/
`itemsToRows`/`rowsToItems`, and from the sheet's column layout entirely — the
sheet schema shrank from 11 columns (A–K) to 10 (A–J); `getHeaderRow()`,
`ensureGroceryListSheet`, `getAllGroceryItems`, and `syncItemsToSheets` all
updated to the new `A:J` range. This was a schema change, not a value change —
deliberately not a compat-preserving "leave a hole and write empty string"
approach, because the app's own `GOOGLE_SHEETS_SETUP.md` never documented a
`versionVector` column to users in the first place (it only ever told users to
set up columns A–I), and `ensureGroceryListSheet` already rewrites the header
row to match `getHeaderRow()` on every connect regardless. `updatedBy` was kept
(harmless audit field, still documented in the setup guide, no longer tied to
any vector logic). `item-mutations.ts` and `use-grocery-items.ts` (the two
other callers that generated/mutated version vectors) were updated to match.

**Verified:** `npx vitest run` → 69/69 passing (added one new regression
test). `npx tsc --noEmit` → same single pre-existing, unrelated error as
before. Full-repo grep for `versionVector|ItemVersionVector|SyncCursor|
incrementVersionVector|compareVersionVectors|mergeVersionVectors|
computeIncrementalSyncDiff|prepareItemsForSync|VersionedGroceryItem|
CURSOR_KEY` across `src/` → zero matches.

**Noticed but out of scope (flagged, not fixed):** while tracing the sheet
column schema for this change, `GOOGLE_SHEETS_SETUP.md` documents only 9
columns (A–I) for users to manually create, but `rowToItem` requires
`row.length >= 10` (was `>= 11`) to parse a row at all. A user who
hand-populates their sheet with rows per the setup doc *before* the app ever
writes to it would have every one of those rows silently dropped as
unparseable (`row.length` would only be 9). This is a pre-existing doc/code
mismatch, not introduced or worsened by this change (it made the gap smaller,
11→10 vs. the documented 9, not larger) — worth its own finding if the setup
flow is revisited, not fixed here.

## Finding 5: rate limiter silently drops the sync of a change — ✅ FIXED

**Where:** hook, `syncNow` top: if last sync was < 5s ago, `return` — the
change is dropped, not deferred. With `autoSync: false` (see Finding 7) there
is no periodic retry, so a check made within 5s of a previous sync is never
pushed until some other edit happens.

**Fix:** when rate-limited, schedule a retry for
(`minSyncInterval - elapsed`) instead of returning. One `setTimeout`, replace
any pending one.

**Done:** when rate-limited, `syncNow` now schedules `rateLimitedRetryRef` for
the remaining wait instead of returning and dropping the request; the timer is
cleared/replaced on repeat calls and cleaned up on unmount alongside the
existing debounce/interval timers.

## Finding 6: full-sheet overwrite leaves stale rows behind — ✅ FIXED

**Where:** `google-sheets.ts#syncItemsToSheets` writes `A1:K{rows.length}`.
If the list shrank since the last write, old rows below remain in the sheet.
On the next read they come back as duplicate/deleted items; with duplicate
ids the *later* (stale) row wins in the remote map — old checked/unchecked
states resurface.

**Fix:** clear before write (`clearSheet(sheetId, 'Name!A2:K')` then write), or
pad the write with blank rows up to the previous row count. Clear+write is two
calls but correct; fine at this sync frequency.

**Done:** `syncItemsToSheets` now calls `clearSheet(sheetId, 'Name!A2:J')`
before `writeSheet`, so a shrinking list can no longer leave stale trailing
rows to be read back and resurrect old state. (The range shrank from `A2:K`
to `A2:J` as part of Finding 4's removal of the `versionVector` column.)
Covered by a new `src/test/google-sheets.test.ts` (mocked `fetch`) proving a
shrinking sync leaves no stale rows readable and that `clearSheet` is called
before the write.

## Finding 7: the app never pulls remote changes (autoSync disabled) — ✅ FIXED

**Where:** `App.tsx`: `autoSync: false, // Disabled to prevent infinite sync loop`.

The periodic pull is switched off, so the app only sees sheet edits as a side
effect of pushing local edits. The "infinite loop" it was papering over is
Findings 1+2 (every sync mutates state → state change re-triggers sync).

**Fix:** after Findings 1, 2, 5 are fixed, re-enable `autoSync: true`.
Recommended cadence:
- `syncInterval: 60000` (60s is plenty for a grocery list; 30s doubles quota
  use for no UX gain).
- Skip the interval tick when `document.visibilityState !== 'visible'`.
- Add a `visibilitychange`/`focus` listener that triggers one sync on return
  to the app — this is when users actually expect fresh data.
- Skip the **write** step when nothing changed locally since the last sync
  (read-only poll), so idle polling costs 1 read instead of read+write.

**Done:** `App.tsx` now passes `autoSync: true, syncInterval: 60000`. The
hook's periodic `setInterval` tick skips silently when
`document.visibilityState !== 'visible'`, and a `visibilitychange` listener
triggers one immediate `syncNow()` when the tab becomes visible again;
cleanup for both is wired into the existing effect teardown.

**Not done:** the read-only-poll optimization (skip the write step entirely
when nothing changed locally) — every periodic sync still does a full
read+write cycle even when idle. Low-risk follow-up, not required for
correctness, just a quota-usage nicety.

## Finding 8: syncing is noisy — toasts on every sync — ✅ FIXED

**Where:** hook: `toast.success('Synced with Google Sheets')` on **every**
successful sync (i.e., every edit, and every poll once autoSync is on),
`toast.info('Auto-resolved N conflicts')`, plus error toasts.

**Fix (silent background sync):**
- Delete the success toast and the auto-resolved toast. The header already has
  a sync status icon (`AppHeader.tsx` `googleSheetsSyncStatus`) — that's the
  right surface.
- Errors: keep silent for transient/quota errors (retry already handles them);
  show one error toast only when sync has failed terminally (retries
  exhausted) and suppress repeats while the error persists (the header icon
  already turns to error state).
- Keep `connect`/`disconnect` toasts — those are explicit user actions.

**Done:** the per-sync `toast.success('Synced with Google Sheets')` and the
`toast.info('Auto-resolved N conflicts')` are both gone (the latter's whole
branch no longer exists per Finding 2). Errors now toast exactly once per new
failure via `hasSyncErrorToastedRef` (reset on the next success), so a string
of retried quota errors no longer spams the user — only a terminal failure
toasts. `connect()`/`disconnect()` toasts are unchanged.

## Finding 9: dead/duplicated code in the sync path (cleanup) — ✅ FIXED

- `syncNow` step 7 computes `rows = itemsToRows(...)` then never uses it.
- `computeIncrementalSyncDiff` result (`toAdd`, `toUpdate`) is computed but
  only `toDelete`/`newCursor` are used; the cursor's `lastKnownVersions` grows
  forever (deleted-item vectors are kept "for history").
- `computeSyncDiff`, `handleRedirectCallback` (superseded by
  `handleOAuthRedirect`), `readSheet`/`writeSheet` re-exports in the hook.
- Tombstones are filtered out *before* writing to the sheet, so deletions only
  propagate via the full-overwrite side effect; another device that still has
  the item will happily re-add it on its next push (deleted items resurrect).
  Simplest fix consistent with Finding 2: **write tombstone rows to the sheet**
  (column K already exists), let LWW merge them, and purge tombstones older
  than ~7 days on write.
- Token is stored in `sessionStorage` in most paths but `TOKEN_STORAGE_KEY`
  comments claim localStorage (`getStorage()` is defined and unused) — sign-in
  doesn't survive a browser restart. Decide one (localStorage) and use it.

**Done:**
- The dead `const rows = itemsToRows(...)` in `syncNow` is gone (the whole
  step was rewritten per Finding 1/3).
- `computeSyncDiff` (fully unused) and `handleRedirectCallback` (superseded by
  `handleOAuthRedirect`, confirmed no external callers) are both deleted.
- Token storage now goes through `getStorage()` (→ `localStorage`)
  consistently everywhere in `google-sheets.ts` for the access token, expiry,
  and OAuth state — sign-in now survives a browser restart. The transient
  `google_sheets_sheet_id`/`sheet_name` values used only during an in-flight
  OAuth redirect intentionally stay on `sessionStorage` (not the token, no
  need to survive a restart).
- The dead `itemsToRows` import left behind in the hook after the above
  cleanup (caught on a final recheck of this plan, not by any subagent) has
  been removed.
- The `computeIncrementalSyncDiff`/`SyncCursor`/cursor-bookkeeping machinery
  this bullet originally flagged for unbounded growth no longer exists at all
  — deleted wholesale as part of Finding 4 (traced and confirmed dead, see
  that finding). Moot, not just fixed.
- **Tombstone propagation** (the last open gap): `syncNow` no longer strips
  every tombstone before writing to the sheet. It now computes
  `finalItems = purgeStaleTombstones(merged)` — a tombstone is only dropped
  once it's older than a 7-day retention window (`TOMBSTONE_RETENTION_MS` in
  `sync-engine.ts`); anything more recent is written through as a real
  `isTombstone=TRUE` row. A device that still has the plain (non-deleted)
  item now merges against that tombstone row on its next sync — tombstone
  wins (existing LWW rule) — and adopts the deletion locally instead of
  pushing the plain item back and resurrecting it. The same
  `purgeStaleTombstones` call is applied a second time to the `onItemsChange`
  merge result, so local storage converges to actually drop a stale tombstone
  too, not just the sheet copy. Marked with a `ponytail:` comment on the
  known ceiling: a device offline longer than the retention window, still
  holding the pre-deletion item, can resurrect it once the tombstone itself
  has expired everywhere — inherent to any time-bounded tombstone scheme, not
  a bug; upgrade path (longer window, or a separate never-expiring "known
  deleted ids" ledger) is noted in the code.

**Verified:** a new `describe('tombstone propagation across a sync
  round-trip...')` block in `sync-engine.test.ts` simulates two devices
  sharing one sheet through the exact sequence `syncNow` runs
  (merge → purge → write → re-merge into local state) and asserts: (1) a
  deletion pushed by device A reaches the shared sheet as a tombstone row,
  not an absent row; (2) device B, still holding the stale plain item,
  adopts the tombstone on its own sync instead of resurrecting the item back
  onto the sheet; (3) a sufficiently old tombstone is purged from both the
  sheet and local state. Plus 3 direct unit tests for `purgeStaleTombstones`
  itself (drops when stale, keeps when recent, never touches non-tombstones).
  `npx vitest run` → 74/74 passing. `npx tsc --noEmit` → same single
  pre-existing, unrelated error as before.

**Not done (deferred, genuinely low-priority):**
- `readSheet`/`writeSheet` re-exports: left in place per instructions (still
  exported from `google-sheets.ts`, just no longer imported by the hook after
  cleanup — genuinely unused now, safe to delete in a future pass along with
  the `readSheet`/`writeSheet` dead-import removal from the hook, which has
  already happened implicitly since those two were dropped from the hook's
  import list during Finding 2/3's cleanup).

## Finding 10: bulk "Clear List"/"Clear Completed" no longer visually clears the sheet — ✅ FIXED

**Surfaced by:** user report, after Finding 9's tombstone-propagation fix
shipped: "if I clear the list in the front end it doesn't seem to clear the
sheet."

**Where:** `App.tsx` `clearCompleted()` / `handleConfirmClear()` →
`createDeletionTombstone` (per item) → `use-google-sheets-sync.ts` `syncNow`.

This is not a separate bug — it's the direct, previously-undiscussed
consequence of Finding 9's own fix. Before Finding 9, a cleared item's
tombstone was stripped out of `finalItems` before the sheet write, so the row
physically vanished from the sheet (full clear-then-rewrite). After Finding 9,
tombstones are deliberately written to the sheet as real rows
(`isTombstone=TRUE` in the last column) so another device/person that still
has the plain item learns about the deletion instead of resurrecting it. But
`itemToRow` still writes the full row — name, category, checked state,
everything — for a tombstoned item; only the last column changes. Opening the
actual spreadsheet after a "clear," every row is still sitting there with its
name and data, unless you happen to notice the flag column. It takes up to 7
days (the retention window) for those rows to actually disappear.

**Decision (asked the user, since it's a genuine trade-off, not an obvious
bug to silently pick a side on):** wipe cleared rows from the sheet
immediately, accepting a small risk — if another device edited one of the
exact items being cleared in the last few seconds before this sync runs,
that edit is lost instead of preserved. This only applies to explicit bulk
clear; ordinary single-item delete (trash icon) keeps Finding 9's safe
tombstone-propagation behavior unchanged, since that's the ambiguous-race
scenario the fix was actually protecting against.

**Done:**
- New hook API `deleteItemsPermanently(itemIds: string[])` in
  `use-google-sheets-sync.ts`: removes the given ids from local state
  outright (a real array filter, not a tombstone) and adds them to a new
  `forceDeleteIdsRef` set.
- `syncNow` now snapshots `forceDeleteIdsRef` at the top of each sync attempt
  and filters those ids out of `finalItems` — the write — regardless of
  whether the just-fetched remote snapshot still reports the plain item. The
  same filter is applied to the `onItemsChange` local-state merge, so a stale
  remote read can't resurrect the item into local storage either. Once the
  write actually succeeds, exactly the snapshotted ids are cleared from
  `forceDeleteIdsRef` (not the whole set, in case a fresh clear was requested
  by the user while this sync was still in flight).
- `App.tsx`'s `clearCompleted()` and `handleConfirmClear()` now call
  `deleteItemsPermanently(ids)` once for the whole batch instead of looping
  `createDeletionTombstone(id)` per item. `deleteItem()` (single-item trash
  icon) is unchanged.

**Verified:** no hook-level test harness exists for `use-google-sheets-sync.ts`
(consistent with how Findings 1/3/5/7/8 were verified — none of those got a
dedicated hook test either), so this was verified the same way as Finding 9's
tombstone-propagation fix: two new tests in `sync-engine.test.ts` simulate the
exact sequence `syncNow` now runs (merge → purge → force-delete filter →
"write") — one proving a bulk-cleared item is wiped from the simulated sheet
immediately, and a contrasting test proving that the *same* hard local removal
without `forceDeleteIds` would resurrect the item (i.e., reproducing the
original Finding 9 bug), documenting why the mechanism exists. `npx vitest
run` → 76/76 passing. `npx tsc --noEmit` → same single pre-existing,
unrelated error as before.

---

## Implementation order (as executed)

| Step | Fix | Files | Status |
|------|-----|-------|--------|
| 1 | Finding 3 — remove double `rowsToItems` conversion | `use-google-sheets-sync.ts` | ✅ done |
| 2 | Finding 2 — drop JSON.stringify conflicts; pure per-item LWW merge | `sync-engine.ts`, hook | ✅ done |
| 3 | Finding 1 — `itemsRef` + functional merge in `onItemsChange`; never replace state from a snapshot | hook | ✅ done |
| 4 | Finding 5 — defer rate-limited syncs instead of dropping | hook | ✅ done |
| 5 | Finding 6 — clear-then-write (or pad) on full sheet write | `google-sheets.ts` | ✅ done |
| 6 | Finding 9 — write tombstones to sheet, purge after 7 days | hook, `sync-engine.ts` | ✅ done |
| 7 | Finding 8 — remove per-sync toasts, error toast only on terminal failure | hook | ✅ done |
| 8 | Finding 7 — re-enable `autoSync`, 60s interval, visibility-gated, sync-on-focus, read-only poll when no local changes | `App.tsx`, hook | ◐ mostly done — autoSync/interval/visibility-gating/sync-on-focus all done; read-only-poll-when-unchanged optimization not done |
| 9 | Finding 4 / 9 — delete version-vector machinery + dead code | `sync-engine.ts`, `item-mutations.ts`, hook | ✅ done — version vectors fully deleted (fields, helpers, sheet column, cursor bookkeeping); tombstone propagation also done (step 6) |
| 10 | Finding 10 — `deleteItemsPermanently` force-delete path for bulk clear, bypassing the tombstone-row write | `App.tsx`, hook | ✅ done |

Steps 1–3 fix the reported reversion bug — **done and independently
verified** (re-read the actual files and re-ran the full test suite +
typecheck myself, not just accepted subagent claims). Steps 7–8 deliver
"silent background sync" and a sane pull frequency — **done**, except the
read-only-poll quota nicety. Step 9 is now fully done: version vectors are
gone (full deletion, not just neutralization, including the
cursor/lastKnownVersions growth this table used to flag), and step 6
(tombstone propagation) closed the last open finding. Step 10 closed a new
finding that surfaced directly from step 6/9 shipping (bulk clear no longer
looked like it cleared the sheet), fixed by giving explicit bulk clear its
own immediate-wipe path distinct from ordinary single-item delete.

**Verification:** `src/test/sync-engine.test.ts` was updated for the
simplified merge, gained a regression test for "a local check made during
an in-flight sync survives the sync completing," a `purgeStaleTombstones`
unit test suite, a two-device tombstone-propagation regression test, and a
force-delete regression test pair (with contrast case) for Finding 10.
`src/test/google-sheets.test.ts` covers the clear-before-write fix.
Full-repo re-verification (run independently, not just by the implementing
subagents):

```
npx vitest run             → 9 files, 76 tests, all passing
npx tsc --noEmit -p tsconfig.json → 1 error, pre-existing & unrelated
                                    (DiagnosticsPanel.tsx AlertDialog className)
```

Manual verification (two browser profiles / two tabs on the same sheet) was
not performed as part of this pass — recommended before shipping, since it's
the only check here that exercises the real Google Sheets API rather than
mocks.

## Follow-ups (open, not blocking)

1. **Read-only polling when nothing changed locally** (Finding 7) — every
   periodic sync still writes, even when idle.
2. Manual two-device/two-tab verification against the real Google Sheets API
   (all fixes so far, including tombstone propagation and force-delete, are
   verified against mocked/simulated fetch, not a live sheet).
3. **New, noticed while removing version vectors:** `GOOGLE_SHEETS_SETUP.md`
   documents only 9 columns (A–I); `rowToItem` requires 10 (A–J) to parse a
   row. A hand-populated sheet (per the doc, before the app ever writes to
   it) would have every row silently dropped. Pre-existing, not worsened by
   this change; worth a look if the setup flow is revisited.
4. **Tombstone retention window ceiling** (documented in code as a
   `ponytail:` comment on `purgeStaleTombstones`): a device offline longer
   than 7 days, still holding a pre-deletion item, can resurrect it once the
   tombstone has expired everywhere. Inherent to any time-bounded tombstone
   scheme; upgrade path is a longer window or a separate never-expiring
   "known deleted ids" ledger, only worth it if this actually bites someone.
5. `readSheet`/`writeSheet` exports in `google-sheets.ts`: genuinely unused
   outside the file now; safe to drop the `export` keyword in a future pass.
6. **Finding 10's accepted trade-off:** an explicit bulk clear can silently
   drop a concurrent edit another device made to one of the cleared items in
   the last few seconds before the clear synced. Accepted deliberately (user
   chose "wipe immediately" over the safer-but-slower tombstone path for bulk
   clear specifically); revisit only if this is reported as an actual problem
   in practice.

---

# Part 2 — Full mutation-path audit (parallel scan)

**Status: ✅ IMPLEMENTED and independently verified** (all 5 findings; see each
section below and the verification block at the end of Part 2).

Requested by the user: scan every place a user can change the list, check
each against the sheet sync, and plan fixes — preferring "a listener that
checks for any changes to the list and updates the sheet."

## Methodology

Three parallel read-only `scout` subagents scanned disjoint areas
(`App.tsx`; `src/hooks/` + `src/lib/`; `src/components/`), each grading every
user-facing mutation path against the real sync-trigger gates. A `reviewer`
subagent then merged the three reports, spot-checking claimed gaps against
the code (it caught and corrected two scout errors: `category` IS in the
snapshot key, and bulk clear DOES call `syncNow()`). Every claim below was
then re-verified by hand at the cited lines before being written here.

## Headline result: the listener already exists and every path routes through it

The user's preferred design — one listener that observes any list change and
syncs — is already the architecture. All list state lives in exactly one
place (`App.tsx:100` `useLocalStorage('grocery-items')`), and the debounced
effect in `use-google-sheets-sync.ts:~178-215` observes it. The audit traced
**all 17 mutation-path families** (tap-check, voice check/uncheck, typed add,
suggestions, barcode, OCR/bulk/recipe/favorites, "other"-category dialogs,
rename, quantity stepper, voice quantity, category change, single delete,
clear completed/all, voice clears, cross-tab edits, manual Sync Now) and
every one reaches that listener — no component writes `grocery-items`
directly, no path bypasses `setItems`/hook APIs, `use-local-storage.ts:57-73`
already handles cross-tab via the `storage` event, and every mutation stamps
`updatedAt` (always in the snapshot key). **So: no new listener needed — the
plan is to repair the existing listener's two defects and the merge's
timestamp rules.** Full inventory table: see the scan artifacts
(`subagent-artifacts/outputs/a7457d32-.../scan-*.md`).

## Finding 11 — P0: unknown/NaN remote timestamps WIN the merge — the revert bug can recur

**Where:** `google-sheets.ts` `rowToItem` (lines ~457-461) +
`sync-engine.ts` `getItemUpdatedAt`/merge (lines ~12-13, 53-66).

- `addedAt: Number(addedAt) || Date.now()` — a blank/non-numeric `addedAt`
  cell is stamped with **fetch time, fresh on every read**. If `updatedAt`
  and `checkedAt` are also missing, that row's effective LWW timestamp is
  "right now" — it beats any real local edit, every sync.
- `updatedAt: updatedAt ? Number(updatedAt) : undefined` — a hand-edited or
  format-mangled cell (`"abc"`) becomes **NaN**, which is truthy-sourced so
  it isn't caught. In the merge, NaN makes both `===` and `>` comparisons
  false → falls into the final `else` → **remote wins, forever**.
- Either way, `syncNow` step 6 then writes the stale remote row back into
  app state: check an item → sync → app flips back to the sheet's version.
  Same signature as the original Finding 1 bug, different mechanism — and
  one hand-mangled cell makes it permanent, not just a race.

**Fix:** treat unknowable history as *oldest*, never newest:
- `rowToItem`: `addedAt: Number(addedAt) || 0`; coerce `updatedAt`/`checkedAt`
  through `Number.isFinite(...) ? n : undefined`.
- `getItemUpdatedAt`: return `0` when the resolved value isn't a finite
  number — so a garbage remote row always loses to a real local edit.

**Done:** exactly as specified. `getItemUpdatedAt` (`sync-engine.ts`) now
returns `0` via `Number.isFinite(resolved) ? resolved : 0`. `rowToItem`
(`google-sheets.ts`): `addedAt: Number(addedAt) || 0` (never `Date.now()`);
`checkedAt`/`updatedAt`/`quantity` now go through a shared
`parseFiniteOrUndefined` helper (`Number.isFinite(n) ? n : undefined`) instead
of the old `x ? Number(x) : undefined` pattern that let `"abc"` become `NaN`.
A latent related bug was also caught and fixed in passing: `category` used
`String(category) || undefined`, but `String(undefined)` is the truthy string
`"undefined"` — changed to `category ? String(category) : undefined`.
**Verified:** two new regression tests in `sync-engine.test.ts` (local wins
against a `NaN` remote `updatedAt`, and against a remote with no timestamps
at all / `addedAt: 0`); four new tests in `google-sheets.test.ts` covering
blank/non-numeric cells, no `Date.now()` leakage, and the `category` fix.

## Finding 12 — P1: bulk clear isn't durable — in-memory `forceDeleteIdsRef` + the empty-list gate

**Where:** `use-google-sheets-sync.ts` — `deleteItemsPermanently`, the gate
at line ~181 (`if (localItems.length > 0)`), the in-flight early-return at
line ~383.

Three failure modes, all stemming from Finding 10's fix keeping its state
only in a `useRef` and its own single `syncNow()` call:
1. **Reload during the window:** `syncNow` can defer up to 5s (rate limiter)
   or fail terminally. Close/reload the tab first → ref is gone, local list
   empty, sheet rows intact → next sync's merge (remote-only branch)
   **resurrects every cleared item**.
2. **The listener can't cover for it:** the debounce effect skips entirely
   when `localItems.length === 0`, so an emptied list is never pushed by the
   normal path — the explicit `syncNow()` is the *only* thing pushing a full
   clear, with no safety net.
3. **In-flight race:** if a sync is already running, `syncNow()` returns the
   in-flight promise without scheduling a follow-up. That sync snapshotted
   `forceDeleteIdsRef` *before* the clear, so its step-6 merge puts the
   cleared items **back into local state** — visibly resurrected for up to
   60s until the periodic sync applies the ref.

**Fix (adjusted from the reviewer's recommendation):** the reviewer proposed
re-tombstoning bulk clear, but that would undo Finding 10's explicit user
choice ("wipe the sheet immediately"). Keep the user's choice; make it
durable instead — the reviewer's own stated fallback:
- Persist pending force-delete ids to localStorage (e.g.
  `google-sheets-pending-deletes`), remove each id only after the write that
  excluded it succeeds (the snapshot/clear logic already works this way —
  just back it with storage instead of a bare ref). Survives reloads.
- Fix the gate (Finding 13 below) so an emptied list syncs via the normal
  listener — the explicit `syncNow()` stops being a single point of failure.
- In-flight race: when `syncNow()` finds a sync already running, schedule one
  follow-up sync after the in-flight promise settles (a one-line `.finally`
  chain guarded against stacking) instead of just returning it.

**Done:** exactly the adjusted fix, not the rejected tombstone alternative.
`forceDeleteIdsRef` (a bare `useRef<Set<string>>`) was replaced with
`readPendingDeleteIds()`/`writePendingDeleteIds()` backed by plain
`localStorage` under `google-sheets-pending-deletes` (a small dedicated pair
of functions rather than the `useLocalStorage` hook, for the same reason
`itemsRef`/`lastSyncedItemsRef` already bypass React state in this file —
values read/written across an `await` inside `syncNow` need to reflect the
latest write, not whatever was current when the closure was created).
`deleteItemsPermanently` persists ids there instead of mutating a ref;
`syncNow` snapshots the persisted set, filters `finalItems` by it (unchanged
semantics from before), and removes exactly the ids it just confirmed
excluded — only after the write succeeds, same success-based timing as the
original ref logic. The in-flight race is fixed with a
`forceDeleteFollowUpPendingRef` guard: a `syncNow()` call arriving while a
sync is already in flight now schedules exactly one follow-up sync via
`.finally()` once the in-flight promise settles, instead of silently
returning the in-flight promise with no further action.
**Verified:** 6 new pure-function tests in `use-google-sheets-sync.test.ts`
covering round-trip persistence, simulated-reload durability, malformed/
non-array JSON handling, and the exact partial-removal pattern `syncNow`
relies on. The in-flight-race *timing* itself isn't covered by an automated
test (no hook-rendering harness exists for this file, consistent with how
every other hook-level fix in this plan was verified) — verified instead by
direct code reading.

## Finding 13 — P1 (structural): the `localItems.length > 0` gate blocks any empty-list push

**Where:** `use-google-sheets-sync.ts:~181`.

The gate exists to prevent wiping the sheet with a not-yet-loaded empty list
on startup — legitimate — but it also permanently gates off the listener the
moment the list is genuinely emptied. Today only the bulk-clear paths empty
the list (they carry their own `syncNow()`, see Finding 12), but this is the
one structural hole in the "listener sees everything" guarantee.

**Fix:** replace `if (localItems.length > 0)` with
`if (lastSyncedItemsRef.current !== '')` — i.e. "at least one sync has
completed this session." Startup protection is preserved (before the first
sync the key is `''`), and a genuinely emptied list pushes normally.

**Done:** implemented as a small named, exported pure predicate
`shouldConsiderAutoSync(lastSyncedItemsKey: string): boolean` (returns
`lastSyncedItemsKey !== ''`) rather than an inline condition, specifically so
it is unit-testable without a hook-rendering harness. The debounce effect now
calls `shouldConsiderAutoSync(lastSyncedItemsRef.current)` in place of the
old length check. **Verified:** 3 unit tests in `use-google-sheets-sync.test.ts`
(false before any sync; true once a sync has completed even over zero items;
true with real items recorded) plus the full existing suite passing.

## Finding 14 — P1: hand-edited sheet rows are silently dropped, then erased

**Where:** `google-sheets.ts` `rowToItem` (line ~447: `row.length < 10 →
null`) + `syncItemsToSheets` (clear + full rewrite).

The Sheets values API omits trailing empty cells, so a row a user adds by
hand (id + name only, per the setup doc's own 9-column instructions) comes
back shorter than 10 cells → dropped from the read → the next full rewrite
**erases it from the sheet**. Silent data loss for anyone who edits the
sheet directly — and the same mechanism behind follow-up item 3 (the doc/
code column mismatch).

**Fix:** in `rowToItem`, require only `id && name`; default all other
missing/short cells (`checked=false`, timestamps undefined → which, with
Finding 11's fix, safely rank as oldest). Closes follow-up item 3 as a side
effect.

**Done:** the `row.length < 10` guard is gone entirely; `rowToItem` now only
checks `if (!id || !name) return null`. Every other field defaults sensibly
(reusing Finding 11's `parseFiniteOrUndefined`/`addedAt: 0` coercions, so a
short row's missing timestamps correctly rank as oldest, not freshest).
**Verified:** `google-sheets.test.ts` asserts `rowToItem(['id1','Milk'])`
parses successfully with sane defaults everywhere else, and that a still-
missing `id`/`name` (including an empty array and `null`) correctly still
returns `null`.

## Finding 15 — P2: dead `use-grocery-items.ts` is a loaded footgun

**Where:** `src/hooks/use-grocery-items.ts` — imported nowhere (verified by
grep), but holds a second `useLocalStorage('grocery-items')` instance and
mutates item objects in place. If ever wired up, its writes would partially
bypass the sync trigger (the `storage` event does not fire in the writing
tab). It also still references the pre-Finding-4 version-vector fields in
spirit (its own `userId: 'local'` stamping).

**Fix:** delete the file.

**Done:** deleted, after re-confirming zero importers via a fresh repo-wide
grep (only historical doc references remained — `SETUP.md`'s old file-tree
comment and an archived plan doc, neither a code import). `npx vitest run`
and `npx tsc --noEmit` both stayed green immediately after.

## Verification (Part 2, final)

Implemented via 2 parallel worker→reviewer subagent waves (Findings 11/13/15
in parallel wave 1, since they touch disjoint files; Finding 12 in wave 2,
since it depends on wave 1's gate fix and touches the same file). All claims
re-verified independently by hand afterward, same discipline as every prior
round in this document.

```
npx vitest run             → 10 files, 91 tests, all passing
npx tsc --noEmit -p tsconfig.json → 1 error, pre-existing & unrelated
                                    (DiagnosticsPanel.tsx AlertDialog className)
```

**Orchestration incident (worth recording, no code impact):** this repo has
no `.git`, so the three wave-1 lanes shared one live working directory with
no worktree isolation. The `timestamps-review` reviewer (scoped to Findings
11/14 only) correctly verified Findings 11 and 14 as fully correct, but also
flagged the hook file and the deleted dead-code file as "unrelated files
were touched" — those were actually the *other two lanes'* own legitimate,
already-approved work (Findings 13 and 15), which the reviewer had no way to
distinguish from a real scope violation once everything landed in the same
shared filesystem. The resulting fix-round worker took that at face value
and began reverting the sibling lanes' correct changes (the Finding 13 gate
fix and its test) before being caught mid-edit, steered, and then
interrupted; the reverted work was manually restored and re-verified.
**Lesson for future parallel lanes on a non-git working tree:** either scope
reviewer instructions to tolerate concurrent sibling changes explicitly, or
run cross-lane review only against an isolated copy — "verify no unrelated
files were touched" is not reliable when multiple lanes write to one shared,
un-isolated directory at the same time.

## Alternatives considered (and why not)

- **Wrap `setItems` in a custom setter that triggers sync** — redundant: the
  effect already observes every state change; would double-trigger and still
  miss the empty-list case unless the gate is fixed anyway.
- **Patch/poll `localStorage` directly** — fragile; state-driven effect +
  existing `storage` listener already cover in-tab and cross-tab.
- **Re-tombstone bulk clear** (reviewer's first choice) — correct and less
  code, but reverses Finding 10's explicit user decision; rejected in favor
  of persisting the force-delete ids.
- **Per-row incremental sheet writes** instead of clear+rewrite — reduces
  quota use and Finding 14 exposure, but a much larger change; not needed to
  close any gap.

## Test plan (each fix gets a regression test)

1. **Finding 11:** `sync-engine.test.ts` — local `{checked:true, updatedAt:T}`
   vs remote `{updatedAt:NaN}` and vs remote `{no timestamps, addedAt:0}` →
   local wins both. `google-sheets.test.ts` — `rowToItem` with blank/`"abc"`
   timestamp cells → finite-or-undefined fields, `addedAt === 0`, no
   `Date.now()` leakage.
2. **Finding 12:** ids persisted → present in localStorage after
   `deleteItemsPermanently`, removed only after a successful write; in-flight
   race → a follow-up sync is scheduled when `syncNow()` is called mid-sync.
3. **Finding 13:** listener schedules a sync for an emptied list *after* a
   completed sync, and schedules none on a fresh boot with an empty list
   (wipe-on-boot protection preserved).
4. **Finding 14:** `rowToItem(['id1','Milk'])` → valid item, not null;
   round-trips through the write path.
5. **Finding 15:** file deleted; `vitest` + `tsc` still green.

## Proposed implementation order

| Step | Finding | Files | Risk |
|------|---------|-------|------|
| 1 | 11 — timestamp hygiene (NaN/fresh-stamp) | `google-sheets.ts`, `sync-engine.ts` | low — pure functions, fully unit-testable |
| 2 | 13 — replace empty-list gate | hook | low — one condition + regression test |
| 3 | 14 — accept short rows | `google-sheets.ts` | low |
| 4 | 12 — persist force-delete ids + in-flight follow-up | hook | medium — touches sync lifecycle; do after 2 so the listener is the safety net |
| 5 | 15 — delete dead hook | `use-grocery-items.ts` | trivial |

Steps 1–3 are independent; 4 depends on 2; 5 is independent.

