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

1. Bookmark any page, edit it, and set the URL to the snippet below (paste works
   in the bookmark editor; Chrome only strips `javascript:` in the omnibox).
2. Open the old address, wait for the app to render.
3. Tap the bookmark. The backup text lands on the clipboard (a prompt appears if
   the clipboard is blocked).
4. Open the new address → ⚙️ → **Backup & Restore** → **Restore From Backup** →
   paste → **Restore**.

```js
javascript:(()=>{const skip=/token|api[-_]key|paired|oauth|device-id|password|secret/i;const data={};for(let i=0;i<localStorage.length;i++){const k=localStorage.key(i);if(skip.test(k))continue;data[k]=localStorage.getItem(k);}const text=JSON.stringify({format:'breadcrumb-backup',version:1,createdAt:Date.now(),app:'Breadcrumb',data});const done=()=>alert('Backup copied ('+Math.round(text.length/1024)+' KB). Paste it into Restore on the new app.');if(navigator.clipboard&&navigator.clipboard.writeText){navigator.clipboard.writeText(text).then(done,()=>prompt('Copy this backup text:',text));}else{prompt('Copy this backup text:',text);}})()
```

Why values are still strings: the snippet copies raw `localStorage` values
instead of parsed ones, so keys the app no longer knows about survive. The
restore parser accepts both shapes and drops anything not in the backup key
list — credentials included, which is also why they are skipped here.

## If the old address no longer loads at all

The old origin's storage is unreachable from outside that origin. The remaining
options are DevTools over USB (`chrome://inspect` against the phone's Chrome,
then read `localStorage` from the console) or letting the list come back from
Google Sheets and re-entering the training.
