-- Admin-managed shared environments.
-- Run this in Supabase SQL Editor after admin_archetypes_migration_safe.sql.

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

drop policy if exists "environments_select_own" on public.environments;
drop policy if exists "environments_insert_own" on public.environments;
drop policy if exists "environments_update_own" on public.environments;
drop policy if exists "environments_delete_own" on public.environments;
drop policy if exists "environments_select_shared" on public.environments;
drop policy if exists "environments_insert_admin" on public.environments;
drop policy if exists "environments_update_admin" on public.environments;
drop policy if exists "environments_delete_admin" on public.environments;

create policy "environments_select_shared" on public.environments
  for select to authenticated
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
        where e.id = environment_id
      )
    )
  );

create policy "matches_update_own" on public.matches
  for update to authenticated
  using (auth.uid() = user_id)
  with check (
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
        where e.id = environment_id
      )
    )
  );
