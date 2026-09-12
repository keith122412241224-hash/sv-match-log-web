/* eslint-disable @typescript-eslint/no-require-imports */
const test = require('node:test');
const assert = require('node:assert/strict');
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
const { buildWeeklyReport, buildWeeklyPeriod } = require('../src/lib/weekly-report.ts');
const { WEEKLY_REPORT_CONFIG: config } = require('../src/lib/weekly-report-config.ts');
const { WeeklyReportTables } = require('../src/components/admin/WeeklyReportViews.tsx');
const { WeeklyReportAiWorkspace } = require('../src/components/admin/WeeklyReportAiWorkspace.tsx');
const { summarizeMatches, buildWinRateMatrix } = require('../src/lib/analytics.ts');

const decks = ['a', 'b', 'c'].map((id) => ({ id, name: id.toUpperCase(), class_name: 'エルフ' }));
const period = buildWeeklyPeriod('2026-09-01', '2026-09-07');
let nextId = 0;
function games(my, opponent, count, wins) {
  return Array.from({ length: count }, (_, i) => ({
    id: String(nextId++), my_deck_id: my, opponent_deck_id: opponent,
    my_archetype_id: null, opponent_archetype_id: null,
    result: i < wins ? 'win' : 'lose', turn_order: 'first',
    played_at: '2026-09-03T00:00:00Z'
  }));
}
const report = (current, previous = []) => buildWeeklyReport(current, previous, decks, period);
const tier = (result, id = 'a') => result.tierCandidates.find((row) => row.deckId === id);
const close = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-8, `${actual} != ${expected}`);

test('direct-only and reversed-only decks are evaluated from the same match, with opposite results', () => {
  const rows = games('a', 'b', 20, 12);
  const snapshot = structuredClone(rows);
  const result = report(rows);
  const a = tier(result);
  const b = tier(result, 'b');
  assert.deepEqual([a.matches, a.directMatches, a.reversedMatches, a.winRate], [20, 20, 0, 60]);
  assert.deepEqual([b.matches, b.directMatches, b.reversedMatches, b.winRate], [20, 0, 20, 40]);
  assert.equal(a.reversedWinRate, null);
  assert.equal(b.directWinRate, null);
  assert.ok(!a.warnings.includes('データ乖離あり'));
  assert.ok(!b.warnings.includes('データ乖離あり'));
  assert.equal(result.totalMatches, 20);
  assert.equal(result.aiJson.summary.totalMatches, 20);
  assert.deepEqual(rows, snapshot);
});

test('100 direct games at 60% plus 100 reversed games at 70% produce 200 games at 65%', () => {
  const result = report([...games('a', 'b', 100, 60), ...games('b', 'a', 100, 30)]);
  const a = tier(result);
  assert.deepEqual([a.matches, a.directMatches, a.reversedMatches, a.winRate], [200, 100, 100, 65]);
  assert.deepEqual([a.directWinRate, a.reversedWinRate], [60, 70]);
  assert.equal(a.weightedMajorMatchupWinRate, 65);
  assert.equal(a.strengthScore, 97.5);
  assert.equal(a.suggestedTier, 'Tier1');
  assert.equal(result.totalMatches, 200);
  assert.equal(result.tierCandidates.reduce((sum, row) => sum + row.matches, 0), 400);
  // Each unordered matchup still contains exactly the original registered rows.
  assert.equal(result.unifiedMatchups.length, 1);
  assert.equal(result.unifiedMatchups[0].totalMatches, 200);
  assert.equal(result.unifiedMatchups[0].deckAWins, 130);
  assert.equal(result.unifiedMatchups[0].deckBWins, 70);
});

test('mirrors remain in registered totals and direct rankings, but never enter Tier or major matchups', () => {
  const result = report([...games('a', 'a', 50, 50), ...games('a', 'b', 10, 6), ...games('c', 'c', 12, 12)]);
  assert.equal(result.totalMatches, 72);
  assert.equal(tier(result).matches, 10);
  assert.equal(tier(result).winRate, 60);
  assert.equal(result.myDeckWinRates.find((row) => row.deckId === 'a').matches, 110);
  assert.equal(result.unifiedMatchups.length, 1);
  assert.equal(result.unifiedMatchups[0].totalMatches, 10);
  const c = tier(result, 'c');
  assert.equal(c.matches, 0);
  assert.equal(c.winRate, null);
  assert.equal(c.suggestedTier, '評価保留');
  assert.deepEqual(c.warnings, ['サンプル不足']);
});

test('sample confidence uses integrated count at the 9/10 and 19/20 boundaries', () => {
  for (const [count, confidence, expectedTier] of [[9, 'insufficient', '評価保留'], [10, 'reference', 'Tier1'], [19, 'reference', 'Tier1'], [20, 'sufficient', 'Tier1']]) {
    const result = report([...games('a', 'b', 4, 4), ...games('b', 'a', count - 4, 0)]);
    const a = tier(result);
    assert.equal(a.matches, count);
    assert.equal(a.confidence, confidence);
    assert.equal(a.suggestedTier, expectedTier);
    close(a.strengthScore, 80 + (confidence === 'sufficient' ? 15 : confidence === 'reference' ? 9.75 : 3.75) + 2.5);
  }
});

