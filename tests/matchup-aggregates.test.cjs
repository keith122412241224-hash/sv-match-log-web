/* eslint-disable @typescript-eslint/no-require-imports */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
const { buildWinRateMatrix } = require('../src/lib/analytics');
const { parseMatchupAggregates, buildWinRateMatrixFromAggregates } = require('../src/lib/matchup-aggregates');

const decks = ['B', 'A', 'C'].map(id => ({ id, name: 'Same name', class_name: 'エルフ' }));
const group = (myDeckId, opponentDeckId, total, wins) => ({ myDeckId, opponentDeckId, total, wins });
const payload = groups => ({ version: 1, totalMatches: groups.reduce((n, g) => n + g.total, 0), groups });

test('matrix presentation matches the untouched production implementation at every count and color boundary', () => {
  for (const total of [0, 1, 4, 5, 19, 20, 21, 100]) {
    for (let wins = 0; wins <= total; wins++) {
      const matches = Array.from({ length: total }, (_, i) => ({ my_deck_id: 'A', opponent_deck_id: 'B', result: i < wins ? 'win' : 'lose' }));
      const result = payload(total ? [group('A', 'B', total, wins)] : []);
      assert.deepEqual(buildWinRateMatrixFromAggregates(parseMatchupAggregates(result), decks, decks), buildWinRateMatrix(matches, decks, decks));
    }
  }
});

test('unknown and null groups retain registered totals without adding visible decks or changing order', () => {
  const result = payload([group(null, 'B', 1, 0), group('unknown', 'B', 2, 1), group('A', 'A', 3, 2)]);
  const rows = buildWinRateMatrixFromAggregates(parseMatchupAggregates(result), decks, decks);
  assert.equal(result.totalMatches, 6);
  assert.deepEqual(rows.map(row => row.myDeck.id), ['B', 'A', 'C']);
  assert.deepEqual(rows[0].cells.map(cell => cell.opponentDeckId), ['B', 'A', 'C']);
  assert.equal(rows.flatMap(row => row.cells).length, 9);
  assert.equal(rows[1].cells[1].total, 3);
  assert.equal(rows[1].cells[1].wins, 2);
  assert.equal(rows[0].cells[0].winRate, null);
});

test('RPC response validation distinguishes true zero from errors, truncation and unsafe counts', () => {
  assert.deepEqual(parseMatchupAggregates(payload([])), payload([]));
  for (const value of [null, [], {}, { version: 2, totalMatches: 0, groups: [] },
    { version: 1, totalMatches: 1, groups: [] },
    payload([group('A', 'B', 1, 2)]), payload([group('A', 'B', 0, 0)]),
    payload([group('A', 'B', -1, 0)]), payload([group('A', 'B', 1.5, 1)]),
    payload([group('A', 'B', 1, 1), group('A', 'B', 1, 0)]),
    payload([group(undefined, 'B', 1, 1)]), payload([group('', 'B', 1, 1)]),
    payload([group('A', 'B', Number.MAX_SAFE_INTEGER + 1, 1)]),
    { version: 1, totalMatches: 0, groups: [null] },
    { version: 1, totalMatches: '0', groups: [] }]) {
    assert.throws(() => parseMatchupAggregates(value), /相性表データ/);
  }
});

let user = { id: 'owner' };
let admin = false;
let response = { data: payload([]), error: null };
let calls = [];
let observedRows;
let activeDecks = decks;
const mock = (relative, exports) => {
  const filename = require.resolve(relative);
  require.cache[filename] = { id: filename, filename, loaded: true, exports };
};
mock('../src/lib/data', {
  getCurrentUser: async () => user,
  getIsAdmin: async () => admin,
  getEnvironments: async () => [{ id: 'old', created_at: '2020-01-01' }, { id: 'new', created_at: '2021-01-01' }],
  getDecks: async () => decks,
  getActiveArchetypes: async () => activeDecks,
  getMatches: () => { throw new Error('Matrix must not fetch raw matches'); }
});
mock('../src/lib/supabase/server', { createSupabaseServerClient: async () => ({
  rpc: async (...args) => { calls.push(args); if (response instanceof Error) throw response; return response; },
  from: () => { throw new Error('No raw table reads in aggregate loader'); }
}) });
mock('../src/components/AppShell', { AppShell: ({ children }) => React.createElement('main', null, children) });
mock('../src/components/MatchupMatrix', { MatchupMatrix: props => { observedRows = props.rows; return React.createElement('div'); } });
const { getMatchupAggregates } = require('../src/lib/matchup-data');
const MatrixPage = require('../src/app/matrix/page').default;

test('aggregate loader makes one RPC, no raw fallback, and preserves anonymous page behavior', async () => {
  calls = [];
  response = { data: payload([group('A', 'B', 10000, 5000)]), error: null };
  assert.equal((await getMatchupAggregates('environment', true)).totalMatches, 10000);
  assert.deepEqual(calls, [['get_matchup_aggregates_v1', { p_environment_id: 'environment', p_include_all_users: true }]]);
  calls = [];
  user = null;
  assert.deepEqual(await getMatchupAggregates(), payload([]));
  assert.equal(calls.length, 0);
  user = { id: 'owner' };
});

test('RPC failures propagate instead of displaying a successful empty matrix', async () => {
  for (response of [{ data: null, error: { code: '42883' } }, { data: null, error: null }, new Error('network failed')]) {
    await assert.rejects(() => getMatchupAggregates());
    await assert.rejects(() => MatrixPage({ searchParams: Promise.resolve({}) }));
  }
  response = { data: payload([]), error: null };
});

test('actual matrix page keeps environment fallback, admin scope, active-deck choice and legacy deck order', async () => {
  response = { data: payload([group('A', 'B', 1, 1)]), error: null };
  for (const isAdmin of [false, true]) {
    admin = isAdmin;
    for (const archetypes of [decks.slice(1), []]) {
      activeDecks = archetypes;
      calls = [];
      renderToStaticMarkup(await MatrixPage({ searchParams: Promise.resolve({ scope: 'all', environment: 'invalid' }) }));
      assert.deepEqual(calls, [['get_matchup_aggregates_v1', { p_environment_id: 'new', p_include_all_users: isAdmin }]]);
      const visible = archetypes.length ? archetypes : decks;
      assert.deepEqual(observedRows, buildWinRateMatrix([{ my_deck_id: 'A', opponent_deck_id: 'B', result: 'win' }], visible, visible));
    }
  }
  calls = [];
  renderToStaticMarkup(await MatrixPage({ searchParams: Promise.resolve({ environment: 'old', scope: 'mine' }) }));
  assert.equal(calls[0][1].p_environment_id, 'old');
  assert.equal(calls[0][1].p_include_all_users, false);
});
