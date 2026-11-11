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
  -- ZainCash: gateway transaction id of the online payment, used to
  -- reconcile the return URL / webhook against the inquiry API.
  payment_ref text
);

-- Existing databases: add the ZainCash column (idempotent).
alter table orders add column if not exists payment_ref text;

-- Storage bucket for uploads (run once). The app also tries to create it.
-- 100 MB file limit matches MAX_UPLOAD in src/lib/actions.ts.
insert into storage.buckets (id, name, public, file_size_limit)
values ('uploads', 'uploads', true, 104857600)
on conflict (id) do nothing;
