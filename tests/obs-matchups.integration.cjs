/* eslint-disable @typescript-eslint/no-require-imports */
const { test } = require('node:test'), assert = require('node:assert/strict');
const h = require('./obs-matchups-db.cjs');
const { parseAnalysisAggregates, buildAnalysisFromAggregates } = require('../src/lib/analysis-aggregates');
const { buildWinRateMatrix } = require('../src/lib/analytics');
const { buildEnvironmentViewV3 } = require('../src/lib/environment-dashboard-v3');
const { analysisPerspectives } = require('../src/lib/match-perspectives');

test('existing combined RPC gives each registration once per non-mirror direction, complementary wins, and unchanged mirror evaluations', async t => {
  const db = await h.createDb(); t.after(() => db.close());
  await db.exec(h.read(h.migration)); await h.identity(db);
  const anchor = await h.environment(db), source = [];
  for (let i = 0; i < 5; i++) for (let j = 0; j < 5; j++) for (let k = 0; k < 1 + i * 3 + j; k++)
    source.push(h.row({ played_at: anchor.current.start, my_archetype_id: h.decks[i].id, opponent_archetype_id: h.decks[j].id,
      my_deck_id: h.decks[i].id, opponent_deck_id: h.decks[j].id, result: k % 3 ? 'win' : 'lose', turn_order: k % 2 ? 'first' : 'second' }));
  await h.seed(db, source);
  const d = await h.environment(db), raw = await h.analysis(db, d, { combined: true });
  const aggregates = parseAnalysisAggregates(raw, []);
  assert.equal(aggregates.registeredMatches, source.length);
  assert.equal(aggregates.perspectives, source.length * 2);
  assert.equal(d.current.total.totalMatches, source.length);
  const top = buildEnvironmentViewV3(d).encounters.map(r => ({ id: r.key, name: r.name, class_name: r.className ?? '' }));
  const cells = buildAnalysisFromAggregates(aggregates, top, top).matrix.flatMap(r => r.cells);
  const views = analysisPerspectives(source, 'combined');
  assert.deepEqual(buildAnalysisFromAggregates(aggregates, top, top).matrix, buildWinRateMatrix(views, top, top));
  assert.equal(cells.length, 25);
  for (const cell of cells) {
    const direct = source.filter(m => m.my_archetype_id === cell.myDeckId && m.opponent_archetype_id === cell.opponentDeckId);
    if (cell.myDeckId === cell.opponentDeckId) {
      assert.equal(cell.total, direct.length * 2); assert.equal(cell.wins, direct.length); assert.equal(cell.winRate, 50);
      continue;
    }
    const pair = source.filter(m => (m.my_archetype_id === cell.myDeckId && m.opponent_archetype_id === cell.opponentDeckId)
      || (m.my_archetype_id === cell.opponentDeckId && m.opponent_archetype_id === cell.myDeckId));
    const side = views.filter(m => m.my_archetype_id === cell.myDeckId && m.opponent_archetype_id === cell.opponentDeckId);
    assert.equal(new Set(side.map(m => m.id)).size, side.length, 'No registration repeated within one directional cell');
    assert.deepEqual(side.map(m => m.id).sort(), pair.map(m => m.id).sort());
    assert.equal(cell.total, pair.length);
    const opposite = cells.find(c => c.myDeckId === cell.opponentDeckId && c.opponentDeckId === cell.myDeckId);
    assert.equal(cell.total, opposite.total); assert.equal(cell.wins + opposite.wins, cell.total);
    assert.ok(Math.abs(cell.winRate + opposite.winRate - 100) < 1e-10);
    assert.ok(Math.abs(Number(cell.winRate.toFixed(1)) + Number(opposite.winRate.toFixed(1)) - 100) <= 0.100001);
  }
});
test('exclusive RPC: actual SQL metadata, RLS/ACL, boundaries and all 25 existing matrix cells', async t => {
  const db = await h.createDb();
  t.after(() => db.close());
  const metadata = async name => (await db.query("select pg_get_functiondef(oid) as def,proowner::regrole::text as owner,prosecdef,provolatile,proconfig,proacl::text as acl from pg_proc where pronamespace='public'::regnamespace and proname=$1", [name])).rows[0];
  const before = await metadata('get_analysis_aggregates_v3');
  const policies = async () => (await db.query('select * from pg_policies order by schemaname,tablename,policyname')).rows;
  const oldPolicies = await policies();
  await db.exec(h.read(h.migration));
  assert.deepEqual(await metadata('get_analysis_aggregates_v3'), before);
  assert.deepEqual(await policies(), oldPolicies);
  const added = await metadata('get_analysis_aggregates_v3_exclusive');
  assert.deepEqual({ ...added, def: added.def.replaceAll('get_analysis_aggregates_v3_exclusive', 'get_analysis_aggregates_v3').replace('m.played_at < p_played_to', 'm.played_at <= p_played_to') }, before);
  assert.equal(added.owner, 'postgres'); assert.equal(added.prosecdef, false); assert.equal(added.provolatile, 's');
  await h.identity(db);
  const anchor = await h.environment(db);
  // Arithmetic here creates boundary fixtures, never adjusts RPC arguments.
  const start = Date.parse(anchor.current.start), end = Date.parse(anchor.current.end);
  const boundaryTimes = [new Date(start - 1).toISOString(), anchor.current.start, new Date(end - 1).toISOString(), anchor.current.end, new Date(end + 1).toISOString()];
  // Include PostgreSQL microsecond precision immediately before end as well.
  const microBefore = (await db.query("select ($1::timestamptz - interval '1 microsecond')::text as t", [anchor.current.end])).rows[0].t;
  const rows = boundaryTimes.map(played_at => h.row({ played_at }));
  rows.push(h.row({ played_at: microBefore }));
  await h.seed(db, rows);
  await db.exec('begin isolation level repeatable read');
  const dashboard = await h.environment(db), exclusive = await h.analysis(db, dashboard, { recent: null });
  assert.equal(dashboard.current.start, anchor.current.start); assert.equal(dashboard.current.end, anchor.current.end);
  assert.equal(dashboard.current.total.totalMatches, 3); assert.equal(exclusive.registeredMatches, 3);
  assert.deepEqual(exclusive.recent.flatMap(r => r.views.map(v => v.id)).sort(), [rows[1].id, rows[2].id, rows[5].id].sort());
  assert.equal((await h.analysis(db, dashboard, { name: 'get_analysis_aggregates_v3' })).registeredMatches, 4);
  // Evaluate each single source row under both real functions, proving membership,
  // not just equality of totals. All calls stay in the same transaction snapshot.
  await db.exec('reset role');
  for (let i = 0; i < rows.length; i++) {
    await db.query('delete from public.matches where id<>$1', [rows[i].id]);
    if (i > 0) await db.query('insert into public.matches select * from jsonb_populate_record(null::public.matches,$1::jsonb)', [JSON.stringify(rows[i])]);
    await h.identity(db);
    const d = await h.environment(db), a = await h.analysis(db, d);
    assert.equal(d.current.total.totalMatches ?? 0, [1, 2, 5].includes(i) ? 1 : 0);
    assert.equal(a.registeredMatches, d.current.total.totalMatches ?? 0);
    await db.exec('reset role');
  }
  await db.exec('rollback');

  const fixture = [];
  for (let i = 0; i < 5; i++) for (let j = 0; j < 5; j++) for (let k = 0; k <= i + j; k++) {
    fixture.push(h.row({ played_at: anchor.current.start, my_archetype_id: h.decks[i].id, opponent_archetype_id: h.decks[j].id,
      my_deck_id: h.decks[i].id, opponent_deck_id: h.decks[j].id, result: k % 3 ? 'win' : 'lose', turn_order: k % 2 ? 'first' : 'second',
      user_id: k % 2 ? h.MEMBER : h.OTHER, ...(k % 3 ? { rank_tier: 'master', master_group: 'ruby' } : {}) }));
  }
  fixture.push(h.row({ played_at: anchor.current.start, environment_id: h.OLD }));
  await h.seed(db, fixture);
  await db.exec('begin isolation level repeatable read');
  for (const env of [h.NEW, h.OLD]) for (const ranks of [['unranked'], ['master:ruby'], ['unranked', 'master:ruby']]) {
    const d = await h.environment(db, env, ranks), a = parseAnalysisAggregates(await h.analysis(db, d), []);
    assert.equal(a.registeredMatches, d.current.total.totalMatches ?? 0);
    const source = fixture.filter(r => r.environment_id === env && ranks.includes(r.rank_tier ? 'master:ruby' : 'unranked'));
    assert.equal(a.registeredMatches, source.length);
    const ids = (await h.analysis(db, d, { recent: null })).recent.flatMap(r => r.views.map(v => v.id));
    assert.ok(ids.every(id => source.some(r => r.id === id)));
    const top = buildEnvironmentViewV3(d).encounters.map(r => ({ id: r.key, name: r.name, class_name: r.className ?? '' }));
    const matrix = buildAnalysisFromAggregates(a, top, top).matrix;
    // Independent existing raw-match matrix path, including diagonal cells.
    const expected = buildWinRateMatrix(source, top, top);
    assert.deepEqual(matrix, expected);
    if (env === h.NEW && ranks.length === 2) assert.equal(matrix.flatMap(r => r.cells).length, 25);
    const combined = parseAnalysisAggregates(await h.analysis(db, d, { combined: true }), []);
    assert.equal(combined.registeredMatches, source.length); assert.equal(combined.perspectives, source.length * 2); assert.equal(combined.totalWins, source.length);
    // No end-bound rows in this fixture: direct/combined/full recent JSON must
    // remain exactly equal to the original v3 for all existing filter modes.
    for (const options of [{}, { combined: true, recent: null }, { my: h.decks[0].id, result: 'win', turn: 'first' }, { opponent: h.decks[1].id, combined: true, recent: [h.decks[0].id] }])
      assert.deepEqual(await h.analysis(db, d, options), await h.analysis(db, d, { ...options, name: 'get_analysis_aggregates_v3' }));
  }
  await db.exec('commit');
  const d = await h.environment(db, h.NEW, ['unranked', 'master:ruby']);
  await h.identity(db, h.MEMBER);
  const own = fixture.filter(r => r.environment_id === h.NEW && r.user_id === h.MEMBER).length;
  assert.equal((await h.analysis(db, d)).registeredMatches, own);
  assert.equal((await h.analysis(db, d, { all: false })).registeredMatches, own);
  await h.identity(db, h.ADMIN); assert.equal((await h.analysis(db, d)).registeredMatches, fixture.length - 1);
  await h.identity(db, null, 'anon'); await assert.rejects(() => h.analysis(db, d), e => e.code === '42501');
  await h.identity(db, null, 'service_role'); assert.equal((await h.analysis(db, d)).registeredMatches, 0);
  await h.identity(db, h.ADMIN, 'service_role'); assert.equal((await h.analysis(db, d)).registeredMatches, fixture.length - 1);
  await h.identity(db);
  for (const ranks of [[], ['all'], [null], null, Array(18).fill('unranked')]) await assert.rejects(() => h.analysis(db, { ...d, rankFilters: ranks }), e => e.code === '22023');
  assert.deepEqual(await h.analysis(db, { ...d, rankFilters: ['unranked', 'unranked'] }), await h.analysis(db, { ...d, rankFilters: ['unranked'] }));
});
