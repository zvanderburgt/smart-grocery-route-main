# Backend sync fit for an offline-first grocery list

**Scope.** The app today syncs through a Google Sheet: `src/lib/sync-model.ts` (merge,
tombstones, timestamp hygiene), `src/lib/sync-engine.ts` (read → merge → plan → write),
`src/lib/sheets-api.ts` (transport, retry, error classification), `src/lib/google-auth.ts`
(GIS token), wrapped by `src/hooks/use-google-sheets-sync.ts`. This document asks, for each
candidate backend: does it carry that merge model, or replace it; how does auth behave in a
cross-origin Home Assistant iframe and an Android WebView kiosk; what would the schema look
like; and how big is the client change.

No winner is picked. The trade-offs are laid out, and the last section is the honest cost of
moving from T-SQL to Postgres or SQLite.

---

## 1. The contract any backend has to satisfy

`sync-model.ts` is not a CRDT library; it is a set of rules that assume the store is a **dumb
shared table that any device may overwrite**. Those rules, in the order the code applies them:

| # | Invariant | Where it lives |
|---|---|---|
| 1 | Item ids are **client-generated**; the server never invents identity | `itemToRow` / `rowToItem` |
| 2 | Two independent clocks: `updatedAt` for content, `checkedAt` for checked state | `mergeOne` |
| 3 | Ties broken deterministically by `updatedBy` (device id), then payload | `pickDeterministic` |
| 4 | Deletions are an **append-only ledger**; duplicate ids are expected, newest wins | `dedupeDeletions` |
| 5 | An item survives a deletion only if `revivedAt > deletedAt` | `applyDeletions` |
| 6 | Untrusted timestamps are clamped at read time (`now + 5 min`) | `sanitizeTimestamp` |
| 7 | Writes are **partial** — only changed rows, never a whole-table rewrite | `planItemWrites` |
| 8 | Merge is idempotent and order-free: both devices run the same function and converge | `mergeItems` |
| 9 | A device may be offline for hours, then read everything and merge | hook: read → merge |
| 10 | Read-your-writes: the writing device sees its own edit immediately | local state first |

A backend "fits" to the extent it can host rows 1–10 unchanged. Note what is *not* in that
list: server ordering, server clocks, or server conflict resolution. Today the server (the
Sheet) has no opinion at all — that is exactly why two phones converge. Any platform whose
realtime/conflict model insists on being the authority is replacing invariant 2, 3 and 8, not
supporting them.

### The seam that makes this cheap

`use-google-sheets-sync.ts` only touches two things from the engine layer:

```ts
import { mergeItems, type DeletionRecord } from '@/lib/sync-model';
import { createSyncEngine, type SyncEngine } from '@/lib/sync-engine';
// ...
const result = await getEngine().sync(localItems, pendingDeletions);
onItemsChange((current) => mergeItems(current ?? [], result.items).merged);
```

So a migration is **a new implementation of `{ ensureSheets(), sync() }` plus an auth swap**.
`mergeItems`, `DeletionRecord`, `sanitizeTimestamp` and the whole 944-line hook (debounce,
rate limit, visibility gating, in-flight locking, persisted force-delete ids) survive untouched
on every backend except Convex.

Current weight of the layer being replaced:

| Module | Lines | Fate on a SQL/document backend |
|---|---|---|
| `sync-model.ts` | 366 | **kept verbatim** |
| `sync-engine.ts` | 330 | ~150 lines of sheet row-planning deleted; ~200-line adapter written |
| `sheets-api.ts` | 267 | retry + error classification kept; transport swapped (~80 lines) |
| `google-auth.ts` + `paired-auth.ts` | 659 | replaced by platform auth (~20–60 lines) or deleted |
| `use-google-sheets-sync.ts` | 944 | kept; only the engine factory and the `connect()` call site change |

Blast radius is small because nothing outside that hook imports the engine
(`grep -rln "sync-engine\|sheets-api\|google-auth" src` → the hook, the libs themselves, and tests).

---

## 2. Fit at a glance

