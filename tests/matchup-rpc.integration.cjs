/* eslint-disable @typescript-eslint/no-require-imports */
// Optional real PostgreSQL (WASM) test, separate from npm test. No service URLs,
// credentials or network access. PGLITE_MODULE points to an external test tool;
// it is deliberately not an application dependency. See docs/phase2a-matrix-rpc.md.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { performance } = require('node:perf_hooks');
const { PGlite } = require(process.env.PGLITE_MODULE || '@electric-sql/pglite');
const { buildWinRateMatrix } = require('../src/lib/analytics');
const { buildWinRateMatrixFromAggregates, parseMatchupAggregates } = require('../src/lib/matchup-aggregates');
const root = path.resolve(__dirname, '..');
const migration = fs.readFileSync(path.join(root, 'supabase/migrations/012_matchup_aggregates_v1.sql'), 'utf8');
const uuid = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const OWNER = uuid(1), OTHER = uuid(2), ADMIN = uuid(3), ENV = uuid(10), ENV2 = uuid(11);
const A = uuid(100), B = uuid(101), C = uuid(102), INACTIVE = uuid(103), REMOVED = uuid(104);
const LEGACY_A = uuid(200), LEGACY_B = uuid(201), UNKNOWN = uuid(202);
const archetypes = [
  { id: A, name: '同名', class_name: 'エルフ', is_active: true, sort_order: 2 },
  { id: B, name: '同名', class_name: 'ロイヤル', is_active: true, sort_order: 1 },
  { id: C, name: '別名', class_name: 'ウィッチ', is_active: true, sort_order: 0 },
  { id: INACTIVE, name: 'Inactive', class_name: 'エルフ', is_active: false, sort_order: 0 },
  { id: REMOVED, name: 'その他エルフ', class_name: 'エルフ', is_active: true, sort_order: 0 }
];
let db, sequence = 0, currentUser = OWNER, counters = { matches: 0, rpc: 0 };
const evidence = { engine: 'PGlite (real PostgreSQL WASM), synthetic local data', cases: [], performance: [] };
function fixture(extra = {}) {
  return {
    id: uuid(1000000 + ++sequence), user_id: OWNER, environment_id: ENV,
    my_deck_id: LEGACY_A, opponent_deck_id: LEGACY_B,
    my_archetype_id: A, opponent_archetype_id: B,
    turn_order: 'first', result: 'win', played_at: '2026-09-20T00:00:00.123456Z', ...extra
  };
}
async function identity(user = OWNER, role = 'authenticated') {
  await db.exec('reset role');
  await db.query("select set_config('request.jwt.claim.sub', $1, false)", [user || '']);
  assert.ok(['authenticated', 'anon'].includes(role));
  await db.exec(`set role ${role}`);
  currentUser = user;
}
async function seed(records) {
  await db.exec('reset role; truncate public.matches');
  await db.query(`insert into public.matches
    (id,user_id,environment_id,my_deck_id,opponent_deck_id,my_archetype_id,opponent_archetype_id,turn_order,result,played_at)
    select id,user_id,environment_id,my_deck_id,opponent_deck_id,my_archetype_id,opponent_archetype_id,turn_order,result,played_at
    from jsonb_to_recordset($1::jsonb) as r(id uuid,user_id uuid,environment_id uuid,my_deck_id uuid,opponent_deck_id uuid,
      my_archetype_id uuid,opponent_archetype_id uuid,turn_order public.turn_order,result public.match_result,played_at timestamptz)`, [JSON.stringify(records)]);
  await identity();
}
function mockModule(relative, exports) {
  const filename = require.resolve(relative);
  require.cache[filename] = { id: filename, filename, loaded: true, exports };
}
// Transport adapter only: all filtering, paging, RLS and aggregation execute in
// PostgreSQL. This exercises the actual old/new application loaders as well.
const supabase = {
  auth: { getUser: async () => ({ data: { user: currentUser ? { id: currentUser } : null } }) },
  rpc: async (name, args) => {
    assert.equal(name, 'get_matchup_aggregates_v1');
    counters.rpc++;
    try {
      const result = await db.query('select public.get_matchup_aggregates_v1($1::uuid,$2::boolean) as data', [args.p_environment_id, args.p_include_all_users]);
      return { data: result.rows[0].data, error: null };
    } catch (error) { return { data: null, error: { code: error.code, message: error.message } }; }
  },
  from(table) {
    assert.ok(['matches', 'admin_users', 'decks', 'deck_archetypes'].includes(table));
    if (table === 'matches') counters.matches++;
    const params = [], predicates = [], orders = [];
    let columns = '*', range, single = false;
    const identifier = value => { assert.match(value, /^[a-z_]+$/); return value; };
    const query = {
      select(value) { columns = value === '*' ? '*' : value.split(',').map(identifier).join(','); return query; },
      eq(column, value) { params.push(value); predicates.push(`${identifier(column)} = $${params.length}`); return query; },
      order(column, options) { orders.push(`${identifier(column)} ${options.ascending ? 'asc' : 'desc'}`); return query; },
      range(from, to) { range = [from, to]; return query; },
      maybeSingle() { single = true; return query; },
      then(resolve, reject) {
        const sql = `select ${columns} from public.${table}${predicates.length ? ' where ' + predicates.join(' and ') : ''}${orders.length ? ' order by ' + orders.join(',') : ''}${range ? ` limit ${range[1] - range[0] + 1} offset ${range[0]}` : ''}`;
        return db.query(sql, params).then(result => ({ data: single ? result.rows[0] ?? null : result.rows, error: null })).then(resolve, reject);
      }
    };
    return query;
  }
};
mockModule('../src/lib/supabase/server', { createSupabaseServerClient: async () => supabase });
const { getMatches, getDecks, getActiveArchetypes } = require('../src/lib/data');
const { getMatchupAggregates } = require('../src/lib/matchup-data');

