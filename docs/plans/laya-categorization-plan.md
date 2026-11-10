# Plan: evaluate Laya as the categorization engine

Status: **Laya (Phases 2–3) shelved by decision. Everything else below is done.**

| item | state |
|---|---|
| Section 6: remove Florence-2 | done (prefetch, `ocr-model.ts`, `@huggingface/transformers`, cache rule removed; one-time cache purge added) |
| Phase 0: eval fixture + accuracy test | done, 211 synthetic entries, floor 0.94 |
| Phase 1: keyword/brand fixes | done, 64.9% → 96.2% on the fixture (rightmost-keyword + frozen/canned override + word-boundary matching + keyword dedupe) |
| Option A: corrections stay in front | done, and fixed a reverse-substring bug in learned-brand matching (`oat milk` correction no longer captures plain `milk`) |
| Phase 2/3: Laya | shelved. Keyword matcher is already ~96% on the fixture; revisit only if real data shows a gap |
| Review round 2 (independent reviewer + blind held-out set) | done. Fixed: add/import path bypassed `categorizeItem` and locked weak-brand results; exact-name corrections ignored on re-add; `addManualBrand` brands inert (occurrences 1 < trust bar 2); `learnFromPattern` learned plain nouns on every render; corrections not persisted; learned brands leaked mid-name (`cream` → `ice cream`); `-ies` plurals; `organizeList` keyed explicit categories by name; "Automatic (X)" label ignored learned brands; dead `EditItemDialog` deleted |
| Vocabulary expansion (done blind to held-out set) | done, +507 keywords, +118 brands. **Held-out: 76.1% → 89.1%**, `other` 43 → 13 of 247. Tuning set 97.6% |
| **Open:** replace synthetic fixtures with real `item-category-hints` | needs data from the user's browser, see below |

Export real corrections: in the app tab's DevTools console run
`copy(localStorage.getItem('item-category-hints'))`, then turn the `{name: category}` pairs into
fixture rows.
Scope: `src/lib/category-mapper.ts`, `src/lib/brand-recognition.ts`, `src/lib/brand-learning.ts`

---

## 1. What the current algorithm actually does

`categorizeItem(name, learnedBrands)` (`src/lib/category-mapper.ts:584`) is a 3-stage
first-match-wins lookup:

1. `recognizeBrand(name)` — substring scan of a 442-entry brand table. **Returns immediately.**
2. `learnedBrands` — substring scan of user-learned brands (confidence ≥ 0.5, occurrences ≥ 2).
3. Keyword scan over `STORE_CATEGORIES` in object-literal order; first category with any
   substring hit wins.

On top of that, `GroceryLearningAlgorithm.organizeList` adds a co-occurrence layer that can
move an item to a neighbouring category, and `App.tsx` layers two override maps in front:
`itemCategoryHints` (exact normalized name → category, written on every manual correction,
`App.tsx:470`) and `BrandLearningSystem.learnManualCorrection` (`brand-learning.ts:253`).

### Measured accuracy

I ran 60 realistic basket entries through it (fixture kept at
`src/test/fixtures/categorization-eval.ts`):

| variant | correct | fell to `other` |
|---|---|---|
| current `categorizeItem` | **35 / 60 (58%)** | 6 |

The failures are not "the model is too dumb" — they are three mechanical bugs:

**(a) Unanchored brand substrings outrank everything.** `recognizeBrand` does
`normalized.includes(brand)` over keys that include `all`, `gain`, `act`, `edge`, `sure`,
`mug`, `pam`, `post`, `extra`, `dove`, `kind`:

- `whole milk g**all**on` → brand `all` → **household**
- `**extra** virgin olive oil` → brand `extra` → **snacks**
- `cr**ush**ed tomatoes` → brand `crush` → **beverages**

**(b) Unanchored keyword substrings.** `cho**cola**te` contains `cola` → beverages.

**(c) First-category-wins over object order, not specificity.** `produce` is declared first,
so `frozen peas` → produce, `frozen blueberries` → produce, `orange juice` → produce,
`cream of mushroom soup` → produce.

### The cheap fix, measured

Prototyped: match keywords and brands on word boundaries with optional plural
(`(^|[^a-z])kw(e?s)?([^a-z]|$)`), take the **longest** matching keyword instead of the first
category, and demote brands to a fallback used only when no keyword matches.

