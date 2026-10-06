/* eslint-disable @typescript-eslint/no-require-imports */
const fs = require('node:fs');
const path = require('node:path');
const { PGlite } = require(process.env.PGLITE_MODULE || path.resolve('build/migration-step2-baseline/tools/node_modules/@electric-sql/pglite'));
const uuid = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const ADMIN = uuid(1), MEMBER = uuid(2);
const migration = fs.readdirSync('supabase/migrations').find(f => f.endsWith('_creator_tier_tools.sql'));
async function createDb() {
  const db = await PGlite.create();
  await db.exec(`create role anon nologin; create role authenticated nologin;
    create schema auth; create schema storage;
    create table auth.users(id uuid primary key);
    create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
    create function auth.jwt() returns jsonb language sql stable as $$select coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb$$;
    create table public.admin_users(id uuid primary key default gen_random_uuid(), user_id uuid);
    create function public.is_admin() returns boolean language sql security definer set search_path='' as $$select exists(select 1 from public.admin_users where user_id=auth.uid())$$;
    create table public.deck_archetypes(id uuid primary key, name text, sort_order integer default 0);
    create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
    create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text references storage.buckets,name text,unique(bucket_id,name));
    alter table storage.objects enable row level security;
    grant usage on schema public,auth,storage to anon,authenticated;
    grant select,insert,update,delete on storage.objects to anon,authenticated;
    grant select on public.admin_users,public.deck_archetypes to authenticated;
    insert into auth.users values('${ADMIN}'),('${MEMBER}');
    insert into public.admin_users(user_id) values('${ADMIN}');
    insert into public.deck_archetypes(id,name) values('${uuid(50)}','標準デッキA');`);
  await db.exec(fs.readFileSync('supabase/migrations/' + migration, 'utf8'));
  const correlationMigration = fs.readdirSync('supabase/migrations').find(f => f.endsWith('_creator_correlations.sql'));
  if (correlationMigration) await db.exec(fs.readFileSync('supabase/migrations/' + correlationMigration, 'utf8'));
  await identity(db);
  return db;
}
async function identity(db, user = ADMIN, role = 'authenticated', anonymous = false) {
  if (!['anon', 'authenticated'].includes(role)) throw Error('invalid test role');
  await db.exec('reset role');
  await db.query("select set_config('request.jwt.claim.sub',$1,false),set_config('request.jwt.claims',$2,false)", [user || '', JSON.stringify({ sub: user, is_anonymous: anonymous })]);
  await db.exec('set role ' + role);
}
module.exports = { createDb, identity, ADMIN, MEMBER, uuid, migration };
