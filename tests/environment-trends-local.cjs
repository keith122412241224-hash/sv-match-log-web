/* eslint-disable @typescript-eslint/no-require-imports */
// Real local Supabase only. Credentials are read from local CLI status in memory.
const fs = require('node:fs'), path = require('node:path'), cp = require('node:child_process'), assert = require('node:assert/strict'), crypto = require('node:crypto');
assert.equal(process.env.ENVIRONMENT_TRENDS_LOCAL, 'local-only');
const root = path.resolve(__dirname, '..'), out = path.join(root, 'build/environment-trends-local');
const local = path.join(out, 'local'), container = 'supabase_db_svml-environment-trends-20261114';
const api = 'http://127.0.0.1:16321', site = 'http://127.0.0.1:16330';
assert(!fs.existsSync(path.join(local, 'supabase/.temp/project-ref')));
assert(fs.readFileSync(path.join(local, 'supabase/config.toml'), 'utf8').includes('project_id = "svml-environment-trends-20261114"'));
const cli = path.join(root, 'build/stable-operations-creator-backup-tools/supabase.exe');
const status = cp.spawnSync(cli, ['status', '--workdir', local, '-o', 'json'], { encoding: 'utf8', windowsHide: true });
assert.equal(status.status, 0, 'Dedicated local status must succeed');
const config = JSON.parse(status.stdout); assert.equal(config.API_URL, api);
const nativeFetch = globalThis.fetch;
globalThis.fetch = (input, init) => { const u = new URL(typeof input === 'string' || input instanceof URL ? input : input.url); assert([api, site].includes(u.origin), 'Only local network allowed'); return nativeFetch(input, init); };
const { createClient } = require('@supabase/supabase-js');
const client = (key = config.ANON_KEY) => createClient(api, key, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
const service = client(config.SERVICE_ROLE_KEY);
const lit = value => "'" + String(value).replaceAll("'", "''") + "'";
function docker(args, input) {
  const r = cp.spawnSync('docker', ['exec', '-i', container, ...args], { input, windowsHide: true, maxBuffer: 64 * 1024 * 1024 });
  assert.equal(r.status, 0, 'Dedicated local command failed: ' + r.stderr?.toString().slice(0, 500)); return r.stdout;
}
const sql = (s, database = 'postgres') => docker(['psql', '-X', '-U', 'postgres', '-d', database, '-v', 'ON_ERROR_STOP=1', '-Atq'], s).toString().trim();
const json = (s, db) => JSON.parse(sql(s, db));
const ok = (r, label) => { assert.equal(r.error, null, label + (r.error ? ' [' + r.error.code + ']' : '')); return r.data; };
const ids = { env: crypto.randomUUID(), a: crypto.randomUUID(), b: crypto.randomUUID(), d1: crypto.randomUUID(), d2: crypto.randomUUID() };
const report = process.argv.includes('--recovery-only') ? JSON.parse(fs.readFileSync(path.join(out, 'real-stack-report.json'), 'utf8'))
  : { localOnly: true, startedAt: new Date().toISOString(), api, checks: [], passed: false };
delete report.error;
const save = () => fs.writeFileSync(path.join(out, 'real-stack-report.json'), JSON.stringify(report, null, 2));
async function user(label) {
  const email = 'trend-' + label + '-' + crypto.randomUUID() + '@example.test', password = 'Local!' + crypto.randomBytes(18).toString('hex');
  const u = ok(await service.auth.admin.createUser({ email, password, email_confirm: true }), 'local Auth create').user;
  const c = client(), session = ok(await c.auth.signInWithPassword({ email, password }), 'real password login').session;
  assert.equal(ok(await c.auth.getUser(), 'Auth user').user.is_anonymous, false); return { id: u.id, c, email, password, session };
}
async function main() {
  report.postgres = sql('select version()');
  report.migrations = json('select jsonb_agg(version order by version) from supabase_migrations.schema_migrations');
  assert(report.migrations.includes('20261114104651'));
  assert(report.migrations.includes('20261114212352'));
  const admin = await user('admin'), member = await user('member');
  sql(`insert into public.admin_users(user_id) values(${lit(admin.id)});
    insert into public.environments(id,user_id,name,start_date,dashboard_end_at,allow_match_input) values(${lit(ids.env)},${lit(admin.id)},'Local trends verification','2026-11-01','2026-11-13T15:00:00Z',true);
    insert into public.deck_archetypes(id,name,class_name,environment_id,environment_name) values(${lit(ids.a)},'Local A','エルフ',${lit(ids.env)},${lit(ids.env)}),(${lit(ids.b)},'Local B','ロイヤル',${lit(ids.env)},${lit(ids.env)});
    insert into public.decks(id,user_id,name,class_name) values(${lit(ids.d1)},${lit(admin.id)},'Local private A','エルフ'),(${lit(ids.d2)},${lit(member.id)},'Local private B','ロイヤル');
    insert into public.matches(user_id,environment_id,my_deck_id,opponent_deck_id,my_archetype_id,opponent_archetype_id,result,turn_order,played_at) values
    (${lit(admin.id)},${lit(ids.env)},${lit(ids.d1)},${lit(ids.d1)},${lit(ids.a)},${lit(ids.b)},'win','first','2026-11-10T00:00:00Z'),
    (${lit(member.id)},${lit(ids.env)},${lit(ids.d2)},${lit(ids.d2)},${lit(ids.b)},${lit(ids.a)},'lose','second','2026-11-11T00:00:00Z'),
    (${lit(admin.id)},${lit(ids.env)},${lit(ids.d1)},${lit(ids.d1)},${lit(ids.a)},${lit(ids.a)},'win','first','2026-11-12T00:00:00Z');
    update public.environments set match_input_start_at='2026-12-01',match_input_end_at='2026-12-02' where id=${lit(ids.env)};`);
  const args = { p_environment_id: ids.env, p_period: '7d', p_rank_filters: ['unranked'], p_deck_ids: [ids.a, ids.b] };
  const data = ok(await member.c.rpc('get_environment_trend_aggregates_v1', args), 'member trend RPC');
  const a = data.decks.find(d => d.id === ids.a).points.at(-1), b = data.decks.find(d => d.id === ids.b).points.at(-1);
  assert.deepEqual(a, { date: '2026-11-13', total: 3, encounters: 2, registrations: 3, evaluations: 4, wins: 3 });
  assert.deepEqual(b, { date: '2026-11-13', total: 3, encounters: 1, registrations: 2, evaluations: 2, wins: 0 });
  assert.deepEqual(ok(await admin.c.rpc('get_environment_trend_aggregates_v1', args), 'admin trend RPC').decks, data.decks);
  assert.equal(ok(await member.c.from('matches').select('id').eq('environment_id', ids.env), 'member raw RLS').length, 1);
  const summary = ok(await member.c.rpc('get_environment_dashboard_aggregates_v4', { p_environment_id: ids.env, p_period: '7d', p_rank_filters: ['unranked'] }), 'summary parity');
  assert.equal(summary.current.total.totalMatches, a.total);
  for (const [id, point] of [[ids.a, a], [ids.b, b]]) {
    const s = summary.decks.find(d => d.key === id).current;
    assert.equal(s.encounter.count, point.encounters); assert.equal(s.winrate.evaluationCount, point.evaluations); assert.equal(s.winrate.wins, point.wins);
  }
  const guest = client(); ok(await guest.auth.signInAnonymously(), 'real anonymous Auth');
  report.denials = [];
  for (const [label, c] of [['no session', client()], ['anonymous Auth', guest], ['service role', service]]) {
    const r = await c.rpc('get_environment_trend_aggregates_v1', args); assert(r.error, label + ' denied'); report.denials.push({ label, code: r.error.code });
  }
  for (const patch of [{ p_period: "all'); select 1; --" }, { p_deck_ids: [] }, { p_deck_ids: [crypto.randomUUID()] }, { p_rank_filters: ['all'] }, { p_environment_id: crypto.randomUUID() }]) {
    const r = await member.c.rpc('get_environment_trend_aggregates_v1', { ...args, ...patch }); assert(r.error); assert.equal(r.error.code, '22023');
  }
  const forged = await fetch(api + '/rest/v1/rpc/get_environment_trend_aggregates_v1', { method: 'POST', headers: { apikey: config.ANON_KEY, Authorization: 'Bearer ' + member.session.access_token.slice(0, -8) + 'forgedxx', 'Content-Type': 'application/json' }, body: JSON.stringify(args) });
  assert.equal(forged.status, 401);
  const privateCall = await member.c.schema('private').rpc('get_environment_trend_aggregates_v1', args); assert(privateCall.error);
  for (const secret of [admin.id, member.id, ids.d1, ids.d2, 'Local private', 'user_id', 'memo']) assert(!JSON.stringify(data).includes(secret));
  report.acl = json("select jsonb_agg(jsonb_build_object('schema',n.nspname,'definer',p.prosecdef,'config',p.proconfig,'anon',has_function_privilege('anon',p.oid,'execute'),'member',has_function_privilege('authenticated',p.oid,'execute'),'service',has_function_privilege('service_role',p.oid,'execute'))) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where p.proname='get_environment_trend_aggregates_v1'");
  for (const f of report.acl) { assert.equal(f.anon, false); assert.equal(f.member, true); assert.equal(f.service, false); assert.deepEqual(f.config, ['search_path=""']); }
  report.checks.push('Historical hardening and split trend migrations applied on real local PostgreSQL; real Auth password JWT and PostgREST RPC; member/admin parity; raw RLS; anonymous/service/forged JWT/private schema denied; invalid arguments; no PII'); save();
  console.log('Real Auth/PostgREST and aggregate checks PASS');
  await browserCheck(member, args);
  await recoveryCheck();
  report.passed = true; report.completedAt = new Date().toISOString(); save();
}
async function browserCheck(member, args) {
  const { chromium } = require(path.join(root, 'build/environment-trends-tools/node_modules/playwright'));
  const env = {};
  for (const [k, v] of Object.entries(process.env)) if (/^(PATH|PATHEXT|SystemRoot|WINDIR|COMSPEC|TEMP|TMP|APPDATA|LOCALAPPDATA|USERPROFILE|HOMEDRIVE|HOMEPATH|ProgramFiles|ProgramFiles\(x86\)|ProgramW6432)$/i.test(k)) env[k] = v;
  Object.assign(env, { NEXT_PUBLIC_SUPABASE_URL: api, NEXT_PUBLIC_SUPABASE_ANON_KEY: config.ANON_KEY, NEXT_PUBLIC_SITE_URL: site, NEXT_TELEMETRY_DISABLED: '1', ADMIN_SUGGESTION_WRITES: 'paused' });
  const log = fs.openSync(path.join(out, 'next-local.log'), 'w');
  const app = cp.spawn(process.execPath, [require.resolve('next/dist/bin/next'), 'dev', '--hostname', '127.0.0.1', '-p', '16330'], { cwd: root, env, windowsHide: true, stdio: ['ignore', log, log] });
  let browser;
  try {
    let ready = false;
    for (let i = 0; i < 100; i++) { try { if ((await fetch(site + '/privacy')).ok) { ready = true; break; } } catch {} await new Promise(r => setTimeout(r, 300)); }
    assert(ready, 'local Next ready');
    browser = await chromium.launch({ headless: true, executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe' });
    const context = await browser.newContext({ timezoneId: 'Asia/Tokyo' });
    await context.route('**/*', route => { const u = new URL(route.request().url()); return [api, site].includes(u.origin) || ['data:', 'blob:'].includes(u.protocol) ? route.continue() : route.abort(); });
    const page = await context.newPage(), errors = []; page.on('pageerror', e => errors.push(e.message));
    await page.goto(site + '/login');
    await page.locator('input[name=email]').first().fill(member.email); await page.locator('input[name=password]').first().fill(member.password);
    await page.getByRole('button', { name: 'ログイン', exact: true }).click(); await page.waitForURL(u => u.pathname !== '/login', { timeout: 60000 });
    await page.goto(site + '/environment?environment=' + ids.env + '&period=7d&ranks=unranked');
    await page.getByRole('tab', { name: '推移分析' }).click();
    const panel = page.getByRole('tabpanel', { name: '推移分析' });
    await panel.getByRole('button', { name: /^デッキ選択/ }).click(); const dialog = page.getByRole('dialog');
    await dialog.getByRole('button', { name: 'すべて選択', exact: true }).click();
    const response = page.waitForResponse(r => r.url().endsWith('/api/environment/trends') && r.status() === 200);
    await dialog.getByRole('button', { name: '決定', exact: true }).click(); const body = await (await response).json();
    assert.equal(body.decks.find(d => d.id === ids.a).points.at(-1).evaluations, 4);
    await page.waitForFunction(() => document.querySelectorAll('path[data-trend-deck]').length >= 2);
    await page.screenshot({ path: path.join(out, 'real-stack-browser.png'), fullPage: true });
    sql('revoke execute on function public.get_environment_trend_aggregates_v1(uuid,text,text[],uuid[]) from authenticated;');
    try {
      await page.locator('label').filter({ has: page.locator('input[name=period][value="14d"]') }).click();
      await panel.getByRole('alert').waitFor(); assert.match(await panel.innerText(), /取得できませんでした/);
    } finally { sql('grant execute on function public.get_environment_trend_aggregates_v1(uuid,text,text[],uuid[]) to authenticated;'); }
    const retry = page.waitForResponse(r => r.url().endsWith('/api/environment/trends') && r.status() === 200);
    await panel.getByRole('button', { name: '再試行', exact: true }).click(); await retry;
    assert.equal((await fetch(site + '/api/environment/trends', { method: 'POST', body: JSON.stringify(args) })).status, 401);
    assert.deepEqual(errors, []);
    report.checks.push('real login UI -> cookie -> Next API -> real PostgREST -> SQL -> two graph lines; real DB permission failure -> UI error -> permission restore -> retry; signed-out API 401'); save();
    console.log('Real browser flow and error/retry PASS');
  } finally { if (browser) await browser.close(); app.kill(); fs.closeSync(log); }
}
async function recoveryCheck() {
  const signature = 'get_environment_trend_aggregates_v1(uuid,text,text[],uuid[])';
  const before = sql("select md5(pg_get_functiondef('private." + signature + "'::regprocedure));");
  const count = sql('select count(*) from public.matches');
  const dump = docker(['pg_dump', '-U', 'postgres', '-d', 'postgres', '-Fc', '--no-owner']);
  fs.writeFileSync(path.join(out, 'synthetic-local-backup.dump'), dump);
  const restoreDb = 'trends_restore_' + Date.now();
  docker(['createdb', '-U', 'postgres', '-T', 'template0', restoreDb]);
  // Managed schemas require the local cluster administrator, not the restricted
  // application postgres role. Preserve original owners/ACLs from the archive.
  docker(['pg_restore', '-U', 'supabase_admin', '-d', restoreDb, '--exit-on-error'], dump);
  assert.equal(sql('select count(*) from public.matches', restoreDb), count);
  assert.equal(sql("select md5(pg_get_functiondef('private." + signature + "'::regprocedure));", restoreDb), before);
  const roles = sql("select has_function_privilege('anon','public." + signature + "','execute'),has_function_privilege('authenticated','public." + signature + "','execute')", restoreDb);
  assert.equal(roles, 'f|t');
  const catalogQuery = `select jsonb_build_object(
    'functions',(select jsonb_agg(jsonb_build_object('name',p.oid::regprocedure::text,'owner',p.proowner::regrole::text,'acl',(select array_agg(v::text order by v::text) from unnest(p.proacl) v),'body',md5(pg_get_functiondef(p.oid))) order by p.oid::regprocedure::text) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname in ('public','private') and p.prokind='f'),
    'policies',(select jsonb_agg(to_jsonb(p) order by schemaname,tablename,policyname) from pg_policies p where schemaname in ('public','storage','suggestion_private')),
    'rls',(select jsonb_agg(jsonb_build_object('name',c.relname,'enabled',c.relrowsecurity,'forced',c.relforcerowsecurity) order by c.relname) from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind='r'));`;
  assert.deepEqual(json(catalogQuery, restoreDb), json(catalogQuery));
  report.backup = { syntheticOnly: true, bytes: dump.length, sha256: crypto.createHash('sha256').update(dump).digest('hex'), restoreDb, matches: Number(count), functionAndAclRestored: true, fullAppFunctionOwnersAclAndRlsPreserved: true };
  report.checks.push('full logical backup and restore into separate local database; row count, RPC definition and ACL preserved'); save();
  console.log('Synthetic local backup/restore PASS');
}
const run = process.argv.includes('--recovery-only') ? recoveryCheck().then(() => { report.passed = true; report.completedAt = new Date().toISOString(); save(); }) : main();
run.catch(e => { report.error = String(e.message).slice(0, 700); save(); console.error(report.error); process.exitCode = 1; });