| Backend | (a) Merge stays client-side? | (b) Auth in HA iframe / WebView | (c) Schema shape | (d) Client change |
|---|---|---|---|---|
| **Supabase** | Yes — plain Postgres tables. Realtime is opt-in, not a conflict model. | JWT bearer + localStorage session. **Works**; OAuth redirect cannot be framed. | 2 tables + RLS | **Medium** (~1 adapter, ~250 lines) |
| **Firebase / Firestore** | Mostly — you write whole documents, so `mergeItems` survives; but the SDK adds a document-level LWW offline queue and listeners. | ID token + IndexedDB. **Redirect sign-in is documented to break** when third-party storage is blocked; Google OAuth is refused in WebViews. | 2 subcollections of JSON docs | **Medium–Large** (rules + listener + rekey) |
| **Turso** | Yes — SQLite over HTTP. No embedded replica in a browser, so offline stays yours. | Database-wide bearer token. Works in an iframe, but the token is a DB credential → needs a proxy. | 2 SQLite tables | **Medium** + a proxy function |
| **Cloudflare D1** | Yes — SQLite. But unreachable from a browser without a Worker in front. | No auth product. Bearer you mint yourself. | 2 SQLite tables | **Large** (Worker + deploy) |
| **Neon** | Yes — Postgres, HTTP driver explicitly usable in browsers. | Connection string = DB credential → RLS or a proxy. Works in an iframe. | 2 tables + RLS | **Medium** |
| **PocketBase** | Yes — collections are plain tables, REST is closest to today's shape. | Stateless JWT, no cookies. **Best iframe fit.** You run the server. | 2 collections | **Small–Medium** code, real ops cost |
| **Appwrite** | Yes — document store, no imposed merge. | **Session cookie first**, localStorage fallback. Partitioned iframe is the hostile case; JWT is not a substitute. | 2 collections | **Medium–Large** |
| **Convex** | **No** — server functions + reactive queries replace the read-merge-write loop; no durable offline queue. | Token over WebSocket. Iframe-friendly. | `schema.ts` | **Large** |

---

## 3. Supabase

