-- PUBLIC privileges are inherited by anon/authenticated, so revoke the
-- inherited write surface as well. Existing objects and public reads remain.
REVOKE INSERT, UPDATE, DELETE ON storage.objects FROM PUBLIC, anon, authenticated;
