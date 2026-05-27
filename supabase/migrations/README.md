# Supabase Existing DB Migrations

These files are for updating an existing SV Match Log Web Supabase project.

Run order:

1. `001_admin_archetypes.sql`
2. `002_admin_environments.sql`
3. `003_guest_public_read.sql`
4. `004_backfill_match_archetype_ids.sql`

Notes:

- These migrations avoid `DROP TABLE`, `TRUNCATE`, and user-data deletion.
- `drop policy if exists` is used only to replace RLS policies safely.
- Run `004_backfill_match_archetype_ids.sql` after standard deck archetypes are registered.
