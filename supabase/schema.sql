-- Run this in your Supabase project's SQL editor.
-- Tables mirror the previous SQLite schema.

-- Accounts are identified by phone number (e-mail sign-in was removed).
-- `email` stays nullable for legacy rows; new sign-ups store a synthetic
-- `<digits>@phone.invalid` value only when the column is still NOT NULL.
-- Existing databases:  alter table users alter column email drop not null;
create table if not exists users (
  id text primary key,
  email text unique,
  password_hash text not null,
  name text not null default '',
  phone text not null default '',
  country text not null default 'IQ',
  reset_code text,
  reset_expires timestamptz,
  created_at timestamptz not null
);

create table if not exists sessions (
  token text primary key,
  user_id text not null references users(id) on delete cascade,
  created_at timestamptz not null
);

create table if not exists memorials (
  id text primary key,
  user_id text not null references users(id) on delete cascade,
  slug text unique not null,
  status text not null default 'draft',
  name text not null default '',
  gender text not null default '',
  birth_year text not null default '',
  death_year text not null default '',
  age text not null default '',
  city text not null default '',
  country text not null default 'IQ',
  school text not null default '',
  university text not null default '',
  job text not null default '',
  marital text not null default '',
  children text not null default '',
  hobbies text not null default '',
  achievements text not null default '',
  quote text not null default '',
  memories text not null default '',
  story text not null default '',
  story_lang text not null default '',
  photos text not null default '[]',
  videos text not null default '[]',
  created_at timestamptz not null
);

create table if not exists orders (
  id text primary key,
  memorial_id text not null references memorials(id) on delete cascade,
  user_id text not null references users(id) on delete cascade,
  contact_name text not null,
  phone text not null,
  address text not null,
  city text not null,
  country text not null,
  payment_method text not null,
  amount double precision not null,
  currency text not null,
  status text not null default 'pending',
  created_at timestamptz not null,
  -- Gateway payment reference of the online payment (ZainCash transaction id
  -- or Qi Card paymentId), used to reconcile the return URL / webhook
  -- against the gateway's own status API.
  payment_ref text
);

-- Existing databases: add the gateway reference column (idempotent).
alter table orders add column if not exists payment_ref text;

-- Storage bucket for uploads (run once). The app also tries to create it.
-- 100 MB file limit matches MAX_UPLOAD in src/lib/actions.ts.
insert into storage.buckets (id, name, public, file_size_limit)
values ('uploads', 'uploads', true, 104857600)
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- Persistent rate limiter (src/lib/ratelimit.ts).
--
-- Without this table the limiter falls back to a per-instance in-memory
-- window that resets on every cold start and is not shared across Vercel's
-- serverless instances. Safe to re-run (idempotent).
-- ---------------------------------------------------------------------------

create table if not exists rate_limits (
  key text primary key,
  hits timestamptz[] not null default '{}',
  updated_at timestamptz not null default now()
);

-- Appends the current hit to the stored window (dropping entries older than
-- p_window_ms) and returns true when the caller is already at p_max — i.e.
-- blocked. Row-level lock on the key serialises concurrent requests, so two
-- parallel attempts from the same IP cannot both slip past the cap.
-- SECURITY DEFINER + execute granted to the service role only: browsers hold
-- no key that can reach this function.
create or replace function rate_limit_hit(p_key text, p_max integer, p_window_ms bigint)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_cutoff timestamptz := now() - make_interval(secs => (p_window_ms / 1000.0)::double precision);
  v_hits timestamptz[];
begin
  insert into rate_limits (key, hits, updated_at)
  values (p_key, '{}', now())
  on conflict (key) do nothing;

  select l.hits into v_hits
  from rate_limits l
  where l.key = p_key
  for update;

  select array_agg(h order by h) into v_hits
  from unnest(coalesce(v_hits, '{}'::timestamptz[])) h
  where h > v_cutoff;

  if coalesce(array_length(v_hits, 1), 0) >= p_max then
    -- Over the cap: store the cleaned window and report blocked without
    -- recording yet another hit.
    update rate_limits
    set hits = coalesce(v_hits, '{}'), updated_at = now()
    where key = p_key;
    return true;
  end if;

  update rate_limits
  set hits = array_append(coalesce(v_hits, '{}'::timestamptz[]), now()),
      updated_at = now()
  where key = p_key;

  -- Opportunistic cleanup: abandoned keys older than a day are dropped so
  -- the table stays tiny.
  if random() < 0.01 then
    delete from rate_limits where updated_at < now() - interval '1 day';
  end if;

  return false;
end;
$$;

revoke all on function rate_limit_hit(text, integer, bigint) from public, anon, authenticated;
grant execute on function rate_limit_hit(text, integer, bigint) to service_role;

-- ---------------------------------------------------------------------------
-- Optional hardening — not required by the app.
--
-- The tables above have no row-level security, so any key that reaches
-- PostgREST can read/write them. This app is server-only (src/lib/db.ts is
-- never bundled for the browser), so enabling RLS with zero policies locks
-- anon/authenticated out completely while the service role keeps working.
-- Only run this if you are sure no client-side code uses the anon key:
--
--   alter table users enable row level security;
--   alter table sessions enable row level security;
--   alter table memorials enable row level security;
--   alter table orders enable row level security;
--   alter table rate_limits enable row level security;
-- ---------------------------------------------------------------------------
