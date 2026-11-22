/**
 * One-time helper that mints the refresh token the relay needs.
 *
 * Open https://<site>/api/relay-setup in a normal browser, sign in with the
 * Google account that owns the grocery sheet, approve, and this page prints a
 * refresh token. Paste it into Netlify as GOOGLE_REFRESH_TOKEN, along with
 * GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET and SHEET_ID, then redeploy.
 *
 * Prerequisites: the OAuth client needs `https://<site>/api/relay-setup` in
 * Authorized redirect URIs (Google Console -> Credentials -> the web client).
 *
 * The page is public on purpose — it only ever shows the token to whoever
 * completes the consent flow, and no consent means no token.
 */

export const config = { path: '/api/relay-setup' };

const AUTH_ENDPOINT = 'https://accounts.google.com/o/oauth2/v2/auth';
const TOKEN_ENDPOINT = 'https://oauth2.googleapis.com/token';
const SCOPE = 'https://www.googleapis.com/auth/spreadsheets';

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function page(title: string, body: string, status = 200): Response {
  return new Response(
    `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escapeHtml(title)}</title>
<style>
 :root{color-scheme:dark}
 body{margin:0;padding:32px;font:16px/1.55 ui-sans-serif,system-ui,-apple-system,sans-serif;background:#0b0b0d;color:#e7e7ea}
 main{max-width:720px;margin:0 auto}
 h1{font-size:20px;margin:0 0 16px}
 p{color:#a7a7b0}
 code,pre{font-family:ui-monospace,SFMono-Regular,Menlo,monospace}
 pre{background:#141418;border:1px solid #26262d;border-radius:10px;padding:16px;overflow-wrap:anywhere;white-space:pre-wrap;color:#9ae6b4}
 .warn{background:#2a1d10;border-color:#5a3f1d;color:#f6c177}
 ol{padding-left:20px}
</style></head><body><main>${body}</main></body></html>`,
    { status, headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' } }
  );
}

export default async function handler(request: Request): Promise<Response> {
  const url = new URL(request.url);
  // Netlify injects env vars into process.env at runtime. Typed locally because
  // tsconfig includes only src/ and has no node types.
  const runtime = globalThis as { process?: { env?: Record<string, string | undefined> } };
  const clientId = (runtime.process?.env?.GOOGLE_CLIENT_ID || '').trim();
  const clientSecret = (runtime.process?.env?.GOOGLE_CLIENT_SECRET || '').trim();

  if (!clientId || !clientSecret) {
    return page(
      'Relay not configured',
      `<h1>Relay not configured</h1>
       <p>Set <code>GOOGLE_CLIENT_ID</code> and <code>GOOGLE_CLIENT_SECRET</code> in Netlify first,
       then reload this page.</p>`,
      503
    );
  }

  const redirectUri = `${url.origin}/api/relay-setup`;
  const code = url.searchParams.get('code');
  const oauthError = url.searchParams.get('error');

  if (oauthError) {
    return page(
      'Google said no',
      `<h1>Google said no</h1><p><code>${escapeHtml(oauthError)}</code></p>
       <p>Try again from <a href="${escapeHtml(redirectUri)}">${escapeHtml(redirectUri)}</a>.</p>`,
      400
    );
  }

  // Step 1 — nothing to show yet: send the user to Google with offline access.
  if (!code) {
    const authorize = new URL(AUTH_ENDPOINT);
    authorize.searchParams.set('client_id', clientId);
    authorize.searchParams.set('redirect_uri', redirectUri);
    authorize.searchParams.set('response_type', 'code');
    authorize.searchParams.set('scope', SCOPE);
    authorize.searchParams.set('access_type', 'offline');
    // Without prompt=consent Google only returns a refresh token the first time
    // an account approves the app; a repeat run would otherwise look successful
    // and hand back nothing to paste.
    authorize.searchParams.set('prompt', 'consent');
    return Response.redirect(authorize.toString(), 302);
  }

  // Step 2 — Google redirected back with a code: trade it for a refresh token.
  const form = new URLSearchParams({
    code,
    client_id: clientId,
    client_secret: clientSecret,
    redirect_uri: redirectUri,
    grant_type: 'authorization_code',
  });

  const response = await fetch(TOKEN_ENDPOINT, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: form.toString(),
  });
  const body = (await response.json()) as {
    refresh_token?: string;
    access_token?: string;
    error?: string;
    error_description?: string;
  };

  if (!response.ok || !body.refresh_token) {
    return page(
      'Token exchange failed',
      `<h1>Token exchange failed</h1>
       <p><code>${escapeHtml(body.error_description || body.error || `HTTP ${response.status}`)}</code></p>
       <p>If this says <code>redirect_uri_mismatch</code>, add
       <code>${escapeHtml(redirectUri)}</code> to Authorized redirect URIs in the Google Cloud Console.</p>
       <p>If no refresh token came back, revoke the app at
       <code>myaccount.google.com/permissions</code> and run this page again.</p>`,
      400
    );
  }

  return page(
    'Breadcrumb relay token',
    `<h1>Refresh token minted</h1>
     <p>Copy this into Netlify → Site configuration → Environment variables as
     <code>GOOGLE_REFRESH_TOKEN</code>, then redeploy.</p>
     <pre>${escapeHtml(body.refresh_token)}</pre>
     <p class="warn" style="padding:12px;border:1px solid;border-radius:10px">Treat it like a password: it grants
     access to this Google account's spreadsheets until you revoke it.</p>
     <ol>
       <li><code>GOOGLE_CLIENT_ID</code> — the same client id the app already uses</li>
       <li><code>GOOGLE_CLIENT_SECRET</code> — from the Google Console credentials page</li>
       <li><code>GOOGLE_REFRESH_TOKEN</code> — the value above</li>
       <li><code>SHEET_ID</code> — the spreadsheet the relay may touch, from its URL</li>
     </ol>
     <p>Check it worked at <a href="/api/sheets-relay/health">/api/sheets-relay/health</a>.</p>`
  );
}