**(a) Merge model.** Tables are plain Postgres; `supabase-js` is a request/response client over
PostgREST. `select()` hits the database every time — the only thing the SDK persists locally is
the auth session ([Supabase: `auth.persistSession` "attempts to store the session in local
storage"](https://supabase.com/docs/reference/javascript/initializing)). So the merge stays in
`sync-model.ts` and the DB stays dumb. Realtime (Postgres Changes / Broadcast) can replace the
60-second poll, but it delivers row payloads, not merged state — you would still run
`mergeItems` on each arrival, so it is a latency upgrade, not a model change.

**(b) Auth.** GoTrue issues a short-lived JWT plus a rotating refresh token; the access token
travels in `Authorization`, and the session is persisted in `localStorage` by default (same
citation; contrast [SSR, which "requires cookie-based session storage"](https://supabase.com/docs/guides/auth/server-side/creating-a-client)).
No cookies means third-party cookie blocking is irrelevant. What breaks:

- **OAuth redirect inside the iframe.** `accounts.google.com` refuses to render in a frame. The
  redirect must happen in a top-level window and the session be handed back — the app already
  has exactly this pattern (`paired-auth.ts` + the `oauth-pair` / `oauth-token` Netlify functions).
- **Storage partitioning.** An iframe's `localStorage` is keyed by top-level site
  ([MDN: third-party iframes get a partitioned storage location](https://developer.mozilla.org/en-US/docs/Web/Privacy/State_Partitioning)),
  so a session established inside the HA dashboard does not exist in the standalone PWA. Signing
  in twice is the cost; nothing is lost.
- The Android WebView is fine for email/password or magic link; Google OAuth is blocked there by
  policy (see §13 sources) and needs the same pair-a-device handoff.

**(c) Schema.**

```sql
create table items (
  id          uuid primary key,                 -- client-generated (invariant 1)
  list_id     uuid not null,
  name        text not null,
  quantity    numeric(10,2),
  category    text,
  checked     boolean not null default false,
  checked_at  timestamptz,                      -- the second clock
  added_at    timestamptz not null default now(),
  updated_at  timestamptz,                      -- the first clock
  updated_by  text,                             -- device id, for the tie-break
  revived_at  timestamptz
);
create index items_list_updated on items (list_id, updated_at);

create table deletions (                        -- append-only ledger (invariant 4)
  seq        bigint generated always as identity primary key,
  item_id    uuid not null,
  deleted_at timestamptz not null,
  device_id  text
);

alter table items enable row level security;
create policy items_rw on items for all to authenticated
  using  (list_id in (select list_id from list_members where user_id = auth.uid()))
  with check (list_id in (select list_id from list_members where user_id = auth.uid()));
```

**(d) Client change: medium.** One adapter implementing `SyncEngine`: `select *` for items and
deletions, `upsert` the rows whose serialized value changed, `insert` new deletion rows. Delete
`planItemWrites`, `itemRowRange`, `quoteSheetName`, the header checks (~150 lines). Replace
`google-auth.ts` with `supabase.auth` (~40 lines). The hook's `connect()` becomes "sign in",
`disconnect()` becomes `signOut`. Tests: point the existing two-engine fixture
(`src/test/fixtures/fake-sheets.ts`) at a fake table client — the merge assertions are unchanged.
Estimate 2–4 days.

---

## 4. Firebase / Firestore

**(a) Merge model.** Firestore is document storage you write explicitly, so `mergeItems` survives:
read the collection, merge locally, write the merged document. It also gives you, free, the thing
the app currently hand-rolls — a durable offline write queue in IndexedDB
([Firestore offline persistence](https://firebase.google.com/docs/firestore/manage-data/enable-offline)).
Two caveats that matter:

- That queue resolves **per document**: "For multiple changes to the same document, it's last
  write wins" (same page). Your two-clock rule only survives because *you* compute the merged
  document before writing it. If you ever switch to field-path updates (`updateDoc(ref, {checked,
  checkedAt})`), Firestore's own field-level semantics become the authority and `checkedAt` stops
  being the tie-breaker.
- Multi-tab persistence is a choice (`persistentMultipleTabManager`); the legacy API fails with
  `failed-precondition` when a second tab is open (same page). The HA dashboard plus a phone
  browser plus a kiosk WebView is exactly the multi-context case, so configure the multi-tab
  manager deliberately.

Real-time listeners (`onSnapshot`) would replace the 60-second poll.

**(b) Auth.** The ID token goes in `Authorization`; persistence is IndexedDB, not cookies. What
breaks, and it is documented rather than speculative:

- `signInWithRedirect` "uses a cross-origin iframe that connects to your app's Firebase Hosting
  domain. However, this mechanism doesn't work with browsers that block third-party storage
  access" — and since Chrome M115 it requires one of the documented workarounds
  ([Firebase: redirect best practices](https://firebase.google.com/docs/auth/web/redirect-best-practices)).
  An app embedded in someone else's dashboard is the worst case for all of those workarounds.
- `signInWithPopup` needs a user gesture and a non-sandboxed iframe (`allow-popups`); in the
  Android WebView `window.open` is often unavailable unless the host app implements multi-window.
- Google refuses OAuth in embedded webviews outright ([Google: no OAuth in web-views](https://developers.googleblog.com/en/modernizing-oauth-interactions-in-native-apps-for-better-usability-and-security/)).

So: email/password and anonymous auth work everywhere; Google sign-in needs the same
top-level-window handoff the app already built for pairing, or a custom token minted server-side
by the existing Netlify function.

**(c) Schema.** Numbers, not `Timestamp`s — that way `sync-model.ts` needs no conversion and no
timezone thinking:

```
lists/{listId}/items/{itemId}
  { name: "milk", quantity: 2, category: "dairy", checked: false,
    checkedAt: 1763784000000, addedAt: 1763781000000,
    updatedAt: 1763784000000, updatedBy: "dev-9f3c", revivedAt: null }

lists/{listId}/deletions/{autoId}          // append-only, auto id keeps duplicates
  { itemId: "6f1c…", deletedAt: 1763784000000, deviceId: "dev-9f3c" }
```

**(d) Client change: medium–large.** The plan/write-diff layer disappears (a `writeBatch` covers
it), but you gain: security-rules authoring (a new language), a listener or an
`updatedAt > cursor` query for pulls, and an index on `updatedAt` per list. Estimate 3–5 days.

---

## 5. Turso

**(a) Merge model.** SQLite dialect over HTTP — `@libsql/client/web` "uses the HTTP protocol",
with the token in `Authorization` ([Turso SQL-over-HTTP quickstart](https://docs.turso.tech/sdk/http/quickstart)).
The merge stays client-side and the schema is two tables. The important negative: **embedded
replicas do not exist in a browser**. They are configured as "a local file to be your main
database" plus a `syncUrl` ([Turso embedded replicas](https://docs.turso.tech/features/embedded-replicas/introduction)),
i.e. a filesystem you do not have in a PWA or a WebView. So "offline" means the same
IndexedDB-plus-outbox you have today; Turso adds a real database, not offline sync.

**(b) Auth.** One `authToken` per database (or per group), sent as a bearer header. That works
perfectly in an iframe — and is unusable as shipped, because a token that can `DROP TABLE` would
be sitting in the bundle. Two honest options: a proxy (the repo already deploys Netlify Functions)
that holds the token and enforces per-list access, or a database per user (Turso is cheap enough
for that at 1–2 users, but the token then still has to be minted somewhere). There is no
row-level security to lean on.

**(c) Schema.** Same two tables, SQLite types, epoch-ms integers so the merge code is unchanged:

```sql
create table items (
  id         text primary key,
  list_id    text not null,
  name       text not null,
  quantity   real,
  category   text,
  checked    integer not null default 0,
  checked_at integer,           -- epoch ms, exactly what sync-model.ts already handles
  added_at   integer not null,
  updated_at integer,
  updated_by text,
  revived_at integer
) strict;

create table deletions (
  seq        integer primary key autoincrement,
  item_id    text not null,
  deleted_at integer not null,
  device_id  text
);
```

`strict` is worth having: without it SQLite coerces types loosely, with it a wrong type is a
constraint error ([SQLite STRICT tables](https://www.sqlite.org/stricttables.html)).

**(d) Client change: medium, plus a proxy.** ~200-line adapter; `batch()` rather than a
`values:batchUpdate`; a ~80-line Netlify function if the token must not reach the browser.
Estimate 3–5 days including the proxy.

---

## 6. Cloudflare D1

**(a) Merge model.** SQLite semantics, so the merge is unchanged. But D1 is reached "from your
Workers and Pages projects" or via the Cloudflare HTTP API ([D1 overview](https://developers.cloudflare.com/d1/)) —
there is no user-scoped client SDK. Cloudflare's own answer to "let a browser talk to D1" is a
tutorial that builds a **proxy Worker** with a shared `API_KEY`
([Build an API to access D1 using a proxy Worker](https://developers.cloudflare.com/d1/tutorials/build-an-api-to-access-d1/)).
So you are back to owning a server, in a second vendor, with a second deploy.

**(b) Auth.** None. D1 has no users, sessions or RLS; whatever identity exists is whatever your
Worker invents. In an iframe that is fine (bearer token to the Worker), which makes this the one
candidate where the iframe question is trivially answered — because the hard part moved into code
you have to write and operate.

**(c) Schema.** Identical to the Turso schema in §5(c) — same dialect, `strict` supported.

**(d) Client change: large.** Adapter (~200 lines) + Worker with per-list auth (~150–250 lines) +
a deploy pipeline + no realtime and no offline beyond what you build. Estimate 4–7 days, and the
ongoing surface is bigger than the current Google Sheets one.

---

## 7. Neon

**(a) Merge model.** Postgres, so `mergeItems` is unchanged. The serverless driver explicitly
supports the browser: `neon()` sends each query as an HTTP `fetch`, and the driver prints a
security warning when it detects a browser context, recommending RLS as the mitigation
([Neon serverless driver](https://neon.com/docs/serverless/serverless-driver)). Limits worth
knowing: HTTP is for one-shot queries and **non-interactive** transactions, 64 MB request/response.

**(b) Auth.** There is no auth product in the path — you ship a Postgres role and password, which
means every client holds full database credentials unless RLS is on every table and the role is
restricted. In an iframe the mechanics work (fetch with the connection string); the risk is
authorization, not cookies. A thin proxy removes the credential from the bundle; RLS keeps it but
moves the security model into SQL policies.

**(c) Schema.** Same as §3(c) minus Supabase-specific `auth.uid()`; policies key off a
`list_members` table joined to a JWT claim you pass per session (`set_config`/`current_setting`)
or to a `user_id` argument your proxy supplies.

**(d) Client change: medium.** ~200-line adapter, one HTTP round-trip per statement, RLS policies,
and a decision about scale-to-zero (a 60-second poll keeps the compute awake; that is a cost note,
not a correctness one). Estimate 2–4 days.

---

## 8. PocketBase (self-hosted)

**(a) Merge model.** Closest to the current shape of anything here: `GET /api/collections/items/records`
is today's `getValues`, `PATCH .../records/{id}` is today's per-row update, `POST` is today's
append. Nothing about the API imposes a merge; `mergeItems` runs unchanged. Realtime exists but is
optional and is implemented as SSE, not a conflict protocol
([PocketBase Realtime API](https://pocketbase.io/docs/api-realtime/)).

**(b) Auth.** The best iframe story of the eight, and for a structural reason: "The PocketBase Web
APIs are fully stateless and there are no sessions in the traditional sense (even the tokens are
not stored in the database)… a single client is considered authenticated as long as it sends a
valid `Authorization: <token>` header" ([PocketBase authentication](https://pocketbase.io/docs/authentication/)).
No cookie, no server session, nothing for third-party cookie blocking to break. Access control is
per-collection API rules rather than RLS, which is a much smaller thing to learn than Postgres
policies. What breaks: OAuth2 providers still need a top-level window (same framing problem as
everyone), and you now run a server — a binary, a volume, backups, TLS, and an upgrade path. For
1–2 users that is a real but bounded chore; the failure mode is "the Pi is down", not "the vendor
changed a policy".

**(c) Schema.** Two collections; keep `item_id` as a unique text field rather than relying on the
record id (PocketBase's 15-character id format will not hold a UUID):

```json
// collection "items"
[{"name":"item_id","type":"text","required":true,"unique":true},
 {"name":"list_id","type":"text","required":true},
 {"name":"name","type":"text","required":true},
 {"name":"quantity","type":"number"},
 {"name":"category","type":"text"},
 {"name":"checked","type":"bool"},
 {"name":"checked_at","type":"number"},
 {"name":"added_at","type":"number","required":true},
 {"name":"updated_at","type":"number"},
 {"name":"updated_by","type":"text"},
 {"name":"revived_at","type":"number"}]
```

`apiRule` for both collections: `@request.auth.id != "" && list_id = @request.auth.list_id`
(or simply "any authenticated user", which is honest for a two-person household).

**(d) Client change: small–medium code, real ops.** ~150-line adapter, no vendor auth SDK, no new
query language. Estimate 2–3 days of code plus a day of server setup, and an ongoing "keep the box
alive" cost that the other options do not have.

---

## 9. Appwrite

**(a) Merge model.** Document store with per-attribute updates; nothing imposes a merge, so the
client-side model survives. No realtime conflict semantics to fight (realtime is a WebSocket
subscription feed).

**(b) Auth — the problem child.** Appwrite documents its persistence as: "Web — Uses a secure
session cookie and falls back to local storage when a session cookie is not available"
([Appwrite auth security](https://appwrite.io/docs/products/auth/security)). Cookie-first is
exactly the shape that a cross-origin, third-party-cookie-blocked HA iframe breaks: the cookie is
dropped, and you land on the fallback path that is least exercised. And the obvious escape hatch
does not apply: Appwrite's JWT is for **server** SDKs and requires an existing client session
first — "You need to create a session using the Client SDKs before generating a JWT… the JWT will
expire after 15 minutes" ([Appwrite JWT login](https://appwrite.io/docs/products/auth/jwt)). It is
a way for your backend to act on behalf of a user, not a way for a browser to authenticate without
a session.

Mitigations exist (self-host Appwrite on the same registrable domain as the app so the cookie is
first-party; use a custom token flow), but each one adds a piece you have to reason about, and the
iframe case is where you would be least sure it works.

**(c) Schema.** Two collections, attributes mirroring §8(c) (`itemId`, `name`, `quantity`,
`category`, `checked`, `checkedAt`, `addedAt`, `updatedAt`, `updatedBy`, `revivedAt`). Key
documents by an `itemId` attribute unless you confirm Appwrite's document-id charset accepts a
UUID. Permissions per document (`read("users")` / `update("users")`), or team-scoped roles.

**(d) Client change: medium–large.** ~200-line adapter plus a permissions design plus a
realistic risk that the auth path needs a fallback you cannot test from the dashboard iframe.
Estimate 4–6 days, with more of it spent on auth than on data.

---

## 10. Convex

**(a) Merge model: it replaces yours.** Convex is server functions plus reactive queries over a
WebSocket — "Convex uses WebSockets to push updated query results to the client and send mutations
to the server". On offline it is explicit: "Convex will automatically handle intermittent network
blips. Convex doesn't currently provide a full offline sync mechanism, but some customers have
used tools like Replicache" ([Convex sync FAQ](https://www.convex.dev/sync)). So:

- The read-merge-write loop becomes `useQuery` + a `mutation` that does the merge server-side
  (read-modify-write, retried on OCC conflict). The two-clock rule has to be re-expressed in
  TypeScript inside a mutation; `sync-model.ts` is no longer the shared truth, and the
  "both devices run the same pure function" property (invariant 8) becomes "one function on one
  server", which is a different correctness argument.
- Offline for hours is not supported. You would bolt on your own IndexedDB outbox — i.e. rebuild
  the thing the current app already has, on a platform whose selling point is not needing it.

Also: `_id`s are server-assigned, so invariant 1 breaks and you carry `clientId` as a field plus a
lookup, or rekey the merge on `_id` after first sync.

**(b) Auth.** Token over the WebSocket connection (Convex Auth, Clerk, Auth0); no cookies, so the
iframe is fine. OAuth popups still need a top-level window, same as everywhere else.

**(c) Schema.**

```ts
import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  items: defineTable({
    listId: v.string(),
    clientId: v.string(),                 // because _id is server-assigned
    name: v.string(),
    quantity: v.optional(v.number()),
    category: v.optional(v.string()),
    checked: v.boolean(),
    checkedAt: v.optional(v.number()),
    addedAt: v.number(),
    updatedAt: v.optional(v.number()),
    updatedBy: v.optional(v.string()),
    revivedAt: v.optional(v.number()),
  }).index("by_list", ["listId"]),
  deletions: defineTable({
    itemId: v.string(),
    deletedAt: v.number(),
    deviceId: v.optional(v.string()),
  }).index("by_item", ["itemId"]),
});
```

**(d) Client change: large.** Rewrite `sync-engine.ts` as queries/mutations, move the merge
server-side, build an offline outbox from scratch, and replace the two-engine fake-sheet tests
(they test a convergence property that no longer exists in the same form). Estimate 1–2 weeks and
it is an architecture change, not a transport swap.

---

## 11. Cross-cutting findings

1. **Seven of eight keep the merge.** Only Convex replaces it. Every SQL/document backend is a
   dumb store, which is what the current code was written for — the Sheet is not special, it is
   just unusually awkward to address.
2. **Offline is never free except in Firestore.** Supabase, Turso, D1, Neon, PocketBase and
   Appwrite are request/response: the PWA's local-first behaviour stays exactly as it is today
   (localStorage list + merge on reconnect). Firestore is the only candidate that ships a durable
   write queue — and it resolves that queue per document, so it is a different guarantee, not a
   stronger version of yours.
3. **Auth is the real discriminator, and the iframe is where it shows.** Cookie-first designs
   (Appwrite) and designs that depend on a cross-origin auth iframe (Firebase redirect) are the two
   that break in a third-party-cookie-blocked frame. Bearer-token designs (Supabase, PocketBase,
   Firebase popup/custom token, Convex) and "bring your own token" designs (Turso, D1, Neon) are
   fine mechanically. The second group's problem is not auth but *authorization*: a database
   credential in a browser is not an access-control model.
4. **Google sign-in is blocked in the Android WebView on every candidate.** This is a Google policy,
   not a vendor behaviour; the app has already solved it once with the pair-a-device flow, and that
   flow ports to any backend.
5. **Who resolves conflicts is a product decision that shows up in the schema.** Keeping the merge
   client-side costs you the platform's realtime conflict handling and buys determinism you can
   test with two engines against one fake store. Moving it server-side buys simpler client code and
   loses the property that a device with no network can still be a full participant.
6. **One cheap hardening exists in every SQL option**, and is worth doing whether or not you keep
   the client merge — make the write itself refuse stale data, so a racing device cannot clobber a
   newer field group even if its merge was computed from a stale read:

   ```sql
   insert into items (id, name, quantity, category, updated_at, updated_by, …)
   values (…)
   on conflict (id) do update
     set name = excluded.name, quantity = excluded.quantity,
         category = excluded.category, updated_at = excluded.updated_at,
         updated_by = excluded.updated_by
   where coalesce(items.updated_at, '-infinity') < excluded.updated_at;   -- stale write loses

   update items set checked = $1, checked_at = $2
    where id = $3 and checked_at < $2;                                    -- the second clock
   ```

   Two statements, one per clock, and invariants 2 and 3 are enforced by the database instead of
   by hoping both devices read the same row. (The `coalesce` matters: `NULL < x` is `NULL`, so a
   bare comparison would silently skip rows that never had that timestamp — same three-valued
   logic as T-SQL.)
7. **Deletion retention becomes a cron job.** The append-only ledger currently grows forever:
   `DELETION_RETENTION_MS` (30 days) is declared in `sync-model.ts` but referenced nowhere, so
   nothing prunes it. Every backend here has a scheduler (pg_cron, Convex scheduled functions,
   PocketBase cron, Worker cron); a real database makes pruning easy and therefore tempting — and
   pruning is exactly what re-enables the resurrection window the code comments already warn about.

---

## 12. Learning cost for a MSSQL person

The honest headline: **the SQL is a weekend; the operational model is a month.** What this app
needs is four statements against two tables. A T-SQL developer can write those on day one. What
takes time is auth/RLS, backups, migrations and connection handling — none of which SQL Server
made you think about because someone else ran the box.

### What carries over unchanged

`SELECT`/`JOIN`/`GROUP BY`/`HAVING`, `WHERE`, subqueries, CTEs, window functions, indexes,
constraints, views, `BEGIN`/`COMMIT`/`ROLLBACK`, normalization instincts, and the habit of reading
a query plan. That is most of the job.

### Postgres: the deltas that actually bite

| Topic | T-SQL | Postgres | Why it bites |
|---|---|---|---|
| Strings | `NVARCHAR(n)` | `text` (no length needed; `varchar(n)` only for a real constraint) | Nothing to size; unicode is the default |
| Auto keys | `INT IDENTITY(1,1)` | `int generated always as identity` (or `bigserial`) | `GENERATED ALWAYS` **errors** on an explicit insert unless you say `OVERRIDING SYSTEM VALUE` ([CREATE TABLE](https://www.postgresql.org/docs/current/sql-createtable.html), [INSERT](https://www.postgresql.org/docs/current/sql-insert.html)) — relevant here, because ids come from the client |
| Getting the key back | `SCOPE_IDENTITY()` | `RETURNING id` | `RETURNING` also returns whole rows — one round trip instead of two |
| Booleans | `BIT` | `boolean` with real `true`/`false` | No 0/1 juggling; the sheet's `'TRUE'`/`'FALSE'` string dance disappears |
| Timestamps | `DATETIME2` (no zone) | `timestamptz` = an instant, stored as UTC | Pick one convention and keep it; here it is easier to store **epoch-ms integers**, which is what `sanitizeTimestamp` already expects |
| UUIDs | `UNIQUEIDENTIFIER`, `NEWID()` | `uuid`, `gen_random_uuid()` | Same idea, different function |
| Money/quantity | `MONEY` | `numeric(10,2)` | `MONEY` has no Postgres equivalent and rounding surprises; use `numeric` |
| Null handling | `ISNULL(a,b)` | `COALESCE(a,b)` | Identical semantics |
| Now | `GETDATE()` | `now()` | `now()` is **transaction start** time; `clock_timestamp()` is the statement-time equivalent of `GETDATE()` |
| Paging | `SELECT TOP 10` | `… LIMIT 10` | Also `OFFSET`/`FETCH` if you prefer the standard form |
| Identifiers | `[dbo].[Items]` | `public.items`, `"Items"` | Unquoted identifiers **fold to lower case**; `"Items"` and `items` are two different tables |
| Concatenation | `+` | `\|\|` or `concat()` | `+` on text is an error, not a silent cast |
| Case sensitivity | Default collation is CI | `=` is case-**sensitive** | The one that will actually burn you: `citext`, or a `lower(name)` expression index |
| Dates | `DATEADD(day, 1, x)` | `x + interval '1 day'` | Interval literals instead of functions |
| Formatting | `CONVERT(varchar, d, 120)` | `to_char(d, 'YYYY-MM-DD')` | Style codes do not port |

**Upsert.** This is the single biggest syntax change, and it is worth learning properly because it
is also the shape SQLite uses:

```sql
-- T-SQL: MERGE INTO items AS t USING (VALUES (…)) AS s (…) ON t.id = s.id
--        WHEN MATCHED THEN UPDATE … WHEN NOT MATCHED THEN INSERT …;

-- Postgres / SQLite
insert into items (id, name, checked) values ($1, $2, $3)
on conflict (id) do update
  set name = excluded.name, checked = excluded.checked;
```

`excluded` is the row you tried to insert. `ON CONFLICT` needs a **unique index or constraint** on
the conflict target — without one it is a syntax error at runtime, not a compile error
([Postgres INSERT … ON CONFLICT](https://www.postgresql.org/docs/current/sql-insert.html)). SQLite's
version is deliberately the same syntax: "UPSERT in SQLite follows the syntax established by
PostgreSQL, with generalizations" ([SQLite UPSERT](https://www.sqlite.org/lang_upsert.html)) — learn
it once.

**JSON.** T-SQL makes you choose between `NVARCHAR(MAX)` and `JSON` plus `JSON_VALUE`/`OPENJSON`.
Postgres has a real type: `jsonb`, with `->` (json), `->>` (text), `@>` (contains), and a GIN index
for containment queries ([JSON types](https://www.postgresql.org/docs/current/datatype-json.html)).
For this app you probably need none of it — the columns are already flat — but it is the feature
most likely to change how you design the next table. SQLite has `json_extract`/`json_each` over
`TEXT` and no GIN index; good enough for one list, not for querying.

**Transactions.** Same verbs, three differences that matter:

- **Any error aborts the whole transaction.** After a failed statement you get
  `25P02 in_failed_sql_transaction` and everything else is refused until you `ROLLBACK`
  ([Postgres error codes](https://www.postgresql.org/docs/current/errcodes-appendix.html)). The
  T-SQL habit of checking `@@ERROR` and carrying on does not port; wrap and retry instead.
- **No `NOLOCK`, and you will not miss it.** Readers never block writers (MVCC). Conversely there
  is no `WITH (UPDLOCK)` hint — you write `SELECT … FOR UPDATE` when you actually want a row lock.
- **DDL is transactional.** You can `BEGIN; ALTER TABLE …; ROLLBACK;`. Coming from SQL Server this
  feels illegal and is genuinely useful for migrations.

Also: sequences are non-transactional (rollbacks leave gaps, like `IDENTITY`), `TRUNCATE … RESTART
IDENTITY` exists, and `MERGE` exists in Postgres 15+ but is best avoided — `ON CONFLICT` is what
everyone writes and what every example you will find uses.

### SQLite: the smaller delta, with one hard wall

Types are **affinity**, not enforcement, unless you declare `strict` — then a wrong type is a
constraint error ([STRICT tables](https://www.sqlite.org/stricttables.html)). There is no
`IDENTITY`: `integer primary key` *is* the rowid, and inserting `NULL` assigns the next value
(same page). No schemas, no roles, no stored procedures, no `RIGHT JOIN` before 3.39, no
`GRANT` — authorization is a file permission or the platform's rules. `ON CONFLICT` is identical to
Postgres, so that skill transfers whole.

The wall is concurrency: "SQLite supports an unlimited number of simultaneous readers, but it will
only allow one writer at any instant in time" ([Appropriate uses for SQLite](https://www.sqlite.org/whentouse.html)).
For a two-person grocery list that is a non-issue (writes are milliseconds), but it is the reason
every SQLite option here either puts a server in front (PocketBase, D1, Turso) or hands you back
the offline problem (a `wa-sqlite`/OPFS file in the browser, which then needs its own sync).

### Effort, honestly

- **Postgres:** 1–2 days to reproduce everything this app does (two `CREATE TABLE`s, one upsert,
  one `SELECT`, one transaction). 2–4 weeks to be fluent enough to design indexes and RLS policies
  without checking docs. The trap list is short and well documented: identifier case folding,
  `GENERATED ALWAYS` vs client-supplied ids, `NULL` comparisons, and `timestamptz` vs naive
  timestamps.
- **SQLite:** half a day for the SQL. The rest is not SQL at all — it is deciding who owns the file
  and how two devices reach it.
- **The thing that costs more than either:** row-level security. Writing
  `using (list_id in (select …))` is easy; being confident it is airtight is not, and it is the
  only thing standing between a public anon key and everyone's shopping list.

---

## 13. Sources

- Firestore offline persistence and per-document last-write-wins —
  <https://firebase.google.com/docs/firestore/manage-data/enable-offline>
- Firebase redirect sign-in vs third-party storage blocking —
  <https://firebase.google.com/docs/auth/web/redirect-best-practices>
- Google ending OAuth in embedded webviews —
  <https://developers.googleblog.com/en/modernizing-oauth-interactions-in-native-apps-for-better-usability-and-security/>
- Supabase `persistSession` → localStorage; `auth.uid()`/RLS model —
  <https://supabase.com/docs/reference/javascript/initializing>
- Supabase sessions (JWT + rotating refresh token) —
  <https://supabase.com/docs/guides/auth/sessions>
- Supabase SSR "requires cookie-based session storage" —
  <https://supabase.com/docs/guides/auth/server-side/creating-a-client>
- Turso embedded replicas are a local **file** + `syncUrl` —
  <https://docs.turso.tech/features/embedded-replicas/introduction>
- Turso SQL over HTTP, `Authorization: Bearer <token>` —
  <https://docs.turso.tech/sdk/http/quickstart>
- D1 "Worker and HTTP API access" —
  <https://developers.cloudflare.com/d1/>
- D1 proxy Worker with a shared API key —
  <https://developers.cloudflare.com/d1/tutorials/build-an-api-to-access-d1/>
- Neon serverless driver usable in browsers, security warning, RLS recommendation —
  <https://neon.com/docs/serverless/serverless-driver>
- PocketBase stateless bearer auth, no server sessions —
  <https://pocketbase.io/docs/authentication/>
- PocketBase realtime is SSE —
  <https://pocketbase.io/docs/api-realtime/>
- Appwrite web sessions: secure session cookie, localStorage fallback —
  <https://appwrite.io/docs/products/auth/security>
- Appwrite JWT requires an existing client session and is for server SDKs —
  <https://appwrite.io/docs/products/auth/jwt>
- Convex: "doesn't currently provide a full offline sync mechanism", WebSocket transport —
  <https://www.convex.dev/sync>
- Postgres `INSERT … ON CONFLICT`, `RETURNING`, `OVERRIDING SYSTEM VALUE` —
  <https://www.postgresql.org/docs/current/sql-insert.html>
- Postgres identity columns —
  <https://www.postgresql.org/docs/current/sql-createtable.html>
- Postgres `jsonb` and operators —
  <https://www.postgresql.org/docs/current/datatype-json.html>
- Postgres error `25P02 in_failed_sql_transaction` —
  <https://www.postgresql.org/docs/current/errcodes-appendix.html>
- SQLite UPSERT follows the Postgres syntax —
  <https://www.sqlite.org/lang_upsert.html>
- SQLite STRICT tables, `INTEGER PRIMARY KEY` rowid behaviour —
  <https://www.sqlite.org/stricttables.html>
- SQLite one writer at a time —
  <https://www.sqlite.org/whentouse.html>
- Third-party iframes get partitioned storage —
  <https://developer.mozilla.org/en-US/docs/Web/Privacy/State_Partitioning>
