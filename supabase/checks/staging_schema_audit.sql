-- Run only in sv-match-log-web-staging's SQL Editor.
-- Read-only catalog inspection. Does not read player records or change data/schema.
-- Copy the single schema_audit result (or export the result as CSV).
with target_tables(name) as (
  values ('profiles'), ('environments'), ('admin_users'), ('deck_archetypes'),
         ('deck_aliases'), ('user_decks'), ('deck_suggestions'), ('decks'), ('matches')
)
select jsonb_pretty(jsonb_build_object(
  'tables', (
    select jsonb_agg(jsonb_build_object(
      'name', t.name,
      'exists', c.oid is not null,
      'rls_enabled', c.relrowsecurity,
      'rls_forced', c.relforcerowsecurity,
      'estimated_rows', c.reltuples
    ) order by t.name)
    from target_tables t
    left join pg_namespace n on n.nspname = 'public'
    left join pg_class c on c.relnamespace = n.oid and c.relname = t.name and c.relkind in ('r', 'p')
  ),
  'columns', (
    select jsonb_agg(jsonb_build_object(
      'table', table_name, 'column', column_name,
      'type', udt_name, 'nullable', is_nullable, 'default', column_default
    ) order by table_name, ordinal_position)
    from information_schema.columns
    where table_schema = 'public' and table_name in (select name from target_tables)
  ),
  'constraints', (
    select jsonb_agg(jsonb_build_object(
      'table', r.relname, 'name', c.conname, 'validated', c.convalidated,
      'definition', pg_get_constraintdef(c.oid)
    ) order by r.relname, c.conname)
    from pg_constraint c
    join pg_class r on r.oid = c.conrelid
    join pg_namespace n on n.oid = r.relnamespace
    where n.nspname = 'public' and r.relname in (select name from target_tables)
  ),
  'indexes', (
    select jsonb_agg(jsonb_build_object(
      'table', tablename, 'name', indexname, 'definition', indexdef
    ) order by tablename, indexname)
    from pg_indexes
    where schemaname = 'public' and tablename in (select name from target_tables)
  ),
  'policies', (
    select jsonb_agg(jsonb_build_object(
      'table', tablename, 'name', policyname, 'command', cmd,
      'roles', roles, 'permissive', permissive, 'using', qual, 'with_check', with_check
    ) order by tablename, policyname)
    from pg_policies
    where schemaname = 'public' and tablename in (select name from target_tables)
  ),
  'grants', (
    select jsonb_agg(jsonb_build_object(
      'table', table_name, 'role', grantee, 'privilege', privilege_type
    ) order by table_name, grantee, privilege_type)
    from information_schema.table_privileges
    where table_schema = 'public' and table_name in (select name from target_tables)
      and grantee in ('anon', 'authenticated', 'service_role', 'PUBLIC')
  ),
  'functions', (
    select jsonb_agg(jsonb_build_object(
      'name', p.proname, 'definition', pg_get_functiondef(p.oid), 'acl', p.proacl
    ) order by p.proname, p.oid)
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.prokind = 'f'
      and p.proname in ('is_admin', 'get_home_dashboard', 'set_updated_at', 'require_match_rank_on_insert')
  ),
  'triggers', (
    select jsonb_agg(jsonb_build_object(
      'table', r.relname, 'name', t.tgname, 'enabled', t.tgenabled,
      'definition', pg_get_triggerdef(t.oid)
    ) order by r.relname, t.tgname)
    from pg_trigger t
    join pg_class r on r.oid = t.tgrelid
    join pg_namespace n on n.oid = r.relnamespace
    where n.nspname = 'public' and not t.tgisinternal
      and r.relname in (select name from target_tables)
  ),
  'enum_values', (
    select jsonb_agg(jsonb_build_object('type', t.typname, 'value', e.enumlabel) order by t.typname, e.enumsortorder)
    from pg_type t
    join pg_namespace n on n.oid = t.typnamespace
    join pg_enum e on e.enumtypid = t.oid
    where n.nspname = 'public'
      and t.typname in ('deck_type', 'turn_order', 'match_result', 'suggestion_status')
  ),
  'migration_history_table_exists', to_regclass('supabase_migrations.schema_migrations') is not null
)) as schema_audit;
