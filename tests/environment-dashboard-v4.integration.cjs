/* eslint-disable @typescript-eslint/no-require-imports */
// Real PostgreSQL execution in an isolated, in-memory PGlite database. No remote connections.
const assert = require('node:assert/strict'), fs = require('node:fs');
require('./register.cjs');
const h = require('./obs-matchups-db.cjs');
const { RANK_ATOMS, RANK_PRESETS } = require('../src/lib/rank-selection');
const { parseEnvironmentDashboardV3: parse3, buildEnvironmentViewV3: view3 } = require('../src/lib/environment-dashboard-v3');
const { parseEnvironmentDashboardV4: parse4, buildEnvironmentViewV4: view4 } = require('../src/lib/environment-dashboard-v4');
const { initialDashboardPeriod, environmentHrefV4 } = require('../src/lib/environment-dashboard-period');
const React = require('react'), { renderToStaticMarkup: render } = require('react-dom/server');
require.extensions['.css'] = module => { module.exports = { __esModule: true, default: new Proxy({}, { get: (_, key) => String(key) }) }; };
const { EnvironmentData, TrendText } = require('../src/components/environment/EnvironmentData');
const { ObsEnvironmentView } = require('../src/components/environment/ObsEnvironmentView');
const migration = 'supabase/migrations/20261010042525_environment_dashboard_v4.sql';
const END = '2026-09-29T08:00:00.000Z', NOW = '2026-10-10T04:13:00.000Z', THROUGH = '2026-10-10T04:00:00.000Z';
const DAY = 86400000, periods = { '24h': DAY, '3d': 3 * DAY, '7d': 7 * DAY, '30d': 30 * DAY };
const rankSets = [RANK_ATOMS, ...RANK_ATOMS.map(r => [r]), ...RANK_PRESETS.map(p => p.ranks), ['beginner', 'master:ruby', 'grandmaster:epic']];
const iso = t => new Date(t).toISOString(), atom = m => m.rank_tier === null ? 'unranked' : m.rank_tier === 'master' ? `master:${m.master_group}` : m.rank_tier === 'grandmaster' ? `grandmaster:${m.grandmaster_rating}` : m.rank_tier;
const report = { localOnly: true, checks: [], comparisons: 0, populations: 0, loaderComparisons: 0, status: 'running' };
const output = 'build/dashboard-v4-integration-resume.json';
let stage = 'setup';
async function run() {
  const db = await h.createDb();
  try {
    await db.exec(h.read(h.migration));
    const metadata = async () => (await db.query("select n.nspname,p.proname,pg_get_functiondef(p.oid) as definition,p.proacl::text as acl,p.proowner::regrole::text as owner,p.prosecdef,p.proconfig from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname in ('public','private') order by 1,2,p.oid")).rows;
    const policies = async () => (await db.query('select * from pg_policies order by schemaname,tablename,policyname')).rows;
    const before = await metadata(), oldPolicies = await policies();
    stage = 'apply new migration locally';
    await db.exec(h.read(migration));
    const after = await metadata();
    assert.deepEqual(after.filter(f => f.proname !== 'get_environment_dashboard_aggregates_v4'), before);
    assert.deepEqual(await policies(), oldPolicies);
    for (const schema of ['public', 'private']) {
      const old = before.find(f => f.nspname === schema && f.proname === 'get_environment_dashboard_aggregates_v3');
      const fresh = after.find(f => f.nspname === schema && f.proname === 'get_environment_dashboard_aggregates_v4');
      for (const key of ['acl', 'owner', 'prosecdef', 'proconfig']) assert.deepEqual(fresh[key], old[key], `${schema}.${key}`);
    }
    assert.ok((await db.query('select dashboard_end_at from public.environments')).rows.every(e => e.dashboard_end_at === null));
    report.checks.push('Migration applied; old functions, ACLs and RLS unchanged; v4 security equals v3; no cutoff backfill');
    // Freeze the test database only, preserving the original repository SQL files.
    for (const version of [3, 4]) {
      const def = (await db.query(`select pg_get_functiondef('private.get_environment_dashboard_aggregates_v${version}(uuid,text,text[])'::regprocedure) as d`)).rows[0].d;
      await db.exec(def.replace('pg_catalog.statement_timestamp()', `timestamptz '${NOW}'`));
    }
    await db.query('update public.environments set dashboard_end_at=$1 where id=$2', [END, h.OLD]);
    const future = h.uuid(103), lengths = [20, 33, 45];
    await db.query("insert into public.environments(id,name,dashboard_end_at) values($1,'future','2026-12-01T00:00:00Z')", [future]);
    for (const days of lengths) await db.query('insert into public.environments(id,name,dashboard_end_at) values($1,$2,$3)', [h.uuid(300 + days), `${days} days`, END]);
    const source = [];
    for (const [env, end] of [[h.OLD, END], [h.NEW, THROUGH], [future, THROUGH]]) {
      for (const [index, rank] of RANK_ATOMS.entries()) {
        const [tier, child] = rank.split(':');
        // Different ranks have different oldest matches. Include mirrors and own-only observations.
        const offsets = new Set([-60 * DAY - index * DAY, -45 * DAY, -33 * DAY, -20 * DAY, -1, 0, 1]);
        for (const span of Object.values(periods)) for (const offset of [-2 * span, -span - 1, -span, -span + 1]) offsets.add(offset);
        for (const offset of offsets) source.push(h.row({ environment_id: env, played_at: iso(Date.parse(end) + offset),
          rank_tier: tier === 'unranked' ? null : tier, master_group: tier === 'master' ? child : null, grandmaster_rating: tier === 'grandmaster' ? child : null,
          my_archetype_id: h.decks[index % 5].id, opponent_archetype_id: h.decks[(index + (offset % 3 === 0 ? 0 : 1)) % 5].id,
          result: offset % 2 ? 'lose' : 'win' }));
      }
    }
    for (const days of lengths) for (let day = 0; day < days; day++) source.push(h.row({ environment_id: h.uuid(300 + days), played_at: iso(Date.parse(END) - (days - day) * DAY) }));
    await h.seed(db, source);
    const call = async (environment, period, ranks = RANK_ATOMS, version = 4) => (await db.query(`select public.get_environment_dashboard_aggregates_v${version}($1,$2,$3) as data`, [environment, period, ranks])).rows[0].data;
    stage = 'v3/v4 equivalence';
    for (const environment of [h.NEW, future, h.EMPTY]) for (const period of Object.keys(periods)) for (const ranks of rankSets) {
      const selection = { environment, period, ranks }, old = parse3(await call(environment, period, ranks, 3), selection), fresh = parse4(await call(environment, period, ranks), selection);
      const { version, comparison, endSource, ...common } = fresh;
      assert.equal(version, 4);
      assert.equal(comparison, 'previous_period'); assert.equal(endSource, 'now');
      assert.deepEqual({ ...common, version: 3 }, old);
      assert.deepEqual(view4(fresh), view3(old));
      report.comparisons++;
    }
    report.checks.push('Fixed four periods: complete responses and computed rankings/trends equal v3 at the same DB state and frozen clock');
    stage = 'populations, boundaries and all-time';
    for (const environment of [h.NEW, h.OLD, future, h.EMPTY, ...lengths.map(n => h.uuid(300 + n))]) for (const period of [...Object.keys(periods), 'all']) for (const ranks of rankSets) {
      const d = parse4(await call(environment, period, ranks), { environment, period, ranks });
      const end = environment === h.OLD || lengths.some(n => environment === h.uuid(300 + n)) ? END : THROUGH;
      assert.equal(Date.parse(d.current.end), Date.parse(end));
      const labels = period === 'all' ? ['current'] : ['current', 'previous'];
      for (const label of labels) {
        const p = d[label], span = periods[period];
        const lower = period === 'all' ? null : Date.parse(end) - span * (label === 'previous' ? 2 : 1);
        const upper = Date.parse(end) - (label === 'previous' ? span : 0);
        assert.equal(p.start === null ? null : Date.parse(p.start), lower);
        const rows = source.filter(m => m.environment_id === environment && ranks.includes(atom(m)) && (lower === null || Date.parse(m.played_at) >= lower) && Date.parse(m.played_at) < upper);
        assert.deepEqual(p.total, rows.length ? { status: 'available', totalMatches: rows.length } : { status: 'no_data', totalMatches: null });
        for (const deck of d.decks) {
          const own = rows.filter(m => m.my_archetype_id === deck.key), opponent = rows.filter(m => m.opponent_archetype_id === deck.key);
          const registrations = rows.filter(m => m.my_archetype_id === deck.key || m.opponent_archetype_id === deck.key).length;
          assert.deepEqual(deck[label].encounter, opponent.length ? { status: 'available', count: opponent.length } : { status: 'no_data', count: null });
          assert.deepEqual(deck[label].winrate, registrations ? { status: 'available', targetRegistrations: registrations, evaluationCount: own.length + opponent.length, wins: own.filter(m => m.result === 'win').length + opponent.filter(m => m.result === 'lose').length } : { status: 'no_data', targetRegistrations: null, evaluationCount: null, wins: null });
        }
      }
      if (period === 'all') {
        assert.equal(d.current.start, null); assert.equal(d.previous, null); assert.equal(d.comparison, 'not_applicable');
        assert.ok(d.decks.every(deck => deck.previous === null));
        assert.deepEqual(view4(d).increases, []); assert.deepEqual(view4(d).decreases, []); assert.ok(view4(d).rows.every(row => row.trend === null));
      }
      report.populations++;
    }
    report.durationTotals = {};
    for (const days of lengths) report.durationTotals[days] = (await call(h.uuid(300 + days), 'all')).current.total.totalMatches;
    assert.deepEqual(report.durationTotals, { 20: 20, 33: 33, 45: 45 });
    report.pastAll = (await call(h.OLD, 'all')).current;
    report.checks.push('Independent row oracle: inclusive fixed start, exclusive end, all-time no lower bound; 20/33/45 days, all 17 rank atoms, presets, multiple ranks, empty data');
    stage = 'Environment/OBS rendering and null versus zero';
    for (const period of [...Object.keys(periods), 'all']) {
      const data = parse4(await call(h.OLD, period), { environment: h.OLD, period, ranks: RANK_ATOMS });
      for (const Component of [EnvironmentData, ObsEnvironmentView]) {
        const html = render(React.createElement(Component, { data, activeDeckIds: h.decks.map(d => d.id), environmentName: '過去環境' }));
        for (const title of ['遭遇率TOP5', '勝率TOP5']) assert.ok(html.includes(title));
        assert.equal(html.includes('増加TOP3'), period !== 'all'); assert.equal(html.includes('減少TOP3'), period !== 'all');
        if (period === 'all') assert.ok(!html.includes('前期間比</') && !html.includes('前期間比較</th>'));
      }
    }
    const zeroHtml = render(React.createElement(TrendText, { trend: { state: 'flat', current: 0, previous: 0, delta: 0 } }));
    assert.ok(zeroHtml.includes('0.0%')); assert.ok(zeroHtml.includes('横ばい'));
    report.checks.push('SSR: all-time hides trends/columns, fixed periods retain them; zero percent remains displayed');
    stage = 'OBS/Creator actual loaders and exclusive Analysis SQL';
    let rpcCalls = [];
    const client = {
      rpc: async (name, args) => {
        rpcCalls.push({ name, args });
        if (name === 'get_environment_dashboard_aggregates_v4') return { data: await call(args.p_environment_id, args.p_period, args.p_rank_filters), error: null };
        assert.equal(name, 'get_analysis_aggregates_v3_exclusive');
        assert.equal(args.p_include_all_users, true); assert.equal(args.p_include_reversed, true);
        const data = await h.analysis(db, { environmentId: args.p_environment_id, current: { start: args.p_played_from, end: args.p_played_to }, rankFilters: args.p_rank_filters }, { combined: true });
        return { data, error: null };
      },
      from: table => { assert.equal(table, 'creator_images'); return { select: () => ({ in: async (_key, ids) => ({ data: ids.map((id, i) => ({ id, archetype_id: h.decks[i].id })), error: null }) }) }; }
    };
    const serverId = require.resolve('../src/lib/supabase/server');
    require.cache[serverId] = { id: serverId, filename: serverId, loaded: true, exports: { createSupabaseServerClient: async () => client } };
    const { getEnvironmentDashboard } = require('../src/lib/environment-dashboard-data');
    const { getObsEnvironmentMatchups } = require('../src/lib/obs-environment-matchups');
    const { getCreatorMatchups } = require('../src/lib/creator/matchup-server');
    const { parseDataSnapshot } = require('../src/lib/creator/matchup-data');
    for (const environment of [h.NEW, h.OLD]) for (const period of [...Object.keys(periods), 'all']) for (const ranks of [RANK_ATOMS, ['unranked'], ['master:ruby', 'grandmaster:epic']]) {
      const selection = { environment, period, ranks }, d = await getEnvironmentDashboard(selection);
      rpcCalls = [];
      const obs = await getObsEnvironmentMatchups(d), obsArgs = rpcCalls[0].args;
      const creator = await getCreatorMatchups(client, selection, h.decks.map((_, i) => h.uuid(600 + i)));
      assert.deepEqual(rpcCalls.at(-1).args, obsArgs);
      assert.equal(creator.start, d.current.start); assert.equal(creator.end, d.current.end);
      if (period === 'all') assert.equal(obsArgs.p_played_from, null);
      const aggregates = await h.analysis(db, d, { combined: true });
      assert.equal(aggregates.registeredMatches, d.current.total.totalMatches);
      assert.equal(aggregates.perspectives, aggregates.registeredMatches * 2);
      for (const row of obs) for (const cell of row.cells) {
        const c = creator.cells.find(c => c.sourceDeckId === cell.myDeckId && c.targetDeckId === cell.opponentDeckId);
        assert.equal(c.winRate, cell.winRate); assert.equal(c.matchCount, cell.total);
      }
      parseDataSnapshot({ selection, start: creator.start, end: creator.end, aggregatedAt: creator.aggregatedAt, sourceDeckId: h.decks[0].id, targetDeckId: h.decks[1].id });
      report.loaderComparisons++;
    }
    report.checks.push('Actual Environment/OBS/Creator loaders: identical boundaries/ranks, Analysis registered population and matrix cells; all-time passes NULL start');
    stage = 'security and selection';
    for (const role of ['anon', 'service_role']) { await h.identity(db, h.MEMBER, role); await assert.rejects(() => call(h.OLD, 'all'), /permission denied/); }
    await h.identity(db, h.MEMBER);
    assert.equal((await call(h.OLD, 'all')).version, 4);
    for (const claims of [{}, { sub: h.MEMBER }, { sub: h.MEMBER, is_anonymous: true }, { sub: h.MEMBER, is_anonymous: 'false' }]) {
      await db.query("select set_config('request.jwt.claims',$1,false)", [JSON.stringify(claims)]);
      await assert.rejects(() => call(h.OLD, 'all'), /Member authentication required/);
    }
    await h.identity(db);
    assert.equal(initialDashboardPeriod(undefined, END, Date.parse(NOW)), 'all');
    assert.equal(initialDashboardPeriod('30d', END, Date.parse(NOW)), '30d');
    assert.equal(initialDashboardPeriod(undefined, null, Date.parse(NOW)), '7d');
    assert.equal(initialDashboardPeriod(undefined, '2027-01-01', Date.parse(NOW)), '7d');
    assert.equal(initialDashboardPeriod('unknown', END, Date.parse(NOW)), '7d');
    assert.ok(environmentHrefV4({ environment: h.OLD, period: 'all', ranks: ['unranked'] }).includes('period=all'));
    report.checks.push('Member/admin callable; unsigned/anonymous claims and anon/service_role denied; ended default and explicit URL selection');
    report.status = 'passed';
  } finally { await db.close(); }
}
run().catch(error => { report.status = 'failed'; report.stage = stage; report.error = error.stack; process.exitCode = 1; }).finally(() => {
  fs.writeFileSync(output, JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
});
