/* eslint-disable @typescript-eslint/no-require-imports */
const test = require('node:test');
const assert = require('node:assert/strict');
const Module = require('node:module');
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
let tables, inserts, calls, failures, rpc, logs, user, rpcThrows;
const warning = console.warn;
const failure = { code: '57014', message: 'private-user-token-and-raw-record' };
class Query {
  constructor(table) { this.table = table; this.filters = []; calls.push(this); }
  select(columns, options) { this.columns = columns; this.options = options; return this; }
  eq(k,v) { this.filters.push([k,v]); return this; }
  in(k,v) { this.filters.push([k,v]); return this; }
  order() { return this; }
  limit() { return this; }
  maybeSingle() { this.single = true; return this; }
  insert(rows) { this.rows = Array.isArray(rows) ? rows : [rows]; return this; }
  then(resolve, reject) {
    return Promise.resolve().then(() => {
      if (this.rows) {
        if (failures.has('insert')) return { error: failure };
        inserts.push(...this.rows); return { error: null };
      }
      const turn = this.filters.find(([k]) => k === 'turn_order')?.[1];
      const result = this.filters.find(([k]) => k === 'result')?.[1] ?? 'all';
      if (failures.has(this.options?.head ? `${turn}:${result}` : this.table)) return { data: null, count: null, error: failure };
      const rows = (tables[this.table] ?? []).filter(row => this.filters.every(([k,v]) => Array.isArray(v) ? v.includes(row[k]) : row[k] === v));
      return { data: this.options?.head ? null : this.single ? rows[0] ?? null : rows, count: failures.has('null-count') ? null : rows.length, error: null };
    }).then(resolve, reject);
  }
}
const client = {
  auth: { getUser: async () => ({ data: { user } }) },
  from: table => new Query(table),
  rpc: async () => { if (rpcThrows) throw failure; return rpc; }
};
const load = Module._load;
Module._load = function (name, ...args) {
  if (name === '@/lib/supabase/server') return { createSupabaseServerClient: async () => client };
  if (name === 'next/navigation') return { redirect(url) { throw Error('REDIRECT:' + url); } };
  if (name === 'next/cache') return { revalidatePath() {} };
  if (name === '@/components/AppShell') return { AppShell: ({ children }) => React.createElement('main', null, children) };
  return load.call(this, name, ...args);
};
const { importGuestMatches } = require('../src/app/actions');
const { identifyGuestMatches, removeImportedGuestMatches } = require('../src/lib/guest-storage');
const { getHomeDashboard } = require('../src/lib/data');
const HomePage = require('../src/app/page').default;
function draft(i, extra = {}) { return { environment_id: 'e', my_deck_id: 'a', opponent_deck_id: 'b', my_archetype_id: null, opponent_archetype_id: null, turn_order: 'first', result: 'win', played_at: '2026-09-01T00:00:00Z', local_id: 'local-' + i, ...extra }; }
function form(raw) { const fd = new FormData(); fd.set('guest_matches_json', raw); return fd; }
test.beforeEach(() => {
  user = { id: 'u' }; tables = { environments: [{ id: 'e', name: 'E', created_at: '2026-09-01', allow_match_input: true }], matches: [], admin_users: [] };
  inserts = []; calls = []; failures = new Set(); logs = []; rpcThrows = false;
  rpc = { data: null, error: failure };
  console.warn = (...args) => logs.push(args);
});
test.afterEach(() => { console.warn = warning; });

