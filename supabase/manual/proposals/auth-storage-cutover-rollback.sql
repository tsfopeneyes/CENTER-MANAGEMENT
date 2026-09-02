-- EMERGENCY ROLLBACK for auth-storage-cutover.sql only. This restores the
-- reviewed 2026-08-31 policy/grant shape; it does not touch stored objects.
BEGIN;
GRANT INSERT, UPDATE, DELETE ON storage.objects TO anon;
GRANT UPDATE ON storage.objects TO authenticated;
CREATE POLICY "Allow Public Uploads" ON storage.objects FOR INSERT TO public
    WITH CHECK (bucket_id = 'notice-images'::text);
CREATE POLICY "Anyone can upload an avatar." ON storage.objects FOR INSERT TO public
    WITH CHECK (bucket_id = 'avatars'::text);
CREATE POLICY "Anyone can update their own avatar." ON storage.objects FOR UPDATE TO public
    USING (bucket_id = 'avatars'::text);
CREATE POLICY "Anyone can delete their own avatar." ON storage.objects FOR DELETE TO public
    USING (bucket_id = 'avatars'::text);
COMMIT;
