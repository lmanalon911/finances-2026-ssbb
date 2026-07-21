-- Run this once in Supabase → SQL Editor → New query → Run.
-- Seven tables, each a simple id + JSON document. The app handles the shape.

create table if not exists obligations (id text primary key, data jsonb not null, updated_at timestamptz default now());
create table if not exists cards       (id text primary key, data jsonb not null, updated_at timestamptz default now());
create table if not exists income      (id text primary key, data jsonb not null, updated_at timestamptz default now());
create table if not exists payments    (id text primary key, data jsonb not null, updated_at timestamptz default now());
create table if not exists todos       (id text primary key, data jsonb not null, updated_at timestamptz default now());
create table if not exists changelog   (id text primary key, data jsonb not null, updated_at timestamptz default now());
create table if not exists settings    (id text primary key, data jsonb not null, updated_at timestamptz default now());

-- Row level security on, with a policy that lets the anon key read and write.
-- The anon key is never committed to the repository — it is pasted into each
-- phone once, in Settings, and stored only in that phone's browser.
do $$
declare t text;
begin
  foreach t in array array['obligations','cards','income','payments','todos','changelog','settings']
  loop
    execute format('alter table %I enable row level security', t);
    execute format('drop policy if exists household_access on %I', t);
    execute format('create policy household_access on %I for all to anon using (true) with check (true)', t);
  end loop;
end $$;
