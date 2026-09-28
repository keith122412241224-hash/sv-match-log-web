/* eslint-disable @typescript-eslint/no-require-imports */
const test = require('node:test');
const assert = require('node:assert/strict');
const Module = require('node:module');
const { summarizeMatches, buildDeckAnalysisSummaries, buildWinRateMatrix, groupWinRates, turnOrderWinRates } = require('../src/lib/analytics.ts');
const { buildWeeklyReport, buildWeeklyPeriod } = require('../src/lib/weekly-report.ts');
const { analysisPerspectives } = require('../src/lib/match-perspectives.ts');

let tables, calls, saved, invalidations, failRead, failUpsert, failInsert, concurrentDeck;
function reset() {
  tables = {
    environments: [{ id: 'open', allow_match_input: true }, { id: 'closed', allow_match_input: false }],
    deck_archetypes: [
      { id: 'a', name: 'Alpha', class_name: 'エルフ', is_active: true },
      { id: 'b', name: 'Beta', class_name: 'ロイヤル', is_active: true },
      { id: 'inactive', name: 'Old', class_name: 'ウィッチ', is_active: false }
    ],
    decks: []
  };
  calls = []; saved = []; invalidations = [];
  failRead = null; failUpsert = false; failInsert = false; concurrentDeck = null;
}
const deck = (name, className, extra = {}) => ({ id: `deck-${name}`, user_id: 'u', deck_type: 'my_deck', name, class_name: className, sort_order: 7, ...extra });
class Query {
  constructor(table) { this.table = table; this.filters = []; this.operation = 'select'; }
  select() { return this; }
  eq(column, value) { this.filters.push(row => row[column] === value); return this; }
  in(column, values) { this.filters.push(row => values.includes(row[column])); return this; }
  maybeSingle() { this.single = true; return this; }
  upsert(rows, options) { this.operation = 'upsert'; this.rows = Array.isArray(rows) ? rows : [rows]; this.options = options; return this; }
  insert(rows) { this.operation = 'insert'; this.rows = Array.isArray(rows) ? rows : [rows]; return this; }
  then(resolve, reject) {
    return Promise.resolve().then(() => {
      calls.push(this);
      if (this.operation === 'upsert') {
        if (failUpsert) return { data: null, error: { message: 'upsert failed' } };
        assert.deepEqual(this.options, { onConflict: 'user_id,deck_type,name', ignoreDuplicates: true });
        if (concurrentDeck) { tables.decks.push(concurrentDeck); concurrentDeck = null; }
        for (const row of this.rows) {
          if (!tables.decks.some(d => d.user_id === row.user_id && d.deck_type === row.deck_type && d.name === row.name)) {
            tables.decks.push({ id: `deck-${row.name}`, ...row });
          }
        }
        return { data: null, error: null };
      }
      if (this.operation === 'insert') {
        if (failInsert) return { data: null, error: { message: 'insert failed' } };
        saved.push(...this.rows);
        return { data: null, error: null };
      }
      if (failRead === this.table) return { data: null, error: { message: 'read failed' } };
      const rows = tables[this.table].filter(row => this.filters.every(filter => filter(row)));
      return { data: this.single ? rows[0] ?? null : rows, error: null };
    }).then(resolve, reject);
  }
}
const client = { auth: { getUser: async () => ({ data: { user: { id: 'u' } } }) }, from: table => new Query(table) };
const originalLoad = Module._load;
Module._load = function(request, ...args) {
  if (request === '@/lib/supabase/server') return { createSupabaseServerClient: async () => client };
  if (request === 'next/cache') return { revalidatePath: path => invalidations.push(path) };
  if (request === 'next/navigation') return { redirect: path => { throw new Error(`redirect:${path}`); } };
  return originalLoad.call(this, request, ...args);
};
const { importGuestMatches, createMatchInline, createMatch } = require('../src/app/actions.ts');
const originalNow = Date.now;
test.afterEach(() => { Date.now = originalNow; });

