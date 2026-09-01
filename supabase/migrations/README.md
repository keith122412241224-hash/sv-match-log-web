# Supabase Existing DB Migrations

These files are for updating an existing SV Match Log Web Supabase project.

Run order:

1. `001_admin_archetypes.sql`
2. `002_admin_environments.sql`
3. `003_guest_public_read.sql`
4. `004_backfill_match_archetype_ids.sql`
5. `005_authenticated_app_table_grants.sql`
6. `006_restore_user_owned_decks_matches_policies.sql`
7. `007_remove_other_archetypes.sql`
8. `008_home_dashboard_rpc.sql`
9. `009_admin_all_matches_analysis.sql`

Notes:

- These migrations avoid `DROP TABLE`, `TRUNCATE`, and user-data deletion.
- `drop policy if exists` is used only to replace RLS policies safely.
- Run `004_backfill_match_archetype_ids.sql` after standard deck archetypes are registered.
