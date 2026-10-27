# Breadcrumb - Google Sheets Sync Handoff Document

## Current Status: ✅ Complete - Full OAuth Flow + Auto-Sync + Concurrent Editing Fixed

---

## What Was Completed (2026-08-04)

### 1. **Fixed Critical Sync Bugs**

| Bug | Root Cause | Solution |
|-----|------------|----------|
| Deleting items didn't sync to Sheets | `syncItemsToSheets` only wrote current items, no deletion tracking | Implemented **tombstone-based deletion** - deleted items become tombstones that sync, then cleaned up |
| Updates to Sheets didn't update frontend | No version tracking; last-write-wins lost remote changes | Added **version vectors** (per-user counters) for concurrent edit detection |
| `updatedAt` always `Date.now()` | `itemToRow` hardcoded `Date.now()` for all rows | Now uses item's actual `updatedAt` field |
| Missing `updatedAt`/`updatedBy` in types | `GroceryItem` lacked metadata fields | Added `updatedAt`, `updatedBy`, `versionVector`, `isTombstone` |

### 2. **Implemented Version Vector Concurrency Control**

- **Each user gets a counter** in `versionVector` that increments on their edits
- **Three-way comparison**: `ancestor` | `descendant` | `concurrent` | `equal`
- **Auto-resolve**: Non-concurrent conflicts (sequential edits) resolve automatically — newer wins
- **User resolution**: True concurrent edits (both users edited same item) surface for manual resolution
- **Tombstones**: Deletions tracked explicitly, preventing "ghost items" from reappearing

### 3. **Incremental Sync with Cursor Tracking**

- **Cursor stored in localStorage**: `lastSyncTimestamp` + `lastKnownVersions` map
- **Only syncs changed items**: Computes diff since last cursor
- **Debounced local sync**: 1s after local changes
- **Periodic remote sync**: Every 30 seconds
- **Deduplication**: Tracks `lastSyncedItemsRef` to avoid redundant cycles

### 4. **OAuth Flow (Unchanged - Already Working)**

- Manual OAuth 2.0 redirect flow (implicit grant)
- Token in URL fragment → parsed on return
- Stored in `sessionStorage` for persistence across reload
- Silent refresh via GIS `prompt: ''` when token expires
- Fallback to manual redirect if silent refresh fails

---

## Files Modified

| File | Changes |
|------|---------|
| `src/lib/types.ts` | Added `updatedAt`, `updatedBy`, `versionVector`, `isTombstone` to `GroceryItem`; added `ItemVersionVector`, `VersionedGroceryItem`, `SyncCursor` types |
| `src/lib/sync-engine.ts` | Complete rewrite: version vectors, tombstones, incremental sync, conflict detection/resolution |
| `src/lib/google-sheets.ts` | Fixed `itemToRow`/`rowToItem`; proper `updatedAt`/`updatedBy` handling; global type declarations for GIS |
| `src/hooks/use-google-sheets-sync.ts` | New sync flow with cursor tracking, conflict UI, tombstone creation, auto/background sync |
| `src/App.tsx` | Updated all item mutations (`toggleItem`, `deleteItem`, `editItem`, `handleQuantityChange`, `handleCategoryChange`) to set `updatedAt`/`updatedBy` |
| `src/test/sync-engine.test.ts` | Fixed test types for new `GoogleSheetsRow` interface |

---

## Test Plan (Manual)

1. Open http://localhost:5173 in **real browser** (not Playwright)
2. Click ⚙️ Settings → Google Sheets Sync
3. Paste **Sheet ID** (44-char string from Google Sheets URL)
4. Click **Save** → **Connect**
5. **OAuth redirect** → Grant "See and edit your Google Sheets" permission
6. **Redirect back** → Sheet created → Initial sync runs
7. Verify 🟢 **"Synced"** badge appears
8. **Add item** → Should appear in Google Sheet within ~1 second
9. **Check/uncheck item** → Should sync to Sheets
10. **Edit item** (name, quantity, category) → Should sync to Sheets
11. **Delete item** → Should disappear from Sheets (was broken, now fixed)
12. **Edit in Google Sheets directly** → Should appear in frontend within 30s (or manual Sync Now)

