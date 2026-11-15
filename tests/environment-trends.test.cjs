/* eslint-disable @typescript-eslint/no-require-imports */
const { test } = require('node:test'), assert = require('node:assert/strict');
const { parseTrendSelection, parseEnvironmentTrends, trendRate, trendLinePath, trendDeckColor } = require('../src/lib/environment-trends');
const { sampleLabel } = require('../src/lib/environment-dashboard');
const id = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const selection = { environment: id(1), period: '7d', ranks: ['unranked'], decks: [id(2)] };
const point = { date: '2026-11-14', total: 10, encounters: 2, registrations: 3, evaluations: 4, wins: 0 };
const fixture = () => ({ version: 1, environmentId: id(1), period: '7d', rankFilters: ['unranked'], aggregatedAt: '2026-11-14T09:10:00Z', dataThrough: '2026-11-14T09:00:00Z', decks: [{ id: id(2), name: 'A', className: 'エルフ', points: [{ ...point }] }] });
test('trend request rejects invalid shapes, ranks, periods, decks and normalizes duplicates', () => {
  assert.deepEqual(parseTrendSelection({ ...selection, decks: [id(2), id(2)] }), selection);
  for (const patch of [{ decks: [] }, { decks: null }, { decks: ['unclassified'] }, { ranks: [] }, { ranks: ['all'] }, { period: '24h' }, { includeAllUsers: true }]) assert.throws(() => parseTrendSelection({ ...selection, ...patch }));
});
test('trend response validates identity, dates, counts and missing values', () => {
  assert.equal(parseEnvironmentTrends(fixture(), selection).decks.length, 1);
  for (const patch of [{ encounters: 11 }, { total: null }, { evaluations: 7 }, { wins: -1 }, { date: '2026-11-15' }, { date: '2026-02-30' }]) {
    const data = fixture(); Object.assign(data.decks[0].points[0], patch); assert.throws(() => parseEnvironmentTrends(data, selection));
  }
  const wrong = fixture(); wrong.decks[0].id = id(3); assert.throws(() => parseEnvironmentTrends(wrong, selection));
});
test('missing observations break lines, while valid zero wins remain zero', () => {
  const empty = { ...point, encounters: null, registrations: null, evaluations: null, wins: null };
  assert.equal(trendRate(point, 'winrate'), 0); assert.equal(trendRate(point, 'encounter'), 20);
  assert.equal(trendRate(empty, 'encounter'), null); assert.equal(trendRate(empty, 'winrate'), null);
  assert.equal(trendLinePath([point, empty, point], 'encounter', i => i, n => n), 'M0,20  M2,20');
});
test('colors stay tied to catalog identity and sample labels reuse summary thresholds', () => {
  const catalog = [{ id: id(2) }, { id: id(3) }];
  assert.equal(trendDeckColor(id(2), catalog), trendDeckColor(id(2), [...catalog].reverse()));
  assert.notEqual(trendDeckColor(id(2), catalog), trendDeckColor(id(3), catalog));
  for (const [n, label] of [[1, 'サンプル不足'], [9, 'サンプル不足'], [10, '参考'], [29, '参考'], [30, null]]) assert.equal(sampleLabel({ status: 'available', targetRegistrations: n, evaluationCount: n, wins: 0 }), label);
});
test('PostgreSQL microsecond cutoffs retain a partial JST day and reject exact midnight/future cutoffs', () => {
  for (const cutoff of ['2026-11-13T15:00:00.000001Z', '2026-11-14T00:00:00.000001+09:00', '2026-11-13T10:00:00.000001-05:00']) {
    const data = fixture(); data.dataThrough = cutoff;
    assert.equal(parseEnvironmentTrends(data, selection).decks[0].points[0].date, '2026-11-14');
  }
  for (const cutoff of ['2026-11-13T15:00:00Z', '2026-11-13T14:59:59.999999Z']) {
    const data = fixture(); data.dataThrough = cutoff; assert.throws(() => parseEnvironmentTrends(data, selection));
  }
  const future = fixture(); future.dataThrough = '2026-11-14T09:10:00.000001Z';
  assert.throws(() => parseEnvironmentTrends(future, selection));
});
