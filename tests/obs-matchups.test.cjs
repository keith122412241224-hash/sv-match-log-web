/* eslint-disable @typescript-eslint/no-require-imports */
const { test } = require('node:test'), assert = require('node:assert/strict'), fs = require('node:fs'), cp = require('node:child_process');
const React = require('react'), { renderToStaticMarkup: render } = require('react-dom/server');
require.extensions['.css'] = module => { module.exports = { __esModule: true, default: new Proxy({}, { get: (_, key) => String(key) }) }; };
const { dashboard, environments } = require('./obs-environment-fixture.cjs');
const { aggregates } = require('./obs-matchups-fixture.cjs');
const { buildEnvironmentViewV3 } = require('../src/lib/environment-dashboard-v3');
const { buildAnalysisFromAggregates, parseAnalysisAggregates } = require('../src/lib/analysis-aggregates');
const { ObsMatchupMatrix } = require('../src/components/environment/ObsMatchupMatrix');
const migration = 'supabase/migrations/20261004022333_analysis_aggregates_v3_exclusive.sql';
const read = f => fs.readFileSync(f, 'utf8').replaceAll('\r\n', '\n');
test('exclusive SQL definition and ACL are v3-identical after only name and end comparison normalization', () => {
  const old = read('supabase/migrations/20260930071612_multi_rank_aggregates.sql');
  const sql = read(migration), normalized = sql.replaceAll('get_analysis_aggregates_v3_exclusive', 'get_analysis_aggregates_v3').replace('m.played_at < p_played_to', 'm.played_at <= p_played_to');
  const extract = s => s.match(/CREATE FUNCTION public\.get_analysis_aggregates_v3\([\s\S]*?\$function\$;/)[0];
  assert.equal(extract(normalized), extract(old));
  const acl = s => s.split('\n').filter(line => /^(alter function|revoke all|grant execute).*public\.get_analysis_aggregates_v3\(/.test(line));
  assert.deepEqual(acl(normalized), acl(old)); assert.equal(acl(normalized).length, 3);
  assert.equal((sql.match(/m\.played_at < p_played_to/g) || []).length, 1);
  assert.match(sql, /BEGIN;[\s\S]*COMMIT;/);
  assert.doesNotMatch(sql, /CREATE OR REPLACE|create table|alter table|create policy|security definer/i);
});
test('OBS loader passes dashboard bounds/ranks verbatim and renders all 25 existing cells in encounter order', async () => {
  let response = { data: aggregates(), error: null }, calls = [];
  const id = require.resolve('../src/lib/supabase/server');
  require.cache[id] = { id, filename: id, loaded: true, exports: { createSupabaseServerClient: async () => ({ rpc: async (name, args) => { calls.push({ name, args }); return response; } }) } };
  const { getObsEnvironmentMatchups } = require('../src/lib/obs-environment-matchups');
  for (const period of ['24h', '3d', '7d', '30d']) for (const ranks of [['unranked'], ['master:ruby'], ['a', 'master:ruby']]) {
    const data = dashboard({ p_environment_id: environments[0].id, p_period: period, p_rank_filters: ranks });
    // Non-round, microsecond timestamps prove no Date serialization/correction.
    data.current.start = '2026-10-01T01:02:03.123456Z'; data.current.end = '2026-10-02T01:02:03.654321Z';
    const rows = await getObsEnvironmentMatchups(data);
    assert.deepEqual(calls.at(-1), { name: 'get_analysis_aggregates_v3_exclusive', args: {
      p_environment_id: data.environmentId, p_played_from: data.current.start, p_played_to: data.current.end, p_rank_filters: data.rankFilters,
      p_include_all_users: true, p_include_reversed: true, p_use_archetype: true, p_recent_deck_ids: [],
      p_my_deck_id: null, p_opponent_deck_id: null, p_result: null, p_turn_order: null
    } });
    const top = buildEnvironmentViewV3(data).encounters.map(r => ({ id: r.key, name: r.name, class_name: r.className ?? '' }));
    assert.deepEqual(rows, buildAnalysisFromAggregates(parseAnalysisAggregates(response.data, []), top, top).matrix);
    assert.deepEqual(rows.map(r => r.myDeck.id), top.map(d => d.id));
    const before = structuredClone(rows);
    const html = render(React.createElement(ObsMatchupMatrix, { rows }));
    assert.deepEqual(rows, before, 'OBS rendering must not mutate internal cell values');
    assert.equal((html.match(/<td /g) || []).length, 25);
    for (const row of rows) for (const cell of row.cells) {
      const td = html.match(new RegExp(`data-row="${cell.myDeckId}" data-column="${cell.opponentDeckId}"[^>]*>(.*?)</td>`))[1];
      if (cell.myDeckId === cell.opponentDeckId) {
        assert.match(td, /<strong>—<\/strong>/); assert.doesNotMatch(td, /<small>|%/);
        assert.ok(html.includes(`class="empty" data-row="${cell.myDeckId}" data-column="${cell.opponentDeckId}"`));
        assert.equal(cell.winRate, 50); assert.ok(cell.total > 0);
      } else {
        assert.ok(td.includes(`${cell.winRate.toFixed(1)}%`)); assert.ok(td.includes(`${cell.total}戦`));
        const opposite = rows.find(r => r.myDeck.id === cell.opponentDeckId).cells.find(c => c.opponentDeckId === cell.myDeckId);
        assert.equal(cell.total, opposite.total); assert.equal(cell.wins + opposite.wins, cell.total);
        assert.ok(Math.abs(cell.winRate + opposite.winRate - 100) < 1e-10);
      }
    }
    for (const deck of top) assert.ok(html.includes(deck.name));
    assert.match(html, /3戦 · 参考/); assert.doesNotMatch(html, /…/);
  }
  const d = dashboard({ p_environment_id: environments[0].id, p_period: '7d', p_rank_filters: ['unranked'] });
  response = { error: { code: '42883' }, data: null }; await assert.rejects(() => getObsEnvironmentMatchups(d));
  response = { error: null, data: {} }; await assert.rejects(() => getObsEnvironmentMatchups(d));
  const incomplete = aggregates(); incomplete.registeredMatches = incomplete.perspectives;
  response = { error: null, data: incomplete }; await assert.rejects(() => getObsEnvironmentMatchups(d), /取得できませんでした/);
  const empty = dashboard({ p_environment_id: environments[0].id, p_period: '7d', p_rank_filters: ['unranked'] }, 'empty');
  const count = calls.length; assert.deepEqual(await getObsEnvironmentMatchups(empty), []); assert.equal(calls.length, count);
  assert.match(render(React.createElement(ObsMatchupMatrix, { rows: null })), /role="alert"/);
  assert.match(render(React.createElement(ObsMatchupMatrix, { rows: [] })), /表示できるデータがありません/);
});
test('exclusive RPC scope: existing SQL and all ordinary routes/aggregation stay byte-identical', () => {
  const base = '9ad9a7ed3ececcaec95e9b84b02067192a37bb59';
  const git = args => cp.execFileSync('git', args, { encoding: 'utf8', maxBuffer: 64e6 }).replaceAll('\r\n', '\n');
  const files = git(['ls-tree', '-r', '--name-only', base]).trim().split('\n').filter(f => /^(src|supabase)\//.test(f) || /^package(-lock)?\.json$/.test(f));
  const changed = ['src/app/admin/obs/environment/page.tsx', 'src/components/environment/ObsEnvironmentView.tsx'];
  for (const f of files.filter(f => !changed.includes(f))) assert.equal(read(f), git(['show', base + ':' + f]), f);
  const added = [migration, 'src/lib/obs-environment-matchups.ts', 'src/components/environment/ObsMatchupMatrix.tsx', 'src/components/environment/ObsMatchupMatrix.module.css'];
  assert.deepEqual(git(['ls-files', '--cached', '--others', '--exclude-standard', '--', 'src', 'supabase']).trim().split('\n').sort(), [...files.filter(f => /^(src|supabase)\//.test(f)), ...added].sort());
  const usages = [...files.filter(f => f.startsWith('src/')), ...added.filter(f => f.startsWith('src/'))].filter(f => read(f).includes('get_analysis_aggregates_v3_exclusive'));
  assert.deepEqual(usages, ['src/lib/obs-environment-matchups.ts']);
});

test('OBS combined/mirror correction changes only its loader and table; every existing RPC, SQL, ordinary UI and URL contract is unchanged', () => {
  const base = 'a7283c06aa5b9911a4daa1ae3923eb32b2b8c98a';
  const git = args => cp.execFileSync('git', args, { encoding: 'utf8', maxBuffer: 64e6 }).replaceAll('\r\n', '\n');
  const files = git(['ls-tree', '-r', '--name-only', base]).trim().split('\n').filter(f => /^(src|supabase)\//.test(f) || /^package(-lock)?\.json$/.test(f));
  const allowed = ['src/lib/obs-environment-matchups.ts', 'src/components/environment/ObsMatchupMatrix.tsx'];
  for (const file of files.filter(f => !allowed.includes(f))) assert.equal(read(file), git(['show', base + ':' + file]), file);
  assert.deepEqual(git(['ls-files', '--cached', '--others', '--exclude-standard', '--', 'src', 'supabase']).trim().split('\n').sort(), files.filter(f => /^(src|supabase)\//.test(f)).sort());
});
