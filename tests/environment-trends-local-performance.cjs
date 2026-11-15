/* eslint-disable @typescript-eslint/no-require-imports */
// Native local PostgreSQL + real HTTP/JWT load. No cloud credentials or URLs accepted.
const fs = require('node:fs'), path = require('node:path'), cp = require('node:child_process'), assert = require('node:assert/strict'), crypto = require('node:crypto');
assert.equal(process.env.ENVIRONMENT_TRENDS_LOCAL, 'local-only');
const out = path.resolve('build/environment-trends-local'), local = path.join(out, 'local');
const container = 'supabase_db_svml-environment-trends-20261114', api = 'http://127.0.0.1:16321';
assert(!fs.existsSync(path.join(local, 'supabase/.temp/project-ref')));
const status = cp.spawnSync(path.resolve('build/stable-operations-creator-backup-tools/supabase.exe'), ['status', '--workdir', local, '-o', 'json'], { encoding: 'utf8', windowsHide: true });
assert.equal(status.status, 0); const config = JSON.parse(status.stdout); assert.equal(config.API_URL, api);
const nativeFetch = globalThis.fetch;
globalThis.fetch = (input, init) => { assert.equal(new URL(typeof input === 'string' || input instanceof URL ? input : input.url).origin, api); return nativeFetch(input, init); };
const { createClient } = require('@supabase/supabase-js');
const client = key => createClient(api, key || config.ANON_KEY, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
const service = client(config.SERVICE_ROLE_KEY), lit = v => "'" + String(v).replaceAll("'", "''") + "'";
const ok = r => { assert.equal(r.error, null, r.error?.code); return r.data; };
function sql(s) { const r = cp.spawnSync('docker', ['exec', '-i', container, 'psql', '-X', '-U', 'postgres', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1', '-Atq'], { input: s, encoding: 'utf8', windowsHide: true, maxBuffer: 16e6 }); assert.equal(r.status, 0, r.stderr.slice(0, 700)); return r.stdout.trim(); }
const ranks = ['unranked','beginner','d','c','b','a','aa','master:emerald','master:topaz','master:ruby','master:sapphire','master:diamond','grandmaster:none','grandmaster:epic','grandmaster:ultimate','grandmaster:legend','grandmaster:beyond'];
const ids = { env: crypto.randomUUID(), personal: crypto.randomUUID(), decks: Array.from({ length: 60 }, () => crypto.randomUUID()) };
const report = { localOnly: true, realAuthPostgREST: true, nativePostgres: true, cases: [], concurrent: [], passed: false };
const save = () => fs.writeFileSync(path.join(out, 'native-performance.json'), JSON.stringify(report, null, 2));
const pct = (a, p) => [...a].sort((x, y) => x - y)[Math.ceil(a.length * p) - 1];
async function main() {
  const users = [];
  for (let i = 0; i < 8; i++) {
    const email = 'trend-load-' + crypto.randomUUID() + '@example.test', password = 'Local!' + crypto.randomBytes(18).toString('hex');
    const u = ok(await service.auth.admin.createUser({ email, password, email_confirm: true })).user, c = client();
    ok(await c.auth.signInWithPassword({ email, password })); users.push({ id: u.id, c });
  }
  report.postgres = sql('select version()');
  report.settings = JSON.parse(sql("select jsonb_object_agg(name,setting) from pg_settings where name in ('work_mem','shared_buffers','statement_timeout','enable_seqscan','max_connections','max_parallel_workers_per_gather')"));
  report.roleSettings = JSON.parse(sql("select jsonb_agg(jsonb_build_object('role',rolname,'config',rolconfig)) from pg_roles where rolname in ('authenticated','authenticator')"));
  sql(`insert into public.environments(id,user_id,name,start_date,dashboard_end_at,allow_match_input) values(${lit(ids.env)},${lit(users[0].id)},'Local native load','2025-11-14','2026-11-13T15:00:00Z',true);
    insert into public.decks(id,user_id,name,class_name) values(${lit(ids.personal)},${lit(users[0].id)},'Synthetic private load','エルフ');
    insert into public.deck_archetypes(id,name,class_name,environment_id,environment_name) values ${ids.decks.map((id, i) => `(${lit(id)},'Synthetic ${i}','エルフ',${lit(ids.env)},${lit(ids.env)})`).join(',')};`);
  const array = ids.decks.map(lit).join(','), tiers = ranks.map(r => lit(r.split(':')[0])).join(','), children = ranks.map(r => lit(r.split(':')[1] || '')).join(',');
  const migration = fs.readFileSync('supabase/migrations/20261114212352_environment_trends_rpc.sql', 'utf8').replaceAll('\r\n', '\n');
  report.migrationSha256 = crypto.createHash('sha256').update(migration).digest('hex');
  const inner = migration.slice(migration.indexOf('    with days as ('), migration.indexOf('\n  );\nend;'));
  for (const size of [100000, 1000000]) {
    const t = performance.now(), from = size === 100000 ? 1 : 100001;
    sql(`insert into public.matches(user_id,environment_id,my_deck_id,opponent_deck_id,my_archetype_id,opponent_archetype_id,result,turn_order,played_at,rank_tier,master_group,grandmaster_rating)
      select ${lit(users[0].id)}::uuid,${lit(ids.env)}::uuid,${lit(ids.personal)}::uuid,${lit(ids.personal)}::uuid,
      (array[${array}]::uuid[])[1+i%60],(array[${array}]::uuid[])[1+(i/17)%60],
      case when i%2=0 then 'win'::public.match_result else 'lose'::public.match_result end,'first',
      timestamptz '2026-11-13T15:00:00Z' - (i%365)*interval '1 day' - interval '1 hour',
      nullif((array[${tiers}])[1+i%17],'unranked'),
      case when (array[${tiers}])[1+i%17]='master' then (array[${children}])[1+i%17] end,
      case when (array[${tiers}])[1+i%17]='grandmaster' then (array[${children}])[1+i%17] end
      from generate_series(${from},${size}) i; analyze public.matches;`);
    console.log(`Native synthetic seed ${size} rows: ${Math.round(performance.now() - t)}ms`);
    for (const period of ['30d', 'all']) for (const count of [1, 60]) {
      const args = { p_environment_id: ids.env, p_period: period, p_rank_filters: ranks, p_deck_ids: ids.decks.slice(0, count) }, samples = [];
      let data;
      for (let n = 0; n < 3; n++) { const t = performance.now(); data = ok(await users[0].c.rpc('get_environment_trend_aggregates_v1', args)); samples.push(Math.round(performance.now() - t)); }
      assert.equal(data.decks.length, count); assert.equal(data.decks[0].points.length, period === 'all' ? 365 : 30);
      const row = { rows: size, period, decks: count, samplesMs: samples, medianMs: pct(samples, 0.5), bytes: Buffer.byteLength(JSON.stringify(data)) };
      if (size === 1000000 && count === 60) {
        const first = period === 'all' ? '2025-11-14' : '2026-10-15', scan = period === 'all' ? first : '2026-10-09';
        const params = { scan_day: lit(scan) + '::date', last_day: "date '2026-11-13'", first_day: lit(first) + '::date', environment_start: "timestamptz '2025-11-13T15:00:00Z'", data_through: "timestamptz '2026-11-13T15:00:00Z'", p_environment_id: lit(ids.env) + '::uuid', p_rank_filters: 'array[' + ranks.map(lit).join(',') + ']::text[]', p_deck_ids: 'array[' + array + ']::uuid[]', p_period: lit(period) + '::text', aggregated_at: 'statement_timestamp()' };
        const query = Object.entries(params).reduce((s, [k, v]) => s.replace(new RegExp('\\b' + k + '\\b', 'g'), v), inner);
        const plan = JSON.parse(sql('explain (analyze,buffers,format json) ' + query))[0];
        const walk = n => [n, ...(n.Plans || []).flatMap(walk)];
        row.plan = { executionMs: plan['Execution Time'], tempReadBlocks: plan.Plan['Temp Read Blocks'], tempWrittenBlocks: plan.Plan['Temp Written Blocks'], scans: walk(plan.Plan).filter(n => n['Relation Name'] === 'matches').map(n => ({ type: n['Node Type'], rows: n['Actual Rows'], loops: n['Actual Loops'], removed: n['Rows Removed by Filter'] })), indexes: [...new Set(walk(plan.Plan).map(n => n['Index Name']).filter(Boolean))] };
        fs.writeFileSync(path.join(out, `native-plan-${period}.json`), JSON.stringify(plan, null, 2));
      }
      report.cases.push(row); save(); console.log(JSON.stringify(row));
    }
  }
  for (const concurrency of [4, 8]) for (const period of ['30d', 'all']) {
    const samples = [], errors = []; let maxActive = 0;
    const start = performance.now();
    for (let round = 0; round < 3; round++) {
      const pending = users.slice(0, concurrency).map(async u => {
        const t = performance.now(), r = await u.c.rpc('get_environment_trend_aggregates_v1', { p_environment_id: ids.env, p_period: period, p_rank_filters: ranks, p_deck_ids: ids.decks });
        samples.push(Math.round(performance.now() - t)); if (r.error) errors.push(r.error.code); else assert.equal(r.data.decks.length, 60);
      });
      await new Promise(r => setTimeout(r, 30));
      maxActive = Math.max(maxActive, Number(sql("select count(distinct pid) from pg_stat_activity where backend_type='client backend' and state='active' and usename='authenticator' and query like '%get_environment_trend_aggregates_v1%'")));
      await Promise.all(pending);
    }
    const row = { concurrency, period, requests: samples.length, medianMs: pct(samples, 0.5), p95Ms: pct(samples, 0.95), maxMs: Math.max(...samples), wallMs: Math.round(performance.now() - start), maxObservedActiveDatabaseSessions: maxActive, errors };
    report.concurrent.push(row); save(); console.log(JSON.stringify(row)); assert.equal(errors.length, 0, 'HTTP concurrent RPC errors');
  }
  const t = performance.now();
  sql('begin; set local lock_timeout=\'2s\'; create index trends_local_index_rehearsal on public.matches(environment_id,played_at); rollback;');
  report.indexBuildRehearsalMs = Math.round(performance.now() - t);
  assert.equal(sql("select count(*) from pg_indexes where indexname='trends_local_index_rehearsal'"), '0');
  report.notes = ['All measured rows in one environment; 365 days; 60 selected active decks; all 17 ranks', 'Real HTTP includes local Auth JWT/PostgREST/JSON transfer; no Next/browser rendering', 'Four/eight distinct authenticated users and concurrent server backends; three small bursts, not sustained production capacity', 'Other existing local Docker stacks remain running; no isolation or production hardware equivalence'];
  report.passed = true; save();
}
main().catch(e => { report.error = String(e.message).slice(0, 700); save(); console.error(report.error); process.exitCode = 1; });
