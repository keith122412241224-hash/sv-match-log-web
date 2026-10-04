/* eslint-disable @typescript-eslint/no-require-imports */
const { decks } = require('./obs-environment-fixture.cjs');
const { analysisPerspectives } = require('../src/lib/match-perspectives');
function aggregates() {
  let serial = 0;
  const source = decks.slice(0, 5).flatMap((my, i) => decks.slice(0, 5).flatMap((opponent, j) =>
    Array.from({ length: i === 0 && j === 1 ? 1 : i === 1 && j === 0 ? 2 : 1 + i * 5 + j }, (_, k) => ({
      id: String(++serial), my_deck_id: my.id, opponent_deck_id: opponent.id, my_archetype_id: my.id, opponent_archetype_id: opponent.id,
      result: (k + i) % 3 ? 'win' : 'lose', turn_order: k % 2 ? 'first' : 'second'
    }))));
  const views = analysisPerspectives(source, 'combined'), grouped = new Map();
  views.forEach((v, i) => {
    const key = JSON.stringify([v.my_archetype_id, v.opponent_archetype_id, v.turn_order]);
    if (!grouped.has(key)) grouped.set(key, { myDeckId: v.my_archetype_id, opponentDeckId: v.opponent_archetype_id,
      cardMyDeckId: v.my_archetype_id, cardOpponentDeckId: v.opponent_archetype_id, turnOrder: v.turn_order, firstOrder: i + 1, total: 0, wins: 0 });
    const g = grouped.get(key); g.total++; g.wins += v.result === 'win' ? 1 : 0;
  });
  return { version: 1, registeredMatches: source.length, perspectives: views.length,
    totalWins: views.filter(v => v.result === 'win').length, groups: [...grouped.values()], recent: [] };
}
module.exports = { aggregates };
