-- Existing DB migration: allow guest mode to read public master data.
-- Safe to run multiple times. Does not expose user match data.

grant usage on schema public to anon, authenticated;
grant select on public.environments to anon, authenticated;
grant select on public.deck_archetypes to anon, authenticated;
grant select on public.deck_aliases to anon, authenticated;

drop policy if exists "environments_select_shared" on public.environments;
drop policy if exists "environments_select_public" on public.environments;
create policy "environments_select_public" on public.environments
  for select to anon, authenticated
  using (true);

drop policy if exists "deck_archetypes_select_all" on public.deck_archetypes;
drop policy if exists "deck_archetypes_select_public" on public.deck_archetypes;
create policy "deck_archetypes_select_public" on public.deck_archetypes
  for select to anon, authenticated
  using (is_active = true or public.is_admin());
