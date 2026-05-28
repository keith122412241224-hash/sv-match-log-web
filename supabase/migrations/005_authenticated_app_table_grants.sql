-- Existing DB migration: grant authenticated users access to app-owned tables.
-- RLS still restricts rows to each owner/admin policy; this does not expose user match data.

grant usage on schema public to authenticated;
grant select on public.admin_users to authenticated;
grant select, insert, update on public.profiles to authenticated;
grant select, insert, update, delete on public.decks to authenticated;
grant select, insert, update, delete on public.matches to authenticated;
grant select, insert, update, delete on public.user_decks to authenticated;
grant select, insert, update on public.deck_suggestions to authenticated;
