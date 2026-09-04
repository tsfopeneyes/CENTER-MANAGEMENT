# Haifn rotating kiosk QR

The legacy `checkin?loc=HAIFN` QR is permanently disabled. Haifn check-in
always requires a short-lived QR token issued by an active kiosk.

Roll out in this order so check-in is never interrupted:

1. Apply `20260828004000_add_kiosk_devices.sql`.
2. Configure `KIOSK_SETUP_PIN` and `KIOSK_QR_SIGNING_SECRET` as Edge Function secrets.
3. Deploy the `kiosk-qr` Edge Function with JWT verification disabled.
4. Verify kiosk activation, QR rotation, member/guest check-in, and checkout using a staging build.
5. Deploy the production frontend.

Enough Place continues to use its existing fixed QR.