for (const delta of [-1, 0, 1]) test(`scheduled save/import at 9/29 17:00 JST ${delta}ms`, async () => {
  const boundary = Date.parse('2026-09-29T08:00:00Z');
  Date.now = () => boundary + delta;
  tables.environments = [
    {id:'old',allow_match_input:true,match_input_end_at:new Date(boundary).toISOString()},
    {id:'new',allow_match_input:true,match_input_start_at:new Date(boundary).toISOString()}
  ];
  for (const id of ['old','new']) {
    const allowed = id === 'old' ? delta < 0 : delta >= 0;
    for (const next of ['home','continue']) {
      const form = new FormData();
      for (const [k,v] of Object.entries({environment_id:id,my_archetype_id:'a',opponent_archetype_id:'b',turn_order:'first',result:'win',next_action:next,played_at:'2020-01-01T00:00:00Z',client_now:'2020-01-01T00:00:00Z'})) form.set(k,v);
      const before = saved.length;
      assert.equal((await createMatchInline(form)).ok,allowed);
      assert.equal(saved.length,before + Number(allowed));
      await assert.rejects(createMatch(form), allowed ? (next==='home'?/redirect:\/$/:/redirect:\/matches\?saved=1/) : /redirect:\/matches\?error=/);
    }
  }
  const response=await runImport([draft('old-guest',{environment_id:'old'}),draft('new-guest',{environment_id:'new'})]);
  assert.deepEqual(response.importedIds,[delta<0?'old-guest':'new-guest']);
  assert.equal(saved.at(-1).environment_id,delta<0?'old':'new');
  assert.equal(saved.at(-1).rank_tier,null);
});
const draft = (id, extra = {}) => ({ local_id: id, environment_id: 'open', my_deck_id: 'a', opponent_deck_id: 'b', my_archetype_id: 'a', opponent_archetype_id: 'b', result: 'win', turn_order: 'first', played_at: '2026-09-03T01:00:00Z', ...extra });
async function runImport(rows) {
  const form = new FormData(); form.set('guest_matches_json', JSON.stringify(rows));
  return importGuestMatches(form);
}
function expectedRow(row, myId = 'deck-Alpha', opponentId = 'deck-Beta') {
  return {
    rank_tier: row.rank_tier ?? null, master_group: row.master_group ?? null, grandmaster_rating: row.grandmaster_rating ?? null,
    user_id: 'u', environment_id: row.environment_id,
    my_deck_id: myId, opponent_deck_id: opponentId,
    my_archetype_id: row.my_archetype_id || null, opponent_archetype_id: row.opponent_archetype_id || null,
    result: row.result, turn_order: row.turn_order, played_at: new Date(row.played_at).toISOString()
  };
}
test.beforeEach(reset);

test('preserves 200 imported rows, IDs and all production analysis outputs', async () => {
  tables.decks = [deck('Alpha', 'エルフ', { id: 'existing-alpha' }), deck('Beta', 'ロイヤル')];
  const initialDecks = structuredClone(tables.decks);
  const input = Array.from({ length: 200 }, (_, i) => draft(`local-${i}`, {
    result: i % 3 ? 'win' : 'lose', turn_order: i % 2 ? 'first' : 'second',
    played_at: i < 100 ? '2026-09-03T01:00:00Z' : '2026-08-27T01:00:00Z',
    my_archetype_id: i % 2 ? 'b' : 'a', opponent_archetype_id: i % 2 ? 'a' : 'b'
  }));
  const result = await runImport(input);
  const expected = input.map(row => expectedRow(row, row.my_archetype_id === 'a' ? 'existing-alpha' : 'deck-Beta', row.opponent_archetype_id === 'a' ? 'existing-alpha' : 'deck-Beta'));
  assert.equal(result.ok, true);
  assert.deepEqual(result.importedIds, input.map(row => row.local_id));
  assert.deepEqual(saved, expected);
  assert.deepEqual(tables.decks, initialDecks);
  assert.deepEqual(invalidations, ['/']);
  for (const mode of ['direct', 'combined']) {
    const actual = analysisPerspectives(saved, mode);
    const reference = analysisPerspectives(expected, mode);
    const decks = tables.deck_archetypes;
    assert.deepEqual(summarizeMatches(actual), summarizeMatches(reference));
    assert.deepEqual(groupWinRates(actual, r => r.my_archetype_id, id => id), groupWinRates(reference, r => r.my_archetype_id, id => id));
    assert.deepEqual(turnOrderWinRates(actual), turnOrderWinRates(reference));
    assert.deepEqual(buildDeckAnalysisSummaries(actual, decks, 'archetype'), buildDeckAnalysisSummaries(reference, decks, 'archetype'));
    assert.deepEqual(buildWinRateMatrix(actual, decks, decks), buildWinRateMatrix(reference, decks, decks));
    const report = rows => buildWeeklyReport(rows.filter(r => r.played_at.startsWith('2026-09')), rows.filter(r => r.played_at.startsWith('2026-08')), decks, buildWeeklyPeriod('2026-09-01', '2026-09-07'));
    assert.deepEqual(report(saved), report(expected));
  }
});

