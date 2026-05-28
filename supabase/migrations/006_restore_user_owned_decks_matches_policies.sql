-- Existing DB migration: restore owner-based deck/match policies for normal users.
-- RLS still limits users to their own decks and matches.

drop policy if exists "decks_select_own" on public.decks;
create policy "decks_select_own" on public.decks
  for select to authenticated
  using (auth.uid() = user_id);

drop policy if exists "decks_insert_own" on public.decks;
create policy "decks_insert_own" on public.decks
  for insert to authenticated
  with check (auth.uid() = user_id);

drop policy if exists "decks_update_own" on public.decks;
create policy "decks_update_own" on public.decks
  for update to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "decks_delete_own" on public.decks;
create policy "decks_delete_own" on public.decks
  for delete to authenticated
  using (auth.uid() = user_id);

drop policy if exists "matches_select_own" on public.matches;
create policy "matches_select_own" on public.matches
  for select to authenticated
  using (auth.uid() = user_id);

drop policy if exists "matches_insert_own" on public.matches;
create policy "matches_insert_own" on public.matches
  for insert to authenticated
  with check (
    auth.uid() = user_id
    and environment_id is not null
    and exists (
      select 1 from public.environments e
      where e.id = environment_id
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
      where e.id = environment_id
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

drop policy if exists "matches_delete_own" on public.matches;
create policy "matches_delete_own" on public.matches
  for delete to authenticated
  using (auth.uid() = user_id);
