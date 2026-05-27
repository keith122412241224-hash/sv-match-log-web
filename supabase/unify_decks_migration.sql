alter table public.decks
  alter column deck_type set default 'my_deck';

drop policy if exists "matches_insert_own" on public.matches;
drop policy if exists "matches_update_own" on public.matches;

create policy "matches_insert_own" on public.matches
  for insert with check (
    auth.uid() = user_id
    and exists (
      select 1 from public.decks d
      where d.id = my_deck_id and d.user_id = auth.uid()
    )
    and exists (
      select 1 from public.decks d
      where d.id = opponent_deck_id and d.user_id = auth.uid()
    )
    and (
      environment_id is null
      or exists (
        select 1 from public.environments e
        where e.id = environment_id and e.user_id = auth.uid()
      )
    )
  );

create policy "matches_update_own" on public.matches
  for update using (auth.uid() = user_id) with check (
    auth.uid() = user_id
    and exists (
      select 1 from public.decks d
      where d.id = my_deck_id and d.user_id = auth.uid()
    )
    and exists (
      select 1 from public.decks d
      where d.id = opponent_deck_id and d.user_id = auth.uid()
    )
    and (
      environment_id is null
      or exists (
        select 1 from public.environments e
        where e.id = environment_id and e.user_id = auth.uid()
      )
    )
  );
