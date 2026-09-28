# Active migrations

The only initial migration is `20260928010000_production_baseline.sql`.
It targets an empty application schema on a provisioned Supabase platform.
Never execute this baseline on existing Production. History synchronization requires a separately approved operation.

Historical SQL is retained under `../legacy-migrations/pre-baseline/`, outside CLI migration discovery. Its manifest preserves audited file hashes. Do not copy those files back here or apply them to Production.

Use a UTC timestamp later than the baseline for subsequent incremental migrations.
CLI version: `.supabase-cli-version`. See [the migration guide](../../docs/migration-baseline.md) for verification and history synchronization gates.

Production already has this schema. Do not apply the baseline body there. History synchronization is a separate step. Make DB changes through new UTC timestamp migrations, avoid manual SQL Editor DDL, and verify every migration with `db reset --local` and affected tests.
