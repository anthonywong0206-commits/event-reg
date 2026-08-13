# Invite code one-time page access fix

- Private-registration pages no longer use persistent invite-access cookies.
- Every fresh visit or reload of a private registration page requires the invite code again.
- Correct invite codes return a short-lived signed token kept only in the current page component state.
- Registration submission sends that signed token in the `X-Event-Invite-Access` header and the server verifies it against the event's current invite-code hash.
- Incorrect invite codes never produce a token and cannot unlock the form.
- Invite-code changes immediately invalidate tokens signed against the previous code.
- Existing public/private event settings and database schema are unchanged.
