/* eslint-disable @typescript-eslint/no-require-imports */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { analysisPerspectives, filterAnalysisPerspectives, summarizeDeckPerspectives, resolveWinRateMode } = require('../src/lib/match-perspectives');
const { buildWeeklyReport, buildWeeklyPeriod } = require('../src/lib/weekly-report');
const { summarizeMatches, groupWinRates, buildWinRateMatrix, buildDeckAnalysisSummaries, turnOrderWinRates } = require('../src/lib/analytics');
const decks = ['A', 'B', 'C'].map(id => ({ id, name: id, class_name: 'エルフ' }));
let sequence = 0;
function match(my = 'A', opponent = 'B', result = 'win', extra = {}) {
  return { id: String(++sequence), my_deck_id: my, opponent_deck_id: opponent, my_archetype_id: my, opponent_archetype_id: opponent, result, turn_order: 'first', played_at: '2026-09-05T00:00:00Z', ...extra };
}
function report(matches, previous = []) { return buildWeeklyReport(matches, previous, decks, buildWeeklyPeriod('2026-09-05')); }

test('case 1: A victory is A direct win and B reversed loss', () => {
  const rows = summarizeDeckPerspectives([match()]);
  assert.deepEqual(rows.get('A').combined, { matches: 1, wins: 1, losses: 0, winRate: 100 });
  assert.deepEqual(rows.get('B').reversed, { matches: 1, wins: 0, losses: 1, winRate: 0 });
  assert.equal(rows.get('B').direct.winRate, null);
});
test('case 2: A defeat is A direct loss and B reversed win', () => {
  const rows = summarizeDeckPerspectives([match('A', 'B', 'lose')]);
  assert.equal(rows.get('A').combined.losses, 1);
  assert.equal(rows.get('B').combined.wins, 1);
});
test('case 3: registrations from both players remain independent', () => {
  const data = report([match(), match('B', 'A', 'lose')]);
  assert.equal(data.totalMatches, 2);
  assert.equal(data.myDeckWinRates.find(row => row.deckId === 'A').wins, 2);
  assert.equal(data.unifiedMatchups[0].totalMatches, 2);
  assert.equal(data.unifiedMatchups[0].deckAWinRate, 100);
});
test('case 4: direct mode matches the existing analytics for all consumers', () => {
  const matches = [match(), match('B', 'A', 'lose'), match('A', 'C', 'lose', { turn_order: 'second' }), match('A', 'B', 'win')];
  const views = analysisPerspectives(matches, 'direct');
  assert.deepEqual(buildDeckAnalysisSummaries(views, decks, 'archetype'), buildDeckAnalysisSummaries(matches, decks, 'archetype'));
  assert.deepEqual(buildWinRateMatrix(views, decks, decks), buildWinRateMatrix(matches, decks, decks));
  assert.deepEqual(turnOrderWinRates(views), turnOrderWinRates(matches));
  const group = rows => groupWinRates(rows, row => row.my_archetype_id, id => id);
  assert.deepEqual(group(views), group(matches));
  assert.deepEqual(group(views), [
    { label: 'A', total: 3, wins: 2, winRate: (2 / 3) * 100 },
    { label: 'B', total: 1, wins: 0, winRate: 0 }
  ]);
});
test('cases 5 and 6: 750 registrations stay 750; encounter counts and shares do not change', () => {
  const matches = Array.from({ length: 750 }, (_, i) => match('A', i < 500 ? 'B' : 'C', i % 2 ? 'win' : 'lose'));
  const data = report(matches, matches.slice(0, 300));
  assert.equal(data.totalMatches, 750);
  assert.equal(data.previousTotalMatches, 300);
  assert.equal(data.aiJson.summary.totalMatches, 750);
  assert.equal(summarizeMatches(matches).total, 750);
  assert.equal(new Set(analysisPerspectives(matches, 'combined').map(row => row.id)).size, 750);
  assert.equal(data.opponentDeckRanking.reduce((sum, row) => sum + row.matches, 0), 750);
  assert.ok(Math.abs(data.opponentDeckRanking[0].share - 200 / 3) < 1e-10);
  assert.deepEqual(data.opponentDeckRanking.map(row => row.matches), [500, 250]);
});
test('case 7: ranking, Tier, matchups, correlation and AI JSON use combined 60%, not direct 50%', () => {
  const matches = [
    ...Array.from({ length: 10 }, (_, i) => match('A', 'B', i < 5 ? 'win' : 'lose')),
    ...Array.from({ length: 10 }, (_, i) => match('B', 'A', i < 7 ? 'lose' : 'win'))
  ];
  const data = report(matches, matches);
  const row = data.myDeckWinRates.find(row => row.deckId === 'A');
  assert.equal(row.direct.winRate, 50);
  assert.equal(row.reversed.winRate, 70);
  assert.equal(row.winRate, 60);
  assert.equal(row.previousWinRate, 60);
  assert.equal(row.winRateChange, 0);
  assert.equal(row.matches, 20);
  const tier = data.tierCandidates.find(row => row.deckId === 'A');
  assert.equal(tier.winRate, 60);
  assert.equal(tier.suggestedTier, 'Tier1');
  assert.equal(tier.weightedMajorMatchupWinRate, 60);
  assert.equal(tier.encounterShare, 50);
  assert.equal(data.unifiedMatchups[0].totalMatches, 20);
  assert.equal(data.unifiedMatchups[0].deckAWinRate, 60);
  assert.equal(data.correlation[0].winRate, 60);
  assert.equal(data.correlation[0].matches, 20);
  const ai = data.aiJson.myDeckWinRates.find(row => row.deckName === 'A');
  assert.equal(ai.environmentWinRate, 60);
  assert.equal(ai.winRate, 60);
  assert.deepEqual(ai.combined, { matches: 20, wins: 12, losses: 8, winRate: 60 });
  assert.equal(ai.direct.winRate, 50);
  assert.equal(ai.reversed.winRate, 70);
  assert.match(data.aiPrompt, /総登録試合数として合計しない/);
  const cells = buildWinRateMatrix(analysisPerspectives(matches, 'combined'), decks, decks);
  assert.equal(cells[0].cells[1].winRate, 60);
  assert.equal(cells[0].cells[1].total, 20);
});
test('directional filters include opponent-only decks and invert first/second and result', () => {
  const original = Object.freeze(match('A', 'B', 'win', { user_id: 'private', memo: 'private' }));
  const rows = filterAnalysisPerspectives(analysisPerspectives([original], 'combined'), { myDeckId: 'B', opponentDeckId: 'A', result: 'lose', turnOrder: 'second', deckIdField: 'archetype' });
  assert.equal(rows.length, 1);
  assert.equal(rows[0].source, 'reversed');
  assert.equal(rows[0].user_id, undefined);
  assert.equal(rows[0].memo, undefined);
  assert.equal(original.result, 'win');
});
test('scope defaults and explicit choices', () => {
  assert.equal(resolveWinRateMode(undefined, 'mine'), 'direct');
  assert.equal(resolveWinRateMode('auto', 'all'), 'combined');
  assert.equal(resolveWinRateMode('direct', 'all'), 'direct');
  assert.equal(resolveWinRateMode('combined', 'mine'), 'combined');
  assert.equal(resolveWinRateMode('invalid', 'mine'), 'direct');
});
test('mirror match contributes two deck perspectives but one registration and one encounter', () => {
  const data = report([match('A', 'A')]);
  assert.equal(data.totalMatches, 1);
  assert.equal(data.myDeckWinRates[0].matches, 2);
  assert.equal(data.myDeckWinRates[0].winRate, 50);
  assert.equal(data.opponentDeckRanking[0].matches, 1);
  assert.equal(data.opponentDeckRanking[0].share, 100);
  assert.deepEqual(data.unifiedMatchups, []);
});
test('empty input, legacy IDs and direct/reversed divergence', () => {
  assert.deepEqual(report([]).myDeckWinRates, []);
  const legacy = summarizeDeckPerspectives([match('A', 'B', 'win', { my_archetype_id: null, opponent_archetype_id: null })]);
  assert.equal(legacy.get('B').reversed.losses, 1);
  const data = report([...Array.from({ length: 10 }, () => match()), ...Array.from({ length: 10 }, () => match('B', 'A'))]);
  const tier = data.tierCandidates.find(row => row.deckId === 'A');
  assert.ok(tier.warnings.includes('データ乖離あり'));
  assert.equal(tier.suggestedTier, '評価保留');
});
