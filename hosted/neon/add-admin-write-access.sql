-- Lets an admin actually act on a member's behalf ("view their version of
-- the app... do a task for them"), not just look. Two gaps existed:
--   1. profiles_owner_update only let a user update their OWN profile row —
--      meaning an admin couldn't change anyone else's role.
--   2. Every table's insert policy only allowed owner_id = the acting
--      session's own id — meaning even though admins could already SELECT/
--      UPDATE/DELETE any row, they could never INSERT a new row attributed
--      to someone else (e.g. adding a note while viewing-as a member).
-- Run this once in Neon's SQL Editor.

drop policy if exists profiles_owner_update on public.profiles;
create policy profiles_owner_update on public.profiles
  for update using (user_id = public.current_app_user() or public.is_admin());

do $$
declare
  t text;
begin
  for t in
    select unnest(array[
      'teachers', 'teacher_assignments', 'groups', 'group_members',
      'templates', 'label_maps', 'projects', 'project_members',
      'project_notes', 'project_person_status', 'send_records', 'notes'
    ])
  loop
    execute format('drop policy if exists owner_insert on public.%I;', t);
    execute format(
      'create policy owner_insert on public.%I for insert with check (owner_id = public.current_app_user() or public.is_admin());',
      t
    );
  end loop;
end $$;
