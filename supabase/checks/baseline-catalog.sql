-- SELECT-only audit. Run as postgres. No migrations or repair commands.
with app_tables as (
  select c.*, n.nspname from pg_class c join pg_namespace n on n.oid=c.relnamespace
  where n.nspname='public' and c.relkind in ('r','p','v','m','S')
), app_functions as (
  select p.* from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public' and p.prokind in ('f','p')
    and not exists(select 1 from pg_depend d where d.classid='pg_proc'::regclass
      and d.objid=p.oid and d.deptype='e')
)
select jsonb_build_object(
  'check','migration-step1-production-catalog-v1',
  'checked_at',statement_timestamp(),
  'server_version',current_setting('server_version'),
  'current_role',current_user,
  'schemas',(select jsonb_agg(jsonb_build_object('name',nspname,'owner',pg_get_userbyid(nspowner),'acl',nspacl::text) order by nspname) from pg_namespace where nspname in ('public','supabase_migrations')),
  'relations',(select jsonb_agg(jsonb_build_object('name',relname,'kind',relkind,'owner',pg_get_userbyid(relowner),'rls',relrowsecurity,'forced_rls',relforcerowsecurity,'acl',relacl::text,'options',reloptions,'view_definition',case when relkind in ('v','m') then pg_get_viewdef(oid,true) else null end) order by relname) from app_tables),
  'columns',(select jsonb_agg(jsonb_build_object('table',c.relname,'position',a.attnum,'name',a.attname,'type',format_type(a.atttypid,a.atttypmod),'nullable',not a.attnotnull,'default',pg_get_expr(d.adbin,d.adrelid),'identity',a.attidentity,'generated',a.attgenerated,'acl',a.attacl::text) order by c.relname,a.attnum) from app_tables c join pg_attribute a on a.attrelid=c.oid left join pg_attrdef d on d.adrelid=c.oid and d.adnum=a.attnum where a.attnum>0 and not a.attisdropped),
  'constraints',(select jsonb_agg(jsonb_build_object('table',c.relname,'name',x.conname,'type',x.contype,'validated',x.convalidated,'deferrable',x.condeferrable,'initially_deferred',x.condeferred,'definition',pg_get_constraintdef(x.oid)) order by c.relname,x.conname) from app_tables c join pg_constraint x on x.conrelid=c.oid),
  'indexes',(select jsonb_agg(jsonb_build_object('table',c.relname,'name',i.relname,'valid',x.indisvalid,'ready',x.indisready,'unique',x.indisunique,'definition',pg_get_indexdef(x.indexrelid)) order by c.relname,i.relname) from app_tables c join pg_index x on x.indrelid=c.oid join pg_class i on i.oid=x.indexrelid),
  'policies',(select jsonb_agg(to_jsonb(p) order by p.tablename,p.policyname) from pg_policies p where p.schemaname='public'),
  'functions',(select jsonb_agg(jsonb_build_object('name',p.proname,'signature',p.oid::regprocedure::text,'owner',pg_get_userbyid(p.proowner),'definition',pg_get_functiondef(p.oid),'definition_md5',md5(pg_get_functiondef(p.oid)),'body_md5',md5(btrim(replace(p.prosrc,E'\r\n',E'\n'),E' \t\r\n')),'arguments',pg_get_function_arguments(p.oid),'result',pg_get_function_result(p.oid),'security_invoker',not p.prosecdef,'volatility',p.provolatile,'settings',p.proconfig,'acl',p.proacl::text,'public_execute',exists(select 1 from aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a where a.grantee=0 and a.privilege_type='EXECUTE'),'anon_execute',has_function_privilege('anon',p.oid,'execute'),'authenticated_execute',has_function_privilege('authenticated',p.oid,'execute'),'service_role_execute',has_function_privilege('service_role',p.oid,'execute')) order by p.proname,p.oid::regprocedure::text) from app_functions p),
  'triggers',(select jsonb_agg(jsonb_build_object('schema',n.nspname,'table',c.relname,'name',t.tgname,'enabled',t.tgenabled,'function',t.tgfoid::regprocedure::text,'definition',pg_get_triggerdef(t.oid)) order by n.nspname,c.relname,t.tgname) from pg_trigger t join pg_class c on c.oid=t.tgrelid join pg_namespace n on n.oid=c.relnamespace where not t.tgisinternal and (n.nspname='public' or (n.nspname='auth' and c.relname='users'))),
  'enums',(select jsonb_agg(to_jsonb(x) order by x.name) from (select t.typname name,array_agg(e.enumlabel order by e.enumsortorder) labels from pg_type t join pg_namespace n on n.oid=t.typnamespace join pg_enum e on e.enumtypid=t.oid where n.nspname='public' group by t.typname) x),
  'table_grants',(select jsonb_agg(to_jsonb(g) order by g.table_name,g.grantee,g.privilege_type) from information_schema.table_privileges g where g.table_schema='public'),
  'default_privileges',(select jsonb_agg(jsonb_build_object('owner',pg_get_userbyid(d.defaclrole),'schema',n.nspname,'object_type',d.defaclobjtype,'acl',d.defaclacl::text) order by d.defaclrole,d.defaclnamespace,d.defaclobjtype) from pg_default_acl d left join pg_namespace n on n.oid=d.defaclnamespace where d.defaclnamespace=0 or n.nspname='public'),
  'roles',(select jsonb_agg(jsonb_build_object('name',rolname,'superuser',rolsuper,'inherit',rolinherit,'bypass_rls',rolbypassrls,'settings',rolconfig) order by rolname) from pg_roles where rolname in ('anon','authenticated','service_role','authenticator')),
  'role_database_settings',(select jsonb_agg(jsonb_build_object('role',coalesce(r.rolname,'(all roles)'),'database',coalesce(b.datname,'(all databases)'),'settings',s.setconfig)) from pg_db_role_setting s left join pg_roles r on r.oid=s.setrole left join pg_database b on b.oid=s.setdatabase where s.setrole=0 or r.rolname in ('anon','authenticated','service_role','authenticator')),
  'migration_history_table',to_regclass('supabase_migrations.schema_migrations')::text,
  'migration_history_xml',case when to_regclass('supabase_migrations.schema_migrations') is not null then query_to_xml('select to_jsonb(h) as entry from supabase_migrations.schema_migrations h',true,false,'')::text else null end,
  'counts',(select jsonb_build_object('matches',count(*),'rank_null',count(*) filter(where rank_tier is null),'rank_present',count(*) filter(where rank_tier is not null)) from public.matches),
  'backfill_candidates',jsonb_build_object(
    'my_side',(select count(*) from public.matches m join public.decks d on d.id=m.my_deck_id where m.my_archetype_id is null and exists(select 1 from public.deck_archetypes a where a.name=d.name and a.class_name=d.class_name and a.is_active)),
    'opponent_side',(select count(*) from public.matches m join public.decks d on d.id=m.opponent_deck_id where m.opponent_archetype_id is null and exists(select 1 from public.deck_archetypes a where a.name=d.name and a.class_name=d.class_name and a.is_active))
  ),
  'removed_archetype_status',(select coalesce(jsonb_agg(jsonb_build_object('class_name',a.class_name,'name',a.name,'active',a.is_active,'user_deck_references',(select count(*) from public.user_decks u where u.archetype_id=a.id),'match_references',(select count(*) from public.matches m where m.my_archetype_id=a.id or m.opponent_archetype_id=a.id)) order by a.class_name,a.name),'[]'::jsonb) from public.deck_archetypes a where a.class_name in ('エルフ','ロイヤル','ウィッチ','ドラゴン','ナイトメア','ビショップ','ネメシス') and a.name='その他'||a.class_name)
) as audit;