---

## Debugging Checklist

### Browser Console (F12)
```
[GoogleSheets] handleOAuthRedirect called, location.hash: #access_token=...
[GoogleSheets] Token obtained from redirect, expires in 3599 seconds
[GoogleSheets] Token restored from redirect
[GoogleSheets] Using cached token
[GoogleSheets] Incremental sync: 1 added, 0 updated, 0 deleted
XHR PUT https://sheets.googleapis.com/v4/spreadsheets/.../values/GroceryList!A1:I...
```

### Network Tab
- Filter: `sheets.googleapis.com` or `accounts.google.com`
- Check for 401/403/400 responses

### Common Failure Modes

| Symptom | Likely Cause |
|---------|-------------|
| "Access blocked: invalid_request" | `access_type=offline` with `response_type=token` (removed in fix) |
| "Connecting..." spins forever | OAuth popup blocked, or redirect URI mismatch |
| 403: "The caller does not have permission" | Sheet not shared as **Editor** / Sheets API not enabled |
| 401: "Invalid credentials" | OAuth origins/redirects don't match `http://localhost:5173` |
| "Access blocked: not verified" | Test users not added in OAuth consent screen |
| Items reappear after delete | Tombstone not syncing - check `isTombstone` logic |
| Conflict UI doesn't appear | Version vectors not being set - check `prepareItemsForSync` |

---

## Required Google Cloud Console Setup

| Setting | Required Value |
|---------|----------------|
| **APIs & Services → Library** | Google Sheets API → **Enable** |
| **Credentials → OAuth 2.0 Client ID** | Application type: Web application |
| **Authorized JavaScript origins** | `http://localhost:5173` (and production domain) |
| **Authorized redirect URIs** | `http://localhost:5173` (and production domain) |
| **OAuth Consent Screen → Test users** | Add your email + partner's email |

---

## Architecture Notes

### OAuth Flow (Manual Redirect)
```
User clicks Connect
       ↓
redirectToGoogleOAuth() builds URL:
  https://accounts.google.com/o/oauth2/v2/auth?
    client_id=...
    &redirect_uri=http://localhost:5173
    &response_type=token
    &scope=https://www.googleapis.com/auth/spreadsheets
    &prompt=consent
    &state={sheetId,sheetName}
       ↓
Page redirects to Google
       ↓
User grants permission
       ↓
Google redirects back to:
  http://localhost:5173/#access_token=ya29...&expires_in=3599&token_type=Bearer...
       ↓
handleOAuthRedirect() parses #hash
       ↓
Token stored in sessionStorage + memory
       ↓
ensureGroceryListSheet() creates sheet if needed
       ↓
syncNow() runs initial sync
```

### Sync Cycle (Incremental)
```
Auto-sync (30s interval) OR Local items change (1s debounce)
       ↓
syncNow()
  1. Prepare local items with version vectors (prepareItemsForSync)
  2. Fetch remote items (GET sheets.values)
  3. Compute incremental diff (computeIncrementalSyncDiff)
     - Uses cursor: lastSyncTimestamp + lastKnownVersions
  4. Merge local + remote (mergeLocalAndRemote)
  5. Detect conflicts via version vectors
     - concurrent → present to user
     - ancestor/descendant → auto-resolve (newer wins)
  6. Apply resolutions (applyResolutions)
  7. Filter tombstones (remove deleted items)
  8. Write merged to sheets (PUT sheets.values)
  9. Update cursor (lastSyncTimestamp + merged version vectors)
  10. Update syncState: status='synced', lastSyncAt=now
```

