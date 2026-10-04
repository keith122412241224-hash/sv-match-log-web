/* eslint-disable @typescript-eslint/no-require-imports */
const { decks } = require('./obs-environment-fixture.cjs');
function aggregates() {
  let position = 1;
  const groups = decks.slice(0, 5).flatMap((my, i) => decks.slice(0, 5).map((opponent, j) => {
    const total = 1 + i * 5 + j, firstOrder = position; position += total;
    return { myDeckId: my.id, opponentDeckId: opponent.id, cardMyDeckId: my.id, cardOpponentDeckId: opponent.id, turnOrder: 'first', total, wins: (i + j * 2) % (total + 1), firstOrder };
  }));
  return { version: 1, registeredMatches: position - 1, perspectives: position - 1, totalWins: groups.reduce((n, g) => n + g.wins, 0), groups, recent: [] };
}
module.exports = { aggregates };
