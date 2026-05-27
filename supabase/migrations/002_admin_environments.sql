-- Existing DB migration: admin-managed shared environments and environment-required matches.
-- Safe to run multiple times. Does not delete user data.

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.admin_users
    where user_id = auth.uid()
  );
$$;

create unique index if not exists environments_unique_name_idx on public.environments(name);
create index if not exists matches_environment_id_idx on public.matches(environment_id);

drop policy if exists "environments_select_own" on public.environments;
drop policy if exists "environments_insert_own" on public.environments;
drop policy if exists "environments_update_own" on public.environments;
drop policy if exists "environments_delete_own" on public.environments;
drop policy if exists "environments_select_shared" on public.environments;
drop policy if exists "environments_select_public" on public.environments;
drop policy if exists "environments_insert_admin" on public.environments;
drop policy if exists "environments_update_admin" on public.environments;
drop policy if exists "environments_delete_admin" on public.environments;

create policy "environments_select_public" on public.environments
  for select to anon, authenticated
  using (true);

create policy "environments_insert_admin" on public.environments
  for insert to authenticated
  with check (public.is_admin() and auth.uid() = user_id);

create policy "environments_update_admin" on public.environments
  for update to authenticated
  using (public.is_admin())
  with check (public.is_admin());

create policy "environments_delete_admin" on public.environments
  for delete to authenticated
  using (public.is_admin());

drop policy if exists "matches_insert_own" on public.matches;
drop policy if exists "matches_update_own" on public.matches;

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
