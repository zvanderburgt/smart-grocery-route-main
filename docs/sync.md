# Google Sheets sync

How the shared list stays consistent across two phones, and why the pieces look
the way they do. This replaced a full-sheet rewrite driven by a whole-record
last-write-wins merge.

## Files

| Module | Responsibility |
|---|---|
| `src/lib/sync-model.ts` | Pure data model: row ⇄ item, timestamp hygiene, deletion ledger math, field-level merge. No I/O. |
| `src/lib/sync-engine.ts` | One sync: read → merge → plan → write. Also creates/validates the two tabs. |
| `src/lib/sheets-api.ts` | Typed Sheets v4 client. The **only** retry layer (429/5xx/network, Retry-After, jitter) and the only place that classifies errors. |
| `src/lib/google-auth.ts` | GIS auth: single-flight refresh, `state` verification, sessionStorage token, no redirect from data calls. |
| `src/lib/device-id.ts` | Stable per-install id, used for `updatedBy` fallback and deterministic tie-breaks. |
| `src/hooks/use-google-sheets-sync.ts` | React wrapper: scheduling, persistence of intent, offline gating, UI state. |

## Sheet layout

- `<sheetName>` (default `GroceryList`): `id, name, checked, checkedAt, addedAt,
  category, quantity, updatedAt, updatedBy, isTombstone, revivedAt`. Live items
  only — deleted items are not kept here as flagged rows.
- `Deletions`: `id, deletedAt, deviceId`. Append-only ledger of deletions.

## A sync, in order

1. `GET` the item tab (`A2:K`) and the `Deletions` tab (`A2:C`) in parallel.
2. Merge live local items with live remote items (`sync-model.mergeItems`).
3. Blank rows for ids the ledger deleted; append new ids; update only rows whose
   serialized value actually changed.
4. Append any deletions the sheet has not recorded yet.
5. Fold the merged list back into React state (merging again, so an edit made
   during the round trip survives).

Writes go out as one `values:batchUpdate` (`RAW`) plus at most one `values:append`.
Nothing is cleared wholesale: a no-op sync writes nothing, and a failed write
cannot leave the shared sheet empty.

## Merge rules

Two independent clocks, so unrelated edits both survive:

- `updatedAt` — name / quantity / category
- `checkedAt` — checked state

Ties are broken deterministically (device id, then payload), never "local wins",
because a device-dependent tie-break makes the two devices disagree forever.
Remote timestamps further ahead than 5 minutes are clamped to `now`, so one
device with a bad clock cannot win every conflict until it is fixed.

## Deletions and undo

Deleting writes `{id, deletedAt, deviceId}` to the ledger and drops the row.
An item is filtered out when a ledger entry is newer than its `revivedAt`; Undo
sets `revivedAt = now`, which is what makes a restore outrank the deletion
without weakening "delete propagates to a device that still has the item".

Legacy `isTombstone` rows from older builds are read as deletions, written into
the ledger, and their rows blanked — no manual migration.

## Deliberate limits

- **`isTombstone`/`revivedAt` are written but only `revivedAt` is meaningful.**
  The flag remains for backward compatibility with existing sheets.
- **Implicit OAuth flow.** Code+PKCE with refresh tokens is the better shape but
  needs a redirect URI registered in Google Cloud Console; switching silently
  would break existing connections.
- **No conflict UI.** Edits resolve silently by design (see `PRODUCT.md`); only
  the count is tracked internally.

## Tests

`src/test/sync-engine.test.ts` runs two engines against one fake sheet
(`src/test/fixtures/fake-sheets.ts`) to assert the properties that actually
matter: deletes and bulk clears converge, undo sticks, a rename and a check on
different devices both survive, equal timestamps converge, a concurrent write is
not erased, and RAW input is used for every write.
