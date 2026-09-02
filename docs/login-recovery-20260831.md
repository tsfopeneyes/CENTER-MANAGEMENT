# Login recovery — 2026-08-31

User approved production application after Jin could not log in following the reviewed duplicate Auth consolidation.

## Evidence and scope

- Read-only check: Jin's linked Auth exists, is not banned, and its email matches the legacy phone-derived login address.
- The public profile's stored password representation does not verify against the surviving Auth password. This does **not** prove that the entered raw password is wrong; raw versus hashed legacy representations differ.
- The former production client attempted the hash only in its verified-profile login path. The updated client tries the hash and then the entered password and accepts only the server-selected Auth ID.
- No password reset, account deletion, data migration, schema change, or test push is part of this release.
- Existing Auth users remain eligible for identity resolution even when temporary membership flags exist. Only new identity provisioning is blocked for visitor/temporary profiles. This avoids introducing a new login lockout through classification.
- Production dispatch-notification source was downloaded into ignored `scratch/login-release-baseline` before release. Comparison confirmed runtime changes limited to authentication linking; other changes are type annotations.

## Verification

- `node scripts/test-auth-link-integrity.mjs`: pass, including raw password fallback, exact identity check, failed login cleanup, and preservation of existing temporary-profile Auth.
- `node scripts/test-account-merge-safety.mjs`: pass.
- `node scripts/test-student-card-calendar.mjs`: pass.
- Deno check of dispatch-notification: pass.
- Local development page localhost:5173: HTTP 200.
- Updated dispatch-notification deployed successfully. Invalid login input returned the expected HTTP 400 without accessing an account or sending notifications.
- Firebase Hosting deployment completed successfully (build 1m21s; legacy-auth bundle guard passed). Official custom domain and Firebase domain both serve the exact verified local index and JS bundle: `assets/index.BPZZuwo6.js`. Verified with `scripts/verify-login-release.mjs` using SHA256 comparisons.

Actual Jin credential login must be confirmed by the user through the normal login form. No user password was requested in chat or reset. Do not claim full end-to-end recovery until that test succeeds.
