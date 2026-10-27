# Rename plan: Smart Grocery List → Breadcrumb

**Rule: only rename what a user sees.** Storage keys (`grocery-items`, `section-order`, …) and Google Sheets config stay untouched — renaming them silently wipes existing users' data for zero benefit.

## Tier 1 — user-facing (the actual rename, ~8 lines)

| File | Change |
|---|---|
| `index.html:9` | `<title>Breadcrumb</title>` |
| `index.html:12` | description → "The grocery list that remembers the way" |
| `index.html:27` | `apple-mobile-web-app-title` → `Breadcrumb` |
| `public/manifest.json:3-5` | `name`/`short_name` → `Breadcrumb`, description to match |
| `public/manifest.json:18` | shortcut `"Scan Grocery List"` → `"Scan a list"` |
| `src/components/AppHeader.tsx:106` | header text → `Breadcrumb` |
| `src/lib/ocr-openrouter.ts` ×3 | `X-Title: 'Breadcrumb'` (OpenRouter attribution only) |

`GoogleSheetsSettings.tsx:391` and `DiagnosticsPanel.tsx:804` say "grocery list" as a *noun*, not a brand — leave them. Same for the `google-sheets.ts` code comments.

## Tier 2 — docs (bulk, mechanical)

`PRODUCT.md`, `PRD.md`, `DESIGN.md`, `SETUP.md`, `HANDOFF.md`, `GOOGLE_SHEETS_SETUP.md`, `README.md` (currently still the Spark boilerplate — replace it outright).

One `rg -l | xargs sed -i ''` pass, then eyeball the diff.

## Tier 3 — skip entirely

`brag-output-2026-07-23-133258/` (dated artifact), `vite.log`, `dist/`, `coverage/`, `test-results/`, `docs/plans/*` (historical record), `public/test-images/*` (fixture text — changing it breaks OCR expectations). `package.json` name is `spark-template` and private — cosmetic only, change it or don't.

## Tier 4 — the icon (separate task)

`src/icon.svg` → regenerate via `npm run generate-icons`, which rebuilds all three PNGs. A breadcrumb trail mark is a genuinely different design problem; do it after the text rename lands.

## Verify

`npm run build && npm test`, then load the PWA and confirm the install prompt/home-screen title reads Breadcrumb.

---

Skipped: storage-key migration, i18n string extraction, domain/trademark check.
