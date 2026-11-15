/* eslint-disable @typescript-eslint/no-require-imports */
// Fresh in-memory PostgreSQL. Never connects to a hosted database.
const h = require('./obs-matchups-db.cjs');
const fs = require('node:fs');
const assert = require('node:assert/strict');
const migration = 'supabase/migrations/' + fs.readdirSync('supabase/migrations').find(f => f.endsWith('_environment_trends.sql'));
const NOW = '2026-11-14T09:13:00Z', END = '2026-11-14T09:00:00Z', START = '2026-09-30T15:00:00Z';
async function createDb() {
  const db = await h.createDb();
  await db.exec(h.read('supabase/migrations/20261010042525_environment_dashboard_v4.sql'));
  await db.exec('alter table public.deck_archetypes add column environment_id uuid');
  await db.query('update public.environments set start_date=$1,match_input_start_at=$2,match_input_end_at=null,created_at=$3 where id=$4', ['2026-10-01', '2026-10-01T03:00:00Z', '2026-09-01T00:00:00Z', h.NEW]);
  const policies = (await db.query('select * from pg_policies order by schemaname,tablename,policyname')).rows;
  const functions = (await db.query("select p.oid,pg_get_functiondef(p.oid) as definition,p.proacl::text from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname in ('public','private') order by p.oid")).rows;
  // PGlite cannot model concurrent sessions; native release test verifies CONCURRENTLY.
  await db.exec(h.read(migration).replace(/create index concurrently/gi, 'create index'));
  await db.exec(h.read('supabase/migrations/20261114212352_environment_trends_rpc.sql'));
  assert.deepEqual((await db.query('select * from pg_policies order by schemaname,tablename,policyname')).rows, policies);
  assert.deepEqual((await db.query("select p.oid,pg_get_functiondef(p.oid) as definition,p.proacl::text from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname in ('public','private') and p.proname <> 'get_environment_trend_aggregates_v1' order by p.oid")).rows, functions);
  for (const [name, signature] of [['get_environment_trend_aggregates_v1', 'uuid,text,text[],uuid[]'], ['get_environment_dashboard_aggregates_v4', 'uuid,text,text[]']]) {
    const def = (await db.query(`select pg_get_functiondef('private.${name}(${signature})'::regprocedure) as d`)).rows[0].d;
    await db.exec(def.replace('pg_catalog.statement_timestamp()', `timestamptz '${NOW}'`));
  }
  return db;
}
async function query(db, { environment = h.NEW, period = '30d', ranks = ['unranked'], decks = h.decks.map(d => d.id) } = {}) {
  return (await db.query('select public.get_environment_trend_aggregates_v1($1,$2,$3,$4) as data', [environment, period, ranks, decks])).rows[0].data;
}
module.exports = { ...h, createDb, query, migration, NOW, END, START };
