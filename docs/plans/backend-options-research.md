# Managed backend / BaaS options — free tier and entry-level pricing

**Read on 2026-11-22.** Every number below comes from the vendor's own pricing page or docs
(URL next to the claim, full list at the end). Where a page rendered its numbers only via
JavaScript and I could not get them out, it says so explicitly instead of guessing.

Context this is written against: a static React/Vite PWA on Netlify, 1–2 users today across a
phone, a desktop browser, an Android tablet in a Home Assistant dashboard iframe, and a WebView
kiosk app. Persistence today is a Google Sheet the client reads and writes directly. Owner has
MSSQL experience, no Postgres experience, wants a free tier that survives growth to a few hundred
users without a rewrite or a surprise bill.

---

## 1. Summary

| Option | Managed free tier | What's included (storage / rows) | Request / egress limits | Pauses or expires? | First paid step | DB type | Auth | Realtime | Self-host |
|---|---|---|---|---|---|---|---|---|---|
| **Supabase** | Yes, $0 | 500 MB database, 1 GB file storage | Unlimited API requests; 5 GB egress + 5 GB cached egress /mo; 50K MAU | **Paused after 1 week of inactivity**; max 2 active projects | Pro **$25/mo** (100K MAU, 8 GB disk/project, 250 GB egress, daily backups) | Postgres | Yes (GoTrue) | Yes, 200 peak connections / 2M msgs per mo free | Yes (Apache-2.0 stack) |
| **Firebase (Firestore)** | Yes, $0 Spark, no card | 1 GiB stored; 50K reads/day, 20K writes/day, 20K deletes/day | 10 GiB/mo outbound; 50K MAU auth | No pause, no expiry; quotas reset daily | Blaze = pay-as-you-go, same no-cost quotas then $0.03/100K reads, $0.09/100K writes | Document (NoSQL) | Yes (Firebase Auth) | Yes (onSnapshot listeners) | No (emulator only) |
| **Appwrite Cloud** | Yes, $0 | 2 GB storage, 1 database/project, 500K reads + 250K writes /mo | 5 GB API bandwidth/mo; 750K function executions; 75K MAU | **Project freezes** at limit, read-only console; resets next cycle | Pro **$25/mo** (150 GB storage, 2 TB bandwidth, 1.75M reads/mo, 200K MAU) | Document + (Pro) Postgres/MySQL | Yes | Yes, 250 connections / 2M msgs free | Yes (BSD-3, Docker) |
| **Convex** | Yes, $0 | 0.5 GB DB, 1 GB file storage, 1 GB DB I/O | 1M function calls, 1 GB egress, 20 GB-hours actions /mo | Not documented (see §3.4) | Professional **$25/dev/mo** (25M calls, 50 GB DB, 50 GB egress) | Reactive document DB | Yes | Yes (built in) | Yes (open source) |
| **Neon** | Yes, $0, no card, no time limit | 100 projects; **100 CU-hours/project**; 1 GB storage/project (20 GB total) | 5 GB network transfer / project /mo; 60K MAU auth | **No inactivity pause**; compute suspends when the 100 CU-hours or 5 GB is used | Launch = usage-based, typical spend **$15/mo** ($0.106/CU-hr, $0.35/GB-mo) | Postgres | Yes (Managed Better Auth) | Beta | Yes (open source) |
| **Turso** | Yes, $0 | 100 databases, 5 GB storage | 500M rows read + 10M rows written /mo; 3 GB syncs | Not documented as pausing | Developer **$4.99/mo** (9 GB, 2.5B reads) | SQLite (libSQL) | Yes (built in) | Sync/replica model | Yes (open source) |
| **Cloudflare D1** | Yes, via Workers Free | 5 GB total, 10 databases | **5M rows read/day, 100K rows written/day** | Daily limits; queries error until 00:00 UTC reset | Workers Paid **$5/mo min** (25B rows read, 50M rows written /mo) | SQLite | No (bring your own) | No | Partly (open-source fork) |
| **PocketBase** | No managed free tier; software is free | Your disk (SQLite file) | Your bandwidth | No (you run it) | PocketHost **$9.99/instance/mo** (no free tier listed) | SQLite | Yes | Yes (SSE) | Yes, MIT, single binary |
| **Azure SQL Database** | Yes — "free offer", 100K vCore-sec + 32 GB/mo, 10 DBs/subscription | 32 GB data + 32 GB backup | Compute-metered; no egress line item in the offer | **Auto-pauses after 15 min idle**; optionally pauses at the monthly limit | Serverless General Purpose, **$0.521758/vCore-hour** (East US, list) | SQL Server (T-SQL) | No (Entra ID / SQL logins only) | No | No |
| **MongoDB Atlas** | Yes, M0 "free forever" | 512 MB, 32 MB sort memory | **100 ops/sec**; 500 connections | No expiry | M2 **$9/mo**, 2 GB | Document (MongoDB) | **No** — App Services auth was removed | No — Device Sync EOL | Yes (community server, not Atlas) |