test('preserves new and mixed deck resolution without replacing existing IDs or metadata', async () => {
  tables.decks = [deck('Alpha', 'エルフ', { id: 'keep-id' }), deck('Beta', 'ロイヤル', { user_id: 'other', id: 'foreign' }), deck('Beta', 'ロイヤル', { deck_type: 'opponent_deck', id: 'other-type' })];
  const first = draft('one');
  const mirror = draft('mirror', { opponent_archetype_id: 'a' });
  assert.equal((await runImport([first, mirror])).ok, true);
  assert.deepEqual(saved, [expectedRow(first, 'keep-id'), expectedRow(mirror, 'keep-id', 'keep-id')]);
  assert.equal(tables.decks.find(d => d.id === 'keep-id').sort_order, 7);
  assert.equal(tables.decks.find(d => d.id === 'deck-Beta').sort_order, 999);
});

test('preserves missing, inactive, wrong-class and raw deck behavior with partial imports', async () => {
  tables.decks = [deck('Alpha', 'エルフ'), deck('Beta', 'ウィッチ')];
  const input = [
    draft('missing', { my_archetype_id: 'missing' }),
    draft('wrong-class'),
    draft('inactive', { my_archetype_id: 'inactive', opponent_archetype_id: 'a' }),
    draft('raw', { my_archetype_id: null, opponent_archetype_id: null, my_deck_id: 'raw-own', opponent_deck_id: 'raw-opponent' }),
    draft('closed', { environment_id: 'closed' })
  ];
  const result = await runImport(input);
  assert.deepEqual(result.importedIds, ['inactive', 'raw']);
  assert.deepEqual(saved, [expectedRow(input[2], 'deck-Old', 'deck-Alpha'), expectedRow(input[3], 'raw-own', 'raw-opponent')]);
});

test('preserves first-seen class for same-name archetypes regardless of SELECT order', async () => {
  tables.deck_archetypes = [
    { id: 'second', name: 'Same', class_name: 'ロイヤル' },
    { id: 'first', name: 'Same', class_name: 'エルフ' }
  ];
  const first = draft('first-row', { my_archetype_id: 'first', opponent_archetype_id: 'first' });
  const second = draft('second-row', { my_archetype_id: 'second', opponent_archetype_id: 'second' });
  const result = await runImport([first, second]);
  assert.deepEqual(result.importedIds, ['first-row']);
  assert.deepEqual(saved, [expectedRow(first, 'deck-Same', 'deck-Same')]);
  assert.equal(tables.decks[0].class_name, 'エルフ');
});

test('preserves candidate limit before unresolved matches are skipped and ignores duplicate local IDs', async () => {
  const input = [draft('closed', { environment_id: 'closed' }), draft('missing', { my_archetype_id: 'missing' }),
    ...Array.from({ length: 200 }, (_, i) => draft(`ok-${i}`))];
  input.splice(3, 0, draft('ok-0'));
  const result = await runImport(input);
  assert.equal(result.importedIds.length, 198);
  assert.equal(result.importedIds.at(-1), 'ok-197');
  assert.equal(saved.length, 198);
});

