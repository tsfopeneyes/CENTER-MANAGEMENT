-- Source: user-supplied September 2026 HAIFN duty image (초안 v2), confirmed for implementation.
-- Only add missing dates. Re-running must never overwrite later corrections.
BEGIN;
WITH roster(duty_date, staff_name) AS (VALUES
    ('2026-09-01'::date, 'Ethan'),
    ('2026-09-02'::date, 'Peter'),
    ('2026-09-03'::date, 'May'),
    ('2026-09-04'::date, 'Jin'),
    ('2026-09-07'::date, 'Sunny'),
    ('2026-09-08'::date, 'Peter'),
    ('2026-09-09'::date, 'Ethan'),
    ('2026-09-10'::date, 'May'),
    ('2026-09-11'::date, 'Buddy'),
    ('2026-09-14'::date, 'Salty'),
    ('2026-09-15'::date, 'Rok'),
    ('2026-09-16'::date, 'Buddy'),
    ('2026-09-17'::date, 'Jin'),
    ('2026-09-18'::date, 'Zoe'),
    ('2026-09-21'::date, 'Lucy'),
    ('2026-09-22'::date, 'Sol'),
    ('2026-09-23'::date, 'Zzang'),
    ('2026-09-28'::date, 'Zzang'),
    ('2026-09-29'::date, 'Sol'),
    ('2026-09-30'::date, 'Rok')
)
INSERT INTO public.center_duty_assignments (center_code, duty_date, staff_name, staff_id)
SELECT 'HAIFN', r.duty_date, r.staff_name,
    (SELECT CASE WHEN count(*) = 1 THEN (array_agg(u.id))[1] ELSE NULL END
     FROM public.users u WHERE lower(btrim(u.name)) = lower(r.staff_name)
       AND (u.role = 'admin' OR u.user_group IN ('STAFF', '관리자')))
FROM roster r
ON CONFLICT (center_code, duty_date) DO NOTHING;
INSERT INTO public.center_duty_assignments (center_code, duty_date, duty_status, label)
VALUES ('HAIFN', '2026-09-24', 'OFF', '추석연휴'), ('HAIFN', '2026-09-25', 'OFF', '추석연휴')
ON CONFLICT (center_code, duty_date) DO NOTHING;
COMMIT;