---

## 2. Option details

### 2.1 Supabase

**Free tier today.** "$0 / month … Limit of 2 active projects." Free includes unlimited API
requests, 50,000 monthly active users, 500 MB database size, shared CPU / 500 MB RAM, 5 GB egress,
5 GB cached egress, 1 GB file storage, community support.
<https://supabase.com/pricing>

**Limits that bite.**
- *Pausing:* "Free projects are paused after 1 week of inactivity." Restoring is a dashboard
  action, but a grocery list that nobody opens for eight days comes back cold. This is the single
  most consequential line on the page for a two-person app.
- *Project cap:* 2 active projects — you cannot keep a staging copy plus prod plus an experiment.
- *Disk:* 500 MB is plenty for lists; it is not the constraint. Egress (5 GB) and MAU (50K) are far
  above what a few hundred users of a list app will use.
- *Backups:* listed only from Pro upward ("Daily backups stored for 7 days"), so free has none.
- *Realtime:* 200 concurrent peak connections and 2 million messages/month included on free.
  <https://supabase.com/pricing>

**First paid step.** Pro, from **$25/month**, "First project included", additional projects from
$10/mo. Pro raises to 100K MAU (then $0.00325/MAU), 8 GB disk per project (then $0.125/GB),
250 GB egress (then $0.09/GB), 100 GB file storage, daily backups with 7-day retention, 7-day logs.
Paid plans include $10/mo of compute credit, enough for one Micro instance (1 GB RAM, 60 direct /
200 pooled connections). <https://supabase.com/pricing>

**Scaling story.** Same Postgres all the way up; compute is a dial from Micro ($10) to 16XL
($3,730, 64 vCPU / 256 GB). Nothing about the schema or client changes between $0 and enterprise —
the only cliff is the $25 subscription and then per-MAU/egress metering. Team plan is $599/mo.

**Embedded-context note.** Supabase's own docs say HTTP-only cookie sessions are "not feasible" for
apps with client-side JavaScript, and that the JS libraries support cookies only in a limited way
(server-side overrides). The default browser client keeps the session in browser storage, which is
what you want inside a third-party iframe or WebView. <https://supabase.com/docs/guides/auth/sessions>

---

### 2.2 Firebase (Firestore + Firebase Auth)

**Free tier today.** Spark plan, no-cost, no card. Firestore free quota: **1 GiB stored data,
50,000 document reads/day, 20,000 writes/day, 20,000 deletes/day, 10 GiB/month outbound data
transfer**. "Cloud Firestore allows exactly one free database per project."
<https://firebase.google.com/docs/firestore/pricing>

Auth is no-cost up to **50,000 MAU** on the Spark column; Hosting no-cost up to 10 GiB/month
storage and 360 MB/day transfer. <https://firebase.google.com/pricing>

**Limits that bite.**
- *Daily, not monthly:* quotas "are applied daily and reset around midnight Pacific time". A
  pathological sync loop can burn 20K writes in an afternoon and the app simply fails until
  midnight — there is no soft landing and no bill to warn you.
- *Read amplification:* every list open is a document read per document. A grocery list of 40 items
  opened 50 times a day by 5 devices is 10K reads/day — visible against a 50K ceiling at only a
  handful of users. This is the quota that actually constrains this app's shape.
- *Blaze-only features:* Cloud Functions are "not applicable" on Spark (no outbound networking),
  so any server-side logic, scheduled job, or third-party API call forces the Blaze plan.
- *No SQL:* it is a document store; you would be rewriting the Sheet logic into collections and
  denormalised reads.
- *Backups/PITR/TTL deletes* are explicitly outside the free quota and require billing.

