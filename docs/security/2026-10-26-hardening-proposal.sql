-- REVIEW PROPOSAL ONLY. Not an applied migration.
-- Validated only in disposable PostgreSQL. Production application requires approval.
-- Keep is_admin() callable: RLS and invoker RPCs rely on it, including public reads.
-- Keep suggestion_private.approvals deny-by-default: access is through guarded functions.
begin;
set local lock_timeout = '3s';
set local statement_timeout = '30s';
revoke execute on function public.handle_new_user() from public, anon, authenticated;
alter function public.set_updated_at() set search_path = '';
-- TRUNCATE is not row-filtered by RLS and is not used by application CRUD/RPCs.
revoke truncate on table public.profiles, public.decks, public.admin_users,
  public.user_decks, public.deck_suggestions, public.deck_archetypes,
  public.deck_aliases, public.matches from public, anon, authenticated;
commit;
