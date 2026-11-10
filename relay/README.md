# OCR relay (OpenCode)

Breadcrumb can run vision OCR through either OpenRouter (default, direct from the
browser) or OpenCode. OpenCode needs this relay for one unavoidable reason:

`https://opencode.ai/zen/go/v1/chat/completions` returns **no CORS headers** and
requires an `x-opencode-session` header. A browser cannot read that response, so
a static PWA must talk to something same-origin or CORS-aware that forwards the
request. That is what this Worker does — it also holds your API key, so the key
never ships to the client.

```
browser ──POST /chat/completions──▶ relay ──▶ opencode.ai/zen/go/v1
                                    │
                                    └─ adds Authorization + x-opencode-session,
                                       answers the OPTIONS preflight
```

## Local development (no deploy needed)

`vite.config.ts` already proxies `/api/opencode` to the gateway, so `npm run dev`
works out of the box:

1. Put your key in `.env.local` (git-ignored):

   ```
   OPENCODE_GO_API_KEY=your-opencode-go-key
   ```

2. `npm run dev`, open Settings → OCR Settings → **OpenCode**. The endpoint
   defaults to `/api/opencode`; leave it as-is.

The key is injected by the dev server, so leave the API key field blank too.

## Deployed (Cloudflare Workers)

```bash
npm create cloudflare@latest breadcrumb-ocr-relay -- --type=hello-world
# replace the generated entry file with relay/opencode-ocr-worker.js
npx wrangler secret put OPENCODE_API_KEY
npx wrangler deploy
```

Point Breadcrumb's OpenCode **Endpoint** at the deployed URL
(`https://breadcrumb-ocr-relay.<account>.workers.dev`) and leave the API key
field empty.

Optional: set `ALLOWED_ORIGIN` to your app's origin so the relay is not open to
the whole internet.

Any host that can run a fetch handler works the same way (Vercel Edge Function,
Netlify Function, Deno Deploy) — the Worker file is ~80 lines and has no
dependencies beyond `fetch`.

## Notes

- The gateway expects traffic that looks like a coding agent and monitors for
  abuse of the shared Go plan. OCR scans are small (one image, a few hundred
  tokens), but this is not the traffic the plan is sold for — if scans start
  failing with 403s, that is the likely cause.
- Model discovery (`GET /models`) is CORS-open, so the app lists models directly
  from opencode.ai and only routes the actual OCR call through the relay.