async function catalog() {
  return {
    indexes: (await db.query("select indexname,indexdef from pg_indexes where schemaname='public' order by indexname")).rows,
    policies: (await db.query("select tablename,policyname,roles,cmd,qual,with_check from pg_policies where schemaname='public' order by tablename,policyname")).rows,
    columns: (await db.query("select table_name,column_name,data_type,is_nullable from information_schema.columns where table_schema='public' order by table_name,ordinal_position")).rows
  };
}
before(async () => {
  db = await PGlite.create();
  await db.exec(`create role anon nologin; create role authenticated nologin;
    create schema auth;
    create table auth.users(id uuid primary key, email text, raw_user_meta_data jsonb);
    create function auth.uid() returns uuid language sql stable as $$
      select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    grant usage on schema auth to anon,authenticated;`);
  // PGlite supplies gen_random_uuid() in core. Only the unavailable pgcrypto
  // extension installation is omitted; all production tables/RLS are unchanged.
  const schema = fs.readFileSync(path.join(root, 'supabase/schema_production.sql'), 'utf8')
    .replace('create extension if not exists "pgcrypto";', '');
  await db.exec(schema);
  await db.exec(fs.readFileSync(path.join(root, 'supabase/migrations/009_admin_all_matches_analysis.sql'), 'utf8'));
  const originalCatalog = await catalog();
  await db.exec(migration);
  await db.exec(migration); // safe rerun of this function migration
  assert.deepEqual(await catalog(), originalCatalog);
  evidence.indexes = originalCatalog.indexes.filter(row => row.indexname.startsWith('matches'));
  evidence.serverVersion = (await db.query('select version()')).rows[0].version;
  for (const id of [OWNER, OTHER, ADMIN]) await db.query('insert into auth.users(id,email) values ($1,$2)', [id, id + '@example.test']);
  await db.query('insert into public.admin_users(user_id) values ($1)', [ADMIN]);
  for (const id of [ENV, ENV2]) await db.query('insert into public.environments(id,user_id,name) values ($1,$2,$3)', [id, ADMIN, id]);
  for (const deck of archetypes) await db.query('insert into public.deck_archetypes(id,name,class_name,is_active,sort_order) values ($1,$2,$3,$4,$5)', [deck.id, deck.name, deck.class_name, deck.is_active, deck.sort_order]);
  for (const [i, id] of [LEGACY_A, LEGACY_B, UNKNOWN].entries()) {
    await db.query('insert into public.decks(id,user_id,name,class_name,sort_order) values ($1,$2,$3,$4,$5)', [id, OWNER, id, 'エルフ', 3 - i]);
  }
  await identity();
});
after(async () => {
  if (db) await db.close();
  fs.mkdirSync(path.join(root, 'build'), { recursive: true });
  fs.writeFileSync(path.join(root, 'build/matchup-rpc-evidence.json'), JSON.stringify(evidence, null, 2));
});

