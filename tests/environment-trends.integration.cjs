/* eslint-disable @typescript-eslint/no-require-imports */
const assert = require('node:assert/strict');
require('./register.cjs');
const h = require('./environment-trends-db.cjs');
const { RANK_ATOMS } = require('../src/lib/rank-selection');
const { parseEnvironmentTrends, trendRate } = require('../src/lib/environment-trends');
const DAY = 86400000, jstDay = iso => new Date(Date.parse(iso) + 9 * 3600000).toISOString().slice(0, 10);
const atom = m => m.rank_tier === null ? 'unranked' : m.rank_tier === 'master' ? `master:${m.master_group}` : m.rank_tier === 'grandmaster' ? `grandmaster:${m.grandmaster_rating}` : m.rank_tier;
async function main() {
  const db = await h.createDb();
  try {
    const rows = [];
    for (let day = -8; day < 46; day++) for (const [i, rank] of RANK_ATOMS.entries()) {
      const [tier, child] = rank.split(':');
      rows.push(h.row({ played_at: new Date(Date.parse('2026-10-01T03:00:00Z') + day * DAY).toISOString(),
        my_archetype_id: i % 4 === 0 ? null : h.decks[i % 4].id, opponent_archetype_id: i % 5 === 0 ? null : h.decks[(i + day + 80) % 4].id,
        result: (i + day) % 2 ? 'win' : 'lose', rank_tier: tier === 'unranked' ? null : tier,
        master_group: tier === 'master' ? child : null, grandmaster_rating: tier === 'grandmaster' ? child : null }));
    }
    for (const played_at of [h.START, '2026-09-30T14:59:59.999Z', '2026-10-01T02:59:59.999Z', '2026-11-07T14:59:59.999Z', '2026-11-07T15:00:00Z', '2026-11-14T08:59:59.999Z', h.END]) rows.push(h.row({ played_at }));
    rows.push(h.row({ environment_id: h.OLD, played_at: '2026-11-14T01:00:00Z' }));
    await h.seed(db, rows);
    let comparisons = 0;
    for (const period of ['7d', '14d', '30d', 'all']) for (const ranks of [RANK_ATOMS, ...RANK_ATOMS.map(r => [r]), ['unranked', 'master:ruby', 'grandmaster:epic']]) {
      const selection = { environment: h.NEW, period, ranks, decks: h.decks.map(d => d.id) };
      const data = parseEnvironmentTrends(await h.query(db, selection), selection);
      assert.equal(data.decks[0].points.length, period === 'all' ? 45 : parseInt(period));
      for (const deck of data.decks) for (const p of deck.points) {
        const end = Math.min(Date.parse(p.date + 'T00:00:00+09:00') + DAY, Date.parse(h.END));
        const start = Math.max(Date.parse(p.date + 'T00:00:00+09:00') - 6 * DAY, Date.parse(h.START));
        const population = rows.filter(m => m.environment_id === h.NEW && Date.parse(m.played_at) >= start && Date.parse(m.played_at) < end && ranks.includes(atom(m)));
        let encounters = 0, registrations = 0, evaluations = 0, wins = 0;
        for (const m of population) {
          const mine = m.my_archetype_id === deck.id, opponent = m.opponent_archetype_id === deck.id;
          encounters += Number(opponent); registrations += Number(mine || opponent);
          evaluations += Number(mine) + Number(opponent);
          wins += Number(mine && m.result === 'win') + Number(opponent && m.result === 'lose');
        }
        assert.deepEqual(p, { date: p.date, total: population.length || null, encounters: encounters || null,
          registrations: registrations || null, evaluations: evaluations || null, wins: evaluations ? wins : null });
        comparisons++;
      }
    }
    const all = await h.query(db, { ranks: RANK_ATOMS });
    const subset = await h.query(db, { ranks: RANK_ATOMS, decks: [h.decks[0].id] });
    assert.deepEqual(subset.decks[0], all.decks[0]);
    await db.exec("set timezone = 'America/New_York'");
    assert.deepEqual((await h.query(db, { ranks: RANK_ATOMS })).decks, all.decks);
    await db.exec("reset timezone; reset role");
    // JST midnight exclusive cutoff: last displayed date is Nov 13, never Nov 14.
    await db.query('update public.environments set dashboard_end_at=$1 where id=$2', ['2026-11-13T15:00:00Z', h.NEW]);
    await h.identity(db, h.MEMBER);
    const cutoff = await h.query(db, { period: '7d', ranks: RANK_ATOMS });
    assert.equal(cutoff.decks[0].points.at(-1).date, '2026-11-13');
    const summary = (await db.query('select public.get_environment_dashboard_aggregates_v4($1,$2,$3) as d', [h.NEW, '7d', RANK_ATOMS])).rows[0].d;
    for (const d of cutoff.decks) {
      const p = d.points.at(-1), s = summary.decks.find(s => s.key === d.id).current;
      assert.equal(p.total, summary.current.total.totalMatches);
      assert.equal(p.encounters, s.encounter.count);
      assert.equal(p.registrations, s.winrate.targetRegistrations);
      assert.equal(p.evaluations, s.winrate.evaluationCount);
      assert.equal(p.wins, s.winrate.wins);
    }
    await db.exec('reset role');
    await db.query('update public.environments set dashboard_end_at=null,match_input_end_at=$1 where id=$2', ['2026-11-05T10:05:00Z', h.NEW]);
    await h.identity(db, h.MEMBER);
    const ended = await h.query(db);
    assert.equal(Date.parse(ended.dataThrough), Date.parse(h.END), 'input end must not stop aggregation');
    assert.equal(ended.decks[0].points.at(-1).date, '2026-11-14');
    await db.exec('reset role');
    await db.query('update public.environments set start_date=$1,match_input_start_at=null,match_input_end_at=null where id=$2', ['2026-12-01', h.NEW]);
    await h.identity(db, h.MEMBER);
    assert.ok((await h.query(db)).decks.every(d => !d.points.length));
    await db.exec('reset role');
    await db.query('update public.environments set start_date=$1 where id=$2', ['2026-11-01', h.NEW]);
    const solo = h.row({ played_at: '2026-11-14T01:00:00Z', my_archetype_id: h.decks[0].id, opponent_archetype_id: h.decks[1].id, result: 'lose' });
    await h.seed(db, [solo]);
    const sparse = await h.query(db);
    assert.equal(trendRate(sparse.decks[0].points.at(-1), 'winrate'), 0);
    assert.equal(trendRate(sparse.decks[0].points.at(-1), 'encounter'), null);
    assert.equal(sparse.decks[0].points[0].total, null);
    await h.seed(db, [{ ...solo, opponent_archetype_id: solo.my_archetype_id }]);
    const mirror = (await h.query(db)).decks[0].points.at(-1);
    assert.equal(mirror.registrations, 1); assert.equal(mirror.evaluations, 2); assert.equal(mirror.wins, 1);
    for (const args of [{ period: '24h' }, { ranks: [] }, { ranks: ['all'] }, { decks: [] }, { decks: [h.uuid(999)] }, { decks: [null] }, { environment: h.uuid(999) }]) await assert.rejects(h.query(db, args));
    await db.exec('reset role');
    await db.query('update public.deck_archetypes set environment_id=$1 where id=$2', [h.OLD, h.decks[0].id]);
    await h.identity(db, h.MEMBER);
    await assert.rejects(h.query(db, { decks: [h.decks[0].id] }));
    for (const role of ['anon', 'service_role']) { await h.identity(db, null, role); await assert.rejects(h.query(db)); }
    for (const claim of [true, null, 'false', undefined]) {
      await db.exec('reset role'); await db.query("select set_config('request.jwt.claims',$1,false)", [JSON.stringify({ is_anonymous: claim })]);
      await db.exec('set role authenticated'); await assert.rejects(h.query(db));
    }
    await h.identity(db, h.MEMBER);
    await db.exec('reset role');
    const functions = (await db.query("select n.nspname,p.prosecdef,p.proconfig,p.proacl::text from pg_proc p join pg_namespace n on n.oid=p.pronamespace where p.proname='get_environment_trend_aggregates_v1'")).rows;
    for (const f of functions) { assert.equal(f.prosecdef, f.nspname === 'private'); assert.ok(f.proconfig.includes('search_path=""')); assert.ok(!/anon=|service_role=/.test(f.proacl)); }
    // Payload size is bounded by days/decks, not source row count; exercise the real index.
    await db.exec(`truncate public.matches;
      insert into public.matches(id,user_id,environment_id,my_archetype_id,opponent_archetype_id,result,played_at)
      select md5('trend-scale-' || i)::uuid,'${h.MEMBER}','${h.NEW}','${h.decks[1].id}','${h.decks[2].id}',
        case when i % 2 = 0 then 'win'::public.match_result else 'lose'::public.match_result end,
        timestamptz '${h.END}' - (i % 45) * interval '24 hours' - interval '1 hour'
      from generate_series(1,100000) i;
      analyze public.matches;`);
    await h.identity(db, h.MEMBER);
    const started = performance.now();
    const scaled = await h.query(db, { period: 'all', decks: [h.decks[1].id, h.decks[2].id] });
    const elapsed = Math.round(performance.now() - started);
    assert.equal(scaled.decks[0].points.length, 14); assert.ok(JSON.stringify(scaled).length < 10000);
    assert.ok(scaled.decks[0].points.at(-1).evaluations > 10000);
    await db.exec('reset role; set enable_seqscan = off');
    const plan = await db.query(`explain select count(*) from public.matches where environment_id=$1 and played_at >= $2 and played_at < $3`, [h.NEW, h.START, h.END]);
    assert.match(JSON.stringify(plan.rows), /matches_environment_played_at_idx/);
    assert.equal(jstDay(h.END), '2026-11-14');
    console.log(`PASS: ${comparisons} daily/deck oracle comparisons; summary parity; all rank atoms; rolling/JST/start/end boundaries; null/zero/mirror handling; subset denominator; SQL role/claim/catalog validation.`);
    console.log(`PASS: unchanged old functions/ACL/RLS; 100,000 synthetic rows, ${elapsed}ms local PGlite, ${JSON.stringify(scaled).length} response bytes; environment/time index usable.`);
  } finally { await db.close(); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
