# Notification server rollout

This function is prepared locally only. It is not active in the web app until
`VITE_SERVER_INTEGRATIONS_ENABLED=true` is set during a Firebase build.

## Safe rollout order

1. Deploy `dispatch-notification` to the existing Supabase project.
2. In Supabase Edge Function secrets, add the existing integration values:
   - `DISCORD_WEBHOOK_URL`
   - `GOOGLE_SHEETS_WEBHOOK_URL`
   - `LINE_HAIFN_PROXY_URL`
   - `LINE_ENOUGH_PROXY_URL`
3. Test one check-in and one check-out while the web app still has the feature
   flag turned off. The current notification route remains the fallback.
4. Set `VITE_SERVER_INTEGRATIONS_ENABLED=true` in the Firebase build secret and
   deploy the web app.
5. Repeat the four checks: kiosk check-in, kiosk check-out, student check-in,
   and guest mobile check-out.
6. Only after those checks succeed, move the sensitive rows out of
   `global_settings` and enable its RLS policy.

The flag must stay off if any function secret is missing. This prevents a
security rollout from interrupting center operations.
