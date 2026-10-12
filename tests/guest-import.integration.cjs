/* eslint-disable @typescript-eslint/no-require-imports */
// Run: PGLITE_MODULE=<installed @electric-sql/pglite> node --test tests/guest-import.integration.cjs
// No network: real Server Action, migrations, RLS and aggregate RPCs on disposable PostgreSQL WASM.
require('./register.cjs');
const { test } = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), Module = require('node:module');
const { setup, ids } = require('./match-mutations-db.cjs');
const { identifyGuestMatches, removeImportedGuestMatches } = require('../src/lib/guest-storage.ts');
const { mutateGuestMatch } = require('../src/lib/guest-records.ts');
let client, activeUser = ids.a;
const load = Module._load;
Module._load = function(name, ...args) {
  if (name === '@/lib/supabase/server') return { createSupabaseServerClient: async () => client };
  if (name === 'next/cache') return { revalidatePath() {} };
  if (name === 'next/navigation') return { redirect: p => { throw Error('redirect:' + p); } };
  return load.call(this, name, ...args);
};
const actions = require('../src/app/actions.ts');
const migration = 'supabase/migrations/20261012052435_guest_match_import_identity.sql';
const draft = (id, extra = {}) => ({ local_id: id, environment_id: ids.env, my_deck_id: ids.deck, opponent_deck_id: ids.deck2,
  my_archetype_id: ids.arch, opponent_archetype_id: ids.arch2, result: 'lose', turn_order: 'second',
  played_at: new Date(Date.now() - 3600000).toISOString(), ...extra });
const form = rows => { const f = new FormData(); f.set('guest_matches_json', JSON.stringify(rows)); return f; };

