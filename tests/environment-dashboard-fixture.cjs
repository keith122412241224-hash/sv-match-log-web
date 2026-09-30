const uuid = n => `e1000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const HOUR = 3600_000_000n;
const catalog = ['A', 'B', 'C', 'D', 'inactive', 'empty'].map((name, i) => ({
  key: uuid(100 + i), name: `Shared ${name}`, className: 'エルフ'
}));
catalog.push({ key: 'unclassified', name: '未分類', className: null });
const users = Array.from({ length: 5 }, (_, i) => uuid(i + 1));
const env = Object.fromEntries(['empty', 'one', 'two', 'three', 'four', 'mixed', 'mirror', 'unknown', 'ranks', 'edges', 'previousOnly', 'sparseMirror'].map((name, i) => [name, uuid(200 + i)]));
function fixture(anchor) {
  const rows = [];
  function add(environment, user, my, opponent, offset = -HOUR, rank = null, result = 'win') {
    rows.push({ id: uuid(1000 + rows.length), environment, user, my, opponent,
      played: anchor + offset, rank, result, privateDeck: uuid(300 + users.indexOf(user)) });
  }
  for (const [name, n] of [['one', 1], ['two', 2], ['three', 3], ['four', 4]]) {
    for (let i = 0; i < n; i++) for (let j = 0; j < 4; j++) add(env[name], users[i], catalog[0].key, catalog[1].key);
  }
  // A's encounters have one reporter; A's winrate has three reporters.
  add(env.mixed, users[0], catalog[1].key, catalog[0].key);
  add(env.mixed, users[1], catalog[0].key, catalog[1].key);
  add(env.mixed, users[2], catalog[0].key, catalog[2].key);
  // Five mirrors, three distinct reporters.
  for (let i = 0; i < 5; i++) add(env.mirror, users[i % 3], catalog[0].key, catalog[0].key);
  // An available period with one-reporter and two-reporter mirrors must still suppress each deck.
  for (let i = 0; i < 5; i++) add(env.sparseMirror, users[0], catalog[0].key, catalog[0].key);
  for (let i = 1; i < 3; i++) add(env.sparseMirror, users[i], catalog[1].key, catalog[1].key);
  for (let i = 0; i < 3; i++) {
    add(env.unknown, users[i], null, catalog[0].key);
    add(env.unknown, users[i], catalog[0].key, null);
    add(env.unknown, users[i], null, null);
  }
  for (const rank of [null, 'master', 'grandmaster', 'grandmaster:epic', 'aa']) {
    for (let i = 0; i < 3; i++) add(env.ranks, users[i], catalog[0].key, catalog[1].key, -HOUR, rank, i % 2 ? 'lose' : 'win');
  }
  // Three reporters at each microsecond boundary; all four windows plus earlier history.
  for (const hours of [0, 24, 48, 72, 144, 168, 336, 720, 1440]) {
    for (const delta of [-1n, 0n, 1n]) for (let i = 0; i < 3; i++) {
      add(env.edges, users[i], catalog[0].key, catalog[1].key, -BigInt(hours) * HOUR + delta, i === 0 ? null : i === 1 ? 'master' : 'grandmaster');
    }
  }
  for (let i = 0; i < 3; i++) add(env.previousOnly, users[i], catalog[0].key, catalog[1].key, -25n * HOUR);
  return rows;
}
function iso(us) {
  const ms = us / 1000n;
  return new Date(Number(ms)).toISOString().replace(/\.\d{3}Z$/, '.' + String(us % 1000000n).padStart(6, '0') + 'Z');
}
// Independent registration-by-registration oracle. No SQL grouping or reversed-row recreation.
function expected(rows, environment, period, rank, anchor) {
  const hours = { '24h': 24, '3d': 72, '7d': 168, '30d': 720 }[period];
  const span = BigInt(hours) * HOUR;
  const passRank = r => rank === 'all' || (rank === 'master-plus' && (r === 'master' || r?.startsWith('grandmaster')))
    || (rank === 'master' && r === 'master') || (rank === 'grandmaster' && r?.startsWith('grandmaster'));
  function calculate(end) {
    const selected = rows.filter(r => r.environment === environment && r.played >= end - span && r.played < end && passRank(r.rank));
    const status = n => n === 0 ? 'no_data' : n < 3 ? 'privacy_suppressed' : 'available';
    const totalStatus = status(new Set(selected.map(r => r.user)).size);
    const decks = catalog.map(c => {
      const encounterUsers = new Set(), winrateUsers = new Set();
      let count = 0, registrations = 0, evaluations = 0, wins = 0;
      for (const r of selected) {
        const my = (r.my ?? 'unclassified') === c.key, opponent = (r.opponent ?? 'unclassified') === c.key;
        if (opponent) { count++; encounterUsers.add(r.user); }
        if (my || opponent) { registrations++; winrateUsers.add(r.user); }
        if (my) { evaluations++; if (r.result === 'win') wins++; }
        if (opponent) { evaluations++; if (r.result === 'lose') wins++; }
      }
      const es = totalStatus === 'available' ? status(encounterUsers.size) : totalStatus;
      const ws = totalStatus === 'available' ? status(winrateUsers.size) : totalStatus;
      return { key: c.key, encounter: { status: es, count: es === 'available' ? count : null },
        winrate: { status: ws, targetRegistrations: ws === 'available' ? registrations : null,
          evaluationCount: ws === 'available' ? evaluations : null, wins: ws === 'available' ? wins : null } };
    });
    return { start: iso(end - span), end: iso(end), total: { status: totalStatus, totalMatches: totalStatus === 'available' ? selected.length : null }, decks };
  }
  return { current: calculate(anchor), previous: calculate(anchor - span) };
}
module.exports = { uuid, HOUR, catalog, users, env, fixture, iso, expected };
