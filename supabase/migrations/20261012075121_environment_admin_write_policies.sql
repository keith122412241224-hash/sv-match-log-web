begin;
set local lock_timeout = '5s';
set local statement_timeout = '30s';

-- Shared environments are managed by administrators, not their original author.
-- Replace the permissive owner policies: adding admin policies would OR with them.
drop policy environments_insert_own on public.environments;
drop policy environments_update_own on public.environments;
drop policy environments_delete_own on public.environments;

create policy environments_insert_admin on public.environments
  for insert to authenticated
  with check ((select public.is_admin()) and user_id = (select auth.uid()));

create policy environments_update_admin on public.environments
  for update to authenticated
  using ((select public.is_admin()))
  with check ((select public.is_admin()));

create policy environments_delete_admin on public.environments
  for delete to authenticated
  using ((select public.is_admin()));

-- TRUNCATE bypasses RLS. It is not used by the admin UI; DELETE remains allowed
-- through the policy above, with the existing foreign keys/triggers intact.
revoke truncate on public.environments from anon, authenticated;

-- SELECT policies, DML grants, is_admin(), IDs, dates and existing rows stay intact.
commit;
