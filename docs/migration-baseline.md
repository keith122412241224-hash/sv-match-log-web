# Baseline adoption candidate — not approved for Production history synchronization

Production reference: `2158fa50b1d83dde2dd22ecd527c0f604b719538`.
CLI is pinned to **2.118.0** by `.supabase-cli-version` (documentation pin; verify `supabase --version` explicitly).
`supabase/config.toml`: PG17, migrations enabled, no declarative schema paths, seed disabled with no seed paths, pg-delta enabled. This configuration does not introduce an automatic migration deployment.

The baseline is an application schema, not a substitute for Supabase auth, managed roles, extensions, or services. It uses existing auth.users/auth.uid(), plpgsql and core gen_random_uuid(). Supabase-owned defaults remain platform prerequisites. Production catalog parity was verified on the official Supabase local stack (PostgreSQL 17.6, CLI 2.118.0). Step 3 completed two local resets with one baseline, exact application catalog parity, Auth login and seven PostgREST RPC comparisons. Step 4 repeats reset and catalog comparison using the adoption candidate.

## Local rehearsal (not Production)

In a disposable checkout, with no Production link and CLI2.118.0:

```text
supabase start
supabase db reset --local
supabase migration list --local
```

Collect `supabase/checks/baseline-catalog.sql` output with a local SQL client, then compare it with the reviewed Production catalog:

```text
node scripts/compare-baseline-catalog.cjs <production-catalog.json> <local-catalog.json>
```

Expect 9 tables/67 columns/4 enums/29 constraints/23 indexes/29 policies/10 functions/4 application triggers, matching definitions/attributes/ACLs, and a single applied version20260928010000. Repeat `db reset --local`, recollect and compare both to Production and the first local result. Review any difference; never silently ignore changed app ACL/policy/function definitions. Run the app regression tests using local fixtures; historical tests explicitly read archived SQL and are separate from fresh-install verification.

No synthetic Production matches or auth identities belong in migrations/seeds. Schema-empty startup is valid; useful registration requires a reviewed environment and deck catalog plus authenticated users. Bootstrap catalogs/admin assignment are separate, explicit provisioning operations. No automatic seed is supplied.

## Future Production history synchronization (plan only)

Do not proceed until real-stack rehearsal and repo review pass, the exact baseline hash is frozen, and a separate authorization covers Production metadata changes.

1. After separate approval, commit/push only the reviewed Step 4 candidate and verify the immutable baseline hash. This is a future Step 5 action, not part of preparation. Re-audit Production schema/RPC/ACL and history absence, record backup/recovery point and baseline file hash. Verify correct project reference and no automated db push.
2. Authenticate via supported CLI login/access-token handling; link the exact approved project with `supabase link --project-ref <verified-ref>`. DB credentials/management authorization are separate from app anon credentials. Do not place passwords in checked-in scripts. Verify local version inventory contains only the baseline. No `--yes`, `--include-all`, `--include-seed` or `--include-roles` shortcuts.
3. After separate approval, intended command:

```text
supabase migration repair --linked --status applied 20260928010000
```

CLI2.118.0 `migration-history.ts` first probes version/name/statements columns. If missing it opens a setup transaction with lock_timeout4s, creates schema `supabase_migrations`, creates `schema_migrations(version text primary key)`, adds `statements text[]` and `name text`, then commits. The repair handler parses the local file and UPSERTs version/name/statements in another transaction. **Parsed baseline statements are stored as text, not executed.** Seed history is not created by this repair path. Actual metadata ACL/ownership inherit the executing connection and database defaults and must be audited.

The setup transaction is distinct from the row transaction: a later file-read or UPSERT failure can leave an empty history schema/table. Do not assume a failed repair leaves no metadata. Explicitly read back state before any retry.

4. Recheck the single history row, version/name/statements, application object hashes and counts; `supabase migration list --linked` must show the same sole baseline locally/remotely. Only after this is approved, `supabase db push --linked --dry-run` should show no pending migration. Do not run an actual push for baseline synchronization. If baseline appears pending, STOP.
5. Future migrations must use later timestamps. CLI pending detection compares versions, not file-content hashes; changing an already-recorded baseline is not detected as a pending migration. Keep the baseline immutable and verify its hash independently.

## History-only reversal

If separately authorized, `supabase migration repair --linked --status reverted 20260928010000` deletes that version's history row; it does not undo application DDL and does not remove newly created metadata schema/table. This does NOT restore the original absence of the history schema/table. Prefer leaving empty metadata while migration deployment is disabled. Removing newly created metadata to restore exact absence would require a separate dependency/ownership audit and explicit approval; it is not an automatic rollback step. Save the pre/post repair metadata evidence before any reversal. This returns baseline to pending status, so keep db push disabled until resolved. Restoring a previously existing row requires its saved contents, not an assumed inverse command. Never drop application objects or run the baseline as a rollback.

## Step4 review scope

Baseline SQL, legacy archive+manifest, migration-only `.gitattributes` preserving reviewed SQL bytes across checkouts, this guide and migration README, CLI config/version pin, catalog comparison script/SQL, layout test, historical test path updates. Exclude node_modules, CLI binaries/source downloads, build artifacts, logs, Production audit JSON and local credentials. No app behavior changes. Existing `supabase/schema_production.sql` is retained only for historical test fixtures, not a new-environment bootstrap.

Official specification: https://supabase.com/docs/reference/cli/supabase-migration-repair
Fixed source: https://github.com/supabase/cli/tree/v2.118.0/apps/cli/src/command-internal

## Incremental changes

Version `20260928010000` is the Production baseline. Legacy SQL must never be executed. Create only newer UTC timestamp migrations; manage DB changes through migrations and avoid manual SQL Editor DDL. Validate each change with `db reset --local`, catalog review and affected regression tests before deployment. Production already has the baseline schema; only separately authorized history synchronization remains.

## Frozen baseline

SHA-256: `013fe4297dd057efcf2762cbcbf7071bb3b318bd5f9a02f836617707369ab20b`. The layout test enforces this hash and every archived SQL hash. `.gitattributes` disables text conversion for these SQL paths so Windows checkout conversion cannot invalidate the reviewed bytes. Historical tests may construct disposable fixture databases from archived snapshots; they are not migration deployment paths and must never target Production.
