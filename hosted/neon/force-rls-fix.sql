-- Fixes a gap where Row Level Security policies existed but were never
-- actually enforced, because the app connects as the table owner
-- (neondb_owner), and Postgres exempts table owners from RLS unless
-- FORCE ROW LEVEL SECURITY is set. Run this once in Neon's SQL Editor.

do $$
declare
  t text;
begin
  for t in
    select unnest(array[
      'teachers', 'teacher_assignments', 'groups', 'group_members',
      'templates', 'label_maps', 'projects', 'project_members',
      'project_notes', 'project_person_status', 'send_records', 'profiles'
    ])
  loop
    execute format('alter table public.%I force row level security;', t);
  end loop;
end $$;
