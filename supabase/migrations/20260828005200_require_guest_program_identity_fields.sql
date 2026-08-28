-- Keep stored program settings consistent with the application rule:
-- guest name, school, phone, birth and privacy consent are always required.
UPDATE public.notices
SET guest_properties = COALESCE(guest_properties, '{}'::jsonb)
    || '{"require_school": true, "require_phone": true}'::jsonb
WHERE guest_properties IS NOT NULL
  AND (
      guest_properties->>'require_school' IS DISTINCT FROM 'true'
      OR guest_properties->>'require_phone' IS DISTINCT FROM 'true'
  );