| variant | correct | fell to `other` |
|---|---|---|
| current | 35 / 60 (58%) | 6 |
| **word-boundary + longest-match** | **46 / 60 (77%)** | 6 |

~15 lines changed, zero bytes downloaded, still synchronous, still works offline on first load.
Of the 14 remaining misses, 3 are genuinely store-dependent (`oat milk` dairy-vs-beverages,
`orange juice`, `sliced provolone` deli-vs-dairy) and 4 are modifier-ordering
(`chicken broth` → meat, `chicken nuggets frozen` → meat).

**This is the headline finding: most of the gap you'd be buying Laya to close is a regex bug.**

---

## 2. Can Laya run on the client device?

Yes, technically. The path exists and is non-trivial.

| fact | source | consequence |
|---|---|---|
| Browser inference exists: `laya-ts`, split ONNX (`encoder.onnx` + `head.onnx`), WebGPU → WASM fallback | [`laya-ts/README.md`](https://github.com/NandhaKishorM/laya/tree/main/laya-ts) | viable in principle |
| `laya-ts` is **not published on npm** (`registry.npmjs.org/laya-ts` → 404) despite the README | checked | you vendor/build from a git tag; no semver, no CDN |
| Weights must be exported yourself: `python laya-ts/scripts/export_onnx.py` | repo | needs a Python+torch step in your release pipeline |
| Export is **fp32 only** — no `--quantize`, `--fp16` or `--int8` flag | read `export_onnx.py` | no shipped small variant |
| Laya's own web demo: "First load transfers **~1.3 GB**" (multilingual, 322M params) | `laya-ts/README.md` | English checkpoint (421M) is worse, ~1.7 GB fp32 |
| `convaiinnovations/laya` repo ships `model.safetensors` only, **no ONNX** | HF API | nothing prebuilt to point at |
| "Base checkpoints are near chance on typed-decisions zero-shot — 0.362 … Laya is a fast base to specialise, **not a zero-shot decision engine**" | model card, *Honest Limits* | zero-shot result on 15 grocery categories is unknown and could be bad |
| "Ships over-confident": mean ECE 0.466 before per-domain temperature fitting | model card | confidence gating is unusable until you fit temperatures on your own data |
| Option budget: 15 options share `head_max_len=192` → ~11 tokens/label | model card | 15 categories is fine; this is not the Banking77 failure mode |
| Latency: 146 ms / 4 questions on Apple MPS, 453 ms on a 28-thread CPU | repo `LOCAL_SETUP.md` | in-browser WASM will be slower; today categorization is ~0 ms and synchronous |

### What it costs this app specifically

Categorization is not a batch job here — it runs on **every keystroke-completed add**
(`App.tsx:352`), on **every OCR/recipe import item** (`App.tsx:584`), and inside
`EditItemDialog`/`GroceryItemComponent` to render the "Automatic (X)" label
(`EditItemDialog.tsx:149`). All of those are synchronous today. Laya makes them async and
gates the first one behind a multi-hundred-MB download.

The app still downloads Florence-2 on every session, so large model downloads look like an
established precedent here — but that download is now pure waste (Section 6), and it is scheduled
in the background where a failure is invisible. Categorization is the core list behaviour on cold
start, including offline. Do not reason from the Florence-2 precedent; it is a bug, not a pattern.

---

## 3. Can user corrections be passed to Laya?

**Not by training on-device.** `laya-ts` exposes `predict`/`decide` only — inference. Fine-tuning
is Python + RLCD + a GPU (the Kaggle 2×T4 notebook). There is no in-browser gradient path.

Four real options, cheapest first:

### Option A — keep the existing override layer in front (recommended, cost: 0)
`itemCategoryHints` and `learnedBrands` already sit in front of `categorizeItem` in `App.tsx`.
Leave them there and let Laya replace only stage 3. A user correction stays instant, exact and
deterministic; Laya never needs to learn it. This is how the current code is already shaped and
it is strictly better than any model-side learning for the "I corrected this exact item" case.

### Option B — few-shot the corrections into the state (cheap, unvalidated)
Laya takes `state` as text or JSON. Prepend the N most recent corrections:

```ts
const state = {
  item: "oat milk",
  user_examples: "almond milk → dairy; soy creamer → dairy; la croix → beverages",
};
```

Budget: English leaves ~320 state tokens after the 15 options, multilingual ~768. That's roughly
30–60 corrections. Zero infrastructure. **Unverified** — this is an encoder with a scoring head,
not an instruction-following LLM, so in-context learning may do nothing. Must be measured, not
assumed.

### Option C — on-device calibration from corrections (the only genuine "teach Laya")
Laya returns a full probability vector per question. Keep a per-category log-odds bias vector in
`localStorage`, fit by online logistic update from each `(itemName, modelProbs, correctedCategory)`
event, and apply it before argmax. ~30 lines of JS, no training infra, and it fixes the systematic
errors ("this user's store puts oat milk in dairy") that per-item hints can't generalize.
It also doubles as the temperature fitting the model card says you must do anyway.

### Option D — offline fine-tune (expensive, probably not worth it)
Export corrections → Kaggle notebook → new checkpoint → re-export ONNX → ship a new model.
Needs corrections leaving the device (privacy change for a grocery app), a training pipeline,
and enough volume — a personal list app will not produce the thousands of labels that moved
`laya-typed-decisions` from 0.362 to 0.766. **Out of scope.**

---

## 4. Recommended plan

Gated. Each phase has an exit condition; do not start the next one until the previous number exists.

### Phase 0 — build the measurement (half a day)
- Expand `src/test/fixtures/categorization-eval.ts` from 60 to ~200 entries. Source them from
  **your own history**, not from imagination: the Google Sheets sync and `item-category-hints` in
  localStorage are real labelled data — every hint is literally `(itemName, userTruth)`.
- Add `src/test/categorization-accuracy.test.ts` that reports accuracy + `other`-rate and
  asserts a floor so it can't regress.
- Exit: a single number for today's algorithm.

### Phase 1 — fix the three bugs (half a day)
- `recognizeBrand`: word-boundary + plural matching; demote to a fallback after keyword matching.
- `categorizeItem`: longest-matching-keyword wins instead of first-category-wins.
- Re-run Phase 0.
- Exit: expect ~58% → ~77%. **If the remaining gap is under ~10 points, stop here** — there is no
  case for a 1.3 GB download.

### Phase 2 — offline spike, no app changes (1–2 days, only if Phase 1 leaves a real gap)
- Export the **multilingual** checkpoint (322M, smaller, and the model card says the English root
  handles ≤512 context — item names are tiny either way): `export_onnx.py --subfolder multilingual`.
- Run the Phase 0 eval set through `laya-ts` **in Node**, one `choice` question with the 15
  `STORE_CATEGORIES` as criteria, descriptions drawn from the existing `keywords` arrays.
- Measure in the same script:
  - zero-shot accuracy vs Phase 1's number;
  - Option B (corrections few-shot in the state) vs zero-shot — this answers the second half of
    your question with data;
  - `onnxruntime` dynamic int8 quantization: size and accuracy delta. **This is the go/no-go
    for shipping** — fp32 at 1.3 GB is not shippable in a grocery PWA.
- Exit: three numbers. Pre-commit the bar now: **ship only if int8 Laya beats Phase 1 by ≥10
  points absolute AND the download is under ~350 MB.**

### Phase 3 — integrate (only if Phase 2 clears the bar)
- Host the exported model as a static asset (do not hotlink HF).
- `src/lib/category-model.ts`. The lazy-load / CacheStorage / prefetch-state pattern to copy is
  in `ocr-model.ts` — **read it before Section 6 deletes it**, or lift the pattern out first.
- Keep `categorizeItem` as the synchronous default. Laya becomes an **async refinement**: the
  item is added instantly with the keyword category, and re-categorized when the model answers.
  Do not make the add path await a model.
- Order of precedence, unchanged from today: `item.category` → `itemCategoryHints` →
  `learnedBrands` → Laya → keywords → `other`.
- Add Option C calibration on Laya's probability vector.
- Add a settings toggle (default **off**) — users on metered connections must be able to decline.

---

## 5. Recommendation

**Do Phases 0 and 1 now; treat Phase 2 as a research spike, not a commitment.**

Laya is a well-documented model with an unusually honest model card, and the browser path is
real. But the specific thing it would be replacing is currently losing ~40% of its accuracy to a
missing `\b` in two regexes, and the model card itself says the base checkpoints are "not a
zero-shot decision engine". Spending a 1.3 GB download and an async rewrite of the add path to
beat a broken baseline is the wrong order of operations. Fix the baseline, then see if there is
anything left worth buying.

---

## 6. Prerequisite cleanup: remove the Florence-2 on-device OCR path

OCR now goes to OpenRouter (`src/lib/ocr-openrouter.ts`). `src/lib/ocr-model.ts` is the old
on-device path. **It is not merely dead code — it is still downloading a model to every client.**

`usePWAState` calls `scheduleOCRModelPrefetch()` unconditionally on mount
(`src/hooks/use-pwa-state.ts:37`), which `requestIdleCallback`s into `loadOCRModel()` and pulls
`onnx-community/Florence-2-base` from the Hugging Face CDN in the background of every session.
Nothing in the scan flow consumes it any more — `UnifiedScanDialog.tsx` imports only
`normalizeOCRTextToLines` from that module and routes the actual image to OpenRouter.

### Tasks

1. **Stop the download first** (one line, ship independently of everything below):
   delete the `scheduleOCRModelPrefetch()` effect in `src/hooks/use-pwa-state.ts:35-38`.
2. **Keep the two pure text helpers**, which have no model dependency and are still used:
   - `normalizeOCRTextToLines` (used by `UnifiedScanDialog.tsx:11`)
   - `getBrandHintsForOCR` (check callers before deciding)

   Move them to `src/lib/ocr-text.ts` and repoint the imports.
3. **Delete `src/lib/ocr-model.ts`** and everything model-bound in it: `OCR_MODE`,
   `loadOCRModel`, `startOCRModelPrefetch`, `scheduleOCRModelPrefetch`, `isModelLoaded`,
   `getOCRPrefetchState`, `setOCRMode`, `getCurrentModelName`, `getActiveOCRMode`,
   `getOCRModes`, and the duplicate `extractGroceryItems`.
4. **Drop `@huggingface/transformers` from `package.json`.** `ocr-model.ts` is its only
   importer, so removal takes the whole dependency with it.
5. **Clean the PWA surface:**
   - Remove the `huggingface.co|cdn-lfs.huggingface.co` → `ocr-model-cache` `runtimeCaching`
     rule in `vite.config.ts:69-82`.
   - **Add a one-time `caches.delete('ocr-model-cache')`** on startup. Without it, every existing
     installed client keeps the already-downloaded weights in CacheStorage forever — removing the
     code does not reclaim the disk space users have already paid for. Guard it with a localStorage
     flag so it runs once.
   - Prune the now-meaningless `ocrReady` / `ocrPrefetchStatus` / `ocrStatusLabel` state from
     `usePWAState`, `App.tsx:136,1065-1067` and `AppHeader.tsx:12-14,40-42,57-67`. The header's
     "ready" badge currently gates on `ocrReady || ocrPrefetchStatus === 'completed'`, so it is
     reporting readiness for a capability that no longer exists.
   - Update the two tests that pass those props (`focus-first-ui.test.tsx`,
     `app-checked-ui-sync.test.tsx`).
6. Check `DiagnosticsPanel.tsx` for any remaining on-device-OCR UI (model picker, prefetch
   status) and remove it.

### Why this belongs in this plan

It is the same question in miniature, already answered once: a several-hundred-megabyte model
shipped to the client, superseded by something better, still costing every user bandwidth and
storage because nothing removed the fetch. Finish this before considering Phase 3, and measure
the actual byte savings on the way out — that number is the honest price tag to compare Laya's
download against.

---

*Skipped: no ONNX export or quantization was actually run — Phase 2's size and accuracy numbers
are projections from the model card and the laya-ts demo's "~1.3 GB", not measurements. The 60-item
eval set is hand-written by me, not from your real list history, so the 58% and 77% figures are
indicative of the bug classes, not a calibrated accuracy for your usage. Risk: `laya-ts` is absent
from npm and its API is young, so a Phase 3 integration would be pinned to a git SHA with no
upgrade path. I did not measure Florence-2-base's actual download size, so Section 6's savings are
stated as "several hundred MB" rather than a figure — measure it from DevTools before and after.*