### Version Vector Example
```
User A edits "Apples": versionVector = { "userA@email.com": 2 }
User B edits "Apples": versionVector = { "userA@email.com": 1, "userB@email.com": 2 }
       ↓
compareVersionVectors(local, remote) → "concurrent"
       ↓
Conflict presented to user for resolution
```

### Tombstone Deletion Flow
```
User deletes "Apples"
       ↓
createDeletionTombstone() creates:
  { ...item, isTombstone: true, updatedAt: now, updatedBy: user, versionVector: incremented }
       ↓
onItemsChange() replaces item with tombstone in local state
       ↓
Next syncNow():
  - computeIncrementalSyncDiff sees tombstone → adds to toDelete
  - Final items filtered: .filter(item => !isTombstone(item) && !toDelete.includes(item.id))
  - Sheets gets full rewrite without deleted item
  - Tombstone cleaned up locally
```

---

## Next Steps for Production

1. **Add production domain** to OAuth origins/redirects
2. **Publish OAuth consent screen** (remove "Testing" label)
3. **Add refresh token support** for longer sessions (current: implicit flow = 1hr tokens)
4. **Implement Drive API webhook** for real-time remote change notifications
5. **Add offline mutation queue** with replay on reconnect
6. **Build conflict resolution UI** showing both versions side-by-side
7. **Add optimistic locking** (ETag/If-Match headers) for stronger consistency
8. **Store version history** in separate sheet tab for audit trail
9. **Add sync status indicators** per-item (synced/pending/conflict)

---

## Key Functions Reference

### Sync Engine (`src/lib/sync-engine.ts`)
- `getItemUpdatedAt(item)` — returns `updatedAt ?? checkedAt ?? addedAt`
- `mergeLocalAndRemote(local, remote)` — last-write-wins merge + conflict detection
- `itemsToRows(items, userEmail)` — converts to Sheets rows with metadata
- `rowsToItems(rows)` — converts Sheets rows to GroceryItems with metadata
- `detectConflicts(local, remote)` — finds conflicts including deletions
- `resolveConflict(conflict, strategy)` — resolves via local/remote/merge
- `compareVersionVectors(v1, v2)` — ancestor/descendant/concurrent/equal
- `mergeVersionVectors(v1, v2)` — takes max of each user's counter
- `isTombstone(item)` — checks `item.isTombstone === true`
- `createTombstone(item, userId)` — creates deletion marker
- `computeIncrementalSyncDiff(local, remote, cursor)` — diff since last sync
- `prepareItemsForSync(items, userId)` — ensures version vectors exist

### Google Sheets (`src/lib/google-sheets.ts`)
- `initGoogleSheetsAuth(clientId)` — initializes GIS for silent refresh
- `getAccessToken()` — returns valid token (cached/refresh/redirect)
- `handleOAuthRedirect()` / `handleRedirectCallback()` — parses token from URL
- `redirectToGoogleOAuth(clientId)` — manual redirect to Google
- `signOut()` — revokes token, clears storage
- `readSheet(sheetId, range)` — GET values
- `writeSheet(sheetId, range, values)` — PUT values (full overwrite)
- `syncItemsToSheets(config, items, userEmail)` — writes header + all items
- `ensureGroceryListSheet(config)` — creates sheet + headers if needed
- `itemToRow(item, userEmail)` — item → row array (9 columns)
- `rowToItem(row)` — row array → GroceryItem

### Hook (`src/hooks/use-google-sheets-sync.ts`)
- `connect()` — initiates OAuth redirect
- `disconnect()` — signs out, clears state
- `syncNow()` — manual sync trigger
- `resolveConflict(conflictId, strategy)` — user resolves conflict
- `createDeletionTombstone(itemId)` — creates tombstone for deleted item
- `syncState` — { status, lastSyncAt, lastError, pendingWrites }
- `pendingConflicts` — array of unresolved SyncConflict

---

*Last updated: 2026-08-04*