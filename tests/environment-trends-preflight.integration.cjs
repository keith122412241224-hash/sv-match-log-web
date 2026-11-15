/* eslint-disable @typescript-eslint/no-require-imports */
// In-memory PostgreSQL only. Does not read credentials or contact any Supabase project.
require('./register.cjs');
const { test } = require('node:test'), assert = require('node:assert/strict');
const h = require('./environment-trends-db.cjs');
const { parseEnvironmentTrends } = require('../src/lib/environment-trends');
const selection = { environment: h.NEW, period: 'all', ranks: ['unranked'], decks: [h.decks[0].id] };
const date = n => new Date(n).toISOString().slice(0, 10);

test('trend additional calendar boundaries: start precedence, exact end, microseconds, leap day, year and timezone', async t => {
  const db = await h.createDb(); t.after(() => db.close());
  const original = (await db.query("select pg_get_functiondef('private.get_environment_trend_aggregates_v1(uuid,text,text[],uuid[])'::regprocedure) d")).rows[0].d;
  const cases = [
    { start: '2026-11-01', inputStart: '2026-11-03T03:00:00Z', first: '2026-11-01', last: '2026-11-14' },
    { start: '2026-11-03', inputStart: '2026-11-01T03:00:00Z', first: '2026-11-03', last: '2026-11-14' },
    { created: '2026-11-02T15:00:00Z', first: '2026-11-03', last: '2026-11-14' },
    { created: '2026-11-02T15:00:00Z', inputStart: '2026-11-10T00:00:00Z', first: '2026-11-03', last: '2026-11-14' },
    { start: '2026-11-01', inputEnd: '2026-11-05T00:00:00Z', first: '2026-11-01', last: '2026-11-14' },
    { start: '2026-12-01', first: null, last: null },
    { start: '2026-11-01', dashboardEnd: '2026-11-07T15:00:00Z', first: '2026-11-01', last: '2026-11-07' },
    { start: '2026-11-01', dashboardEnd: '2026-11-07T15:00:00.000001Z', first: '2026-11-01', last: '2026-11-08' },
    { start: '2026-11-01', dashboardEnd: '2026-11-07T14:59:59.999999Z', first: '2026-11-01', last: '2026-11-07' },
    { start: '2026-11-01', dashboardEnd: '2026-11-07T15:00:00Z', inputEnd: '2026-11-06T03:05:00Z', first: '2026-11-01', last: '2026-11-07' },
    { start: '2026-11-01', dashboardEnd: '2026-11-05T15:00:00Z', inputEnd: '2026-11-06T03:05:00Z', first: '2026-11-01', last: '2026-11-05' },
    { start: '2026-11-01', dashboardEnd: '2026-12-01T00:00:00Z', inputEnd: '2026-12-02T00:00:00Z', first: '2026-11-01', last: '2026-11-14' },
    { start: '2026-11-01', now: '2026-11-13T15:00:00Z', first: '2026-11-01', last: '2026-11-13' },
    { start: '2026-11-01', now: '2026-11-13T15:29:59Z', first: '2026-11-01', last: '2026-11-13' },
    { start: '2026-11-01', now: '2026-11-13T15:30:00Z', first: '2026-11-01', last: '2026-11-14' },
    { start: '2024-02-28', now: '2024-03-01T03:00:00Z', first: '2024-02-28', last: '2024-03-01' },
    { start: '2025-12-30', now: '2026-01-02T03:00:00Z', first: '2025-12-30', last: '2026-01-02' },
    { start: '2026-11-05', dashboardEnd: '2026-11-01T00:00:00Z', first: null, last: null }
  ];
  for (const c of cases) {
    await db.exec('reset role');
    await db.exec(original.replace(/aggregated_at timestamptz := [^;]+;/, `aggregated_at timestamptz := timestamptz '${c.now || h.NOW}';`));
    await db.query('update public.environments set start_date=$1,match_input_start_at=$2,match_input_end_at=$3,dashboard_end_at=$4,created_at=$5 where id=$6',
      [c.start ?? null, c.inputStart ?? null, c.inputEnd ?? null, c.dashboardEnd ?? null, c.created ?? '2026-10-01T00:00:00Z', h.NEW]);
    await h.identity(db, h.MEMBER);
    for (const period of ['7d', '14d', '30d', 'all']) for (const tz of ['UTC', 'Asia/Tokyo', 'America/New_York']) {
      await db.query("select set_config('TimeZone',$1,false)", [tz]);
      const data = parseEnvironmentTrends(await h.query(db, { ...selection, period }), { ...selection, period });
      const points = data.decks[0].points;
      const first = !c.first ? null : period === 'all' ? c.first : [c.first, date(Date.parse(c.last) - (parseInt(period) - 1) * 86400000)].sort().at(-1);
      assert.equal(points[0]?.date ?? null, first, JSON.stringify(c));
      assert.equal(points.at(-1)?.date ?? null, c.last, JSON.stringify(c));
      assert.ok(points.every(p => p.total === null && p.encounters === null && p.evaluations === null));
    }
  }
  console.log(`${cases.length * 4 * 3} calendar/period/timezone combinations passed`);
});

