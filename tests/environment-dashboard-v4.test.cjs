/* eslint-disable @typescript-eslint/no-require-imports */
const { test } = require('node:test'), assert = require('node:assert/strict');
const React = require('react'), { renderToStaticMarkup: render } = require('react-dom/server');
require.extensions['.css'] = module => { module.exports = { __esModule: true, default: new Proxy({}, { get: (_, key) => String(key) }) }; };
const fixture = require('./obs-environment-fixture.cjs');
const { parseEnvironmentDashboardV4: parse, buildEnvironmentViewV4: view } = require('../src/lib/environment-dashboard-v4');
const { EnvironmentData, TrendText } = require('../src/components/environment/EnvironmentData');
const { ObsEnvironmentView } = require('../src/components/environment/ObsEnvironmentView');
const { initialDashboardPeriod, normalizeDashboardPeriod } = require('../src/lib/environment-dashboard-period');
const { parseDataSnapshot } = require('../src/lib/creator/matchup-data');
const selection = { environment: fixture.environments[0].id, period: 'all', ranks: ['unranked'] };
function payload(period = 'all') {
  const d = fixture.dashboard({ p_environment_id: selection.environment, p_period: period === 'all' ? '7d' : period, p_rank_filters: selection.ranks });
  d.version = 4; d.period = period; d.endSource = 'now'; d.comparison = period === 'all' ? 'not_applicable' : 'previous_period';
  if (period === 'all') { d.current.start = null; d.previous = null; d.decks.forEach(deck => { deck.previous = null; }); }
  return d;
}
test('v4 all-time renders rankings and deck data without comparison columns or mobile trends', () => {
  const data = parse(payload(), selection);
  assert.equal(data.previous, null); assert.equal(data.comparison, 'not_applicable');
  assert.ok(view(data).rows.every(row => row.trend === null));
  for (const Component of [EnvironmentData, ObsEnvironmentView]) {
    const html = render(React.createElement(Component, { data, activeDeckIds: fixture.decks.map(d => d.id), environmentName: 'test' }));
    assert.ok(html.includes('遭遇率TOP5') && html.includes('勝率TOP5') && html.includes('環境全期間'));
    for (const absent of ['増加TOP3', '減少TOP3', '>前期間比較</th>', '前期間との比較', '前期間の観測なし', '比較データなし']) assert.ok(!html.includes(absent));
  }
});
test('v4 fixed periods retain comparisons; zero percent is a valid display value', () => {
  for (const period of ['24h', '3d', '7d', '30d']) {
    const data = parse(payload(period), { ...selection, period });
    const html = render(React.createElement(EnvironmentData, { data, activeDeckIds: fixture.decks.map(d => d.id) }));
    for (const title of ['増加TOP3', '減少TOP3', '前期間比較']) assert.ok(html.includes(title));
  }
  const zero = render(React.createElement(TrendText, { trend: { state: 'flat', current: 0, previous: 0, delta: 0 } }));
  assert.ok(zero.includes('横ばい')); assert.equal((zero.match(/0\.0%/g) || []).length, 2);
});
test('v4 parser rejects fabricated all-time comparisons and inconsistent null boundaries', () => {
  for (const mutate of [d => { d.previous = payload('7d').previous; }, d => { d.comparison = 'previous_period'; }, d => { d.current.start = d.current.end; }, d => { d.decks[0].previous = payload('7d').decks[0].previous; }]) {
    const d = payload(); mutate(d); assert.throws(() => parse(d, selection));
  }
  const fixed = payload('7d'); fixed.previous = null;
  assert.throws(() => parse(fixed, { ...selection, period: '7d' }));
});
test('v4 initial selection respects explicit period and future/unset cutoffs', () => {
  const now = Date.parse('2026-10-10T04:00:00Z');
  assert.equal(initialDashboardPeriod(undefined, '2026-09-29T08:00:00Z', now), 'all');
  assert.equal(initialDashboardPeriod('30d', '2026-09-29T08:00:00Z', now), '30d');
  for (const end of [null, '2026-11-01T00:00:00Z']) assert.equal(initialDashboardPeriod(undefined, end, now), '7d');
  assert.equal(normalizeDashboardPeriod('unknown'), '7d'); assert.equal(normalizeDashboardPeriod('all'), 'all');
});
test('Creator snapshot accepts NULL only for all-time and preserves fixed snapshots', () => {
  const d = payload();
  const snapshot = { selection, start: null, end: d.current.end, aggregatedAt: d.aggregatedAt, sourceDeckId: fixture.decks[0].id, targetDeckId: fixture.decks[1].id };
  assert.deepEqual(parseDataSnapshot(snapshot), snapshot);
  assert.throws(() => parseDataSnapshot({ ...snapshot, selection: { ...selection, period: '7d' } }));
  assert.throws(() => parseDataSnapshot({ ...snapshot, start: '2026-01-01T00:00:00Z' }));
  const fixed = { ...snapshot, selection: { ...selection, period: '7d' }, start: payload('7d').current.start };
  assert.deepEqual(parseDataSnapshot(fixed), fixed);
});