for (const [total, saved] of [[10,10],[250,200]]) test(`A2: save ${saved}/${total} and remove only acknowledged IDs`, async () => {
  const raw = JSON.stringify(Array.from({ length: total }, (_,i) => draft(i)));
  const response = await importGuestMatches(form(raw));
  assert.equal(response.ok, true);
  assert.equal(inserts.length, saved);
  assert.equal(response.importedIds.length, saved);
  assert.deepEqual(JSON.parse(removeImportedGuestMatches(raw, raw, response.importedIds)), JSON.parse(raw).slice(saved));
  for (const row of inserts) { assert.equal(row.user_id, 'u'); assert.ok(!('local_id' in row)); assert.ok(!('rank_tier' in row)); }
});
test('A2: invalid, stopped, unrecognized and unprepared records remain after partial success', async () => {
  const raw = JSON.stringify([draft(0), draft(1, { result: 'invalid' }), draft(2, { environment_id: 'stopped' }), draft(3, { played_at: 'invalid' }), draft(4, { my_archetype_id: 'missing' }), null, { unknown: true }]);
  const response = await importGuestMatches(form(raw));
  assert.deepEqual(response.importedIds, ['local-0']);
  assert.deepEqual(JSON.parse(removeImportedGuestMatches(raw, raw, response.importedIds)), JSON.parse(raw).slice(1));
});
for (const mode of ['insert', 'environments']) test(`A2: ${mode} failure acknowledges nothing`, async () => {
  failures.add(mode);
  const raw = JSON.stringify([draft(0)]);
  const response = await importGuestMatches(form(raw));
  assert.equal(response.ok, false);
  assert.deepEqual(response.importedIds, []);
  assert.equal(removeImportedGuestMatches(raw, raw, response.importedIds), raw);
});
test('A2: all invalid records cause no inserts and no acknowledgements', async () => {
  const result = await importGuestMatches(form(JSON.stringify([draft(0, { result: 'bad' })])));
  assert.equal(result.ok, false); assert.deepEqual(result.importedIds, []); assert.equal(inserts.length, 0);
});
test('A2: concurrent additions and changed records survive cleanup', () => {
  const submitted = JSON.stringify([draft(0), draft(1)]);
  const latest = [draft(2), draft(0), draft(1, { result: 'lose' }), { malformed: true }];
  assert.deepEqual(JSON.parse(removeImportedGuestMatches(JSON.stringify(latest), submitted, ['local-0','local-1','local-2'])), [latest[0],latest[2],latest[3]]);
});
test('A2: legacy identity persists and duplicate client IDs become distinct without losing entries', () => {
  let next = 0;
  const old = [draft(0, { local_id: undefined }), draft(1), draft(2, { local_id: 'local-1' }), null, { bad: true }];
  const identified = identifyGuestMatches(JSON.stringify(old), () => `new-${next++}`);
  const rows = JSON.parse(identified);
  assert.equal(rows.length, old.length);
  assert.equal(rows[3], null);
  assert.equal(new Set(rows.filter(Boolean).map(x => x.local_id)).size, 4);
  assert.equal(identifyGuestMatches(identified), identified);
  assert.throws(() => identifyGuestMatches('bad-json'));
});
test('A2: cleanup followed by retry saves only remainder; raw request replay is not DB-deduplicated', async () => {
  const raw = JSON.stringify(Array.from({ length: 250 }, (_,i) => draft(i)));
  const first = await importGuestMatches(form(raw));
  const remaining = removeImportedGuestMatches(raw, raw, first.importedIds);
  const second = await importGuestMatches(form(remaining));
  assert.equal(inserts.length, 250); assert.equal(second.importedIds.length, 50);
  await importGuestMatches(form(JSON.stringify([draft(0)])));
  assert.equal(inserts.length, 251); // Existing retry limitation is explicit; no schema/dedup change.
});

const emptySummary = { total: 0, wins: 0, winRate: null, firstWinRate: null, secondWinRate: null };
function sampleMatches() { return ['win','lose','win','win'].map((result,i) => ({ ...draft(i), id: String(i), user_id: 'u', turn_order: i < 2 ? 'first' : 'second', result })); }
test('A3: RPC success is returned without fallback queries', async () => {
  rpc = { data: { summary: { ...emptySummary, total: 4, wins: 3, winRate: 75, firstWinRate: 50, secondWinRate: 100 }, recent: [] }, error: null };
  assert.deepEqual(await getHomeDashboard('e'), rpc.data);
  assert.equal(calls.length, 0); assert.equal(logs.length, 0);
});
test('A3: RPC failure with successful fallback returns correct counts and safe logs', async () => {
  tables.matches = sampleMatches();
  const result = await getHomeDashboard('e');
  assert.deepEqual(result.summary, { total: 4, wins: 3, winRate: 75, firstWinRate: 50, secondWinRate: 100 });
  assert.equal(logs[0][1].outcome, 'using_fallback');
  assert.equal(logs[0][1].code, '57014');
  assert.ok(!JSON.stringify(logs).includes(failure.message));
});
for (const failed of [['first:all'],['first:all','first:win','second:all','second:win'],['null-count'],['matches']]) test(`A3: fallback failure ${failed.join(',')} rejects the whole dashboard`, async () => {
  tables.matches = sampleMatches(); failures = new Set(failed);
  await assert.rejects(getHomeDashboard('e'), /取得できませんでした/);
  const html = renderToStaticMarkup(await HomePage({ searchParams: Promise.resolve({ environment: 'e' }) }));
  assert.match(html, /role="alert"/); assert.match(html, /戦績データを取得できませんでした/);
  assert.doesNotMatch(html, /総試合数|勝利数|この環境の戦績はまだありません/);
  assert.ok(!JSON.stringify(logs).includes(failure.message));
});
test('A3: genuine zero data remains a successful zero dashboard and zero UI', async () => {
  assert.deepEqual((await getHomeDashboard('e')).summary, emptySummary);
  const html = renderToStaticMarkup(await HomePage({ searchParams: Promise.resolve({ environment: 'e' }) }));
  assert.match(html, /総試合数/); assert.doesNotMatch(html, /戦績データを取得できませんでした/);
});
test('A3: thrown RPC errors and invalid RPC payloads also use fallback', async () => {
  rpcThrows = true;
  assert.deepEqual((await getHomeDashboard('e')).summary, emptySummary);
  rpcThrows = false; rpc = { data: { summary: {}, recent: [] }, error: null };
  assert.deepEqual((await getHomeDashboard('e')).summary, emptySummary);
});
