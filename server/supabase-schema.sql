-- Memory Lane's Supabase schema — run this once in the SQL editor
-- (Dashboard → SQL Editor → New query → Run). The server checks for these
-- tables at boot and tells you if they are missing.
--
-- The photos bucket is created automatically by the server on first start.

-- One row per person: their entire store, exactly the JSON document the app
-- has always kept in db.json.
create table if not exists documents (
  user_id    uuid primary key references auth.users (id) on delete cascade,
  data       jsonb not null,
  updated_at timestamptz not null default now()
);

-- Login sessions created by the app itself (a random token, 30 days).
create table if not exists sessions (
  token      text primary key,
  user_id    uuid not null references auth.users (id) on delete cascade,
  email      text not null default '',
  expires_at timestamptz not null
);

create index if not exists sessions_user_id_idx on sessions (user_id);

-- Row level security with no policies: the anon and authenticated keys can
-- touch nothing here. Only the server, which holds the service role key
-- (which bypasses RLS), reads or writes these tables.
alter table documents enable row level security;
alter table sessions enable row level security;
