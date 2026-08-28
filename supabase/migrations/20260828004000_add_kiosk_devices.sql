create table if not exists public.kiosk_devices (
    id uuid primary key default gen_random_uuid(),
    location_id text not null references public.locations(id) on delete cascade,
    device_secret_hash text not null,
    display_name text,
    is_active boolean not null default true,
    created_at timestamptz not null default now(),
    last_seen_at timestamptz
);

create index if not exists kiosk_devices_location_id_idx
    on public.kiosk_devices(location_id);

alter table public.kiosk_devices enable row level security;

comment on table public.kiosk_devices is
    'Server-managed kiosk credentials. Browser device secrets are stored only as SHA-256 hashes.';

create table if not exists public.kiosk_activation_attempts (
    client_fingerprint text primary key check (length(client_fingerprint) = 64),
    attempt_count integer not null default 0 check (attempt_count >= 0),
    window_started_at timestamptz not null default now(),
    blocked_until timestamptz,
    updated_at timestamptz not null default now()
);

alter table public.kiosk_activation_attempts enable row level security;

comment on table public.kiosk_activation_attempts is
    'Service-only rate limit records for kiosk activation. Stores a keyed hash, never a raw IP address.';
