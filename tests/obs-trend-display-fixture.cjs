/* eslint-disable @typescript-eslint/no-require-imports */
const fixture = require('./environment-dashboard-v4-fixture.cjs');
const current = [1831, 2280, 1240, 500, 830, 610, 1070, 1500];
const previous = [31, 480, 440, 300, 3030, 2810, 1870, 1700];
const metric = count => ({ encounter: { status: 'available', count }, winrate: {
  status: 'available', targetRegistrations: count + 111, evaluationCount: count + 222, wins: Math.floor(count / 2)
} });
function dashboard(args, mode = 'full') {
  const d = fixture.dashboard(args);
  d.current.total = { status: 'available', totalMatches: 20000 };
  if (d.previous) d.previous.total = { status: 'available', totalMatches: 20000 };
  const unclassified = d.decks.at(-1);
  d.decks = current.map((count, i) => ({
    key: fixture.id(10 + i), name: fixture.decks[i]?.name ?? ['秘術ウィッチ', 'アグロエルフ'][i - 6],
    className: fixture.decks[i]?.class_name ?? ['ウィッチ', 'エルフ'][i - 6],
    current: metric(count), previous: d.previous ? metric(previous[i]) : null
  }));
  d.decks.push(unclassified);
  if (mode === 'long') d.decks.slice(0, -1).forEach(deck => { deck.name += '・長いデッキ名の表示確認用ABCDEFGHIJKLMNOPQRSTUVWXYZ'; });
  if (mode === 'no_previous' || mode === 'no_current') {
    const period = mode === 'no_previous' ? 'previous' : 'current';
    d[period].total = { status: 'no_data', totalMatches: null };
    d.decks.forEach(deck => { deck[period] = structuredClone(unclassified.current); });
  }
  if (mode === 'insufficient') {
    d.previous.total.totalMatches = 29;
    d.decks.slice(0, -1).forEach(deck => { deck.previous = {
      encounter: { status: 'available', count: 1 },
      winrate: { status: 'available', targetRegistrations: 1, evaluationCount: 1, wins: 1 }
    }; });
  }
  return d;
}
module.exports = { ...fixture, dashboard };
