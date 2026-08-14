-- Adds per-user Settings (accessibility + a Compose signature) onto the
-- existing profiles table, since it's already one row per Clerk user and
-- already has the right RLS policies (select/update your own row).
-- Run this once in Neon's SQL Editor.

alter table public.profiles
  add column if not exists font_scale double precision not null default 1.0,
  add column if not exists high_contrast boolean not null default false,
  add column if not exists default_signature text;
