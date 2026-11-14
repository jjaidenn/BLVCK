-- BLVCK backend foundation (Supabase Postgres)
-- This migration uses Supabase Auth identities. Username-only sign-in needs
-- a trusted server-side username resolver; do not expose auth.users or service keys.

create extension if not exists pgcrypto;

create table if not exists public.blvck_profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username text not null,
  username_normalized text generated always as (lower(username)) stored,
  created_at timestamptz not null default now(),
  constraint blvck_username_format check (username ~ '^[A-Za-z0-9_]{3,20}$')
);
create unique index if not exists blvck_profiles_username_unique
  on public.blvck_profiles(username_normalized);

create table if not exists public.blvck_roles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  role text not null default 'member' check (role in ('member','admin','owner')),
  created_at timestamptz not null default now()
);

create table if not exists public.blvck_chat_messages (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  content text not null check (char_length(content) between 1 and 500),
  created_at timestamptz not null default now()
);
create index if not exists blvck_chat_messages_created_at_idx
  on public.blvck_chat_messages(created_at desc);

alter table public.blvck_profiles enable row level security;
alter table public.blvck_roles enable row level security;
alter table public.blvck_chat_messages enable row level security;

-- Profiles: users can read public usernames and update only their own row.
drop policy if exists "Profiles are readable" on public.blvck_profiles;
create policy "Profiles are readable" on public.blvck_profiles
  for select to authenticated using (true);
drop policy if exists "Users update own profile" on public.blvck_profiles;
create policy "Users update own profile" on public.blvck_profiles
  for update to authenticated using (auth.uid() = id) with check (auth.uid() = id);
drop policy if exists "Users insert own profile" on public.blvck_profiles;
create policy "Users insert own profile" on public.blvck_profiles
  for insert to authenticated with check (auth.uid() = id);

-- Roles are readable only for authorization display; clients cannot write roles.
drop policy if exists "Roles readable by signed-in users" on public.blvck_roles;
create policy "Roles readable by signed-in users" on public.blvck_roles
  for select to authenticated using (true);

-- Chat: signed-in users can read and send only as themselves.
drop policy if exists "Signed-in users read chat" on public.blvck_chat_messages;
create policy "Signed-in users read chat" on public.blvck_chat_messages
  for select to authenticated using (true);
drop policy if exists "Users send own chat messages" on public.blvck_chat_messages;
create policy "Users send own chat messages" on public.blvck_chat_messages
  for insert to authenticated with check (auth.uid() = user_id);
drop policy if exists "Users delete own chat messages" on public.blvck_chat_messages;
create policy "Users delete own chat messages" on public.blvck_chat_messages
  for delete to authenticated using (auth.uid() = user_id);

-- No client-side role promotion. Owner assignment must be performed by a trusted
-- server-side admin operation after verifying the actual account identity.
revoke insert, update, delete on public.blvck_roles from anon, authenticated;
grant select on public.blvck_roles to authenticated;
grant select, insert, update on public.blvck_profiles to authenticated;
grant select, insert, delete on public.blvck_chat_messages to authenticated;
