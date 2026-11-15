/* eslint-disable @typescript-eslint/no-require-imports */
// Reproducible synthetic benchmark. PGlite only, never a network/database URL.
require('./register.cjs');
const fs = require('node:fs'), path = require('node:path'), os = require('node:os'), assert = require('node:assert/strict'), crypto = require('node:crypto');
const h = require('./environment-trends-db.cjs'), { RANK_ATOMS } = require('../src/lib/rank-selection');
const out = path.resolve('build/environment-trends-preflight'); fs.mkdirSync(out, { recursive: true });
const report = { engine: 'PGlite single in-process PostgreSQL; no Auth/PostgREST or network', runtime: process.version,
  cpu: os.cpus()[0]?.model, logicalCpus: os.cpus().length, sourceDistribution: '20% target environment, 80% another environment; 365 days; 17 rank atoms; 60 active decks', cases: [], passed: false };
const ranks = RANK_ATOMS.map(r => r.split(':'));
const walk = node => [node, ...(node.Plans ?? []).flatMap(walk)];
async function main() {
  const db = await h.createDb();
  try {
    // The shared fixture disables sequential scans for its index availability test.
    // Restore the production planner default before measuring realistic choices.
    await db.exec('set enable_seqscan=on');
    report.postgres = (await db.query('select version() v')).rows[0].v;
    report.settings = (await db.query("select name,setting,unit from pg_settings where name in ('work_mem','shared_buffers','statement_timeout','enable_seqscan','max_parallel_workers_per_gather')")).rows;
    await db.query('update public.environments set start_date=$1,match_input_start_at=null,match_input_end_at=null,dashboard_end_at=null where id=$2', ['2025-11-15', h.NEW]);
    await db.exec('update public.deck_archetypes set is_active=false');
    const decks = Array.from({ length: 60 }, (_, i) => ({ id: h.uuid(10000 + i), name: 'Synthetic deck ' + i, class_name: 'Synthetic', is_active: true }));
    await db.query('insert into public.deck_archetypes select * from jsonb_populate_recordset(null::public.deck_archetypes,$1::jsonb)', [JSON.stringify(decks)]);
    const migration = h.read(h.migration); report.migrationSha256 = crypto.createHash('sha256').update(migration).digest('hex');
    // EXPLAIN the exact SQL return body of the RPC; otherwise EXPLAIN only shows a function Result node.
    const inner = migration.slice(migration.indexOf('    with days as ('), migration.indexOf('\n  );\nend;'));
    const keys = ['scan_day', 'last_day', 'first_day', 'environment_start', 'data_through', 'p_environment_id', 'p_rank_filters', 'p_deck_ids', 'p_period', 'aggregated_at'];
    const types = ['date', 'date', 'date', 'timestamptz', 'timestamptz', 'uuid', 'text[]', 'uuid[]', 'text', 'timestamptz'];
    const query = keys.reduce((sql, k, i) => sql.replace(new RegExp('\\b' + k + '\\b', 'g'), '$' + (i + 1) + '::' + types[i]), inner);
    const day = ms => new Date(ms).toISOString().slice(0, 10), start = '2025-11-14T15:00:00Z';
    for (const { size, allInTarget } of [{ size: 10000 }, { size: 100000 }, { size: 1000000 }, { size: 1000000, allInTarget: true }]) {
      await db.exec('reset role; truncate public.matches');
      const insertStart = performance.now();
      await db.query(`insert into public.matches(id,user_id,environment_id,my_archetype_id,opponent_archetype_id,result,played_at,rank_tier,master_group,grandmaster_rating)
        select md5('trend-perf-' || i)::uuid,case when i % 2 = 0 then $1::uuid else $2::uuid end,
          case when $10::boolean or i % 5 = 0 then $3::uuid else $4::uuid end,
          ($5::uuid[])[1 + ((i / 5) % 60)], ($5::uuid[])[1 + ((i / 17) % 60)],
          case when i % 2 = 0 then 'win'::public.match_result else 'lose'::public.match_result end,
          $6::timestamptz - ((i / 5) % 365) * interval '24 hours' - interval '1 hour',
          nullif(($7::text[])[1 + (i % 17)],'unranked'),
          case when ($7::text[])[1 + (i % 17)]='master' then ($8::text[])[1 + (i % 17)] else null end,
          case when ($7::text[])[1 + (i % 17)]='grandmaster' then ($8::text[])[1 + (i % 17)] else null end
        from generate_series(1,$9::int) i`, [h.MEMBER, h.OTHER, h.NEW, h.OLD, decks.map(d => d.id), h.END, ranks.map(r => r[0]), ranks.map(r => r[1] ?? ''), size, !!allInTarget]);
      await db.exec('analyze public.matches');
      console.log(`Seeded ${size} synthetic rows in ${Math.round(performance.now() - insertStart)}ms`);
      for (const period of ['30d', 'all']) for (const count of allInTarget ? [60] : [1, 8, 60]) {
        const selected = decks.slice(0, count).map(d => d.id), durations = [];
        await h.identity(db, h.MEMBER);
        let data;
        for (let repeat = 0; repeat < 3; repeat++) {
          const t = performance.now(); data = await h.query(db, { period, decks: selected, ranks: RANK_ATOMS }); durations.push(Math.round((performance.now() - t) * 10) / 10);
        }
        assert.equal(data.decks.length, count); assert.equal(data.decks[0].points.length, period === 'all' ? 365 : 30);
        const row = { size, targetEnvironmentRows: allInTarget ? size : size / 5, period, selectedDecks: count, allRanks: true, samplesMs: durations, medianMs: [...durations].sort((a, b) => a - b)[1], bytes: Buffer.byteLength(JSON.stringify(data)), points: count * data.decks[0].points.length };
        if (size === 1000000) {
          await db.exec('reset role');
          const first = period === 'all' ? '2025-11-15' : day(Date.parse('2026-11-14') - 29 * 86400000);
          const scan = period === 'all' ? first : day(Date.parse(first) - 6 * 86400000);
          const plan = (await db.query('explain (analyze,buffers,format json) ' + query, [scan, '2026-11-14', first, start, h.END, h.NEW, RANK_ATOMS, selected, period, h.NOW])).rows[0]['QUERY PLAN'][0];
          const file = `plan-${size}-${allInTarget ? 'concentrated-' : ''}${period}-${count}.json`; fs.writeFileSync(path.join(out, file), JSON.stringify(plan, null, 2));
          const nodes = walk(plan.Plan);
          row.plan = { file, executionMs: plan['Execution Time'], planningMs: plan['Planning Time'], sharedHitBlocks: plan.Plan['Shared Hit Blocks'], tempReadBlocks: plan.Plan['Temp Read Blocks'], tempWrittenBlocks: plan.Plan['Temp Written Blocks'],
            scans: nodes.filter(n => n['Relation Name'] === 'matches').map(n => ({ type: n['Node Type'], index: n['Index Name'], rows: n['Actual Rows'], loops: n['Actual Loops'], removed: n['Rows Removed by Filter'] })),
            indexes: [...new Set(nodes.map(n => n['Index Name']).filter(Boolean))],
            sorts: nodes.filter(n => n['Sort Method']).map(n => ({ method: n['Sort Method'], spaceKB: n['Sort Space Used'], type: n['Sort Space Type'] })) };
        }
        report.cases.push(row); fs.writeFileSync(path.join(out, 'performance.json'), JSON.stringify(report, null, 2)); console.log(JSON.stringify(row));
      }
    }
    await h.identity(db, h.MEMBER);
    const t = performance.now();
    const completionMs = await Promise.all(Array.from({ length: 8 }, async () => { await h.query(db, { period: '30d', decks: decks.map(d => d.id), ranks: RANK_ATOMS }); return Math.round(performance.now() - t); }));
    report.queuedBurst = { requests: 8, completionMs, note: 'PGlite serializes these requests; this is queue latency, NOT real database multi-session concurrency.' };
    report.realConcurrentUsers = 'UNVERIFIED: no safe real Supabase/PostgreSQL server available'; report.passed = true;
  } finally { await db.close(); }
}
main().catch(e => { report.error = e.stack; console.error(e); process.exitCode = 1; }).finally(() => fs.writeFileSync(path.join(out, 'performance.json'), JSON.stringify(report, null, 2)));