**First paid step.** Blaze is pay-as-you-go with **no monthly minimum** and keeps the same no-cost
quotas, then bills: $0.03 per 100,000 document reads, $0.09 per 100,000 writes, $0.01 per 100,000
deletes (list, before 1-yr/3-yr committed-use discounts of $0.024/$0.018 and $0.072/$0.054).
Outbound networking on Blaze: no-cost up to 5 GB/month then $0.12/GB.
<https://cloud.google.com/firestore/pricing> · <https://firebase.google.com/pricing>

**Scaling story.** Effectively unbounded, and the cost curve is smooth — but it is a per-operation
meter, so cost tracks usage linearly forever rather than stepping at a plan boundary. The risk is
not a cliff, it is a bill that grows with every extra document read.

**Embedded-context note.** Firebase web auth persistence is client-side (LOCAL by default, i.e.
IndexedDB-backed, with SESSION/NONE alternatives) — no third-party cookie involved, which is the
most iframe/WebView-friendly of the bunch. <https://firebase.google.com/docs/auth/web/auth-state-persistence>

---

### 2.3 Appwrite Cloud

**Free tier today.** $0, and the free plan is materially different from Pro — not a trial:
2 projects (shared resources), 1 organisation member, 3 connected platforms per project,
5 GB API bandwidth/month, 2 GB storage, 1 database per project, **500K reads + 250K writes per
month**, 75K MAU, 100 teams per project, 1 bucket per project (50 MB file limit), 2 functions,
750K executions/month, 100 GB-hours, 250 realtime concurrent connections / 2M messages,
1-hour log retention, 2 webhooks. <https://appwrite.io/pricing>

**Limits that bite.**
- *Freeze, not throttle:* "What happens if I reach a resource limit in my Free plan? Your project
  will freeze, and Appwrite Console will continue running in read-only mode." Recovery is upgrade,
  delete resources, or wait for the next billing cycle.
- *1 database per project* on free (unlimited on Pro) and *2 projects* total.
- *5 GB bandwidth* is the tightest number on the card for a PWA that pulls its assets from the API
  origin if you also host the site there.
- *Reads* at 500K/month is a real ceiling for a read-heavy list app (see the Firebase read-note
  above; same shape applies).
- *1 hour* of log retention makes debugging a production complaint nearly impossible.

**First paid step.** Pro **$25/month**: 2 TB bandwidth, 150 GB storage, unlimited databases,
1.75M reads + 750K writes/month then $0.060/100K reads and $0.10/100K writes, 200K MAU,
unlimited projects (dedicated), daily backups with 7-day retention, 7-day logs, custom SMTP,
budget caps. <https://appwrite.io/pricing>

**Scaling story.** Same platform, one subscription covering auth, DB, storage, functions, realtime,
hosting; overage is metered per read/write and per GB-hour of compute. Dedicated database tiers
start at $10/mo (1 core / 1 GB) if serverless reads/writes stop being predictable.

**Unverified:** the pages I read do not state where the web SDK persists its session (cookie vs
browser storage). Relevant to the iframe/WebView case — check `a_session_*` behaviour against your
own embedding before committing.

---

### 2.4 Convex

**Free tier today.** "$0/month and pay as you go". Included per month: 1M function calls,
0.5 GB database storage, 1 GB file storage, 1 GB database I/O, 1 GB data egress, 20 GB-hours of
action compute, 0.5 GB search storage, 3,000 query-GBs of search; 16 concurrent queries, 64
concurrent actions, 1,000 concurrent sessions, 40 deployments. Auth, realtime, crons, text and
vector search and the health dashboard are all on the free plan.
<https://www.convex.dev/pricing>

**Limits that bite.**
- *0.5 GB database* and *1 GB egress* are the smallest storage/egress numbers in this comparison.
- *1M function calls/month* is ~33K/day; a reactive app that re-runs queries on every write burns
  calls faster than you expect.
- *20 GB-hours of action compute* is the ceiling on server-side work.
- *No daily quotas* — everything is monthly, so a burst is absorbed rather than hard-failing at
  midnight. Backups are Professional-only, so on free you have none.

**First paid step.** Professional **$25 per developer/month**: 25M calls, 50 GB DB, 100 GB file
storage, 50 GB egress, 250 GB-hours actions, 256 concurrent queries, log streaming, daily backups,
custom domains. Business/Enterprise starts at a **$2,500 monthly minimum**.
<https://www.convex.dev/pricing>

