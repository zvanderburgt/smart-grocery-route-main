/**
 * OCR relay as a Netlify Function.
 *
 * Why this exists: opencode.ai's chat-completions endpoint sends no CORS
 * headers, so a deployed static PWA cannot call it from the browser. This
 * function is the same-origin hop the app already expects at `/api/opencode/*`
 * (see the redirect in netlify.toml), and it can hold the API key as a Netlify
 * environment variable so the key never reaches the client.
 *
 * Set OPENCODE_API_KEY in Netlify (Site configuration -> Environment variables)
 * and OpenCode OCR works on the deployed site with no key in the app's Settings.
 * If the variable is absent the caller's own Authorization header is forwarded,
 * which keeps the "paste a key in Settings" path working.
 *
 * The app fetches the model catalog straight from opencode.ai (that endpoint is
 * CORS-open); this relay is only used for chat completions.
 */

const UPSTREAM = 'https://opencode.ai/zen/go/v1';

/** Keeps the upstream from being reached with an unexpected verb. */
const ALLOWED_METHODS = new Set(['GET', 'POST']);

export default async function handler(request: Request): Promise<Response> {
  if (!ALLOWED_METHODS.has(request.method)) {
    return new Response(JSON.stringify({ error: { message: 'Method not allowed' } }), {
      status: 405,
      headers: { 'content-type': 'application/json' },
    });
  }

  const incoming = new URL(request.url);
  // netlify.toml rewrites /api/opencode/<rest> here as ?path=<rest>, which
  // survives the rewrite where the original path does not.
  const rest = (incoming.searchParams.get('path') || 'models').replace(/^\/+/, '');

  const target = new URL(`${UPSTREAM}/${rest}`);
  incoming.searchParams.forEach((value, key) => {
    if (key !== 'path') target.searchParams.set(key, value);
  });

  const headers = new Headers();
  const contentType = request.headers.get('content-type');
  if (contentType) headers.set('content-type', contentType);

  // Netlify injects env vars into process.env at runtime. Typed locally because
  // this function is outside the app's tsconfig (no @types/node in the bundle).
  const runtime = globalThis as { process?: { env?: Record<string, string | undefined> } };
  const envKey = runtime.process?.env?.OPENCODE_API_KEY;
  const clientAuth = request.headers.get('authorization');
  if (envKey) headers.set('authorization', `Bearer ${envKey}`);
  else if (clientAuth) headers.set('authorization', clientAuth);

  // The gateway routes on this header and rejects requests without it.
  headers.set('x-opencode-session', request.headers.get('x-opencode-session') || crypto.randomUUID());

  const hasBody = request.method !== 'GET' && request.method !== 'HEAD';

  try {
    const upstream = await fetch(target, {
      method: request.method,
      headers,
      body: hasBody ? await request.text() : undefined,
    });

    // Pass the status through untouched so the app can tell 401/402/429 apart.
    return new Response(upstream.body, {
      status: upstream.status,
      headers: {
        'content-type': upstream.headers.get('content-type') ?? 'application/json',
        'cache-control': 'no-store',
      },
    });
  } catch (cause) {
    return new Response(
      JSON.stringify({
        error: {
          message: `Relay could not reach opencode.ai: ${cause instanceof Error ? cause.message : 'unknown error'}`,
        },
      }),
      { status: 502, headers: { 'content-type': 'application/json' } }
    );
  }
}
