# Haifn rotating kiosk QR

The legacy `checkin?loc=HAIFN` QR remains active while
`VITE_HAIFN_ROTATING_QR_ENABLED` is unset or `false`.

Roll out in this order so check-in is never interrupted:

1. Apply `20260828004000_add_kiosk_devices.sql`.
2. Configure `KIOSK_SETUP_PIN` and `KIOSK_QR_SIGNING_SECRET` as Edge Function secrets.
3. Deploy the `kiosk-qr` Edge Function with JWT verification disabled.
4. Verify kiosk activation, QR rotation, member/guest check-in, and checkout using a staging build with `VITE_HAIFN_ROTATING_QR_ENABLED=true`.
5. Set `VITE_HAIFN_ROTATING_QR_ENABLED=true` in the production frontend and deploy it.

Only step 5 hides the legacy Haifn QR and starts requiring the rotating QR.
Enough Place continues to use its existing fixed QR.
