/* eslint-disable @typescript-eslint/no-require-imports */
// Real Supabase Auth + PostgREST + PG17. Fixed localhost ports; no .env or remote URL accepted.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { Client } = require(process.env.PG_MODULE || 'pg');
const f = require('./environment-dashboard-fixture.cjs');
const root = path.resolve(__dirname, '..'), out = path.join(root, 'build/e1-evidence');
const migration = fs.readdirSync(path.join(root, 'supabase/migrations')).find(n => n.endsWith('_environment_dashboard_rank_filters.sql'));
const migrationSql = fs.readFileSync(path.join(root, 'supabase/migrations', migration), 'utf8');
const name = 'get_environment_dashboard_aggregates_v1';
const db = new Client({ host: '127.0.0.1', port: 56322, database: 'postgres', user: 'postgres', password: 'postgres', connectionTimeoutMillis: 5000 });
const report = { localOnly: true, cases: [], auth: [], plans: [], migration };
let keys, rows, anchor;
function note(name) { report.cases.push(name); }
function readKeys() {
  const raw = fs.readFileSync(path.join(out, 'start.log'));
  const text = raw.toString(raw[0] === 255 ? 'utf16le' : 'utf8');
  const data = JSON.parse(text.replace(/^\uFEFF/, '').trim());
  assert.equal(data.API_URL, 'http://127.0.0.1:56321');
  assert.equal(data.DB_URL, 'postgresql://postgres:postgres@127.0.0.1:56322/postgres');
  return data;
}
async function http(route, body, token, extra = {}) {
  const headers = { apikey: keys.ANON_KEY, 'Content-Type': 'application/json', ...extra };
  if (token) headers.Authorization = 'Bearer ' + token;
  const response = await fetch(keys.API_URL + route, { method: 'POST', headers, body: JSON.stringify(body) });
  return { status: response.status, body: await response.json() };
}
async function claim(user = f.users[0], anonymous = false, role = 'authenticated', omit = false) {
  await db.query('reset role');
  const claims = { role, ...(user ? { sub: user } : {}), ...(omit ? {} : { is_anonymous: anonymous }) };
  await db.query("select set_config('request.jwt.claims',$1,false), set_config('request.jwt.claim.sub','',false)", [JSON.stringify(claims)]);
  assert.ok(['authenticated', 'anon', 'service_role'].includes(role));
  await db.query('set role ' + role);
}
async function rpc(environment, period = '24h', rank = 'all', schema = 'public') {
  assert.ok(['public', 'private'].includes(schema));
  return (await db.query(`select ${schema}.${name}($1::uuid,$2::text,$3::text) as payload`, [environment, period, rank])).rows[0].payload;
}
async function rejectCall(fn, code) {
  await db.query('savepoint negative');
  try { await assert.rejects(fn, e => e.code === code); }
  finally { await db.query('rollback to savepoint negative'); await db.query('release savepoint negative'); }
}
const stamp = x => new Date(x).toISOString();
function auditPayload(p) {
  const checkKeys = (o, allowed) => assert.deepEqual(Object.keys(o).sort(), allowed.slice().sort());
  checkKeys(p, ['version', 'period', 'rankFilter', 'environmentId', 'aggregatedAt', 'dataThrough', 'current', 'previous', 'decks']);
  for (const label of ['current', 'previous']) {
    checkKeys(p[label], ['start', 'end', 'total']); checkKeys(p[label].total, ['status', 'totalMatches']);
    if (p[label].total.status !== 'available') assert.equal(p[label].total.totalMatches, null);
  }
  const strings = [], numbers = [];
  function visit(v) { if (typeof v === 'string') strings.push(v); else if (typeof v === 'number') numbers.push(v); else if (v && typeof v === 'object') Object.values(v).forEach(visit); }
  for (const d of p.decks) {
    checkKeys(d, ['key', 'name', 'className', 'current', 'previous']);
    for (const label of ['current', 'previous']) {
      checkKeys(d[label], ['encounter', 'winrate']);
      const e = d[label].encounter, w = d[label].winrate;
      checkKeys(e, ['status', 'count']); checkKeys(w, ['status', 'targetRegistrations', 'evaluationCount', 'wins']);
      if (e.status !== 'available') assert.equal(e.count, null);
      if (w.status !== 'available') for (const k of ['targetRegistrations', 'evaluationCount', 'wins']) assert.equal(w[k], null);
      if (p[label].total.status !== 'available') {
        assert.equal(e.status, p[label].total.status); assert.equal(w.status, p[label].total.status);
      }
    }
  }
  visit(p);
  for (const n of numbers) assert.ok(Number.isSafeInteger(n) && n >= 0);
  const forbidden = [...f.users, ...rows.flatMap(r => [r.id, r.privateDeck, f.iso(r.played)]), 'PRIVATE-DECK', 'PRIVATE-MEMO'];
  for (const value of forbidden) for (const s of strings) assert.ok(!s.includes(value), 'Forbidden value in payload');
  assert.deepEqual(p.decks.map(d => d.key), f.catalog.map(d => d.key).sort());
}
function compare(p, environment, period, rank, t) {
  assert.equal(p.version, 1); assert.equal(p.environmentId, environment); assert.equal(p.period, period); assert.equal(p.rankFilter, rank);
  assert.equal(stamp(p.dataThrough), stamp(f.iso(t)));
  const expected = f.expected(rows, environment, period, rank, t);
  for (const label of ['current', 'previous']) {
    assert.equal(stamp(p[label].start), stamp(expected[label].start)); assert.equal(stamp(p[label].end), stamp(expected[label].end));
    assert.deepEqual(p[label].total, expected[label].total);
    for (const want of expected[label].decks) {
      const got = p.decks.find(d => d.key === want.key);
      assert.deepEqual(got[label], { encounter: want.encounter, winrate: want.winrate }, `${environment}/${period}/${rank}/${want.key}/${label}`);
    }
  }
  auditPayload(p);
}
async function catalogSnapshot() {
  await db.query('reset role');
  return (await db.query(`select jsonb_build_object(
    'functions',(select jsonb_agg(jsonb_build_object('name',p.proname,'definition',pg_get_functiondef(p.oid),'acl',p.proacl,'owner',pg_get_userbyid(p.proowner)) order by p.proname) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname <> '${name}'),
    'policies',(select jsonb_agg(to_jsonb(p) order by tablename,policyname) from pg_policies p where schemaname='public'),
    'indexes',(select jsonb_agg(to_jsonb(i) order by indexname) from pg_indexes i where schemaname='public'),
    'tables',(select jsonb_agg(jsonb_build_object('name',c.relname,'acl',c.relacl,'rls',c.relrowsecurity,'force',c.relforcerowsecurity) order by c.relname) from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind='r'),
    'columns',(select jsonb_agg(jsonb_build_object('table',table_name,'column',column_name,'type',data_type,'nullable',is_nullable,'default',column_default) order by table_name,ordinal_position) from information_schema.columns where table_schema='public'),
    'constraints',(select jsonb_agg(jsonb_build_object('table',c.conrelid::regclass::text,'name',c.conname,'definition',pg_get_constraintdef(c.oid)) order by c.conrelid::regclass::text,c.conname) from pg_constraint c join pg_namespace n on n.oid=c.connamespace where n.nspname='public'),
    'defaults',(select jsonb_agg(jsonb_build_object('role',pg_get_userbyid(a.defaclrole),'namespace',a.defaclnamespace::regnamespace::text,'type',a.defaclobjtype,'acl',a.defaclacl) order by a.defaclrole,a.defaclnamespace,a.defaclobjtype) from pg_default_acl a)
  ) as snapshot`)).rows[0].snapshot;
}
async function seed() {
  await db.query('reset role');
  await db.query('begin');
  try {
    for (let i = 0; i < f.users.length; i++) await db.query("insert into public.decks(id,user_id,name,class_name) values($1,$2,$3,'エルフ')", [f.uuid(300 + i), f.users[i], 'PRIVATE-DECK-' + i]);
    for (const [label, id] of Object.entries(f.env)) await db.query("insert into public.environments(id,user_id,name,memo) values($1,$2,$3,'PRIVATE-MEMO')", [id, f.users[0], label]);
    for (const c of f.catalog.filter(c => c.key !== 'unclassified')) await db.query("insert into public.deck_archetypes(id,name,class_name,is_active,memo) values($1,$2,$3,$4,'PRIVATE-MEMO')", [c.key, c.name, c.className, c.name !== 'Shared inactive']);
    await db.query('insert into public.admin_users(user_id) values($1)', [f.users[4]]);
    for (const r of rows) {
      const rank = r.rank?.split(':')[0] ?? null;
      await db.query(`insert into public.matches(id,user_id,environment_id,my_deck_id,opponent_deck_id,my_archetype_id,opponent_archetype_id,result,turn_order,played_at,rank_tier,master_group,grandmaster_rating,memo)
        values($1,$2,$3,$4,$4,$5,$6,$7,'first',$8,$9,$10,$11,'PRIVATE-MEMO')`,
      [r.id, r.user, r.environment, r.privateDeck, r.my, r.opponent, r.result, f.iso(r.played), rank, rank === 'master' ? (r.rank.split(':')[1] || 'emerald') : null, rank === 'grandmaster' ? (r.rank.split(':')[1] || 'none') : null]);
    }
    await db.query('commit');
  } catch (e) { await db.query('rollback'); throw e; }
}
async function legacy() {
  await claim(f.users[4]);
  const results = {};
  for (const [fn, args] of [
    ['get_home_dashboard', [f.env.edges, 10]],
    ['get_analysis_aggregates_v1', [f.env.edges, true, true]],
    ['get_analysis_aggregates_v2', [f.env.edges, true, true]],
    ['get_matchup_aggregates_v1', [f.env.edges, true]],
    ['get_matchup_aggregates_v2', [f.env.edges, true, 'master-plus']],
    ['get_period_report_aggregates_v1', [f.iso(anchor - 24n * f.HOUR), f.iso(anchor - 1n), f.iso(anchor - 48n * f.HOUR), f.iso(anchor - 24n * f.HOUR - 1n)]],
    ['get_period_report_aggregates_v2', [f.iso(anchor - 24n * f.HOUR), f.iso(anchor - 1n), f.iso(anchor - 48n * f.HOUR), f.iso(anchor - 24n * f.HOUR - 1n), 'grandmaster']]
  ]) results[fn] = (await db.query(`select public.${fn}(${args.map((_, i) => '$' + (i + 1)).join(',')}) as data`, args)).rows[0].data;
  await db.query('reset role'); return results;
}
async function main() {
  keys = readKeys(); await db.connect();
  try {
    report.version = (await db.query('show server_version')).rows[0].server_version;
    assert.match(report.version, /^17\./);
    assert.equal((await db.query('select count(*)::int n from public.matches')).rows[0].n, 0, 'Run clean reset of dedicated stack first');
    report.history = (await db.query('select version from supabase_migrations.schema_migrations order by version')).rows.map(r => r.version);
    const apply = process.argv.includes('--apply');
    assert.deepEqual(report.history, ['20260928010000', '20260928060000', '20260929053719', '20260930004618', ...(!apply ? [migration.split('_')[0]] : [])]);
    const beforeCatalog = await catalogSnapshot();
    const password = crypto.randomBytes(24).toString('hex'), tokens = [];
    for (let i = 0; i < 5; i++) {
      const email = `e1-${Date.now()}-${i}@example.test`;
      const create = await http('/auth/v1/admin/users', { email, password, email_confirm: true }, keys.SERVICE_ROLE_KEY, { apikey: keys.SERVICE_ROLE_KEY });
      assert.equal(create.status, 200); f.users[i] = create.body.id;
      const login = await http('/auth/v1/token?grant_type=password', { email, password });
      assert.equal(login.status, 200); tokens.push(login.body.access_token);
      const jwt = JSON.parse(Buffer.from(tokens[i].split('.')[1], 'base64url'));
      assert.equal(jwt.is_anonymous, false); assert.equal(jwt.role, 'authenticated');
    }
    const anonymous = await http('/auth/v1/signup', {});
    assert.equal(anonymous.status, 200); const anonToken = anonymous.body.access_token;
    const anonClaims = JSON.parse(Buffer.from(anonToken.split('.')[1], 'base64url'));
    assert.equal(anonClaims.is_anonymous, true); assert.equal(anonClaims.role, 'authenticated');
    report.actualJwt = { member: { role: 'authenticated', is_anonymous: false }, anonymous: { role: 'authenticated', is_anonymous: true } };
    anchor = BigInt(Math.floor(Date.now() / 1800000) * 1800000) * 1000n;
    rows = f.fixture(anchor); await seed();
    const beforeLegacy = await legacy();
    if (apply) await db.query(migrationSql);
    assert.deepEqual(await catalogSnapshot(), beforeCatalog); note('Existing functions/ACLs/RLS/tables/indexes/constraints/default ACLs unchanged');
    assert.deepEqual(await legacy(), beforeLegacy); note('Seven existing RPC responses byte-equivalent before/after migration');
    fs.writeFileSync(path.join(out, 'existing-catalog.json'), JSON.stringify(beforeCatalog, null, 2));
    const definition = (await db.query("select pg_get_functiondef('private.get_environment_dashboard_aggregates_v1(uuid,text,text)'::regprocedure) as d")).rows[0].d;
    await db.query('begin');
    try {
      // Test-only clock substitution in the real body, rolled back. No clock input/GUC exists in production.
      await db.query(definition.replace('pg_catalog.statement_timestamp()', `timestamptz '${f.iso(anchor + 14n * 60_000_000n)}'`));
      await claim();
      for (const [label, environment] of Object.entries(f.env)) for (const period of ['24h', '3d', '7d', '30d']) for (const rank of f.filters) {
        compare(await rpc(environment, period, rank), environment, period, rank, anchor);
        note(`oracle ${label}/${period}/${rank}`);
      }
      const totals=Object.fromEntries(await Promise.all(f.filters.map(async rank=>[rank,(await rpc(f.env.rankThree,'24h',rank)).current.total.totalMatches])));
      assert.equal(totals['master-plus'],totals.master+totals.grandmaster);
      assert.equal(totals['grandmaster-plus'],totals.grandmaster);
      assert.equal(totals.master,f.leaves.slice(6,11).reduce((n,r)=>n+totals[r],0));
      assert.equal(totals.grandmaster,f.leaves.slice(11).reduce((n,r)=>n+totals[r],0));
      assert.equal(totals.all-f.leaves.reduce((n,r)=>n+totals[r],0),9);
      assert.equal(totals['grandmaster:none'],9);
      note('All rank inclusion identities and NULL distinct from GM none');
      for(const rank of f.filters) for(const [e,status]of [[f.env.rankZero,'no_data'],[f.env.rankOne,'privacy_suppressed'],[f.env.rankTwo,'privacy_suppressed'],[f.env.rankThree,'available']]) assert.equal((await rpc(e,'24h',rank)).current.total.status,status);
      note('Every rank has zero, one, two and three distinct contributor checks');
      for(const rank of f.filters){
        await claim();compare(await rpc(f.env.rankThree,'24h',rank,'private'),f.env.rankThree,'24h',rank,anchor);
        const member=await rpc(f.env.rankOne,'24h',rank);await claim(f.users[4]);assert.deepEqual(await rpc(f.env.rankOne,'24h',rank),member);
      }
      await claim();note('Private function accepts every valid rank; admin has identical per-rank suppression');
      const mixed = (await rpc(f.env.mixed)).decks.find(d => d.key === f.catalog[0].key).current;
      assert.equal(mixed.encounter.status, 'privacy_suppressed'); assert.equal(mixed.winrate.status, 'available');
      const mirror = (await rpc(f.env.mirror)).decks.find(d => d.key === f.catalog[0].key).current.winrate;
      assert.deepEqual(mirror, { status: 'available', targetRegistrations: 5, evaluationCount: 10, wins: 5 }); note('Mirror 5 registrations / 10 evaluations / 5 wins; distinct reporters unchanged');
      const sparse = await rpc(f.env.sparseMirror);
      assert.equal(sparse.current.total.status, 'available');
      for (const key of [f.catalog[0].key, f.catalog[1].key]) {
        assert.equal(sparse.decks.find(d => d.key === key).current.winrate.status, 'privacy_suppressed');
      }
      note('One/two-reporter mirrors remain suppressed inside an available period');
      const member = await rpc(f.env.one); await claim(f.users[4]); assert.deepEqual(await rpc(f.env.one), member); note('Admin receives identical suppression');
      await claim(); const normal = await rpc(f.env.three); assert.deepEqual(await rpc(f.env.three, '24h', 'all', 'private'), normal);
      for (const schema of ['public', 'private']) {
        for (const [e, p, r] of [[null, '24h', 'all'], [f.uuid(999), '24h', 'all'], [f.env.three, null, 'all'], [f.env.three, 'custom', 'all'], [f.env.three, '24h', null], [f.env.three, '24h', 'master:none'], [f.env.three, '24h', 'grandmaster:emerald'], [f.env.three, '24h', 'invalid']]) await rejectCall(() => rpc(e, p, r, schema), '22023');
        for (const [user, anonymousClaim, role, omit] of [[null, false, 'authenticated', false], [f.users[0], true, 'authenticated', false], [f.users[0], false, 'authenticated', true], [f.users[0], 'false', 'authenticated', false], [f.users[0], null, 'authenticated', false], [f.users[0], false, 'anon', false], [f.users[0], false, 'service_role', false]]) {
          await claim(user, anonymousClaim, role, omit); await rejectCall(() => rpc(f.env.three, '24h', 'all', schema), '42501');
        }
        await claim();
      }
      note('Public and private entry authentication/input rejection matrix');
      // Session-zone independence and exact 30-minute boundary, including a DST transition.
      for (const clock of ['2026-09-30T00:14:00Z', '2026-09-30T00:29:59.999999Z', '2026-09-30T00:30:00Z', '2026-09-30T00:59:59Z', '2026-03-08T07:14:00Z']) {
        for (const zone of ['UTC', 'Asia/Tokyo', 'America/New_York']) {
          await db.query('reset role'); await db.query("select set_config('TimeZone',$1,true)", [zone]);
          await db.query(definition.replace('pg_catalog.statement_timestamp()', `timestamptz '${clock}'`)); await claim();
          const p = await rpc(f.env.edges, '3d');
          assert.equal(Date.parse(p.dataThrough), Math.floor(Date.parse(clock) / 1800000) * 1800000);
          assert.equal(Date.parse(p.current.end) - Date.parse(p.current.start), 72 * 3600000);
          assert.equal(Date.parse(p.previous.end) - Date.parse(p.previous.start), 72 * 3600000);
        }
      }
      note('15 frozen-clock/timezone cases, microsecond cutoff and DST elapsed hours');
    } finally { await db.query('rollback'); await db.query('reset role'); }
    assert.equal((await db.query("select pg_get_functiondef('private.get_environment_dashboard_aggregates_v1(uuid,text,text)'::regprocedure) as d")).rows[0].d, definition);
    const args = { p_environment_id: f.env.three, p_period: '24h', p_rank_filter: 'all' };
    for (const [label, token, success] of [['unauthenticated', null, false], ['anon', keys.ANON_KEY, false], ['anonymous-sign-in', anonToken, false], ['member', tokens[0], true], ['admin', tokens[4], true], ['service-role', keys.SERVICE_ROLE_KEY, false]]) {
      const response = await http('/rest/v1/rpc/' + name, args, token);
      assert.ok(success ? response.status === 200 : response.status >= 400, label);
      if (success) { auditPayload(response.body); assert.equal(response.body.current.total.totalMatches, 12); }
      else assert.ok(!JSON.stringify(response.body).includes(f.env.three));
      report.auth.push({ label, status: response.status });
    }
    const privateApi = await http('/rest/v1/rpc/' + name, args, tokens[0], { 'Content-Profile': 'private' });
    for(const rank of f.filters) for(const [label,token,success]of [['anon',null,false],['anonymous',anonToken,false],['member',tokens[0],true],['admin',tokens[4],true]]){
      const response=await http('/rest/v1/rpc/'+name,{...args,p_environment_id:f.env.rankThree,p_rank_filter:rank},token);
      assert.equal(response.status,success?200:label==='anonymous'?403:401,label+'/'+rank);if(success){auditPayload(response.body);assert.equal(response.body.rankFilter,rank);}else assert.equal(response.body.code,'42501');
    }
    note('Real Auth/PostgREST authorization for every new rank');
    assert.equal(privateApi.status, 406); assert.equal(privateApi.body.code, 'PGRST106'); note('Private schema not exposed via Data API');
    for (const bad of [{ ...args, p_period: 'custom' }, { ...args, p_rank_filter: 'master:none' }, { ...args, p_environment_id: null }, { ...args, p_rank_filter: null }, { ...args, p_period: null }, { ...args, p_environment_id: f.uuid(999) }, { ...args, p_current_start: '2026-01-01' }, { ...args, p_user_id: f.users[1] }]) {
      const response = await http('/rest/v1/rpc/' + name, bad, tokens[0]); assert.ok(response.status >= 400);
      for (const s of [...f.users, 'PRIVATE-MEMO', 'PRIVATE-DECK']) assert.ok(!JSON.stringify(response.body).includes(s));
    }
    const omitted = { p_environment_id: f.env.three, p_period: '24h' };
    assert.equal((await http('/rest/v1/rpc/' + name, omitted, tokens[0])).body.rankFilter, 'all');
    await aclAudit(); await regressions(); await performanceCheck();
    assert.deepEqual(await catalogSnapshot(), beforeCatalog);
    report.passed = true;
  } finally {
    await db.query('rollback').catch(() => {}); await db.end();
    fs.writeFileSync(path.join(out, process.argv.includes('--apply') ? 'integration-first.json' : 'integration-reset.json'), JSON.stringify(report, null, 2));
  }
  console.log(JSON.stringify({ passed: report.passed, cases: report.cases.length, auth: report.auth, plans: report.plans }, null, 2));
}
async function aclAudit() {
  await db.query('reset role');
  report.functions = (await db.query(`select n.nspname,p.proname,pg_get_userbyid(p.proowner) as owner,p.prosecdef,p.provolatile,p.proconfig,p.proacl::text[] as proacl from pg_proc p join pg_namespace n on n.oid=p.pronamespace where p.proname=$1 order by n.nspname`, [name])).rows;
  assert.equal(report.functions.length, 2);
  for (const fn of report.functions) {
    assert.equal(fn.owner, 'postgres'); assert.equal(fn.prosecdef, fn.nspname === 'private'); assert.deepEqual(fn.proconfig, ['search_path=""']);
    assert.deepEqual(fn.proacl.sort(), ['authenticated=X/postgres', 'postgres=X/postgres']);
  }
  report.schema = (await db.query("select nspname,nspacl::text[] as nspacl from pg_namespace where nspname='private'")).rows;
  for (const role of ['anon', 'authenticated', 'service_role']) {
    const a = (await db.query("select has_schema_privilege($1,'private','USAGE') as usage,has_schema_privilege($1,'private','CREATE') as create", [role])).rows[0];
    assert.equal(a.usage, role === 'authenticated'); assert.equal(a.create, false);
  }
  await claim(); const visible = (await db.query('select count(*)::int n from public.matches')).rows[0].n;
  assert.equal(visible, rows.filter(r => r.user === f.users[0]).length); note('Member raw SELECT remains own-only');
  await db.query('reset role');
}
async function regressions() {
  await db.query('begin');
  try {
    await claim(f.users[4]);
    // Aggregate E1 integers across environments and compare with the existing admin period report.
    const admin = (await db.query('select public.get_period_report_aggregates_v1($1,$2,$3,$4) p', [f.iso(anchor - 24n * f.HOUR), f.iso(anchor - 1n), f.iso(anchor - 48n * f.HOUR), f.iso(anchor - 24n * f.HOUR - 1n)])).rows[0].p;
    for (const label of ['current', 'previous']) {
      const expected = new Map();
      for (const g of admin[label].groups) for (const [id, wins] of [[g.myDeckId, g.wins], [g.opponentDeckId, g.total - g.wins]]) {
        // All fixture NULL archetypes map through compat IDs in the legacy RPC; normalize them here.
        const key = f.catalog.some(c => c.key === id) ? id : 'unclassified';
        const count = expected.get(key) || { total: 0, wins: 0 }; count.total += g.total; count.wins += wins; expected.set(key, count);
      }
      const start = label === 'current' ? anchor - 24n * f.HOUR : anchor - 48n * f.HOUR;
      const end = start + 24n * f.HOUR;
      for (const c of f.catalog) {
        let total = 0, wins = 0;
        for (const r of rows.filter(r => r.played >= start && r.played < end)) {
          if ((r.my ?? 'unclassified') === c.key) { total++; wins += Number(r.result === 'win'); }
          if ((r.opponent ?? 'unclassified') === c.key) { total++; wins += Number(r.result === 'lose'); }
        }
        assert.deepEqual(expected.get(c.key) || { total: 0, wins: 0 }, { total, wins });
      }
    }
    note('Legacy period report direct+reversed integer parity with aligned inclusive endpoints');
    // v2 rank predicates match E1's source population on a single fixture environment.
    for (const rank of ['all', 'master-plus', 'master', 'grandmaster']) {
      const p = await rpc(f.env.ranks, '24h', rank);
      const m = (await db.query('select public.get_matchup_aggregates_v2($1,true,$2) p', [f.env.ranks, rank])).rows[0].p;
      assert.equal(p.current.total.totalMatches, m.totalMatches);
      const a = (await db.query("select public.get_analysis_aggregates_v2(p_environment_id=>$1,p_include_all_users=>true,p_include_reversed=>true,p_rank_filter=>$2) p", [f.env.ranks, rank])).rows[0].p;
      assert.equal(a.registeredMatches, m.totalMatches); assert.equal(a.perspectives, m.totalMatches * 2);
    }
    // The old period RPC has no environment argument: isolate each synthetic environment
    // inside a rolled-back savepoint to compare its actual integers directly with E1.
    for (const environment of [f.env.three, f.env.mirror, f.env.unknown]) {
      await db.query('reset role'); await db.query('savepoint isolated_environment');
      await db.query('delete from public.matches where environment_id <> $1', [environment]);
      await claim(f.users[4]);
      const e1 = await rpc(environment);
      const old = (await legacy()).get_period_report_aggregates_v1;
      for (const label of ['current', 'previous']) {
        const counts = new Map();
        for (const g of old[label].groups) for (const [id, wins] of [[g.myDeckId, g.wins], [g.opponentDeckId, g.total - g.wins]]) {
          const key = f.catalog.some(c => c.key === id) ? id : 'unclassified';
          const value = counts.get(key) || { evaluations: 0, wins: 0 };
          value.evaluations += g.total; value.wins += wins; counts.set(key, value);
        }
        for (const deck of e1.decks) if (deck[label].winrate.status === 'available') {
          assert.deepEqual(counts.get(deck.key), { evaluations: deck[label].winrate.evaluationCount, wins: deck[label].winrate.wins });
        }
      }
      await db.query('reset role'); await db.query('rollback to savepoint isolated_environment');
      await db.query('release savepoint isolated_environment');
    }
    note('Direct E1 versus period report parity: normal, mirror and unclassified');
    await db.query('reset role');
    for (const ms of [-1, 0, 1]) {
      const t = new Date(Date.parse('2026-09-29T08:00:00Z') + ms).toISOString();
      const p = (await db.query("select public.is_match_input_window_open(true,$1,null,$2) as starts,public.is_match_input_window_open(true,null,$1,$2) as ends", ['2026-09-29T08:00:00Z', t])).rows[0];
      assert.deepEqual(p, { starts: ms >= 0, ends: ms < 0 });
    }
    await db.query('update public.environments set allow_match_input=false where id=$1', [f.env.empty]);
    await claim();
    await rejectCall(() => db.query("insert into public.matches(user_id,environment_id,my_deck_id,opponent_deck_id,result,turn_order) values($1,$2,$3,$3,'win','first')", [f.users[0], f.env.empty, f.uuid(300)]), 'P0001');
    await rejectCall(() => db.query("update public.matches set rank_tier='grandmaster',grandmaster_rating=null where id=$1", [rows[0].id]), '23514');
    await rejectCall(() => db.query("update public.matches set rank_tier=null,grandmaster_rating='none' where id=$1", [rows[0].id]), '23514');
    await rejectCall(() => db.query("update public.matches set rank_tier='master',master_group=null where id=$1", [rows[0].id]), '23514');
    note('Rank NULL/none CHECK and environment schedule trigger/predicate remain enforced');
  } finally { await db.query('rollback'); await db.query('reset role'); }
}
async function performanceCheck() {
  await db.query('begin');
  try {
    // Synthetic rows only; no production records. Keep indexes exactly as migrated.
    await db.query(`insert into public.matches(user_id,environment_id,my_deck_id,opponent_deck_id,my_archetype_id,opponent_archetype_id,result,turn_order,played_at)
      select $1::uuid,$2::uuid,$3::uuid,$3::uuid,$4::uuid,$5::uuid,'win','first',$6::timestamptz - (g % 1440) * interval '1 hour' from generate_series(1,10000) g`,
    [f.users[0], f.env.edges, f.uuid(300), f.catalog[0].key, f.catalog[1].key, f.iso(anchor)]);
    await db.query('analyze public.matches');
    const def = (await db.query("select pg_get_functiondef('private.get_environment_dashboard_aggregates_v1(uuid,text,text)'::regprocedure) d")).rows[0].d;
    const inner = def.slice(def.indexOf('    with periods'), def.lastIndexOf('\n  );'));
    for (const [period, hours] of [['24h', 24], ['3d', 72], ['7d', 168], ['30d', 720]]) {
      const query = inner.replace(/\bp_environment_id\b/g, `'${f.env.edges}'::uuid`).replace(/\bp_period\b/g, `'${period}'::text`).replace(/\bp_rank_filter\b/g, "'all'::text")
        .replace(/\bdata_through\b/g, `timestamptz '${f.iso(anchor)}'`).replace(/\baggregated_at\b/g, `timestamptz '${f.iso(anchor)}'`).replace(/\bduration\b/g, `interval '${hours} hours'`);
      const plan = (await db.query('explain (analyze,buffers,format json) ' + query)).rows[0]['QUERY PLAN'][0];
      const nodes = []; function walk(n) { nodes.push(n); (n.Plans || []).forEach(walk); } walk(plan.Plan);
      await claim(); const payload = await rpc(f.env.edges, period); await db.query('reset role');
      const summary = { period, milliseconds: plan['Execution Time'], nodes: [...new Set(nodes.map(n => n['Node Type']))], tempRead: plan.Plan['Temp Read Blocks'], tempWrite: plan.Plan['Temp Written Blocks'], jsonBytes: Buffer.byteLength(JSON.stringify(payload)) };
      report.plans.push(summary); fs.writeFileSync(path.join(out, `explain-${period}.json`), JSON.stringify(plan, null, 2));
    }
    note('10k synthetic rows: actual inner query plans, no added indexes');
  } finally { await db.query('rollback'); await db.query('reset role'); }
}
main().catch(e => { console.error(e.message, e.code || '', e.stack); process.exitCode = 1; });