test('preserves concurrent existing deck ID when creation conflicts', async () => {
  concurrentDeck = deck('Alpha', 'エルフ', { id: 'concurrent-id' });
  const row = draft('one');
  assert.equal((await runImport([row])).ok, true);
  assert.deepEqual(saved, [expectedRow(row, 'concurrent-id')]);
});

test('preserves normal and continuous registration payloads and refresh policy', async () => {
  tables.decks = [deck('Alpha', 'エルフ', { id: 'saved-id' }), deck('Beta', 'ロイヤル')];
  const form = new FormData();
  for (const [key, value] of Object.entries(draft('one'))) if (value !== null) form.set(key, value);
  assert.equal((await createMatchInline(form)).ok, true);
  assert.deepEqual(invalidations, []);
  await assert.rejects(createMatch(form), /redirect:\//);
  const expected = expectedRow(draft('one'), 'saved-id');
  for (const row of saved) {
    assert.ok(Number.isFinite(new Date(row.played_at).getTime()));
    assert.deepEqual({ ...row, played_at: expected.played_at }, expected);
  }
  assert.equal(saved.length, 2);
  assert.deepEqual(invalidations, ['/', '/analysis', '/matrix']);
});

test('client home save preserves redirect-save payload and invalidation; continue does not invalidate', async () => {
  const form = new FormData();
  for (const [key, value] of Object.entries(draft('one', { rank_tier: 'master', master_group: 'diamond' }))) form.set(key, value);
  form.set('next_action', 'continue');
  assert.equal((await createMatchInline(form)).ok, true);
  assert.deepEqual(invalidations, []);
  form.set('next_action', 'home');
  assert.equal((await createMatchInline(form)).ok, true);
  const homeInvalidations = [...invalidations];
  invalidations.length = 0;
  await assert.rejects(createMatch(form), /redirect:\/$/);
  assert.deepEqual(homeInvalidations, invalidations);
  assert.ok(homeInvalidations.includes('/'));
  assert.equal(saved.length, 3);
  for (const row of saved) assert.deepEqual({ ...row, played_at: saved[0].played_at }, saved[0]);
});

test('failed client home save returns an error without invalidation or redirect', async () => {
  failInsert = true;
  const form = new FormData();
  for (const [key, value] of Object.entries(draft('one'))) form.set(key, value);
  form.set('next_action', 'home');
  assert.deepEqual(await createMatchInline(form), { ok: false, message: 'insert failed' });
  assert.deepEqual(invalidations, []);
  assert.deepEqual(saved, []);
});

test('200 repeated matches require four DB calls with existing decks and six with missing decks', async () => {
  const input = Array.from({ length: 200 }, (_, i) => draft(String(i)));
  tables.decks = [deck('Alpha', 'エルフ'), deck('Beta', 'ロイヤル')];
  await runImport(input);
  assert.equal(calls.length, 4);
  assert.equal(calls.filter(q => q.operation === 'upsert').length, 0);
  reset();
  await runImport(input);
  assert.equal(calls.length, 6);
  assert.equal(calls.find(q => q.operation === 'upsert').rows.length, 2);
});

test('only missing decks are sent to upsert', async () => {
  tables.decks = [deck('Alpha', 'エルフ')];
  await runImport([draft('one')]);
  assert.deepEqual(calls.find(q => q.operation === 'upsert').rows.map(r => r.name), ['Beta']);
});

test('400 distinct decks for 200 matches use bounded batches and preserve every row', async () => {
  tables.deck_archetypes = Array.from({ length: 400 }, (_, i) => ({ id: `a${i}`, name: `Deck${i}`, class_name: 'エルフ' }));
  const input = Array.from({ length: 200 }, (_, i) => draft(String(i), { my_archetype_id: `a${2*i}`, opponent_archetype_id: `a${2*i+1}` }));
  assert.equal((await runImport(input)).importedIds.length, 200);
  assert.equal(calls.length, 15);
  assert.deepEqual(saved, input.map((r, i) => expectedRow(r, `deck-Deck${2*i}`, `deck-Deck${2*i+1}`)));
});

test('preserves unresolved imports on failed deck reads or creation', async () => {
  for (const failure of ['deck_archetypes', 'decks', 'upsert']) {
    reset();
    if (failure === 'upsert') failUpsert = true; else failRead = failure;
    const result = await runImport([draft('one')]);
    assert.equal(result.ok, false);
    assert.deepEqual(result.importedIds, []);
    assert.deepEqual(saved, []);
    assert.deepEqual(invalidations, []);
  }
});

test('preserves resolvable matches when creation of a missing deck fails', async () => {
  tables.decks = [deck('Alpha', 'エルフ')];
  failUpsert = true;
  const mirror = draft('mirror', { opponent_archetype_id: 'a' });
  const raw = draft('raw', { my_archetype_id: null, opponent_archetype_id: null });
  const result = await runImport([draft('missing'), mirror, raw]);
  assert.deepEqual(result.importedIds, ['mirror', 'raw']);
  assert.deepEqual(saved, [expectedRow(mirror, 'deck-Alpha', 'deck-Alpha'), expectedRow(raw, 'a', 'b')]);
});

test('preserves local records on match INSERT failure', async () => {
  failInsert = true;
  const result = await runImport([draft('one')]);
  assert.equal(result.ok, false);
  assert.deepEqual(result.importedIds, []);
  assert.deepEqual(saved, []);
  assert.deepEqual(invalidations, []);
});

const rankCases=[{rank_tier:null,master_group:null,grandmaster_rating:null},...['beginner','d','c','b','a','aa'].map(rank_tier=>({rank_tier,master_group:null,grandmaster_rating:null})),...['emerald','topaz','ruby','sapphire','diamond'].map(master_group=>({rank_tier:'master',master_group,grandmaster_rating:null})),...['none','epic','ultimate','legend','beyond'].map(grandmaster_rating=>({rank_tier:'grandmaster',master_group:null,grandmaster_rating}))];
for(const rank of rankCases)test('R2 actual actions preserve rank '+JSON.stringify(rank),async()=>{
 tables.decks=[deck('Alpha','エルフ'),deck('Beta','ロイヤル')];
 const row=draft('rank',{...rank}),form=new FormData();for(const [k,v]of Object.entries(row))if(v!==null)form.set(k,v);
 assert.equal((await createMatchInline(form)).ok,true);
 await assert.rejects(createMatch(form),/^Error: redirect:\/$/);
 assert.equal((await runImport([row])).ok,true);
 for(const savedRow of saved)for(const key of Object.keys(rank))assert.equal(savedRow[key],rank[key]);
 assert.equal(saved.length,3);
});
test('R2 invalid ranks never write and mixed imports preserve invalid records',async()=>{
 for(const rank of [{rank_tier:'master'},{rank_tier:'grandmaster'},{rank_tier:'unknown'},{rank_tier:'aa',grandmaster_rating:'none'},{rank_tier:null,master_group:'ruby'}]){
 reset();const form=new FormData();for(const [k,v]of Object.entries(draft('bad',rank)))if(v!==null)form.set(k,v);
 assert.equal((await createMatchInline(form)).ok,false);assert.deepEqual(saved,[]);assert.equal(calls.length,0);
 assert.equal((await runImport([draft('bad',rank)])).ok,false);assert.deepEqual(saved,[]);
 }
 reset();const result=await runImport([draft('old'),draft('invalid',{rank_tier:'master'}),draft('none',{rank_tier:'grandmaster',grandmaster_rating:'none'})]);
 assert.deepEqual(result.importedIds,['old','none']);assert.match(result.message,/ランク情報が不正/);assert.equal(saved[0].rank_tier,null);assert.equal(saved[1].grandmaster_rating,'none');
});
test('R2 invalid rank candidates still count toward the 200-row cap',async()=>{
 const rows=[draft('bad',{rank_tier:'invalid'}),...Array.from({length:200},(_,i)=>draft('valid-'+i))];
 const result=await runImport(rows);assert.equal(result.importedIds.length,199);assert.equal(result.importedIds.at(-1),'valid-198');
});
