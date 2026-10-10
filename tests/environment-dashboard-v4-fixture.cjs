/* eslint-disable @typescript-eslint/no-require-imports */
const v3 = require('./obs-environment-fixture.cjs');
function dashboard(args, mode) {
  const d = v3.dashboard({ ...args, p_period: args.p_period === 'all' ? '7d' : args.p_period }, mode);
  d.version = 4; d.period = args.p_period; d.endSource = 'now';
  d.comparison = d.period === 'all' ? 'not_applicable' : 'previous_period';
  if (d.period === 'all') {
    d.current.start = null; d.previous = null;
    d.decks.forEach(deck => { deck.previous = null; });
  }
  return d;
}
module.exports = { ...v3, dashboard };
