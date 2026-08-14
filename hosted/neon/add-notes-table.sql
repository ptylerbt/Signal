-- Adds a global Notes feature: a note can optionally link to a Project
-- and/or a Teacher, instead of living only inside a Project like before.
-- Run this once in Neon's SQL Editor.

create table if not exists public.notes (
  id bigint generated always as identity primary key,
  owner_id text not null,
  project_id bigint references public.projects(id) on delete set null,
  teacher_id bigint references public.teachers(id) on delete set null,
  note_text text not null,
  created_at timestamptz not null default now()
);

-- Carry over any notes already recorded the old way (Project -> Person).
insert into public.notes (owner_id, project_id, teacher_id, note_text, created_at)
select owner_id, project_id, teacher_id, note_text, created_at
from public.project_notes;

-- Same RLS pattern as every other table, and FORCE so it actually applies
-- (see the earlier fix: the app connects as the restricted `signal_app`
-- role now, which is not exempt from RLS the way `neondb_owner` was).
alter table public.notes enable row level security;
alter table public.notes force row level security;

drop policy if exists owner_or_admin_select on public.notes;
create policy owner_or_admin_select on public.notes
  for select using (owner_id = public.current_app_user() or public.is_admin());

drop policy if exists owner_insert on public.notes;
create policy owner_insert on public.notes
  for insert with check (owner_id = public.current_app_user());

drop policy if exists owner_or_admin_update on public.notes;
create policy owner_or_admin_update on public.notes
  for update using (owner_id = public.current_app_user() or public.is_admin());

drop policy if exists owner_or_admin_delete on public.notes;
create policy owner_or_admin_delete on public.notes
  for delete using (owner_id = public.current_app_user() or public.is_admin());

grant select, insert, update, delete on public.notes to signal_app;
grant usage, select on all sequences in schema public to signal_app;
