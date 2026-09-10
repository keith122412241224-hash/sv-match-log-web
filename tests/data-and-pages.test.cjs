/* eslint-disable @typescript-eslint/no-require-imports */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
let admin = true;
let currentUser = { id: 'owner' };
let records = [];
let calls = [];
const decks = ['A', 'B'].map(id => ({ id, name: id, class_name: 'エルフ', is_active: true }));
const environment = { id: 'environment', name: 'Test environment', created_at: '2026-09-01', allow_match_input: true };
function mockModule(relative, exports) {
  const filename = require.resolve(relative);
  require.cache[filename] = { id: filename, filename, loaded: true, exports };
}
const supabase = {
  auth: { getUser: async () => ({ data: { user: currentUser } }) },
  from(table) {
    const call = { table, filters: [], orders: [] };
    calls.push(call);
    const query = {
      select(columns) { call.columns = columns; return query; },
      eq(field, value) { call.filters.push(['eq', field, value]); return query; },
      gte(field, value) { call.filters.push(['gte', field, value]); return query; },
      lte(field, value) { call.filters.push(['lte', field, value]); return query; },
      order(field, options) { call.orders.push([field, options]); return query; },
      range(from, to) { call.range = [from, to]; return query; },
      maybeSingle() { return Promise.resolve({ data: admin ? { id: 'admin' } : null }); },
      then(resolve, reject) {
        let data = table === 'matches' ? records : table === 'environments' ? [environment] : decks;
        if (table === 'matches') {
          data = data.filter(row => call.filters.every(([op, key, value]) => op === 'eq' ? row[key] === value : op === 'gte' ? row[key] >= value : row[key] <= value));
          if (call.range) data = data.slice(call.range[0], call.range[1] + 1);
        }
        return Promise.resolve({ data, error: null }).then(resolve, reject);
      }
    };
    return query;
  }
};
mockModule('../src/lib/supabase/server', { createSupabaseServerClient: async () => supabase });
mockModule('../src/components/AppShell', { AppShell: ({ children }) => React.createElement('main', null, children) });
const data = require('../src/lib/data');
const AnalysisPage = require('../src/app/analysis/page').default;
const { buildWeeklyReport, buildWeeklyPeriod } = require('../src/lib/weekly-report');
const { WeeklyReportTables } = require('../src/components/admin/WeeklyReportViews');
function record(i, extra = {}) {
  return { id: String(i), user_id: 'owner', environment_id: 'environment', my_deck_id: 'A', opponent_deck_id: 'B', my_archetype_id: 'A', opponent_archetype_id: 'B', result: 'win', turn_order: 'first', played_at: '2026-09-05T01:00:00.000Z', ...extra };
}

test('analysis and report queries retrieve 2,505 rows with stable paging; no mutation queries', async () => {
  records = Array.from({ length: 2505 }, (_, i) => record(i));
  calls = [];
  const matches = await data.getMatches('environment', { includeAllUsers: true });
  assert.equal(matches.length, 2505);
  assert.deepEqual(calls.filter(row => row.table === 'matches').map(row => row.range), [[0, 999], [1000, 1999], [2000, 2999]]);
  assert.deepEqual(calls.find(row => row.table === 'matches').orders.map(row => row[0]), ['played_at', 'id']);
  const report = await data.getWeeklyReport('2026-09-05', '2026-09-05');
  assert.equal(report.totalMatches, 2505);
  assert.equal(report.previousTotalMatches, 0);
  assert.equal(report.myDeckWinRates.find(row => row.deckId === 'B').reversed.matches, 2505);
  assert.equal(report.opponentDeckRanking[0].matches, 2505);
});
test('exactly 1,000 results requests the final empty page', async () => {
  records = Array.from({ length: 1000 }, (_, i) => record(i));
  calls = [];
  assert.equal((await data.getMatches()).length, 1000);
  assert.deepEqual(calls.filter(row => row.table === 'matches').map(row => row.range), [[0, 999], [1000, 1999]]);
});
test('non-admin cannot expand data access via includeAllUsers or scope=all', async () => {
  admin = false;
  records = [record(1), record(2, { user_id: 'someone-else' })];
  assert.equal((await data.getMatches('environment', { includeAllUsers: true })).length, 1);
  const html = renderToStaticMarkup(await AnalysisPage({ searchParams: Promise.resolve({ scope: 'all' }) }));
  assert.match(html, /対象登録戦績: 1件/);
  assert.match(html, /勝率集計: 使用者側のみ/);
  assert.equal(await data.getWeeklyReport('2026-09-05'), null);
  currentUser = null;
  assert.deepEqual(await data.getMatches(), []);
  currentUser = { id: 'owner' };
  admin = true;
});
test('actual analysis page defaults to combined for all users; reverse-only filtered view renders', async () => {
  records = [record(1)];
  calls = [];
  const html = renderToStaticMarkup(await AnalysisPage({ searchParams: Promise.resolve({ scope: 'all', myDeck: 'B', opponentDeck: 'A', turnOrder: 'second', result: 'lose' }) }));
  assert.match(html, /勝率集計: 対戦相手反転込み/);
  assert.match(html, /対象登録戦績: 1件/);
  assert.match(html, /環境勝率/);
  assert.match(html, /0%/);
  const query = calls.find(row => row.table === 'matches');
  assert.ok(!query.filters.some(row => ['my_archetype_id', 'opponent_archetype_id', 'turn_order', 'result'].includes(row[1])));
  const mine = renderToStaticMarkup(await AnalysisPage({ searchParams: Promise.resolve({}) }));
  assert.match(mine, /勝率集計: 使用者側のみ/);
  const direct = renderToStaticMarkup(await AnalysisPage({ searchParams: Promise.resolve({ scope: 'all', winRateMode: 'direct', myDeck: 'B' }) }));
  assert.match(direct, /対象登録戦績: 0件/);
});
test('report chart and PNG content include environment rate and both breakdowns', () => {
  const report = buildWeeklyReport([record(1)], [], decks, buildWeeklyPeriod('2026-09-05'));
  const html = renderToStaticMarkup(React.createElement(WeeklyReportTables, {
    opponentRows: report.opponentDeckRanking, winRateRows: report.myDeckWinRates,
    matchupRows: report.unifiedMatchups, tierRows: report.tierCandidates, correlationRows: report.correlation
  }));
  assert.match(html, /環境勝率/);
  assert.match(html, /直接 1件 \(100%\) \/ 反転 0件/);
  assert.match(html, /直接 0件 .*反転 1件 \(0%\)/);
  assert.match(html, /対象件数は視点数/);
});
