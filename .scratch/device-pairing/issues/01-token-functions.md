# 01 — token exchange functions

Blocked by: none

Add netlify/functions/oauth-pair.mts (auth code -> refresh token, mint 8-char code in Blobs, 10 min), oauth-claim.mts (redeem once, delete), oauth-token.mts (refresh -> access token). Stateless except the code store; client secret stays server-side.
