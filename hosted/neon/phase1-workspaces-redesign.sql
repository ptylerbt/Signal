-- ============================================================
-- Phase 1 of the simplified redesign.
-- Run this whole file once in Neon's SQL Editor (as neondb_owner).
--
--   1. WIPES all existing app data (people, groups, projects, letters,
--      notes, send history) for every account. Profiles (accounts, roles,
--      accessibility settings) are kept.
--   2. Adds Workspaces (DMEA / Church / School ...).
--   3. Adds Lists, which replace both Groups and Projects.
--   4. Adds Trash support (deleted_at) for 30-day recovery.
--
-- The old groups/projects tables stay for now so the current screens keep
-- working until the new ones replace them; a later cleanup drops them.
-- ============================================================

-- ------------------------------------------------------------
-- 1. WIPE (user approved a fresh start). TRUNCATE ignores RLS and resets ids.
-- ------------------------------------------------------------
truncate table
  public.send_records,
  public.notes,
  public.project_notes,
  public.project_person_status,
  public.project_members,
  public.projects,
  public.group_members,
  public.groups,
  public.label_maps,
  public.templates,
  public.teacher_assignments,
  public.teachers
restart identity cascade;

-- ------------------------------------------------------------
-- 2. WORKSPACES — one per organization she emails for.
-- ------------------------------------------------------------
create table if not exists public.workspaces (
  id bigint generated always as identity primary key,
  owner_id text not null,
  name text not null,
  emoji text,
  color text,
  is_practice boolean not null default false,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  deleted_at timestamptz
);
create index if not exists workspaces_owner_idx on public.workspaces (owner_id);

-- A person is stored once (teachers + teacher_assignments, now shown as
-- "People") and can belong to several workspaces.
create table if not exists public.workspace_people (
  owner_id text not null,
  workspace_id bigint not null references public.workspaces(id) on delete cascade,
  teacher_id bigint not null references public.teachers(id) on delete cascade,
  added_at timestamptz not null default now(),
  primary key (workspace_id, teacher_id)
);
create index if not exists workspace_people_teacher_idx on public.workspace_people (teacher_id);

-- ------------------------------------------------------------
-- 3. LISTS — replaces Groups + Projects. A list lives in one workspace,
--    holds people, and tracks each person's reply status.
-- ------------------------------------------------------------
create table if not exists public.lists (
  id bigint generated always as identity primary key,
  owner_id text not null,
  workspace_id bigint not null references public.workspaces(id) on delete cascade,
  name text not null,
  description text,
  color text,
  created_at timestamptz not null default now(),
  deleted_at timestamptz
);
create index if not exists lists_workspace_idx on public.lists (workspace_id);

create table if not exists public.list_members (
  owner_id text not null,
  list_id bigint not null references public.lists(id) on delete cascade,
  teacher_id bigint not null references public.teachers(id) on delete cascade,
  -- Which of the person's emails/roles to use for this list (e.g. their
  -- Strings address rather than their Band one). Null = their default.
  assignment_id bigint references public.teacher_assignments(id) on delete set null,
  status text,
  status_updated_at timestamptz,
  added_at timestamptz not null default now(),
  primary key (list_id, teacher_id)
);
create index if not exists list_members_teacher_idx on public.list_members (teacher_id);

-- ------------------------------------------------------------
-- 4. Hook existing tables into workspaces/lists + Trash columns.
-- ------------------------------------------------------------
-- Letters: workspace_id null = available in every workspace.
alter table public.templates
  add column if not exists workspace_id bigint references public.workspaces(id) on delete cascade,
  add column if not exists deleted_at timestamptz;

alter table public.notes
  add column if not exists workspace_id bigint references public.workspaces(id) on delete cascade,
  add column if not exists list_id bigint references public.lists(id) on delete set null,
  add column if not exists deleted_at timestamptz;

alter table public.send_records
  add column if not exists workspace_id bigint references public.workspaces(id) on delete set null,
  add column if not exists list_id bigint references public.lists(id) on delete set null;
create index if not exists send_records_list_idx on public.send_records (list_id);

alter table public.teachers
  add column if not exists deleted_at timestamptz;

-- Remember which workspace each user last had open, and whether they've
-- switched on the "Advanced" features (duplicate finder, backup).
alter table public.profiles
  add column if not exists current_workspace_id bigint references public.workspaces(id) on delete set null,
  add column if not exists show_advanced boolean not null default false;

-- ------------------------------------------------------------
-- 5. RLS on the new tables — same owner-or-admin pattern as the rest,
--    FORCEd so it applies to the restricted signal_app role.
-- ------------------------------------------------------------
do $$
declare
  t text;
begin
  for t in
    select unnest(array['workspaces', 'workspace_people', 'lists', 'list_members'])
  loop
    execute format('alter table public.%I enable row level security;', t);
    execute format('alter table public.%I force row level security;', t);

    execute format('drop policy if exists owner_or_admin_select on public.%I;', t);
    execute format(
      'create policy owner_or_admin_select on public.%I for select using (owner_id = public.current_app_user() or public.is_admin());',
      t
    );

    execute format('drop policy if exists owner_insert on public.%I;', t);
    execute format(
      'create policy owner_insert on public.%I for insert with check (owner_id = public.current_app_user() or public.is_admin());',
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

    execute format('grant select, insert, update, delete on public.%I to signal_app;', t);
  end loop;
end $$;

grant usage, select on all sequences in schema public to signal_app;
