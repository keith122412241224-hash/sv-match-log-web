/* eslint-disable @typescript-eslint/no-require-imports */
const { test } = require('node:test'), assert = require('node:assert/strict');
const React = require('react'), { renderToStaticMarkup: render } = require('react-dom/server');
const mock = (p, exports) => { const id = require.resolve(p); require.cache[id] = { id, filename: id, loaded: true, exports }; };
let calls = [], data, error = null, admin = false;
mock('../src/lib/data', { getCurrentUser: async () => ({ id: 'owner' }), getIsAdmin: async () => admin, getEnvironments: async () => [{ id: 'env', name: '環境', created_at: '2026-01-01' }], getDecks: async () => [], getActiveArchetypes: async () => [] });
mock('../src/lib/supabase/server', { createSupabaseServerClient: async () => ({ rpc: async (name, args) => { calls.push({ name, args }); return { data, error }; } }) });
mock('../src/components/AppShell', { AppShell: ({ children }) => React.createElement('main', null, children) });
mock('next/navigation', { useRouter: () => ({ push() {} }) });
const { getMatchupAggregates } = require('../src/lib/matchup-data');
const Page = require('../src/app/matrix/page').default;
const { RANK_ATOMS, expandLegacyRankFilter } = require('../src/lib/rank-selection');
const { ANALYSIS_RANK_FILTERS } = require('../src/lib/analysis-rank-filter');
const scope = require('./matrix-multi-rank-scope.cjs');
const empty = { version: 1, registeredMatches: 0, perspectives: 0, totalWins: 0, groups: [], recent: [] };
test('matrix merges turn/card groups by the exact deck ID pair without changing wins or adding reversed matches', async () => {
  data = { ...empty, registeredMatches: 9, perspectives: 9, totalWins: 5, groups: [
    { myDeckId: 'A', opponentDeckId: 'B', cardMyDeckId: 'A', cardOpponentDeckId: 'B', turnOrder: 'first', total: 3, wins: 2, firstOrder: 1 },
    { myDeckId: 'A', opponentDeckId: 'B', cardMyDeckId: 'A', cardOpponentDeckId: 'B', turnOrder: 'second', total: 4, wins: 2, firstOrder: 2 },
    { myDeckId: null, opponentDeckId: 'legacy', cardMyDeckId: null, cardOpponentDeckId: 'legacy', turnOrder: 'first', total: 2, wins: 1, firstOrder: 3 }
  ] };
  calls = [];
  assert.deepEqual(await getMatchupAggregates('env', true, ['grandmaster:epic', 'master:ruby', 'master:sapphire']), { version: 1, totalMatches: 9, groups: [{ myDeckId: 'A', opponentDeckId: 'B', total: 7, wins: 4 }, { myDeckId: null, opponentDeckId: 'legacy', total: 2, wins: 1 }] });
  assert.deepEqual(calls, [{ name: 'get_analysis_aggregates_v3', args: { p_rank_filters: ['master:ruby', 'master:sapphire', 'grandmaster:epic'], p_environment_id: 'env', p_include_all_users: true, p_include_reversed: false, p_use_archetype: true, p_my_deck_id: null, p_opponent_deck_id: null, p_result: null, p_turn_order: null, p_played_from: null, p_played_to: null, p_recent_deck_ids: [] } }]);
});
test('legacy rank URLs and new equivalent sets use the same original RPC, including unranked in all', async () => {
  data = { version: 1, totalMatches: 0, groups: [] };
  for (const { value } of ANALYSIS_RANK_FILTERS) { calls = []; await getMatchupAggregates('env', false, expandLegacyRankFilter(value)); assert.equal(calls.length, 1); assert.equal(calls[0].name, value === 'all' ? 'get_matchup_aggregates_v1' : 'get_matchup_aggregates_v2'); assert.equal(calls[0].args.p_rank_filter, value === 'all' ? undefined : value); }
});
test('matrix custom rank transport, permission and response failures never fall back to unfiltered data or zero', async () => {
  for (const code of ['42501', 'PGRST202', '22023']) { error = { code }; calls = []; await assert.rejects(() => getMatchupAggregates('env', false, ['unranked'])); assert.equal(calls.length, 1); }
  error = null;
  for (data of [null, { ...empty, registeredMatches: 1 }, { ...empty, registeredMatches: 1, perspectives: 2, totalWins: 1, groups: [{ myDeckId: 'A', opponentDeckId: 'B', cardMyDeckId: 'A', cardOpponentDeckId: 'B', turnOrder: 'first', total: 2, wins: 1, firstOrder: 1 }] }]) await assert.rejects(() => getMatchupAggregates('env', false, ['a', 'aa']));
});
test('invalid/empty/ambiguous URL ranks and environments never issue an aggregate RPC', async () => {
  for (const params of [{ ranks: '' }, { ranks: 'unknown' }, { ranks: ['a', 'aa'] }, { rank: '' }, { rank: 'unknown' }, { ranks: 'a', rank: 'master' }, { environment: '' }, { environment: 'bad' }, { environment: ['env', 'env'] }]) {
    calls = []; assert.match(render(await Page({ searchParams: Promise.resolve(params) })), /role="alert"/); assert.deepEqual(calls, []);
  }
});
test('page renders reused multi-selector, old URLs, canonical ranks and member scope guard', async () => {
  for (admin of [false, true]) for (const rank of ['all', 'master', 'grandmaster-plus', 'master:ruby']) {
    data = { version: 1, totalMatches: 0, groups: [] }; calls = [];
    const html = render(await Page({ searchParams: Promise.resolve({ rank, scope: 'all' }) }));
    assert.ok(html.includes(`name="ranks" value="${expandLegacyRankFilter(rank).join(',')}"`));
    assert.match(html, /aria-haspopup="dialog"/); assert.doesNotMatch(html, /name="rank"/); assert.equal(calls[0].args.p_include_all_users, admin);
  }
  data = empty; calls = [];
  assert.match(render(await Page({ searchParams: Promise.resolve({ ranks: 'a,unranked,a' }) })), /name="ranks" value="unranked,a"/);
  assert.deepEqual(calls[0].args.p_rank_filters, ['unranked', 'a']);
  assert.equal(RANK_ATOMS[0], 'unranked');
});

test('matrix multi-rank changes only four pinned product files; SQL, analysis, OBS, Creator, auth, rates, renderer and dependencies remain unchanged', () => {
  const cp = require('node:child_process');
  const git = args => cp.execFileSync('git', args, { encoding: 'utf8', maxBuffer: 64e6 }).replaceAll('\r\n', '\n');
  const files = git(['ls-tree', '-r', '--name-only', scope.base]).trim().split('\n').filter(f => /^(src|supabase)\//.test(f) || /^package(-lock)?\.json$/.test(f));
  for (const file of files) assert.equal(scope.readBeforeMatrixMultiRank(file), git(['show', scope.base + ':' + file]), file);
  assert.deepEqual(git(['ls-files', '--cached', '--others', '--exclude-standard', '--', 'src', 'supabase']).trim().split('\n').sort(), files.filter(f => /^(src|supabase)\//.test(f)).sort());
});
