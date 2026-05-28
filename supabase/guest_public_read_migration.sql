-- Allow guest mode to read admin-managed public choices.
-- Run this in Supabase SQL Editor if /guest does not show environments or standard decks.

grant usage on schema public to anon, authenticated;
grant select on public.environments to anon, authenticated;
grant select on public.deck_archetypes to anon, authenticated;
grant select on public.deck_aliases to anon, authenticated;

drop policy if exists "environments_select_public" on public.environments;
create policy "environments_select_public" on public.environments
  for select to anon, authenticated
  using (true);

drop policy if exists "deck_archetypes_select_public" on public.deck_archetypes;
create policy "deck_archetypes_select_public" on public.deck_archetypes
  for select to anon, authenticated
  using (is_active = true);
