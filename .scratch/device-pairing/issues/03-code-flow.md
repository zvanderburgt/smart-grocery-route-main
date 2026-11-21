# 03 — code-flow redirect in google-auth

Blocked by: none

Add redirectToGoogleOAuthCode + handleOAuthCodeRedirect with a mode on the pending record, so the token flow and the pairing flow cannot consume each other's returns.
