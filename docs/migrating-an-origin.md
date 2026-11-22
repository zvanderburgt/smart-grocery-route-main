# Moving data out of an old address

The app keeps everything in `localStorage`, which is scoped to one origin. Change
the address the app is served from — rename the Netlify site, add a domain, move
to a new phone — and the new address starts empty. The list, the trained brands,
the barcode catalog, the shopping trips and the section layout are all still in
the old origin, and no server call can reach them.

Two ways across, depending on whether the old address still loads.

## A. The old address still loads, and the current build is deployed there

Settings (⚙️) → **Backup & Restore** → **Export Backup**, then open the new
address → same section → **Restore From Backup** → paste the file. Done.

## B. The old address loads an older build (no Backup & Restore section)

The old build cannot be updated from here, so run this bookmarklet *on the old
origin* to scrape its `localStorage` into the same backup format the new install
restores from.

1. Bookmark any page, edit it, and set the URL to the snippet below (type
   `javascript:` by hand — Chrome can strip the scheme when it is pasted — then
   paste the rest).
2. Open the old address in the browser (not the home-screen icon), wait for the
   app to render.
3. Tap the bookmark. It downloads `breadcrumb-backup.json` and tells you the
   size in the alert.
4. Open the new address → ⚙️ → **Backup & Restore** → **Restore From Backup** →
   **Choose backup file** → pick the download.

```js
(()=>{const K=['grocery-items','item-relationships','shopping-trips','recipe-favorites','learned-brands','learned-barcodes','item-category-hints','section-custom-names','section-order','collapsed-sections','show-learning-tip','show-suggestions','show-confidence-indicators','google-sheets-config','google-sheets-pending-deletions','google-sheets-dirty'];const d={};K.forEach(k=>{const v=localStorage.getItem(k);if(v!==null)d[k]=v});const t=JSON.stringify({format:'breadcrumb-backup',version:1,createdAt:Date.now(),app:'Breadcrumb',data:d});const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([t],{type:'application/json'}));a.download='breadcrumb-backup.json';a.click();alert('Backup saved: '+Math.round(t.length/1024)+' KB. Restore it from the file in the new app.')})()
```

**Take only the app's own keys, not the whole storage.** An earlier version
swept every key and produced a multi-megabyte file — mostly the cached model
catalogues, which the restore drops anyway — and pasting that into a phone
locked the tab. The restore parser accepts the wide snapshot too, and now keeps
the pasted text out of the DOM, but the file above is a few KB instead of
megabytes, which is the difference between working and not on a phone.

## If the old address no longer loads at all

The old origin's storage is unreachable from outside that origin. The remaining
options are DevTools over USB (`chrome://inspect` against the phone's Chrome,
then read `localStorage` from the console) or letting the list come back from
Google Sheets and re-entering the training.
