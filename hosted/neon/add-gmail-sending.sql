-- ============================================================
-- Signal sends email itself through Gmail accounts the user connects.
-- Run this once in the Neon SQL Editor. Safe to run again.
-- ============================================================

-- One row per connected Gmail account. The refresh token is encrypted by
-- the web server before it gets here (AES-256-GCM, key in GMAIL_TOKEN_KEY),
-- so the database never holds a usable token.
create table if not exists public.gmail_accounts (
  id bigint generated always as identity primary key,
  owner_id text not null,
  email text not null,
  refresh_token_enc text not null,
  created_at timestamptz not null default now(),
  unique (owner_id, email)
);
create index if not exists gmail_accounts_owner_idx on public.gmail_accounts (owner_id);

-- Remembers which account was last used in each workspace, so Write Email
-- can suggest it next time.
alter table public.workspaces
  add column if not exists last_gmail_account_id bigint references public.gmail_accounts(id) on delete set null;

-- What actually went out, for the "Recently sent" list.
alter table public.send_records
  add column if not exists sent_from text,
  add column if not exists subject text;

alter table public.gmail_accounts enable row level security;
alter table public.gmail_accounts force row level security;

drop policy if exists owner_or_admin_select on public.gmail_accounts;
create policy owner_or_admin_select on public.gmail_accounts
  for select using (owner_id = public.current_app_user() or public.is_admin());

drop policy if exists owner_insert on public.gmail_accounts;
create policy owner_insert on public.gmail_accounts
  for insert with check (owner_id = public.current_app_user() or public.is_admin());

drop policy if exists owner_or_admin_update on public.gmail_accounts;
create policy owner_or_admin_update on public.gmail_accounts
  for update using (owner_id = public.current_app_user() or public.is_admin());

drop policy if exists owner_or_admin_delete on public.gmail_accounts;
create policy owner_or_admin_delete on public.gmail_accounts
  for delete using (owner_id = public.current_app_user() or public.is_admin());

grant select, insert, update, delete on public.gmail_accounts to signal_app;
grant usage, select on all sequences in schema public to signal_app;
