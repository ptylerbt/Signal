-- ============================================================
-- Signal (hosted) — Supabase schema + Row Level Security
-- Paste this whole file into Supabase → SQL Editor → New Query → Run.
-- Safe to re-run: every statement is "create if not exists" style.
-- ============================================================

-- ------------------------------------------------------------
-- 1. PROFILES — one row per signed-up user, holds their role.
--    Auto-created whenever someone signs up (via the trigger below).
-- ------------------------------------------------------------
create table if not exists public.profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  role text not null default 'user' check (role in ('user', 'admin')),
  created_at timestamptz not null default now()
);

-- Every new auth signup gets a matching profiles row automatically.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (user_id) values (new.id);
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ------------------------------------------------------------
-- 2. CORE TABLES — same shape as Signal's local schema, each with
--    an owner_id so Row Level Security can keep users' data apart.
-- ------------------------------------------------------------

create table if not exists public.teachers (
  id bigint generated always as identity primary key,
  owner_id uuid not null references auth.users(id) on delete cascade,
  first_name text,
  last_name text,
  is_district_rep boolean not null default false,
  default_assignment_id bigint,
  created_at timestamptz not null default now()
);

create table if not exists public.teacher_assignments (
  id bigint generated always as identity primary key,
  owner_id uuid not null references auth.users(id) on delete cascade,
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
  add constraint teachers_default_assignment_fk
  foreign key (default_assignment_id) references public.teacher_assignments(id)
  on delete set null;

create table if not exists public.groups (
  id bigint generated always as identity primary key,
  owner_id uuid not null references auth.users(id) on delete cascade,
  name text,
  created_at timestamptz not null default now()
);

create table if not exists public.group_members (
  owner_id uuid not null references auth.users(id) on delete cascade,
  group_id bigint references public.groups(id) on delete cascade,
  assignment_id bigint references public.teacher_assignments(id) on delete cascade,
  primary key (group_id, assignment_id)
);

create table if not exists public.templates (
  id bigint generated always as identity primary key,
  owner_id uuid not null references auth.users(id) on delete cascade,
  file_name text,
  raw_text text,
  detected_labels_json jsonb,
  uploaded_at timestamptz not null default now()
);

create table if not exists public.label_maps (
  id bigint generated always as identity primary key,
  owner_id uuid not null references auth.users(id) on delete cascade,
  template_id bigint references public.templates(id) on delete cascade,
  label_name text,
  matched_column text,
  manual_override boolean not null default false
);

create table if not exists public.projects (
  id bigint generated always as identity primary key,
  owner_id uuid not null references auth.users(id) on delete cascade,
  name text,
  description text,
  status text not null default 'active' check (status in ('active', 'archived')),
  created_at timestamptz not null default now()
);

create table if not exists public.project_members (
  owner_id uuid not null references auth.users(id) on delete cascade,
  project_id bigint references public.projects(id) on delete cascade,
  teacher_id bigint references public.teachers(id) on delete cascade,
  added_at timestamptz not null default now(),
  primary key (project_id, teacher_id)
);

create table if not exists public.project_notes (
  id bigint generated always as identity primary key,
  owner_id uuid not null references auth.users(id) on delete cascade,
  project_id bigint references public.projects(id) on delete cascade,
  teacher_id bigint references public.teachers(id) on delete cascade,
  note_text text,
  created_at timestamptz not null default now()
);

create table if not exists public.project_person_status (
  owner_id uuid not null references auth.users(id) on delete cascade,
  project_id bigint references public.projects(id) on delete cascade,
  teacher_id bigint references public.teachers(id) on delete cascade,
  status text,
  updated_at timestamptz not null default now(),
  primary key (project_id, teacher_id)
);

create table if not exists public.send_records (
  id bigint generated always as identity primary key,
  owner_id uuid not null references auth.users(id) on delete cascade,
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
-- ------------------------------------------------------------

create or replace function public.is_admin()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from public.profiles
    where user_id = auth.uid() and role = 'admin'
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
      'create policy owner_or_admin_select on public.%I for select using (owner_id = auth.uid() or public.is_admin());',
      t
    );

    execute format('drop policy if exists owner_insert on public.%I;', t);
    execute format(
      'create policy owner_insert on public.%I for insert with check (owner_id = auth.uid());',
      t
    );

    execute format('drop policy if exists owner_or_admin_update on public.%I;', t);
    execute format(
      'create policy owner_or_admin_update on public.%I for update using (owner_id = auth.uid() or public.is_admin());',
      t
    );

    execute format('drop policy if exists owner_or_admin_delete on public.%I;', t);
    execute format(
      'create policy owner_or_admin_delete on public.%I for delete using (owner_id = auth.uid() or public.is_admin());',
      t
    );
  end loop;
end $$;

-- profiles table itself: you can see your own row; admins see everyone's.
alter table public.profiles enable row level security;

drop policy if exists profiles_owner_or_admin_select on public.profiles;
create policy profiles_owner_or_admin_select on public.profiles
  for select using (user_id = auth.uid() or public.is_admin());

drop policy if exists profiles_owner_update on public.profiles;
create policy profiles_owner_update on public.profiles
  for update using (user_id = auth.uid());

-- ============================================================
-- Done. Next: run this once, then in Supabase → Authentication →
-- sign up your own account, then run:
--   update public.profiles set role = 'admin' where user_id = '<your-auth-uid>';
-- (find your uid in Authentication → Users after signing up)
-- ============================================================
