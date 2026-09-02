-- ISOLATED CUTOVER PROPOSAL ONLY. Apply only after every active image upload
-- caller uses the verified account-auth /uploads route and rollback is ready.
-- Public reads remain unchanged so all existing image URLs keep working.
BEGIN;
DROP POLICY IF EXISTS "Allow Public Uploads" ON storage.objects;
DROP POLICY IF EXISTS "Anyone can upload an avatar." ON storage.objects;
DROP POLICY IF EXISTS "Anyone can update their own avatar." ON storage.objects;
DROP POLICY IF EXISTS "Anyone can delete their own avatar." ON storage.objects;
REVOKE INSERT, UPDATE, DELETE ON storage.objects FROM PUBLIC, anon, authenticated;
-- account-auth uploads through the server-only service role. No browser role
-- receives a replacement write policy and no existing object is changed.
COMMIT;
