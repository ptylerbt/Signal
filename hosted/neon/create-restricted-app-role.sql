-- Second, necessary fix for the RLS gap (force-rls-fix.sql alone was not
-- enough). Neon's default role for your project, `neondb_owner`, has the
-- BYPASSRLS attribute — this is set by Neon itself on every project's
-- primary role, and it overrides FORCE ROW LEVEL SECURITY entirely. A role
-- with BYPASSRLS ignores RLS no matter what. Since neondb_owner isn't a
-- superuser, you (and the app) cannot remove that attribute from it.
--
-- The standard fix: create a separate, lower-privileged role for the app
-- to connect as — one that owns nothing and has no BYPASSRLS — and grant
-- it just the data access it needs. RLS applies fully to this role.
--
-- Run this once in Neon's SQL Editor.

create role signal_app with login password 'u2C-UNcFRzHDvaa5NcWhN2D--AbBaJ-q';

grant usage on schema public to signal_app;

grant select, insert, update, delete on all tables in schema public to signal_app;
grant usage, select on all sequences in schema public to signal_app;
grant execute on all functions in schema public to signal_app;

-- Keeps working for tables/sequences/functions you add later too.
alter default privileges in schema public
  grant select, insert, update, delete on tables to signal_app;
alter default privileges in schema public
  grant usage, select on sequences to signal_app;
alter default privileges in schema public
  grant execute on functions to signal_app;