async function compare(name, { environment = ENV, user = OWNER, all = false } = {}) {
  await identity(user);
  counters = { matches: 0, rpc: 0 };
  const oldRows = await getMatches(environment, { includeAllUsers: all });
  const aggregates = await getMatchupAggregates(environment, all);
  assert.equal(aggregates.totalMatches, oldRows.length, name + ': registrations');
  const expectedGroups = new Map();
  for (const row of oldRows) {
    const my = row.my_archetype_id ?? row.my_deck_id, opponent = row.opponent_archetype_id ?? row.opponent_deck_id;
    const key = JSON.stringify([my, opponent]);
    const count = expectedGroups.get(key) ?? { myDeckId: my, opponentDeckId: opponent, total: 0, wins: 0 };
    count.total++; count.wins += row.result === 'win' ? 1 : 0; expectedGroups.set(key, count);
  }
  const sort = groups => [...groups].sort((a, b) => JSON.stringify([a.myDeckId, a.opponentDeckId]).localeCompare(JSON.stringify([b.myDeckId, b.opponentDeckId])));
  assert.deepEqual(sort(aggregates.groups), sort(expectedGroups.values()), name + ': all groups including hidden');
  const [legacy, active] = await Promise.all([getDecks(), getActiveArchetypes()]);
  for (const visible of [active.length ? active : legacy, legacy, []]) {
    const oldMatrix = buildWinRateMatrix(oldRows, visible, visible);
    const newMatrix = buildWinRateMatrixFromAggregates(aggregates, visible, visible);
    assert.deepEqual(newMatrix, oldMatrix, name + ': final cell props/order/colors/index');
    assert.deepEqual(newMatrix.flatMap(r => r.cells.map(c => c.total - c.wins)), oldMatrix.flatMap(r => r.cells.map(c => c.total - c.wins)), name + ': losses');
  }
  assert.deepEqual(counters, { matches: Math.floor(oldRows.length / 1000) + 1, rpc: 1 });
  const result = { name, records: oldRows.length, groups: aggregates.groups.length, oldApiCalls: counters.matches, newApiCalls: counters.rpc,
    oldJsonBytes: Buffer.byteLength(JSON.stringify(oldRows)), rpcJsonBytes: Buffer.byteLength(JSON.stringify(aggregates)), equal: true };
  evidence.cases.push(result);
  return result;
}

test('real SQL matches production at 0/1/999/1000/1001/10000/100000 records', async () => {
  for (const size of [0, 1, 999, 1000, 1001, 10000, 100000]) {
    await seed(Array.from({ length: size }, (_, i) => fixture({ result: i % 3 ? 'win' : 'lose' })));
    const stats = await compare(`boundary-${size}`);
    if (size >= 10000) {
      await db.exec('reset role; analyze public.matches');
      await identity();
      const durations = [];
      for (let i = 0; i < 3; i++) {
        const start = performance.now();
        await db.query('select public.get_matchup_aggregates_v1($1::uuid,false)', [ENV]);
        durations.push(performance.now() - start);
      }
      const body = migration.split('as $$')[1].split('$$;')[0].replaceAll('p_environment_id', '$1::uuid').replaceAll('p_include_all_users', '$2::boolean');
      const plan = await db.query(`explain (analyze, buffers, format json) ${body}`, [ENV, false]);
      evidence.performance.push({ ...stats, rpcWallTimeMs: durations, plan: plan.rows[0]['QUERY PLAN'] });
    }
  }
});

test('all wins, all losses, directions, mirrors, same timestamps and double registration remain distinct', async () => {
  for (const result of ['win', 'lose']) {
    await seed(Array.from({ length: 23 }, () => fixture({ result })));
    await compare('all-' + result);
  }
  await seed([fixture(), fixture(), fixture({ my_archetype_id: B, opponent_archetype_id: A, result: 'lose', user_id: OTHER }), fixture({ opponent_archetype_id: A }), fixture({ result: 'lose', turn_order: 'second' })]);
  const stats = await compare('directions-mirror-double-registration', { user: ADMIN, all: true });
  assert.equal(stats.records, 5);
  assert.equal(stats.groups, 3);
});

test('archetype precedence, legacy IDs, inactive/removed/unknown display IDs and same-name different IDs', async () => {
  await seed([fixture(), fixture({ my_archetype_id: null }), fixture({ my_archetype_id: null, opponent_archetype_id: null }),
    fixture({ my_archetype_id: null, my_deck_id: UNKNOWN }), fixture({ my_archetype_id: INACTIVE }),
    fixture({ my_archetype_id: REMOVED }), fixture({ my_archetype_id: C })]);
  assert.equal((await compare('ids-hidden-and-fallback')).records, 7);
  const active = await getActiveArchetypes();
  assert.ok(!active.some(d => [INACTIVE, REMOVED].includes(d.id)));
  assert.equal(active.filter(d => d.name === '同名').length, 2);
});