test('trend compares integrated rates in both periods, including previous reversed-only decks', () => {
  const current = [...games('a', 'b', 10, 8), ...games('b', 'a', 10, 6)];
  const previous = games('b', 'a', 20, 10);
  const result = report(current, previous);
  const a = tier(result);
  assert.deepEqual([a.matches, a.winRate, a.previousMatches, a.previousWinRate, a.winRateChange], [20, 60, 20, 50, 10]);
  assert.equal(a.isWinRateComparisonReliable, true);
  close(a.strengthScore, 83);
  assert.equal(result.previousTotalMatches, 20);
  assert.equal(result.myDeckWinRates.find((row) => row.deckId === 'a').previousWinRate, 50);
});

test('missing or fewer than 10 previous integrated games leave trend neutral', () => {
  const current = games('a', 'b', 20, 12);
  for (const previous of [[], games('b', 'a', 9, 9)]) {
    const a = tier(report(current, previous));
    assert.equal(a.isWinRateComparisonReliable, false);
    close(a.strengthScore, 81.5);
  }
  const a = tier(report(games('a', 'b', 9, 9), games('b', 'a', 20, 20)));
  assert.equal(a.isWinRateComparisonReliable, false);
});

test('major matchups use the 10-game cutoff and match-weighted rates without a second reversal', () => {
  const result = report([...games('a', 'b', 10, 6), ...games('b', 'a', 20, 8), ...games('a', 'c', 10, 4)]);
  close(tier(result).weightedMajorMatchupWinRate, 55); // (18 + 4) / 40
  assert.deepEqual(result.unifiedMatchups.map((row) => row.totalMatches), [30, 10]);
  const below = report([...games('a', 'b', 30, 18), ...games('a', 'c', 9, 0)]);
  close(tier(below).winRate, 1800 / 39);
  close(tier(below).weightedMajorMatchupWinRate, 60);
  assert.equal(below.correlation.length, 1);
  assert.equal(below.correlation[0].advantagedDeck, 'A');
  assert.equal(below.correlation[0].winRate, 60);
  const noMajor = tier(report([...games('a', 'b', 6, 4), ...games('a', 'c', 6, 4)]));
  assert.equal(noMajor.weightedMajorMatchupWinRate, null);
  close(noMajor.strengthScore, 92.25); // fallback to integrated win rate, reference sample
});

test('divergence requires at least 20 games on each side, not just a large combined sample', () => {
  for (const current of [
    [...games('a', 'b', 100, 70), ...games('b', 'a', 1, 1)],
    [...games('a', 'b', 100, 100), ...games('b', 'a', 19, 19)],
    [...games('a', 'b', 19, 19), ...games('b', 'a', 100, 100)]
  ]) {
    assert.ok(!tier(report(current)).warnings.includes('データ乖離あり'));
  }
  const a = tier(report([...games('a', 'b', 20, 14), ...games('b', 'a', 20, 12)]));
  assert.deepEqual([a.directWinRate, a.reversedWinRate], [70, 40]);
  close(a.winRate, 55);
  assert.equal(a.suggestedTier, '評価保留');
  assert.deepEqual(a.warnings, ['データ乖離あり']);
});

test('divergence boundary is inclusive at 25 points and symmetric in registration direction', () => {
  for (const [directWins, reversedWins, warned] of [[70, 46, false], [70, 45, true], [45, 70, true], [60, 58, false]]) {
    const a = tier(report([...games('a', 'b', 100, directWins), ...games('b', 'a', 100, 100 - reversedWins)]));
    assert.equal(a.warnings.includes('データ乖離あり'), warned);
  }
  // 23/40 - 13/40 is exactly 25pt, but subtracting floating-point rates can
  // produce 24.999999999999993. Both registration directions must warn.
  for (const [directWins, reversedWins] of [[23, 13], [13, 23]]) {
    const a = tier(report([...games('a', 'b', 40, directWins), ...games('b', 'a', 40, 40 - reversedWins)]));
    assert.ok(a.warnings.includes('データ乖離あり'));
  }
});

test('registration direction does not affect integrated rates, score, matchup or trend', () => {
  const current = [...games('a', 'b', 100, 60), ...games('b', 'a', 100, 40)];
  const reverse = (rows) => rows.map((row) => ({ ...row, my_deck_id: row.opponent_deck_id, opponent_deck_id: row.my_deck_id, result: row.result === 'win' ? 'lose' : 'win' }));
  const previous = [...games('a', 'b', 20, 10), ...games('b', 'a', 20, 10)];
  const before = report(current, previous);
  const after = report(reverse(current), reverse(previous));
  for (const id of ['a', 'b']) {
    const a = tier(before, id), b = tier(after, id);
    for (const field of ['matches', 'winRate', 'weightedMajorMatchupWinRate', 'strengthScore', 'suggestedTier', 'previousWinRate', 'winRateChange']) assert.equal(a[field], b[field]);
  }
  assert.deepEqual(before.unifiedMatchups, after.unifiedMatchups);
  assert.deepEqual(before.correlation, after.correlation);
});

