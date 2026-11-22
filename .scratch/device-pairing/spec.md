# Device pairing for sync (branch `feat/device-pairing`)

## Why

Google sign-in only works in a real browser tab. Inside a WebView (the View
Assist tablet) the consent screen is handed to the system browser, so the token
lands in a different storage area and the tablet never becomes signed in. The
relay experiment solved that by moving the credential server-side, but it also
took away per-user sheet ids and put one shared credential in front of everyone.

Pairing keeps the credential on the user's own devices and keeps per-user sheets:

1. On a phone/desktop the app signs in with Google exactly as it does today.
2. Tapping **Pair a device** starts the authorization-code flow (offline access),
   the code goes to a Netlify function that adds the client secret, and the
   function mints a short one-time pairing code.
3. On the tablet the user types that code. It is redeemed once for the user's
   own refresh token, which is stored on the tablet. From then on the tablet
   refreshes access tokens through a stateless function and syncs directly to
   Sheets with the user's own credentials and own sheet id.

The server stores no credentials except the app's own client secret, and the
pairing code lives in Blobs for 10 minutes and is deleted on first use.

## Acceptance criteria

- Unpaired users see exactly today's behaviour: Google sign-in, own sheet id.
- A paired device syncs with no Google sign-in and no navigation to Google.
- Each user's refresh token and sheet id stay theirs; nothing is shared.
- The pairing code is one-time, expires in 10 minutes, and is unusable twice.
- A dead refresh token (Google expires them after 7 days while the OAuth app is
  in Testing) surfaces as "pair again", not as a silent sync failure.
- `npx vitest run` and `npx tsc --noEmit` stay green.

## Out of scope

QR codes (dropped by request), publishing the OAuth app, multi-user accounts on
one device.