test('trend exact microsecond source boundaries, six prior days, gap expiry and missing classifications', async t => {
  const db = await h.createDb(); t.after(() => db.close());
  await db.query('update public.environments set start_date=$1,match_input_start_at=$2,dashboard_end_at=$3 where id=$4', ['2026-11-01', '2026-11-01T03:00:00.000001Z', '2026-11-13T15:00:00.000001Z', h.NEW]);
  const rows = [
    h.row({ played_at: '2026-10-31T14:59:59.999999Z' }), // before JST start
    h.row({ played_at: '2026-10-31T15:00:00Z' }), // included despite later input start
    h.row({ played_at: '2026-11-07T14:59:59.999999Z' }), // prior day, not Nov 14 window
    h.row({ played_at: '2026-11-07T15:00:00Z', opponent_archetype_id: null }), // unclassified opponent
    h.row({ played_at: '2026-11-13T15:00:00Z', my_archetype_id: null, opponent_archetype_id: h.decks[0].id, result: 'lose' }),
    h.row({ played_at: '2026-11-13T15:00:00.000001Z' }), // exclusive end
    h.row({ played_at: '2026-11-13T15:00:00Z', environment_id: h.OLD })
  ];
  await h.seed(db, rows);
  const data = parseEnvironmentTrends(await h.query(db, selection), selection), points = data.decks[0].points;
  assert.equal(points[0].total, 1); assert.equal(points[0].wins, 1);
  assert.deepEqual(points.at(-1), { date: '2026-11-14', total: 2, encounters: 1, registrations: 2, evaluations: 2, wins: 2 });
  assert.deepEqual((await h.query(db, { ...selection, period: '7d' })).decks[0].points, points.slice(-7));
  await h.seed(db, [rows[1]]);
  const gap = (await h.query(db, selection)).decks[0].points;
  assert.equal(gap[6].total, 1); assert.equal(gap[7].total, null);
});

test('trend input schedules never alter populated series, and dashboard end agrees with summary', async t => {
  const db = await h.createDb(); t.after(() => db.close());
  await db.query('update public.environments set start_date=$1,match_input_start_at=null,match_input_end_at=null,dashboard_end_at=$2 where id=$3',
    ['2026-11-01', '2026-11-07T15:00:00Z', h.NEW]);
  await h.seed(db, ['2026-10-31T14:59:59.999999Z', '2026-10-31T15:00:00Z', '2026-11-02T00:00:00Z',
    '2026-11-06T00:00:00Z', '2026-11-07T14:59:59.999999Z', '2026-11-07T15:00:00Z'].map(played_at => h.row({ played_at })));
  const baseline = new Map();
  for (const period of ['7d', '14d', '30d', 'all']) baseline.set(period, await h.query(db, { ...selection, period }));
  assert.equal(baseline.get('all').decks[0].points.at(-1).total, 4);
  for (const [start, end] of [[null, '2026-11-05T00:00:00Z'], ['2026-11-03T00:00:00Z', '2026-11-05T00:00:00Z'],
    ['2026-12-01T00:00:00Z', '2026-12-02T00:00:00Z'], [null, null]]) {
    await db.exec('reset role');
    await db.query('update public.environments set match_input_start_at=$1,match_input_end_at=$2 where id=$3', [start, end, h.NEW]);
    await h.identity(db, h.MEMBER);
    for (const [period, expected] of baseline) assert.deepEqual(await h.query(db, { ...selection, period }), expected);
    const summary = (await db.query('select public.get_environment_dashboard_aggregates_v4($1,$2,$3) d', [h.NEW, '7d', selection.ranks])).rows[0].d;
    const point = baseline.get('7d').decks[0].points.at(-1), deck = summary.decks.find(d => d.key === selection.decks[0]).current;
    assert.equal(summary.dataThrough, baseline.get('7d').dataThrough);
    assert.equal(summary.current.total.totalMatches, point.total);
    assert.equal(deck.encounter.count, point.encounters);
    assert.equal(deck.winrate.targetRegistrations, point.registrations);
    assert.equal(deck.winrate.evaluationCount, point.evaluations);
    assert.equal(deck.winrate.wins, point.wins);
  }
});

