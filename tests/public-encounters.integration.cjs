/* eslint-disable @typescript-eslint/no-require-imports */
// In-memory PostgreSQL only. Run from the repository root.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
process.env.PGLITE_MODULE ||= path.resolve('build/migration-step2-baseline/tools/node_modules/@electric-sql/pglite');
require('./register.cjs');
const h = require('./period-report-environment-db.cjs');
const { buildEnvironmentViewV4, parseEnvironmentDashboardV4 } = require('../src/lib/environment-dashboard-v4');
const { initialDashboardPeriod } = require('../src/lib/environment-dashboard-period');
const { RANK_ATOMS } = require('../src/lib/rank-selection');
const { getPublicEncounterSnapshot } = require('../src/lib/public-encounter-snapshot');
const server = require('../src/lib/supabase/server');
const migrations = 'supabase/migrations/';
const read = name => fs.readFileSync(migrations + name, 'utf8');

test('public encounters match member rankings, cache boundaries and anonymous permissions', async t => {
  const db = await h.createDb();
  t.after(() => db.close());
  const schedule = read('20260928060000_environment_match_input_schedule.sql');
  await db.exec(schedule.slice(schedule.indexOf('create function public.is_match_input_window_open'), schedule.indexOf('-- Close the race')));
  await db.exec(read('20261010042525_environment_dashboard_v4.sql'));
  await db.exec('revoke usage on schema private from anon');
  await db.exec(read('20261126105932_public_encounter_top3.sql'));
  const ids = [200, 201, 202, 203].map(h.uuid);
  for (const id of ids.slice(2)) await db.query("insert into public.deck_archetypes values ($1::uuid,($1::uuid)::text,'エルフ',false)", [id]);
  const owner = () => db.exec('reset role');
  const anon = () => h.identity(db, null, 'anon');
  const expire = async () => {
    await owner();
    await db.exec("update private.public_encounter_cache set refreshed_at = refreshed_at - interval '5 minutes'");
  };
  const call = async (id = h.NEW) => (await db.query('select public.get_current_public_encounters($1) as data', [id])).rows[0].data;
  const member = async period => {
    await h.identity(db, h.MEMBER);
    const raw = (await db.query("select public.get_environment_dashboard_aggregates_v4($1,$2) as data", [h.NEW, period])).rows[0].data;
    return parseEnvironmentDashboardV4(raw, { environment:h.NEW, period, ranks:RANK_ATOMS });
  };
  const through = (await member('7d')).current.end;
  const beforeEnd = new Date(Date.parse(through)-1000).toISOString();
  const beforeStart = new Date(Date.parse(through)-7*86400000-1000).toISOString();
  const row = (id, extras) => h.row({played_at:beforeEnd, opponent_archetype_id:id, ...extras});
  const compare = async (period, expectedRows) => {
    const data = await member(period);
    const ranking = buildEnvironmentViewV4(data).encounters.slice(0,3).map(({name, encounterRate}) => ({name, encounterRate}));
    await anon();
    const pub = await call();
    assert.equal(ranking.length,expectedRows);
    if (!ranking.length) { assert.equal(pub,null); return; }
    assert.deepEqual(Object.keys(pub).sort(), ['decks','environmentName','periodEnd','periodStart','totalMatches','updatedAt']);
    assert.equal(pub.environmentName,h.environments[0].name);
    assert.deepEqual(pub.decks,ranking);
    assert.equal(pub.totalMatches,data.current.total.totalMatches);
    assert.equal(pub.periodStart, data.current.start);
    assert.equal(pub.periodEnd, data.current.end);
    assert.ok(Number.isFinite(Date.parse(pub.updatedAt)));
    return pub;
  };
  await t.test('no registrations or only unclassified opponents', async () => {
    await compare('7d',0);
    await h.seed(db,[row(null)]); await expire(); await compare('7d',0);
  });
  await t.test('one and two decks, cache hits and refresh on expiry', async () => {
    await h.seed(db,[row(ids[0]),row(null)]); await anon();
    assert.equal(await call(),null); // cached empty response
    await expire(); const one = await compare('7d',1);
    await h.seed(db,[row(ids[0]),row(ids[1]),row(null)]); await anon();
    assert.deepEqual(await call(),one);
    await expire(); await compare('7d',2);
  });
  await t.test('all ranks, ties at the third slot, inactive archetypes, denominators and boundaries', async () => {
    const rows = h.ranks.map((rank,i) => row(ids[i%4],rank));
    rows.push(row(null),row(ids[3],{played_at:through}),row(ids[1],{played_at:beforeStart}),
      row(ids[0],{environment_id:h.OLD}),row(null,{played_at:new Date(Date.parse(through)-7*86400000).toISOString()}));
    await h.seed(db,rows); await expire();
    const ranked = await compare(initialDashboardPeriod(undefined,null),3);
    assert.equal(ranked.totalMatches,19);
    await owner();
    await db.query('update public.environments set dashboard_end_at=$1 where id=$2',[through,h.NEW]);
    const all = await compare(initialDashboardPeriod(undefined,through),3);
    assert.equal(all.totalMatches,20);
    assert.equal(all.periodStart,null);
  });
  await t.test('failed aggregation rolls back the cache claim and the next request can recover', async () => {
    await expire();
    await db.exec('begin');
    try {
      await db.exec('alter table public.matches rename to temporarily_unavailable_matches');
      await db.exec('savepoint before_refresh');
      await anon();
      await assert.rejects(() => call(),{code:'42P01'});
      await db.exec('rollback to savepoint before_refresh');
      const {rows} = await db.query("select refreshed_at <= now() - interval '5 minutes' as expired from private.public_encounter_cache where environment_id=$1",[h.NEW]);
      assert.equal(rows[0].expired,true);
    } finally {
      await db.exec('rollback');
    }
    await compare('all',3);
  });
  await t.test('old environment cannot be queried or reused across a scheduled switch', async () => {
    await owner();
    await db.query("update public.environments set match_input_end_at=now() where id=$1",[h.NEW]);
    await db.query("update public.environments set allow_match_input=true,match_input_start_at=now() where id=$1",[h.EMPTY]);
    await anon(); assert.equal(await call(h.NEW),null); assert.equal(await call(h.EMPTY),null);
    await owner();
    await db.exec('update public.environments set allow_match_input=false');
    await anon(); assert.equal(await call(h.NEW),null);
  });
  await t.test('anonymous SQL role has only the public projection; member RPC and raw rows remain restricted', async () => {
    await anon();
    for (const sql of ["select public.get_environment_dashboard_aggregates_v4($1,'7d')",
      "select private.get_environment_dashboard_aggregates_v4($1,'7d')"]) {
      await assert.rejects(() => db.query(sql,[h.NEW]),{code:'42501'});
    }
    for (const sql of ['select * from private.public_encounter_cache','select * from public.matches'])
      await assert.rejects(() => db.exec(sql),{code:'42501'});
  });
  await t.test('component loader fails closed on RPC errors, invalid payloads or environment changes', async t => {
    const environment = h.environments[0];
    let response;
    t.mock.method(server,'createSupabaseServerClient',async () => ({rpc:async (name,args) => {
      assert.equal(name,'get_current_public_encounters');
      assert.deepEqual(args,{p_expected_environment_id:environment.id});
      if (response instanceof Error) throw response;
      return response;
    }}));
    const valid = {environmentName:environment.name,periodStart:null,periodEnd:through,updatedAt:through,totalMatches:2,decks:[{name:'A',encounterRate:50}]};
    response={data:valid,error:null};
    assert.deepEqual((await getPublicEncounterSnapshot(environment)).decks,valid.decks);
    for (response of [new Error('connection unavailable'),{error:{code:'57014'},data:valid},
      {data:{...valid,environmentName:'previous'}},{data:{...valid,decks:[]}}, {data:null}])
      assert.equal(await getPublicEncounterSnapshot(environment),null);
  });
});
