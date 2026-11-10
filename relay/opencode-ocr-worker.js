/**
 * Breadcrumb OCR relay — OpenCode edition.
 *
 * Why this exists: opencode.ai's chat-completions endpoint returns no
 * Access-Control-Allow-Origin header, and it rejects requests that are missing
 * an `x-opencode-session` header. A static PWA can therefore never call it from
 * the browser. This Worker sits in between:
 *
 *   browser  ->  POST /chat/completions  ->  Worker  ->  opencode.ai/zen/go/v1
 *
 * It adds the bearer token (kept as a Worker secret, so it never ships to the
 * client), forwards or mints the session header, and answers the CORS
 * preflight the gateway refuses to answer.
 *
 * Deploy (Cloudflare Workers, free tier):
 *   npm create cloudflare@latest breadcrumb-ocr-relay -- --type=hello-world
 *   # replace src/index.js with this file (wrangler.toml can stay minimal)
 *   npx wrangler secret put OPENCODE_API_KEY     # paste your OpenCode Go key
 *   npx wrangler deploy
 *
 * Then in Breadcrumb -> Settings -> OCR Settings -> OpenCode, set Endpoint to
 * the deployed URL, e.g. https://breadcrumb-ocr-relay.<account>.workers.dev
 * Leave the API key field blank: the Worker holds it.
 *
 * Optional vars (wrangler.toml [vars] or dashboard):
 *   ALLOWED_ORIGIN — lock the relay to your app's origin instead of "*".
 */

const UPSTREAM = 'https://opencode.ai/zen/go/v1';

function corsHeaders(origin) {
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-opencode-session',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  };
}

export default {
  async fetch(request, env) {
    const origin = env.ALLOWED_ORIGIN || '*';

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders(origin) });
    }

    if (request.method !== 'POST' && request.method !== 'GET') {
      return new Response('Method not allowed', { status: 405, headers: corsHeaders(origin) });
    }

    const url = new URL(request.url);
    // Keep the path the client used (/chat/completions, /models, ...).
    const upstreamUrl = `${UPSTREAM}${url.pathname}${url.search}`;

    const headers = new Headers();
    const contentType = request.headers.get('content-type');
    if (contentType) headers.set('Content-Type', contentType);

    const apiKey = env.OPENCODE_API_KEY;
    const clientAuth = request.headers.get('authorization');
    if (clientAuth) {
      headers.set('Authorization', clientAuth);
    } else if (apiKey) {
      headers.set('Authorization', `Bearer ${apiKey}`);
    }

    // The gateway routes on this header and rejects requests without it. Prefer
    // the client's stable session id, and mint one if a caller omits it.
    const session = request.headers.get('x-opencode-session') || crypto.randomUUID();
    headers.set('x-opencode-session', session);

    const upstream = await fetch(upstreamUrl, {
      method: request.method,
      headers,
      body: request.method === 'POST' ? await request.text() : undefined,
    });

    const response = new Response(upstream.body, upstream);
    for (const [key, value] of Object.entries(corsHeaders(origin))) {
      response.headers.set(key, value);
    }
    response.headers.set('x-opencode-session', session);

    return response;
  },
};