test('trend full migration ACL/RLS, ordinary member visibility, private entrypoint, spoofed claims and schemas', async t => {
  const { setup, ids } = require('./match-mutations-db.cjs');
  const { db, claim } = await setup(); t.after(() => db.close());
  await db.query('update public.environments set start_date=$1 where id=$2', ['2026-01-01', ids.env]);
  const direct = schema => db.query(`select ${schema}.get_environment_trend_aggregates_v1($1,'7d',$2,$3) data`, [ids.env, ['unranked'], [ids.arch]]);
  await claim(ids.b);
  assert.equal((await db.query('select * from public.matches')).rows.length, 1);
  const member = (await direct('public')).rows[0].data;
  assert.equal(member.decks[0].points.at(-1).total, 2, 'deliberate aggregate scope agrees with existing shared summary');
  assert.equal(member.decks[0].points.at(-1).registrations, 2);
  assert.equal(member.decks[0].points.at(-1).evaluations, 4);
  assert.equal(member.decks[0].points.at(-1).wins, 2);
  assert.deepEqual((await direct('private')).rows[0].data.decks, member.decks);
  for (const secret of [ids.a, ids.b, ids.match, ids.other, '@example.test', 'user_id', 'memo', '非公開B']) assert.ok(!JSON.stringify(member).includes(secret));
  await claim(ids.a); assert.deepEqual((await direct('public')).rows[0].data.decks, member.decks);
  await claim(ids.b);
  await db.exec('create temp table matches (secret text); create temp table environments(secret text); create temp table deck_archetypes(secret text); set search_path=pg_temp,public');
  assert.deepEqual((await direct('public')).rows[0].data.decks, member.decks);
  for (const claims of [{}, { is_anonymous: null }, { is_anonymous: true }, { is_anonymous: 'false' }, { is_anonymous: 0 }, { user_metadata: { is_anonymous: false, admin: true } }]) {
    await claim(ids.b); await db.query("select set_config('request.jwt.claims',$1,false)", [JSON.stringify({ sub: ids.b, ...claims })]);
    for (const schema of ['public', 'private']) await assert.rejects(direct(schema), e => e.code === '42501');
  }
  await claim(null);
  for (const schema of ['public', 'private']) await assert.rejects(direct(schema), e => e.code === '42501');
  await db.exec('reset role');
  const acl = (await db.query("select n.nspname,p.prosecdef,p.provolatile,p.proconfig,p.proowner::regrole::text owner,p.proacl::text acl,has_function_privilege('anon',p.oid,'execute') anon,has_function_privilege('authenticated',p.oid,'execute') member,has_function_privilege('service_role',p.oid,'execute') service from pg_proc p join pg_namespace n on n.oid=p.pronamespace where p.proname='get_environment_trend_aggregates_v1'")).rows;
  assert.equal(acl.length, 2);
  for (const f of acl) { assert.equal(f.prosecdef, f.nspname === 'private'); assert.equal(f.provolatile, 's'); assert.deepEqual(f.proconfig, ['search_path=""']); assert.equal(f.owner, 'postgres'); assert.equal(f.anon, false); assert.equal(f.member, true); assert.equal(f.service, false); assert.ok(!/(\{|,)=/.test(f.acl)); }
});

test('trend SQL input validation rejects injection, malformed arrays, inactive/foreign decks and null identity', async t => {
  const db = await h.createDb(); t.after(() => db.close()); await h.identity(db, h.MEMBER);
  for (const args of [{ period: "all'); drop table public.matches; --" }, { ranks: [null] }, { ranks: [['unranked']] }, { ranks: Array(18).fill('unranked') },
    { decks: [[h.decks[0].id]] }, { decks: Array(1001).fill(h.decks[0].id) }, { environment: null }, { period: null }, { ranks: null }, { decks: null }]) await assert.rejects(h.query(db, args), e => ['22023', '22P02'].includes(e.code));
  const normal = await h.query(db, selection), duplicated = await h.query(db, { ...selection, ranks: ['unranked', 'unranked'], decks: [h.decks[0].id, h.decks[0].id] });
  assert.deepEqual(duplicated.decks, normal.decks);
  await db.exec('reset role'); await db.query('update public.deck_archetypes set is_active=false where id=$1', [h.decks[0].id]); await h.identity(db, h.MEMBER);
  await assert.rejects(h.query(db, selection), e => e.code === '22023');
  await h.identity(db, null, 'authenticated'); await assert.rejects(h.query(db, selection), e => e.code === '42501');
});