test('guest identity: migrations, replay, partial retry, ownership and aggregate regression', { timeout: 120000 }, async () => {
  const { db, claim, Query } = await setup();
  const checks = [], report = { localOnly: true, independentConnectionConcurrency: 'not run: PGlite single connection; Docker daemon unavailable', checks };
  try {
    // Verify applying the additive migration over existing rows preserves all data/ACLs.
    await db.exec('alter table public.matches drop column guest_import_id');
    const before = (await db.query('select * from public.matches order by id')).rows;
    const security = async () => (await db.query("select relrowsecurity, relacl::text, (select jsonb_agg(to_jsonb(p) order by policyname) from pg_policies p where schemaname='public' and tablename='matches') policies from pg_class where oid='public.matches'::regclass")).rows;
    const beforeSecurity = await security();
    await db.exec(fs.readFileSync(migration, 'utf8'));
    const after = (await db.query('select * from public.matches order by id')).rows;
    assert.deepEqual(after.map(({ guest_import_id, ...row }) => { assert.equal(guest_import_id, null); return row; }), before);
    assert.deepEqual(await security(), beforeSecurity);
    await assert.rejects(db.exec(fs.readFileSync(migration, 'utf8')), /already exists/);
    await db.exec('rollback');
    assert.deepEqual(await security(), beforeSecurity);
    checks.push('migration preserves pre-existing rows, NULL identities, RLS and ACLs; rerun fails safely and rolls back');
    let failWrite = false, loseReply = false, failConfirmation = false;
    client = { auth: { getUser: async () => ({ data: { user: activeUser ? { id: activeUser, is_anonymous: false } : null } }) }, from: table => {
      const q = new Query(table), execute = q.execute.bind(q);
      q.execute = async () => {
        if (table === 'matches' && q.rows && failWrite) return { data: null, error: { message: 'injected DB error' } };
        const result = await execute();
        if (table === 'matches' && q.rows && loseReply) { loseReply = false; throw Error('response lost after COMMIT'); }
        if (table === 'matches' && !q.rows && failConfirmation) return { data: null, error: { message: 'read failed' } };
        return result;
      };
      return q;
    } };
    await claim();
    const home = async () => (await db.query('select public.get_home_dashboard($1) p', [ids.env])).rows[0].p.summary;
    const snapshots = async () => {
      const result = {};
      for (const [name, sql, params] of [
        ['home', 'select public.get_home_dashboard($1) p', [ids.env]],
        ['environment', "select public.get_environment_dashboard_aggregates_v4($1,'all') p", [ids.env]],
        ['analysis', 'select public.get_analysis_aggregates_v3($1) p', [ids.env]],
        ['matrix', 'select public.get_matchup_aggregates_v1($1) p', [ids.env]],
        ['report', "select public.get_period_report_aggregates_v3(now()-interval '2 days',now()+interval '1 day',now()-interval '4 days',now()-interval '2 days',p_environment_id:=$1) p", [ids.env]]
      ]) {
        result[name] = (await db.query(sql, params)).rows[0].p;
        if (name === 'environment') delete result[name].aggregatedAt; // wall-clock generation metadata, not a statistic
      }
      return result;
    };
    const row = draft('p1-replay');
    assert.equal((await home()).total, 1);
    assert.deepEqual((await actions.importGuestMatches(form([row]))).importedIds, [row.local_id]);
    const first = await home(); assert.equal(first.total, 2); assert.equal(first.winRate, 50);
    const stored = (await db.query('select * from public.matches where user_id=$1 and guest_import_id=$2', [ids.a, row.local_id])).rows[0];
    await assert.rejects(db.query("insert into public.matches(user_id,environment_id,my_deck_id,opponent_deck_id,result,turn_order,guest_import_id) values($1,$2,$3,$4,'win','first',$5)", [ids.a, ids.env, stored.my_deck_id, stored.opponent_deck_id, row.local_id]), error => error.code === '23505');
    checks.push('direct duplicate INSERT rejected by PostgreSQL unique index (23505), independent of Action pre-read');
    const firstSnapshots = await snapshots();
    for (let i = 0; i < 5; i++) {
      const reply = await actions.importGuestMatches(form([row]));
      assert.deepEqual(reply.importedIds, [row.local_id]); assert.match(reply.message, /0件を新規保存.*1件は取り込み済み/);
    }
    assert.deepEqual(await home(), first);
    // Freeze period endpoints with a transaction; generation metadata is excluded above.
    await db.exec('begin');
    const stableBefore = await snapshots();
    await actions.importGuestMatches(form([row]));
    assert.deepEqual(await snapshots(), stableBefore);
    await db.exec('commit');
    assert.equal(firstSnapshots.analysis.totalMatches ?? firstSnapshots.analysis.registeredMatches, 2);
    report.p1 = { before: { total: 1, winRate: 100 }, afterFirst: first, afterFiveReplays: await home() };
    checks.push('P1 regression: Home 2/50% after first import AND five replays; all five aggregate RPCs unchanged on replay');

    const changed = { ...row, result: 'win' };
    assert.equal((await actions.importGuestMatches(form([changed]))).ok, false);
    assert.equal((await home()).winRate, 50);
    assert.deepEqual(JSON.parse(removeImportedGuestMatches(JSON.stringify([changed]), JSON.stringify([row]), [row.local_id])), [changed]);
    checks.push('changed local snapshot and same-ID changed payload survive; stored match not overwritten');

    const identical = { ...row, local_id: 'different-id' };
    await actions.importGuestMatches(form([identical]));
    assert.equal((await home()).total, 3);
    const batch = [draft('batch-1'), draft('batch-2'), draft('batch-3')];
    await actions.importGuestMatches(form(batch.slice(0, 1)));
    const partial = await actions.importGuestMatches(form(batch));
    assert.match(partial.message, /2件を新規保存.*1件は取り込み済み/);
    assert.equal(partial.importedIds.length, 3);
    const batchTotal = (await home()).total;
    await actions.importGuestMatches(form(batch)); assert.equal((await home()).total, batchTotal);
    checks.push('different IDs with same content remain distinct; bulk replay and retry after partial success add only missing rows');

    const failed = draft('db-failure');
    failWrite = true;
    const bad = await actions.importGuestMatches(form([failed]));
    assert.equal(bad.ok, false); assert.deepEqual(bad.importedIds, []);
    assert.equal((await home()).total, batchTotal);
    failWrite = false;
    failConfirmation = true;
    assert.equal((await actions.importGuestMatches(form([failed]))).ok, false);
    failConfirmation = false;
    const lost = draft('lost-response'); loseReply = true;
    await assert.rejects(actions.importGuestMatches(form([lost])), /response lost/);
    assert.equal((await home()).total, batchTotal + 1);
    assert.match((await actions.importGuestMatches(form([lost]))).message, /0件を新規保存.*1件は取り込み済み/);
    assert.equal((await home()).total, batchTotal + 1);
    checks.push('DB/read error gives no acknowledgment; committed-but-lost response retry does not duplicate');

    // Overlapping actions, not independent PostgreSQL transactions: PGlite queues SQL.
    const parallel = draft('overlapping');
    const overlap = await Promise.all(Array.from({ length: 5 }, () => actions.importGuestMatches(form([parallel]))));
    assert.ok(overlap.every(r => r.ok));
    assert.equal((await db.query('select count(*)::int n from public.matches where user_id=$1 and guest_import_id=$2', [ids.a, parallel.local_id])).rows[0].n, 1);
    checks.push('five overlapping Server Actions preserve one row (single PGlite connection; NOT independent-connection race proof)');

    activeUser = ids.b; await claim(ids.b);
    const spoofed = { ...row, user_id: ids.a, id: ids.match };
    assert.equal((await actions.importGuestMatches(form([spoofed]))).ok, true);
    assert.equal((await db.query('select count(*)::int n from public.matches where user_id=$1 and guest_import_id=$2', [ids.b, row.local_id])).rows[0].n, 1);
    assert.equal((await actions.deleteMatchInline(ids.match)).ok, false);
    assert.equal((await db.query("update public.matches set result='lose' where id=$1 returning id", [ids.match])).rows.length, 0);
    await assert.rejects(db.query("insert into public.matches(user_id,environment_id,my_deck_id,opponent_deck_id,result,turn_order,guest_import_id) values($1,$2,$3,$3,'win','first','forged')", [ids.a, ids.env, ids.bdeck]), /row-level security/);
    activeUser = null; await claim(null);
    await assert.rejects(actions.importGuestMatches(form([row])), /redirect:\/login/);
    checks.push('same ID belongs independently to A and B; supplied user/id ignored; cross-owner write and anon import denied');

    activeUser = ids.a; await claim();
    const legacy = draft('legacy'); delete legacy.local_id;
    const identified = identifyGuestMatches(JSON.stringify([legacy]));
    assert.equal((await actions.importGuestMatches(form(JSON.parse(identified)))).ok, true);
    assert.equal(removeImportedGuestMatches(identified, identified, JSON.parse(identified).map(r => r.local_id)), '[]');
    let raw = JSON.stringify([draft('guest-edit')]);
    const storage = { getItem: () => raw, setItem: (_, value) => { raw = value; } };
    mutateGuestMatch(storage, 'guest-edit', { ...JSON.parse(raw)[0], result: 'win' });
    assert.equal(JSON.parse(raw)[0].local_id, 'guest-edit'); assert.equal(JSON.parse(raw)[0].result, 'win');
    mutateGuestMatch(storage, 'guest-edit'); assert.equal(raw, '[]');
    checks.push('legacy local data receives a persisted ID; guest edit keeps identity and delete works');

    // A syntactically valid but invalid FK rolls back the entire insert statement.
    const valid = draft('atomic-valid'), invalid = draft('atomic-invalid', { my_archetype_id: null, my_deck_id: '00000000-0000-4000-8000-000000000999' });
    assert.equal((await actions.importGuestMatches(form([valid, invalid]))).ok, false);
    assert.equal((await db.query("select count(*)::int n from public.matches where guest_import_id='atomic-valid'")).rows[0].n, 0);
    assert.equal((await actions.importGuestMatches(form([valid]))).ok, true);
    await db.exec('reset role'); await db.query('update public.environments set allow_match_input=false where id=$1', [ids.env]); await claim();
    assert.deepEqual((await actions.importGuestMatches(form([row]))).importedIds, [row.local_id]);
    checks.push('atomic batch error leaves no partial insert; valid row can retry; acknowledged replay works after input closes');
    report.passed = true;
  } finally {
    await db.close(); fs.mkdirSync('build/guest-import-fix', { recursive: true });
    fs.writeFileSync('build/guest-import-fix/integration.json', JSON.stringify(report, null, 2));
  }
});
