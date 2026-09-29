# Staging catalog audit (read only)

The query in `supabase/checks/staging_schema_audit.sql` only reads catalogs. It does not prove which project is connected, that a migration ran, or that application data is correct. Verify the selected Staging project before running it manually.

This rescue has NOT inspected or changed Staging. The historical `staging-setup.md` and `prepare_rank_testing.sql` remain in the protected original workspace and outside this application checkout. Do not use those historical instructions to provision or upgrade a current database.

Production migrations remain the immutable baseline plus newer timestamp migrations. `schema_production.sql` and legacy SQL are not bootstrap instructions. This audit query is outside migration discovery and is not called by build, tests or deployment.
