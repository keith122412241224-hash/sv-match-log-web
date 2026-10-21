/* eslint-disable @typescript-eslint/no-require-imports */
const { test } = require('node:test'), assert = require('node:assert/strict'), fs = require('node:fs');
const h = require('./matrix-multi-rank-db.cjs');
const { RANK_ATOMS, RANK_PRESETS, expandLegacyRankFilter } = require('../src/lib/rank-selection');
const { ANALYSIS_RANK_FILTERS } = require('../src/lib/analysis-rank-filter');
const { buildWinRateMatrix } = require('../src/lib/analytics');
const { buildWinRateMatrixFromAggregates } = require('../src/lib/matchup-aggregates');
let db, who = h.MEMBER, calls = [];
const mock = (p, exports) => { const id = require.resolve(p); require.cache[id] = { id, filename: id, loaded: true, exports }; };
mock('../src/lib/data', { getCurrentUser: async () => who ? { id: who } : null });
mock('../src/lib/supabase/server', { createSupabaseServerClient: async () => ({ rpc: async (name, args) => {
  calls.push({ name, args });
  try { return { data: await h.rpc(db, name, args), error: null }; } catch (error) { return { data: null, error }; }
} }) });
const { getMatchupAggregates } = require('../src/lib/matchup-data');
test('matrix multi-rank: real SQL, actual loader, legacy parity, RLS, missing metadata and scale', { timeout: 180000 }, async t => {
  db = await h.createDb(); t.after(() => db.close());
  const catalog = async () => (await db.query("select n.nspname,p.proname,pg_get_functiondef(p.oid) definition,p.proacl::text acl from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname in ('public','private') order by 1,2,p.oid")).rows;
  const before = await catalog(), rows = h.fixture(), report = { localOnly: true, comparisons: 0, legacy: 0, performance: [] };
  await h.seed(db, rows);
  const selections = [RANK_ATOMS, ...RANK_ATOMS.map(v => [v]), ...RANK_PRESETS.map(p => p.ranks), ['a', 'aa'], ['master:ruby', 'master:sapphire', 'grandmaster:epic'], ['unranked', 'a'], ['a', 'master:ruby', 'master:sapphire', 'master:diamond', 'grandmaster:none']];
  const visible = [...h.decks, ...[300, 301].map(n => ({ id: h.uuid(n), name: '同名の旧デッキ', class_name: 'エルフ' }))];
  const canonical = p => ({ ...p, groups: p.groups.toSorted((a, b) => JSON.stringify([a.myDeckId, a.opponentDeckId]).localeCompare(JSON.stringify([b.myDeckId, b.opponentDeckId]))) });
  for (who of [h.MEMBER, h.ADMIN]) for (const all of [false, true]) for (const env of [h.NEW, h.OLD, h.EMPTY]) {
    await h.identity(db, who);
    for (const selection of selections) {
      calls = [];
      const actual = await getMatchupAggregates(env, all, selection);
      const source = rows.filter(r => r.environment_id === env && (r.user_id === who || (who === h.ADMIN && all)) && selection.includes(h.atom(r)));
      assert.equal(actual.totalMatches, source.length);
      for (const decks of [visible, visible.slice(-2), h.decks]) assert.deepEqual(buildWinRateMatrixFromAggregates(actual, decks, decks), buildWinRateMatrix(source, decks, decks));
      assert.equal(calls.length, 1);
      if (calls[0].name === 'get_analysis_aggregates_v3') { assert.equal(calls[0].args.p_include_reversed, false); assert.deepEqual(calls[0].args.p_recent_deck_ids, []); }
      report.comparisons++;
    }
    for (const { value } of ANALYSIS_RANK_FILTERS) {
      const old = await h.rpc(db, value === 'all' ? 'get_matchup_aggregates_v1' : 'get_matchup_aggregates_v2', { p_environment_id: env, p_include_all_users: all, ...(value === 'all' ? {} : { p_rank_filter: value }) });
      assert.deepEqual(canonical(await getMatchupAggregates(env, all, expandLegacyRankFilter(value))), canonical(old)); report.legacy++;
    }
  }
  // A NULL whole rank is valid, but missing Master/GM children are forbidden by the deployed constraint.
  await db.exec('reset role');
  for (const rank_tier of ['master', 'grandmaster']) await assert.rejects(() => db.query('insert into public.matches select * from jsonb_populate_recordset(null::public.matches,$1::jsonb)', [JSON.stringify([h.row({ rank_tier })])]), e => e.code === '23514');
  for (const bad of [[], ['wrong'], [null], ['master'], Array(18).fill('a')]) {
    calls = []; await assert.rejects(() => getMatchupAggregates(h.NEW, false, bad)); assert.equal(calls.length, 0);
    await assert.rejects(() => h.rpc(db, 'get_analysis_aggregates_v3', { p_rank_filters: bad }), e => e.code === '22023');
  }
  await h.identity(db, null, 'anon');
  for (const name of ['get_matchup_aggregates_v1', 'get_matchup_aggregates_v2', 'get_analysis_aggregates_v3']) await assert.rejects(() => h.rpc(db, name, {}), e => e.code === '42501');
  who = null; calls = []; assert.equal((await getMatchupAggregates(h.NEW, true, ['unranked', 'a'])).totalMatches, 0); assert.equal(calls.length, 0);
  who = h.ADMIN; await h.identity(db, who);
  await db.exec('reset role;begin;drop policy matches_select_own_or_admin on public.matches;create policy local_own_only on public.matches for select to authenticated using(auth.uid()=user_id)');
  await h.identity(db, who);
  assert.equal((await getMatchupAggregates(h.NEW, true, ['a', 'aa'])).totalMatches, rows.filter(r => r.user_id === who && r.environment_id === h.NEW && ['a', 'aa'].includes(h.atom(r))).length);
  await db.exec('reset role;rollback');
  // JSON aggregate responses are not subject to a 1000-row source fetch cap.
  const large = Array.from({ length: 10000 }, (_, i) => h.row({ rank_tier: i % 2 ? 'a' : 'aa', my_archetype_id: h.uuid(10000 + Math.floor(i / 100)), opponent_archetype_id: h.uuid(10000 + i % 100), result: i % 3 ? 'win' : 'lose' }));
  await h.seed(db, large); who = h.MEMBER; await h.identity(db, who);
  const start = performance.now(), result = await getMatchupAggregates(h.NEW, false, ['a', 'aa']);
  assert.equal(result.totalMatches, 10000); assert.equal(result.groups.length, 10000); assert.equal(result.groups.reduce((n, g) => n + g.wins, 0), large.filter(r => r.result === 'win').length);
  report.performance.push({ matches: 10000, pairs: result.groups.length, milliseconds: performance.now() - start, bytes: Buffer.byteLength(JSON.stringify(result)) });
  await db.exec('reset role'); assert.deepEqual(await catalog(), before);
  report.passed = true; fs.mkdirSync('build/matrix-multi-rank', { recursive: true }); fs.writeFileSync('build/matrix-multi-rank/integration.json', JSON.stringify(report, null, 2));
});
