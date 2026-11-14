-- BLVCK username/password backend (custom auth, no email field).
-- Privileged database functions are callable only by service_role.
create extension if not exists pgcrypto with schema extensions;

create table if not exists public.blvck_accounts (
  id uuid primary key default gen_random_uuid(),
  username text not null,
  username_normalized text generated always as (lower(username)) stored,
  password_hash text not null,
  role text not null default 'member' check (role in ('member','admin','owner')),
  created_at timestamptz not null default now(),
  constraint blvck_accounts_username_format check (username ~ '^[A-Za-z0-9_]{3,20}$')
);
create unique index if not exists blvck_accounts_username_unique
  on public.blvck_accounts(username_normalized);

create table if not exists public.blvck_messages (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.blvck_accounts(id) on delete cascade,
  content text not null check (char_length(content) between 1 and 500),
  created_at timestamptz not null default now()
);
create index if not exists blvck_messages_created_at_idx
  on public.blvck_messages(created_at desc);

alter table public.blvck_accounts enable row level security;
alter table public.blvck_messages enable row level security;
revoke all on public.blvck_accounts from anon, authenticated;
revoke all on public.blvck_messages from anon, authenticated;
grant all on public.blvck_accounts to service_role;
grant all on public.blvck_messages to service_role;
grant usage, select on sequence public.blvck_messages_id_seq to service_role;

create or replace function public.blvck_register_account(p_username text, p_password text)
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare v_id uuid; v_username text;
begin
  if p_username is null or p_username !~ '^[A-Za-z0-9_]{3,20}$' then raise exception 'INVALID_USERNAME'; end if;
  if p_password is null or char_length(p_password) < 8 or char_length(p_password) > 128 then raise exception 'INVALID_PASSWORD'; end if;
  insert into public.blvck_accounts(username, password_hash)
  values (p_username, extensions.crypt(p_password, extensions.gen_salt('bf', 12)))
  returning id, username into v_id, v_username;
  return jsonb_build_object('id', v_id, 'username', v_username, 'role', 'member');
exception when unique_violation then raise exception 'ACCOUNT_UNAVAILABLE';
end;
$$;

create or replace function public.blvck_verify_account(p_username text, p_password text)
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare v_account public.blvck_accounts%rowtype;
begin
  if p_username is null or p_password is null then return null; end if;
  select * into v_account from public.blvck_accounts
  where username_normalized = lower(p_username)
    and password_hash = extensions.crypt(p_password, password_hash)
  limit 1;
  if v_account.id is null then return null; end if;
  return jsonb_build_object('id', v_account.id, 'username', v_account.username, 'role', v_account.role);
end;
$$;

revoke all on function public.blvck_register_account(text,text) from public, anon, authenticated;
revoke all on function public.blvck_verify_account(text,text) from public, anon, authenticated;
grant execute on function public.blvck_register_account(text,text) to service_role;
grant execute on function public.blvck_verify_account(text,text) to service_role;