test('Tier thresholds, weights and absolute evaluation remain unchanged', () => {
  assert.deepEqual([config.tier.tier1WinRate, config.tier.tier15WinRate, config.tier.tier2WinRate], [56, 53, 50]);
  assert.deepEqual(config.tier.strengthScore, { tier1: 78, tier15: 66, tier2: 54 });
  assert.deepEqual(config.tier.strengthWeights, { winRate: 0.45, majorMatchup: 0.35, sampleConfidence: 0.15, trend: 0.05 });
  for (const [wins, score, expected] of [[50, 49.5, 'Tier3'], [53, 59.1, 'Tier2'], [56, 68.7, 'Tier1.5'], [60, 81.5, 'Tier1']]) {
    const a = tier(report(games('a', 'b', 100, wins)));
    close(a.strengthScore, score);
    assert.equal(a.suggestedTier, expected);
  }
  const none = report(games('a', 'b', 100, 53));
  assert.ok(none.tierCandidates.every((row) => !['Tier1', 'Tier1.5'].includes(row.suggestedTier)));
});

test('archetype IDs take precedence and class fallback IDs continue to work', () => {
  const current = games('class-a', 'class-b', 10, 6).map((row) => ({ ...row, my_archetype_id: 'a', opponent_archetype_id: 'b' }));
  current.push(...games('b', 'a', 10, 4));
  const result = report(current);
  assert.equal(result.tierCandidates.length, 2);
  assert.equal(tier(result).matches, 20);
  assert.equal(tier(result).winRate, 60);
});

test('published environment rankings, encounter counts and shared analytics preserve their original population', () => {
  const current = [...games('a', 'b', 100, 60), ...games('b', 'a', 100, 30)];
  const result = report(current);
  const directA = result.myDeckWinRates.find((row) => row.deckId === 'a');
  assert.deepEqual([directA.matches, directA.wins, directA.winRate], [200, 130, 65]);
  assert.deepEqual([directA.direct.matches, directA.direct.wins, directA.direct.winRate], [100, 60, 60]);
  assert.equal(result.opponentDeckRanking.find((row) => row.deckId === 'a').share, 50);
  assert.equal(result.opponentDeckRanking.find((row) => row.deckId === 'a').matches, 100);
  assert.equal(summarizeMatches(current).total, 200);
  const matrix = buildWinRateMatrix(current, decks, decks);
  assert.equal(matrix[0].cells[1].total, 100);
  assert.equal(matrix[0].cells[1].winRate, 60);
});

test('UI, PNG content and AI JSON carry integrated counts, rates and Strength Score', () => {
  const result = report([...games('a', 'b', 100, 60), ...games('b', 'a', 100, 30)]);
  const payload = result.aiJson.tierCandidates.find((row) => row.deckName === 'A');
  assert.deepEqual([payload.matches, payload.directMatches, payload.reversedMatches, payload.winRate, payload.strengthScore], [200, 100, 100, 65, 97.5]);
  assert.equal(result.aiJson.myDeckWinRates.find((row) => row.deckName === 'A').winRate, 65);
  const html = renderToStaticMarkup(React.createElement(WeeklyReportTables, {
    contextLabel: '登録試合数200戦', opponentRows: result.opponentDeckRanking,
    winRateRows: result.myDeckWinRates, matchupRows: result.unifiedMatchups,
    tierRows: result.tierCandidates, correlationRows: result.correlation
  }));
  assert.match(html, /評価対象：200戦/);
  assert.match(html, /環境勝率：65%/);
  assert.match(html, /Strength Score：97.5/);
  assert.match(html, /使用側100戦 \/ 相手側100戦/);
  const workspace = renderToStaticMarkup(React.createElement(WeeklyReportAiWorkspace, {
    aiJson: result.aiJson, startDate: period.startDate, endDate: period.endDate,
    hasApiKey: false, tierOverrides: { A: 'Tier2' }, onTierChange: () => {}
  }));
  assert.match(workspace, /Strength Score：97.5/);
  assert.match(workspace, /環境勝率：65%/);
  assert.match(result.aiPrompt, /Tierの前期間比較も両側統合/);
  assert.match(result.aiPrompt, /デッキ評価対象数の合計を総登録試合数にしない/);
  assert.ok(!('deckId' in payload));
});

test('empty periods remain empty without synthetic candidates', () => {
  const result = report([]);
  assert.equal(result.totalMatches, 0);
  assert.deepEqual(result.tierCandidates, []);
  assert.deepEqual(result.aiJson.tierCandidates, []);
});
