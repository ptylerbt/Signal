-- ============================================================
-- Signal (hosted) — Neon (plain Postgres) + Clerk schema + RLS
-- Paste this whole file into Neon → SQL Editor → Run.
-- Safe to re-run: every statement is "create if not exists" style.
--
-- IMPORTANT — how this differs from Supabase:
-- Supabase auto-detects "who's asking" via auth.uid(). Plain Postgres
-- has no such thing, so your backend must tell the database who the
-- current user is on every request, by running this as the FIRST
-- statement in the same transaction as your query:
--
--   SET LOCAL app.current_user_id = '<clerk_user_id>';
--
-- (Clerk gives you the user's id after verifying their session on
-- your server. "SET LOCAL" only affects the current transaction, so
-- there's no risk of one request's user id leaking into another's.)
-- ============================================================

-- ------------------------------------------------------------
-- 1. PROFILES — one row per Clerk user, holds their role.
--    Clerk user ids are strings like "user_2abc123XYZ", not UUIDs.
-- ------------------------------------------------------------
create table if not exists public.profiles (
  user_id text primary key,
  role text not null default 'user' check (role in ('user', 'admin')),
  created_at timestamptz not null default now()
);

-- Call this once per user the first time they hit your API
-- (e.g. inside a "get or create my profile" endpoint):
--   insert into public.profiles (user_id) values ($1) on conflict do nothing;

-- ------------------------------------------------------------
-- 2. CORE TABLES — same shape as Signal's local schema, each with
--    an owner_id (Clerk user id) so RLS can keep users' data apart.
-- ------------------------------------------------------------

create table if not exists public.teachers (
  id bigint generated always as identity primary key,
  owner_id text not null,
  first_name text,
  last_name text,
  is_district_rep boolean not null default false,
  default_assignment_id bigint,
  created_at timestamptz not null default now()
);

create table if not exists public.teacher_assignments (
  id bigint generated always as identity primary key,
  owner_id text not null,
  teacher_id bigint references public.teachers(id) on delete cascade,
  school text,
  district text,
  subject text,
  level text,
  email text,
  source_sheet text,
  extra_json jsonb,
  created_at timestamptz not null default now()
);

alter table public.teachers
  drop constraint if exists teachers_default_assignment_fk;
alter table public.teachers
  add constraint teachers_default_assignment_fk
  foreign key (default_assignment_id) references public.teacher_assignments(id)
  on delete set null;

create table if not exists public.groups (
  id bigint generated always as identity primary key,
  owner_id text not null,
  name text,
  created_at timestamptz not null default now()
);

create table if not exists public.group_members (
  owner_id text not null,
  group_id bigint references public.groups(id) on delete cascade,
  assignment_id bigint references public.teacher_assignments(id) on delete cascade,
  primary key (group_id, assignment_id)
);

create table if not exists public.templates (
  id bigint generated always as identity primary key,
  owner_id text not null,
  file_name text,
  raw_text text,
  detected_labels_json jsonb,
  uploaded_at timestamptz not null default now()
);

create table if not exists public.label_maps (
  id bigint generated always as identity primary key,
  owner_id text not null,
  template_id bigint references public.templates(id) on delete cascade,
  label_name text,
  matched_column text,
  manual_override boolean not null default false
);

create table if not exists public.projects (
  id bigint generated always as identity primary key,
  owner_id text not null,
  name text,
  description text,
  status text not null default 'active' check (status in ('active', 'archived')),
  created_at timestamptz not null default now()
);

create table if not exists public.project_members (
  owner_id text not null,
  project_id bigint references public.projects(id) on delete cascade,
  teacher_id bigint references public.teachers(id) on delete cascade,
  added_at timestamptz not null default now(),
  primary key (project_id, teacher_id)
);

create table if not exists public.project_notes (
  id bigint generated always as identity primary key,
  owner_id text not null,
  project_id bigint references public.projects(id) on delete cascade,
  teacher_id bigint references public.teachers(id) on delete cascade,
  note_text text,
  created_at timestamptz not null default now()
);

create table if not exists public.project_person_status (
  owner_id text not null,
  project_id bigint references public.projects(id) on delete cascade,
  teacher_id bigint references public.teachers(id) on delete cascade,
  status text,
  updated_at timestamptz not null default now(),
  primary key (project_id, teacher_id)
);

create table if not exists public.send_records (
  id bigint generated always as identity primary key,
  owner_id text not null,
  assignment_id bigint references public.teacher_assignments(id) on delete set null,
  template_id bigint references public.templates(id) on delete set null,
  group_id bigint references public.groups(id) on delete set null,
  project_id bigint references public.projects(id) on delete set null,
  recipient_field text,
  generated_at timestamptz,
  opened_at timestamptz,
  status text
);

-- ------------------------------------------------------------
-- 3. ROW LEVEL SECURITY — a user only ever sees rows they own;
--    an admin (profiles.role = 'admin') sees everyone's rows.
--    Driven by the session variable your backend sets per request.
-- ------------------------------------------------------------

create or replace function public.current_app_user()
returns text
language sql
stable
as $$
  select nullif(current_setting('app.current_user_id', true), '');
$$;

create or replace function public.is_admin()
returns boolean
language sql
stable
as $$
  select exists (
    select 1 from public.profiles
    where user_id = public.current_app_user() and role = 'admin'
  );
$$;

do $$
declare
  t text;
begin
  for t in
    select unnest(array[
      'teachers', 'teacher_assignments', 'groups', 'group_members',
      'templates', 'label_maps', 'projects', 'project_members',
      'project_notes', 'project_person_status', 'send_records'
    ])
  loop
    execute format('alter table public.%I enable row level security;', t);

    execute format('drop policy if exists owner_or_admin_select on public.%I;', t);
    execute format(
      'create policy owner_or_admin_select on public.%I for select using (owner_id = public.current_app_user() or public.is_admin());',
      t
    );

    execute format('drop policy if exists owner_insert on public.%I;', t);
    execute format(
      'create policy owner_insert on public.%I for insert with check (owner_id = public.current_app_user());',
      t
    );

    execute format('drop policy if exists owner_or_admin_update on public.%I;', t);
    execute format(
      'create policy owner_or_admin_update on public.%I for update using (owner_id = public.current_app_user() or public.is_admin());',
      t
    );

    execute format('drop policy if exists owner_or_admin_delete on public.%I;', t);
    execute format(
      'create policy owner_or_admin_delete on public.%I for delete using (owner_id = public.current_app_user() or public.is_admin());',
      t
    );
  end loop;
end $$;

-- profiles table itself: you can see your own row; admins see everyone's.
alter table public.profiles enable row level security;

drop policy if exists profiles_owner_or_admin_select on public.profiles;
create policy profiles_owner_or_admin_select on public.profiles
  for select using (user_id = public.current_app_user() or public.is_admin());

drop policy if exists profiles_owner_update on public.profiles;
create policy profiles_owner_update on public.profiles
  for update using (user_id = public.current_app_user());

drop policy if exists profiles_insert on public.profiles;
create policy profiles_insert on public.profiles
  for insert with check (user_id = public.current_app_user());

-- ============================================================
-- Done. Next steps:
-- 1. Create a Clerk application (clerk.com), grab its API keys.
-- 2. Your backend, on every authenticated request:
--      a. Verify the Clerk session, get the user's id.
--      b. Open a transaction, run:
--           SET LOCAL app.current_user_id = '<clerk_user_id>';
--         then your actual query, in the SAME transaction.
--      c. On first-ever request for a user, upsert their profiles row:
--           insert into public.profiles (user_id) values ($1)
--           on conflict (user_id) do nothing;
-- 3. To make yourself admin, after your first request creates your
--    profile row, run in Neon's SQL editor:
--      update public.profiles set role = 'admin' where user_id = '<your-clerk-user-id>';
-- ============================================================
