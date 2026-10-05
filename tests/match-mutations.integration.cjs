/* eslint-disable @typescript-eslint/no-require-imports */
require('./register.cjs');
const { test } = require('node:test'), assert = require('node:assert/strict'), Module = require('node:module');
const fs = require('node:fs');
const { setup, ids } = require('./match-mutations-db.cjs');
let activeUser = ids.a, client;
const invalidated = [];
const load = Module._load;
Module._load = function(name, ...args) {
  if (name === '@/lib/supabase/server') return { createSupabaseServerClient: async () => client };
  if (name === 'next/cache') return { revalidatePath: p => invalidated.push(p) };
  if (name === 'next/navigation') return { redirect: p => { throw Error('redirect:' + p); } };
  return load.call(this, name, ...args);
};
const actions = require('../src/app/actions.ts');
const form = values => { const f = new FormData(); for (const [key, value] of Object.entries({ environment_id: ids.env, my_archetype_id: ids.arch2, opponent_archetype_id: ids.arch, result: 'lose', turn_order: 'second', rank_tier: 'master', master_group: 'ruby', ...values })) f.set(key, value); return f; };
test('actual actions + current migrations: owner, other owner, admin, anon, failures, import and aggregate recomputation', { timeout: 120000 }, async () => {
  const { db, claim, Query } = await setup();
  client = { auth: { getUser: async () => ({ data: { user: activeUser ? { id: activeUser } : null } }) }, from: name => new Query(name) };
  const report = { localOnly: true, engine: 'PGlite PostgreSQL; actual migrations/RLS/actions; no Supabase HTTP', checks: [] };
  try {
    await claim();
    const original = (await db.query('select * from public.matches where id=$1', [ids.match])).rows[0];
    assert.ok((await actions.getMatchForEdit(ids.match)).data);
    assert.equal((await actions.getMatchForEdit(ids.other)).data, undefined);
    assert.equal((await actions.updateMatchInline(ids.other, form())).ok, false);
    assert.equal((await actions.deleteMatchInline(ids.other)).ok, false);
    for (const invalid of [undefined, null, '', 0]) {
      assert.equal((await actions.updateMatchInline(invalid, form())).ok, false);
      assert.equal((await actions.deleteMatchInline(invalid)).ok, false);
    }
    assert.equal((await db.query('select count(*)::int n from public.matches')).rows[0].n, 2);
    // Direct queries deliberately omit the action's user_id predicate.
    assert.equal((await db.query("update public.matches set result='lose' where id=$1 returning id", [ids.other])).rows.length, 0);
    assert.equal((await db.query('delete from public.matches where id=$1 returning id', [ids.other])).rows.length, 0);
    await assert.rejects(db.query('update public.matches set user_id=$1 where id=$2', [ids.b, ids.match]), /row-level security/);
    report.checks.push('A including admin cannot update/delete B via actions or direct SQL; ownership transfer denied');
    const rpcs = [
      ['Home', 'select public.get_home_dashboard($1) p', [ids.env]],
      ['Environment', "select public.get_environment_dashboard_aggregates_v3($1,'24h') p", [ids.env]],
      ['Analysis', 'select public.get_analysis_aggregates_v3($1) p', [ids.env]],
      ['Matrix', 'select public.get_matchup_aggregates_v1($1) p', [ids.env]],
      ['Period Report', "select public.get_period_report_aggregates_v3(now()-interval '2 days',now(),now()-interval '4 days',now()-interval '2 days',p_environment_id:=$1) p", [ids.env]],
      ['OBS', 'select public.get_analysis_aggregates_v3_exclusive($1) p', [ids.env]]
    ];
    const before = [];
    for (const [, sql, args] of rpcs) before.push((await db.query(sql, args)).rows[0].p);
    assert.deepEqual((await actions.updateMatchInline(ids.match, form({ user_id: ids.b, id: ids.other, created_at: '1900-01-01', played_at: '1900-01-01', memo: 'forged' }))), { ok: true });
    const updated = (await db.query('select * from public.matches where id=$1', [ids.match])).rows[0];
    for (const key of ['id', 'user_id', 'created_at', 'played_at', 'memo', 'my_user_deck_id']) assert.deepEqual(updated[key], original[key], key);
    assert.equal(updated.my_archetype_id, ids.arch2); assert.equal(updated.my_deck_id, ids.deck2);
    assert.equal(updated.result, 'lose'); assert.equal(updated.turn_order, 'second'); assert.equal(updated.master_group, 'ruby');
    for (const [i, [name, sql, args]] of rpcs.entries()) {
      const payload = (await db.query(sql, args)).rows[0].p;
      assert.notDeepEqual(payload, before[i], name);
      if (name === 'Home') { assert.equal(payload.summary.total, 1); assert.equal(payload.summary.wins, 0); }
      else if (name === 'Environment') {
        assert.equal(payload.current.total.totalMatches, 2);
        const b = payload.decks.find(d => d.key === ids.arch2).current.winrate;
        assert.equal(b.targetRegistrations, 1); assert.equal(b.evaluationCount, 1); assert.equal(b.wins, 0);
      } else if (name === 'Period Report') {
        assert.equal(payload.current.totalMatches, 2);
        assert.equal(payload.current.groups.find(g => g.myDeckId === ids.arch2).wins, 0);
      } else {
        assert.equal(payload.totalMatches ?? payload.registeredMatches, 1);
        assert.equal(payload.groups[0].myDeckId, ids.arch2); assert.equal(payload.groups[0].wins, 0);
      }
      report.checks.push(name + ' reflects A win -> B loss (explicit counts/deck/wins)');
    }
    assert.equal((await actions.updateMatchInline(ids.match, form({ rank_tier: 'master', master_group: 'bad' }))).ok, false);
    assert.equal((await actions.updateMatchInline(ids.match, form({ environment_id: ids.env2, my_archetype_id: ids.arch, opponent_archetype_id: ids.arch2, rank_tier: 'grandmaster', master_group: '', grandmaster_rating: 'beyond' }))).ok, true);
    const moved = (await db.query('select * from public.matches where id=$1', [ids.match])).rows[0];
    assert.equal(moved.environment_id, ids.env2); assert.equal(moved.opponent_archetype_id, ids.arch2); assert.equal(moved.grandmaster_rating, 'beyond');
    assert.equal((await actions.updateMatchInline(ids.match, form())).ok, true);
    const edited = []; for (const [, sql, args] of rpcs) edited.push((await db.query(sql, args)).rows[0].p);
    assert.equal((await actions.deleteMatchInline(ids.match)).ok, true);
    assert.equal((await actions.deleteMatchInline(ids.match)).ok, false);
    assert.equal((await db.query('select * from public.matches where id=$1', [ids.match])).rows.length, 0);
    for (const [i, [name, sql, args]] of rpcs.entries()) {
      const payload = (await db.query(sql, args)).rows[0].p;
      assert.notDeepEqual(payload, edited[i], name);
      if (name === 'Home') assert.equal(payload.summary.total, 0);
      else if (name === 'Environment') {
        assert.equal(payload.current.total.totalMatches, 1);
        assert.equal(payload.decks.find(d => d.key === ids.arch2).current.winrate.status, 'no_data');
      } else if (name === 'Period Report') {
        assert.equal(payload.current.totalMatches, 1); assert.ok(!payload.current.groups.some(g => g.myDeckId === ids.arch2));
      } else { assert.equal(payload.totalMatches ?? payload.registeredMatches, 0); assert.deepEqual(payload.groups, []); }
      report.checks.push(name + ' reflects deletion (explicit totals and groups)');
    }
    assert.equal((await actions.createMatchInline(form())).ok, true);
    const f = new FormData(); f.set('guest_matches_json', JSON.stringify([{ local_id: 'edited', environment_id: ids.env, my_deck_id: ids.arch2, opponent_deck_id: ids.arch, my_archetype_id: ids.arch2, opponent_archetype_id: ids.arch, result: 'lose', turn_order: 'second', played_at: original.played_at }]));
    assert.deepEqual((await actions.importGuestMatches(f)).importedIds, ['edited']);
    report.checks.push('new registration and edited Guest import succeed');
    await db.exec('reset role'); await db.query('update public.environments set allow_match_input=false where id=$1', [ids.env]); await claim();
    const ownId = (await db.query('select id from public.matches where user_id=$1 limit 1', [ids.a])).rows[0].id;
    assert.equal((await actions.updateMatchInline(ownId, form())).ok, false);
    assert.equal((await actions.deleteMatchInline(ownId)).ok, true);
    activeUser = null; await claim(null);
    assert.equal((await actions.updateMatchInline(ids.other, form())).ok, false);
    assert.equal((await actions.deleteMatchInline(ids.other)).ok, false);
    assert.equal((await db.query("update public.matches set result='lose' where id=$1 returning id", [ids.other])).rows.length, 0);
    assert.equal((await db.query('delete from public.matches where id=$1 returning id', [ids.other])).rows.length, 0);
    report.checks.push('anon UPDATE/DELETE denied; stopped environment edit denied and delete allowed');
    for (const p of ['/', '/analysis', '/matrix', '/environment', '/admin/weekly-report', '/admin/obs/environment']) assert.ok(invalidated.includes(p));
    report.passed = true;
  } finally { await db.close(); fs.mkdirSync('build/match-mutations', { recursive: true }); fs.writeFileSync('build/match-mutations/sql.json', JSON.stringify(report, null, 2)); }
});