**Scaling story.** Per-unit rates drop on Professional ($2 vs $2.20 per extra 1M calls, $0.20 vs
$0.22 per GB) and the platform scales to dedicated deployments — but the jump from $25/dev to a
$2,500/mo floor is the steepest single step of any option here. The model is also the most
opinionated: TypeScript functions and a reactive query layer, not tables you can query with SQL.

**Unverified:** the pricing page does not say what happens when a Free/Starter project exceeds its
included resources (blocked vs. auto-billed). Confirm before relying on it.

---

### 2.5 Neon

**Free tier today.** $0, "no time limits and no credit card required": **100 projects**,
**100 CU-hours of database compute per project per month**, 1 GB of storage per project,
sizes up to 2 CU (8 GB RAM), unlimited team members, 5 GB object storage, Functions, Realtime
(beta), and Managed Better Auth up to **60,000 MAU per project**.
<https://neon.com/pricing>

**Limits that bite.**
- *CU-hours, not dollars:* 100 CU-hours at the free default of 0.25 CU ≈ 400 hours of active
  compute (the page's own arithmetic), or ~12 hours/day for a month at 0.25 CU. Fine for a list
  app; gone fast if something polls.
- *Per project, and genuinely independent:* 100 projects × 100 CU-hours each — the page is explicit
  that projects don't share the allowance. That is unusually generous for side projects.
- *What happens at the limit:* "If a project uses up its 100 CU-hours or 5 GB of network transfer
  for the month, its compute is suspended until the next billing period" — data is not deleted;
  "operations that increase storage fail" past 1 GB.
- *No inactivity pause:* "Neon doesn't pause Free projects for inactivity, and there's no restore
  step." Idle compute scales to zero after 5 minutes and resumes on the next query in a few hundred
  milliseconds. For a Home Assistant dashboard that polls occasionally, this is the friendliest
  behaviour in the comparison.
- *Caveat:* scale-to-zero means the first query after idle is slower — relevant to a kiosk that
  should feel instant.

**First paid step.** **Launch is usage-based with no fixed monthly fee** ("Typical spend: $15/mo"):
$0.106 per CU-hour, $0.35 per GB-month, 100 projects, up to 16 CU, 3-day metrics. Scale is
$0.222/CU-hour, 1,000+ projects, SLAs, HIPAA. <https://neon.com/pricing>

**Scaling story.** The smoothest curve here: nothing is a plan cliff except 100→1,000 projects, and
cost tracks actual compute because idle databases cost nothing. Same Postgres as Supabase, so the
skills transfer; it does not give you the storage/edge-function ecosystem Supabase bundles.

**Embedded-context note.** Auth ("Managed Better Auth") is part of the platform on free, which is
unusual at this price.

---

### 2.6 Turso

**Free tier today.** $0: **100 databases, 5 GB storage, 500 million rows read/month, 10 million
rows written/month, 3 GB of syncs, 1-day point-in-time restore**, community support.
<https://turso.tech/pricing>

**Limits that bite.**
- *Rows read, not requests:* 500M rows/month is generous for a grocery list (a 40-row table read
  1,000 times = 40K rows), but a query without an index scans the table and counts every row.
- *5 GB storage* across 100 databases.
- 1-day PITR only, no audit logs, no teams/SSO on free.

**First paid step.** Developer **$4.99/month**: unlimited databases, 9 GB storage (+$0.75/GB),
2.5B rows read (+$1/billion), 25M rows written (+$1/million), 10 GB syncs, 3-day PITR.
Scaler $24.92/mo, Pro $416.58/mo. <https://turso.tech/pricing>

**Scaling story.** Cheapest paid entry of any managed option here, and the architecture (one SQLite
file per database, embedded replicas) scales reads by adding replicas rather than by enlarging one
server. The honest caveat is ownership: **"Turso is joining Supabase"** — Supabase acquired Turso,
announced 2026-10-02, with the post saying "The Turso platform continues" and promising "deeper
integration between Turso and Supabase in the coming months".
<https://turso.tech/blog/turso-is-joining-supabase> Whether the free tier survives that integration
is not stated anywhere I could read.

---

### 2.7 Cloudflare D1 (+ Workers)

**Free tier today.** Via the Workers Free plan: **5 million rows read/day, 100,000 rows written/day,
5 GB total storage, 10 databases**. "The Workers Free plan will always include the ability to
prototype and experiment with D1 for free."
<https://developers.cloudflare.com/d1/platform/pricing/>

**Limits that bite.**
- *Daily row budget, hard stop:* "When your account hits the daily read and/or write limits, you
  will not be able to run queries against D1. D1 API will return errors… Once you have reached your
  included storage limit, you will need to delete unused databases or clean up stale data before you
  can insert new data."
- *100K writes/day* sounds large until a sync layer writes every list mutation plus an updated_at
  row; a full-table resync of 2,000 rows is 2,000 writes.
- *D1 is not a BaaS:* no auth, no realtime, no row-level security. You write a Worker API yourself
  and handle identity with something else (Cloudflare Access, JWTs, or a third party).
- *No egress charges* on Workers — the page is explicit that D1 does not charge for data transfer.

**First paid step.** Workers Paid, **$5/month minimum per account**, which unlocks 25 billion rows
read and 50 million rows written per month included, then $0.001/million reads and $1.00/million
writes, 5 GB storage included then $0.75/GB-month, and up to 100,000 databases.
<https://developers.cloudflare.com/workers/platform/pricing/>

**Scaling story.** Cheapest floor ($5) of any paid tier here, and it sits next to Workers/R2/KV so
the edge story is coherent. But you are building the auth, permissions and realtime layer yourself —
which is the opposite of what a one-person project should take on unless you specifically want it.

---

### 2.8 PocketBase (self-hosted)

**"Free tier" today.** There is no managed free tier; the software is free. PocketBase is "an open
source backend consisting of embedded database (SQLite) with realtime subscriptions, builtin auth
management, convenient dashboard UI and simple REST-ish API", shipped as a ~12 MB single executable
(MIT licensed — the LICENSE reads "The MIT License (MIT) Copyright (c) 2022 - present, Gani
Georgiev"). <https://pocketbase.io/docs/> · <https://github.com/pocketbase/pocketbase/blob/master/LICENSE.md>

**Limits that bite.**
- *You are the operator.* Backups, TLS, uptime, upgrades and the public IP are yours. There is no
  support, no SLA, and no dashboard that tells you something broke at 2am.
- *Pre-1.0:* the docs say plainly "PocketBase is still under active development and full backward
  compatibility is not guaranteed before reaching v1.0.0. PocketBase is NOT recommended for
  production critical applications yet." <https://pocketbase.io/docs/>
- *Single node, SQLite.* Fine for hundreds of users on a list app; not a horizontal-scaling story.
- *Hosting cost is real* even though the software is free — a VPS or small instance, priced
  elsewhere, plus your time.

**First paid step (managed).** PocketHost charges **$9.99 per instance per month** (annual
$59.99/yr, or $149.99 once for lifetime), 10 GB storage per paid instance, unmetered bandwidth
under fair use. **No free tier is listed on their pricing page.**
<https://pockethost.io/pricing>

**Scaling story.** Vertical only — a bigger box. The appeal is that there is no vendor, no invoice
and no quota: the ceiling is your server. The cost is that you have become the on-call engineer.

---

### 2.9 Azure SQL Database (free offer)

**Free tier today.** "For each database, you get **100,000 vCore seconds, 32 GB of data, and 32 GB
of backup storage free per month for the lifetime of your subscription**. Each Azure subscription
allows you to create up to **10 free tier General Purpose databases**."
<https://learn.microsoft.com/en-us/azure/azure-sql/database/free-offer>

**Limits that bite.**
- *100,000 vCore-seconds is 27.8 vCore-hours per month* — not 100 hours. At the East US list rate of
  $0.521758 per vCore-hour (see below) the allowance is worth roughly **$14.50/month** of compute.
- *Auto-pause is 15 minutes and not configurable:* "The free tier databases automatically pause
  after 15 minutes of inactivity. The auto-pause delay is fixed and can't be changed." And: "Open
  connections can prevent idle auto-pause and continue to consume vCore seconds" (SQL Server
  Management Studio, the MSSQL VS Code extension, any pooled client). This is the trap — a
  serverless tier that never pauses because something holds a connection.
- *At the monthly limit* you choose AutoPause (database inaccessible until the allowance resets at
  the start of the next calendar month) or BillOverUsage (standard serverless rates, and "You can't
  switch back to the auto-pause option").
- *No SLA:* "The free tier uses the same fully managed General Purpose infrastructure as a paid
  database, but it doesn't include a service-level agreement (SLA)."
- *One-way door:* "You can apply the free tier only to a new database. You can't restore or convert
  an existing database to the free tier."
- *No auth, no realtime, no HTTP API* in the box. A browser app cannot talk to Azure SQL directly —
  you need a server (Azure Functions, Container Apps, or Data API builder) plus your own auth.

**First paid step.** Per-second serverless General Purpose, Gen5: **$0.521758 per vCore-hour**,
East US, list price, from Microsoft's own Retail Prices API
(`https://prices.azure.com/api/retail/prices`, filtered `serviceName eq 'SQL Database' and
armRegionName eq 'eastus'`, read 2026-11-22). Storage is billed separately and the pricing page's
own rate cells rendered as `$-` placeholders, i.e. JS-only — see the note in §3. A 2-vCore minimum
that runs continuously is ~$762/month at that rate, which is why serverless + auto-pause matters.

**Scaling story.** The strongest "no rewrite" story *if* you stay in T-SQL: the same database scales
to Hyperscale (up to 100 TB) and to vCore tiers far beyond anything this app needs, and the owner's
MSSQL experience transfers 1:1. The catch is that it is the only option here with **no auth, no
realtime and no HTTP API**, so a BaaS-shaped app becomes a client + API service + database, three
things to deploy instead of one.

---

### 2.10 MongoDB Atlas (M0)

**Free tier today.** M0: **512 MB storage, shared RAM, shared vCPU, "Free forever"**; the FAQ adds
"512 MB of storage, 32MB of sort memory, and up to 100 operations per second".
<https://www.mongodb.com/pricing> Free clusters allow a maximum of **500 connections** and
100 databases / 500 collections; backups are "only available as a private preview feature" on free
clusters. <https://www.mongodb.com/docs/atlas/reference/free-shared-limitations/>

**Limits that bite.**
- *100 operations per second* is a throughput ceiling, not a volume one — fine for two people,
  visible at a few hundred concurrent users.
- *One free cluster per project*, 512 MB, no real backups.
- **No auth and no realtime:** Atlas App Services authentication "is no longer available" and
  "Atlas Device Sync is deprecated"; the Device SDKs "reached end-of-life and were removed on
  September 30, 2025". <https://www.mongodb.com/docs/atlas/device-sdks/deprecation/> What remains
  is a managed database you reach over a driver — from a browser app, that means a server in
  between.

**First paid step.** M2 **$9/month**, 2 GB, shared RAM/vCPU. <https://www.mongodb.com/pricing>

**Scaling story.** Excellent as a database (replica sets, sharding), but as a *backend* it lost its
BaaS pieces in 2025, so choosing it means building auth and the API layer yourself. For a
document-store rewrite of a grocery list this is the least attractive shape of the ten.

---

## 3. Traps and gotchas

**3.1 "Free" often means "free until you stop using it."** Supabase pauses free projects after one
week of inactivity — for a two-person grocery list that is the default state, not the edge case. A
paused project is a broken kiosk in the kitchen. Neon explicitly does *not* do this (scale-to-zero,
no restore step), which is a meaningful difference between two otherwise similar Postgres hosts.
<https://supabase.com/pricing> · <https://neon.com/pricing>

**3.2 Hard stops vs. bills.** Three different failure modes hide behind "free tier":
- *Blocked until reset*: Firebase (daily quotas, midnight Pacific), Cloudflare D1 (daily quotas,
  00:00 UTC), Appwrite (project freeze until next billing cycle), Neon (compute suspended until next
  billing period).
- *Silently billed*: any plan with pay-as-you-go overage and no cap — Supabase Pro, Appwrite Pro,
  Convex Professional, Firebase Blaze, Neon Launch.
- *Paused*: Supabase (inactivity), Azure SQL (15-minute idle auto-pause, plus optional AutoPause at
  the monthly limit).
Appwrite is the only one here that advertises budget caps on Pro; Convex and Neon have spending
*notifications* that "alert you but don't stop usage" (Neon's words).

**3.3 The metered unit is chosen to be invisible.** Rows read (D1, Turso), document reads
(Firebase), execution count (Appwrite, Convex), vCore-seconds (Azure), CU-hours (Neon). The number
that matters is not "how many users" but "how many reads does one screen refresh cost". A grocery
list re-fetched on every focus event is cheap in Postgres and expensive in Firestore. Compute the
per-refresh cost against your actual UI before comparing headline numbers.

**3.4 FREEZE/EXPIRE facts worth stating precisely.**
- Render's free Postgres **expires 30 days after creation** ("Free Render Postgres databases expire
  30 days after creation", <https://render.com/docs/free>) — not in the table above because it is
  not a viable backend for this app, but it is the canonical example of "free tier" meaning "trial".
- Azure SQL's free allowance is per **database**, capped at 10 per subscription, and cannot be
  applied to an existing database.
- MongoDB's "free forever" M0 is genuinely free forever, but with no backups outside a private
  preview.
- Convex's behaviour past the free allowance is not documented on its pricing page (see the
  unverified list at the end).

**3.5 Third-party cookies are a real constraint here, and most BaaS defaults dodge it — except when
you add SSR.** In the Home Assistant iframe and the WebView kiosk, a cookie set on
`something.cloud.appwrite.io` or `xyz.supabase.co` is a third-party cookie and will be blocked or
partitioned. The client-side SDKs mostly avoid this by keeping tokens in browser storage:
Supabase's docs note HTTP-only cookie sessions are "not feasible" for client-side JS and that the
JS libraries support cookies only in a limited, server-side way
(<https://supabase.com/docs/guides/auth/sessions>); Firebase persists auth state client-side (LOCAL,
i.e. IndexedDB, by default) (<https://firebase.google.com/docs/auth/web/auth-state-persistence>).
The trap is adopting a "modern SSR auth" recipe (Next.js `@supabase/ssr`-style cookie sessions)
because a blog post recommends it — that reintroduces exactly the cookie dependency your embedded
contexts break. If you need server-side rendering, get a **custom domain on the same site** so the
cookie is first-party.
*Not verified in this pass:* Appwrite's and PocketBase's default session storage location.

**3.6 "Rows included" tables hide the project/DB caps.** Supabase 2 active projects. Appwrite 2
projects on free, 1 database per project. D1 10 databases. Atlas one free cluster per project.
Neon 100 projects (the outlier). If you want prod + staging + a sandbox, most free tiers give you
one and a half.

**3.7 Auth is where the "included" claims quietly fail.** Firebase 50K MAU, Supabase 50K MAU,
Appwrite 75K MAU, Neon 60K MAU — all irrelevant at 2 users and all fine at 300. The real question is
whether auth exists at all: D1, Azure SQL and Atlas have **none**, which converts a "database
choice" into "database + auth service + API server" and is the single biggest hidden cost driver in
this list.

**3.8 Ownership risk is a free-tier risk.** Turso's free tier is a good deal today and Turso was
acquired by Supabase on 2026-10-02 with "deeper integration … in the coming months"
(<https://turso.tech/blog/turso-is-joining-supabase>). MongoDB removed its BaaS layer (App Services
auth, Device Sync) outright. "Free forever" describes the price, not the product.

**3.9 Azure's free tier is the one that looks biggest and is smallest.** 100,000 vCore-seconds reads
like a large number; it is 27.8 vCore-hours per month, and a single always-open SSMS connection
prevents the 15-minute auto-pause and burns it in days. <https://learn.microsoft.com/en-us/azure/azure-sql/database/free-offer>

**3.10 JS-only pages I could not read.** Azure's per-region price cells on
https://azure.microsoft.com/en-us/pricing/details/azure-sql-database/single/ render as `$-`
placeholders in the served HTML, so I used Microsoft's Retail Prices API
(`https://prices.azure.com/api/retail/prices`) instead — that is a first-party machine-readable
price list, but it returns **list prices for one region** (East US). Google's Firestore storage rate
is quoted per GiB with a unit that the page does not disambiguate (`$0.000205479`, unit column
"GiB") — the read/write/delete rates are unambiguous and are the ones used above. Appwrite's
Free/Pro comparison table is JS-rendered; I read it by rendering the page in a real browser, not
from the HTML source.

---

## 4. Sources

All read **2026-11-22**.

| # | Source | URL |
|---|---|---|
| 1 | Supabase — Pricing (free plan, pausing, 2-project cap, Pro $25, MAU/egress/compute table, Realtime 200 connections / 2M messages) | https://supabase.com/pricing |
| 2 | Supabase Docs — Sessions (HTTP-only cookies not feasible for client-side JS) | https://supabase.com/docs/guides/auth/sessions |
| 3 | Firebase — Pricing (Spark/Blaze columns, 50K MAU, Functions/outbound networking, 5 GB then $0.12/GB) | https://firebase.google.com/pricing |
| 4 | Cloud Firestore — Pricing (free quota: 1 GiB, 50K reads/day, 20K writes/day, 20K deletes/day, 10 GiB/mo egress; one free DB per project) | https://firebase.google.com/docs/firestore/pricing |
| 5 | Google Cloud — Firestore pricing (list rates $0.03/100K reads, $0.09/100K writes, $0.01/100K deletes) | https://cloud.google.com/firestore/pricing |
| 6 | Firebase — Auth state persistence (LOCAL/IndexedDB default) | https://firebase.google.com/docs/auth/web/auth-state-persistence |
| 7 | Appwrite — Pricing (Free vs Pro table, freeze-on-limit FAQ, Pro $25, dedicated DB tiers) | https://appwrite.io/pricing |
| 8 | Convex — Pricing (Free & Starter resources, Professional $25/dev, $2,500 minimum) | https://www.convex.dev/pricing |
| 9 | Neon — Pricing (100 projects, 100 CU-hrs, 1 GB/project, 60K MAU auth, no inactivity pause, Launch $0.106/CU-hr) | https://neon.com/pricing |
| 10 | Turso — Pricing (Free: 100 DBs, 5 GB, 500M reads, 10M writes, 3 GB syncs; Developer $4.99) | https://turso.tech/pricing |
| 11 | Turso — "Turso is joining Supabase" (2026-10-02) | https://turso.tech/blog/turso-is-joining-supabase |
| 12 | Cloudflare — D1 pricing (Workers Free 5M reads/100K writes per day, 5 GB, 10 DBs; Paid inclusions) | https://developers.cloudflare.com/d1/platform/pricing/ |
| 13 | Cloudflare — Workers pricing ($5/month minimum, 10M requests, no egress charges) | https://developers.cloudflare.com/workers/platform/pricing/ |
| 14 | PocketBase — Docs (SQLite + realtime + auth, single binary, pre-1.0 production warning) | https://pocketbase.io/docs/ |
| 15 | PocketBase — LICENSE (MIT) | https://github.com/pocketbase/pocketbase/blob/master/LICENSE.md |
| 16 | PocketHost — Pricing ($9.99/instance/mo, annual, lifetime; no free tier listed) | https://pockethost.io/pricing |
| 17 | Microsoft Learn — Azure SQL Database free tier (100K vCore-sec, 32 GB, 32 GB backup, 10 DBs, 15-min auto-pause, no SLA, no conversion) | https://learn.microsoft.com/en-us/azure/azure-sql/database/free-offer |
| 18 | Azure Retail Prices API (SQL Database General Purpose Serverless Gen5, East US: $0.521758/vCore-hour) | https://prices.azure.com/api/retail/prices |
| 19 | Azure — SQL Database pricing page (rate cells JS-only; storage ranges; auto-pause behaviour) | https://azure.microsoft.com/en-us/pricing/details/azure-sql-database/single/ |
| 20 | MongoDB — Pricing (M0 free forever 512 MB; M2 $9/mo; 100 ops/sec; no backups on free) | https://www.mongodb.com/pricing |
| 21 | MongoDB Docs — Atlas Free Cluster Limits (500 connections, 100 DBs/500 collections, backups private preview) | https://www.mongodb.com/docs/atlas/reference/free-shared-limitations/ |
| 22 | MongoDB Docs — Atlas App Services Device SDKs deprecation (Device Sync EOL 2025-09-30, App Services auth removed) | https://www.mongodb.com/docs/atlas/device-sdks/deprecation/ |
| 23 | Render — Deploy for Free (free Postgres expires 30 days after creation; free web services spin down after 15 min) | https://render.com/docs/free |

### Items I could not verify

1. **Convex** — what happens when a Free/Starter project exceeds its included resources (blocked vs.
   auto-billed). Not stated on the pricing page.
2. **Appwrite** — where the web SDK stores its session (cookie vs. browser storage), which matters
   for the iframe/WebView case.
3. **PocketBase** — same question for its JS SDK's default token storage.
4. **Azure SQL** — per-GB storage rate and per-region pricing beyond East US; the pricing page's
   cells are client-rendered (`$-`), so only the Retail Prices API numbers are cited.
5. **Firestore** — the storage rate's unit on the Google Cloud pricing table is ambiguous
   (`$0.000205479`, unit "GiB"); reads/writes/deletes are unambiguous.
6. **Turso** — whether the free tier terms change under Supabase ownership; no statement found.
7. **Supabase** — what happens to a project that stays paused long-term (retention/deletion policy
   for paused free projects) is not stated on the pricing page.
