-- Add an admin-controlled switch that blocks new match input for closed environments.

alter table public.environments
  add column if not exists allow_match_input boolean not null default true;

drop policy if exists "matches_insert_own" on public.matches;
create policy "matches_insert_own" on public.matches
  for insert to authenticated
  with check (
    auth.uid() = user_id
    and environment_id is not null
    and exists (
      select 1 from public.environments e
      where e.id = environment_id and e.allow_match_input = true
    )
    and exists (
      select 1 from public.decks d
      where d.id = my_deck_id and d.user_id = auth.uid()
    )
    and exists (
      select 1 from public.decks d
      where d.id = opponent_deck_id and d.user_id = auth.uid()
    )
  );

drop policy if exists "matches_update_own" on public.matches;
create policy "matches_update_own" on public.matches
  for update to authenticated
  using (auth.uid() = user_id)
  with check (
    auth.uid() = user_id
    and environment_id is not null
    and exists (
      select 1 from public.environments e
      where e.id = environment_id and e.allow_match_input = true
    )
    and exists (
      select 1 from public.decks d
      where d.id = my_deck_id and d.user_id = auth.uid()
    )
    and exists (
      select 1 from public.decks d
      where d.id = opponent_deck_id and d.user_id = auth.uid()
    )
  );
