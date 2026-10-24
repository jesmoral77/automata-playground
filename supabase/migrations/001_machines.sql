-- Saved machines. Anonymous for now: the creator gets a secret edit token
-- (only its SHA-256 hash is stored). owner_id is reserved for when user
-- accounts are added; it will reference Supabase Auth users.

create table if not exists public.machines (
  id               text primary key,
  name             text not null default 'Untitled',
  type             text not null check (type in ('DFA', 'NFA')),
  definition       jsonb not null,
  edit_token_hash  text,
  owner_id         uuid references auth.users (id) on delete set null,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create index if not exists machines_owner_id_idx on public.machines (owner_id);

-- Row Level Security is on with no policies, so the public (anon) key can't
-- read or write anything directly. All access goes through the app's API
-- routes, which use the server-only secret key. When accounts are added,
-- policies like "owner_id = auth.uid()" can be added here.
alter table public.machines enable row level security;
