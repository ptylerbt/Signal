-- profiles never got a delete policy when the other tables did, so admins
-- (or users) could never actually delete a profiles row — RLS silently
-- blocks deletes with no matching policy. Needed to clean up stray test
-- accounts, and useful going forward if a user's account is ever removed.
-- Run this once in Neon's SQL Editor.

drop policy if exists profiles_owner_or_admin_delete on public.profiles;
create policy profiles_owner_or_admin_delete on public.profiles
  for delete using (user_id = public.current_app_user() or public.is_admin());
