-- Allow administrators to read all match rows for aggregate analysis.
-- Normal authenticated users remain limited to their own match rows.

drop policy if exists "matches_select_own" on public.matches;
drop policy if exists "matches_select_own_or_admin" on public.matches;
create policy "matches_select_own_or_admin" on public.matches
  for select to authenticated
  using (auth.uid() = user_id or public.is_admin());