test('fully null legacy IDs are forbidden by production schema; defensive SQL retains them if encountered', async () => {
  await seed([]);
  await db.exec('reset role');
  await assert.rejects(() => db.query(`insert into public.matches(user_id,environment_id,my_deck_id,opponent_deck_id,turn_order,result) values ($1,$2,null,null,'first','win')`, [OWNER, ENV]), e => e.code === '23502');
  // Fault fixture only. Roll back the constraint relaxation and rows together.
  await db.exec('begin; alter table public.matches alter column my_deck_id drop not null; alter table public.matches alter column opponent_deck_id drop not null');
  try {
    await seed([fixture({ my_deck_id: null, opponent_deck_id: null, my_archetype_id: null, opponent_archetype_id: null })]);
    await compare('defensive-all-null');
  } finally { await db.exec('reset role; rollback'); }
});

test('owner/admin/non-admin all scope, environments and admin revocation enforce actual RLS', async () => {
  await seed([fixture(), fixture({ user_id: OTHER }), fixture({ user_id: ADMIN }), fixture({ environment_id: ENV2 })]);
  for (const [name, options, expected] of [
    ['owner', {}, 1], ['non-admin-request-all', { all: true }, 1],
    ['other-owner', { user: OTHER }, 1], ['admin-mine', { user: ADMIN }, 1],
    ['admin-all', { user: ADMIN, all: true }, 3], ['all-environments', { user: ADMIN, all: true, environment: '' }, 4],
    ['empty-environment', { environment: uuid(999) }, 0], ['different-environment', { environment: ENV2 }, 1]
  ]) assert.equal((await compare(name, options)).records, expected);
  assert.equal((await compare('no-environment-filter', { user: ADMIN, all: true, environment: '' })).records, 4);
  await db.exec('reset role');
  await db.query('delete from public.admin_users where user_id=$1', [ADMIN]);
  assert.equal((await compare('revoked-admin', { user: ADMIN, all: true })).records, 1);
  await db.exec('reset role');
  await db.query('insert into public.admin_users(user_id) values ($1)', [ADMIN]);
  await identity(ADMIN);
  // The function does not bypass a more restrictive deployed matches policy.
  await db.exec('reset role; begin; drop policy matches_select_own_or_admin on public.matches; create policy matches_select_fixture_own on public.matches for select to authenticated using (auth.uid()=user_id)');
  try { assert.equal((await compare('invoker-respects-stricter-rls', { user: ADMIN, all: true })).records, 1); }
  finally { await db.exec('reset role; rollback'); }
});

test('anonymous execution denied, no arbitrary user argument, invoker/stable/search_path and grants fixed', async () => {
  await identity(null, 'anon');
  await assert.rejects(() => db.query('select public.get_matchup_aggregates_v1(null,true)'), e => e.code === '42501');
  await identity(null);
  const empty = (await db.query('select public.get_matchup_aggregates_v1(null,true) as data')).rows[0].data;
  assert.deepEqual(empty, { version: 1, totalMatches: 0, groups: [] });
  await identity(OWNER);
  await assert.rejects(() => db.query('select public.get_matchup_aggregates_v1(p_user_id => $1::uuid)', [OTHER]), e => e.code === '42883');
  await db.exec('reset role');
  const fn = (await db.query("select prosecdef,provolatile,proconfig,proargnames from pg_proc where oid='public.get_matchup_aggregates_v1(uuid,boolean)'::regprocedure")).rows[0];
  assert.equal(fn.prosecdef, false); assert.equal(fn.provolatile, 's');
  assert.deepEqual(fn.proargnames, ['p_environment_id', 'p_include_all_users']);
  assert.ok(fn.proconfig.includes('search_path=""'));
  const grants = (await db.query("select has_function_privilege('anon','public.get_matchup_aggregates_v1(uuid,boolean)','execute') as anon, has_function_privilege('authenticated','public.get_matchup_aggregates_v1(uuid,boolean)','execute') as authenticated")).rows[0];
  assert.deepEqual(grants, { anon: false, authenticated: true });
  evidence.permissions = { ...grants, ...fn, anonymousRejected: true };
});

test('single JSON result retains over 1000 aggregate groups without truncation', async () => {
  await db.exec('reset role');
  const ids = Array.from({ length: 40 }, (_, i) => uuid(300 + i));
  for (const id of ids) await db.query('insert into public.deck_archetypes(id,name,class_name) values ($1,$2,$3)', [id, id, 'エルフ']);
  await seed(ids.flatMap(my => ids.map(opponent => fixture({ my_archetype_id: my, opponent_archetype_id: opponent }))));
  const stats = await compare('1600-distinct-groups');
  assert.equal(stats.groups, 1600);
  assert.equal(stats.records, 1600);
  parseMatchupAggregates((await db.query('select public.get_matchup_aggregates_v1(null,false) as data')).rows[0].data);
});
