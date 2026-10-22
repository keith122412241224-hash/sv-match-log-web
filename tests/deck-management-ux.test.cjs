/* eslint-disable @typescript-eslint/no-require-imports */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
const { SHADOWVERSE_CLASSES } = require('../src/lib/constants');
let decks = [], reads = 0, user = { id: 'member' }, writes = [], invalidations = [];
function mock(name, exports) {
  const id = require.resolve(name);
  require.cache[id] = { id, filename: id, loaded: true, exports };
}
mock('../src/components/AppShell', { AppShell: ({ children }) => React.createElement('main', null, children) });
mock('../src/lib/data', { getActiveArchetypes: async () => { reads++; return decks; } });
mock('../src/lib/supabase/server', { createSupabaseServerClient: async () => ({
  auth: { getUser: async () => ({ data: { user } }) },
  from: table => ({ insert: async data => { writes.push({ table, data }); return { error: null }; } })
}) });
mock('next/cache', { revalidatePath: path => invalidations.push(path) });
mock('next/navigation', { redirect: path => { throw Error('redirect:' + path); } });
const Page = require('../src/app/decks/page').default;
const { DeckSuggestionForm } = require('../src/components/decks/DeckSuggestionForm');
const { createDeckSuggestion } = require('../src/app/actions');
const deck = (id, class_name, name = id) => ({ id, class_name, name });
const render = async rows => { decks = rows; return renderToStaticMarkup(await Page()); };

test('deck management: suggestion is above counted list, all disclosures closed and form action unchanged', async () => {
  reads = 0;
  const html = await render([deck('a', 'エルフ')]);
  assert.ok(html.indexOf('デッキ候補を申請') < html.indexOf('標準デッキ一覧'));
  assert.match(html, /標準デッキ一覧（1デッキ）/);
  assert.doesNotMatch(html, /<details[^>]*\bopen(?:=|\s|>)/);
  assert.equal(reads, 1);
  assert.equal(DeckSuggestionForm().props.action, createDeckSuggestion);
  for (const name of ['class_name', 'suggested_name', 'memo']) assert.match(html, new RegExp('name="' + name + '"'));
  assert.match(html, /required=""/);
  assert.match(html, /候補を申請/);
  for (const summary of html.matchAll(/<summary[^>]*>([\s\S]*?)<\/summary>/g)) assert.doesNotMatch(summary[1], /<button|<input|<a /);
});

test('deck management: canonical class order, visible labels/icons/counts, original deck order, no duplicates', async () => {
  const rows = [deck('z', 'ウィッチ'), deck('b', 'エルフ'), deck('a', 'ウィッチ'), ...SHADOWVERSE_CLASSES.filter(c => !['ウィッチ', 'エルフ'].includes(c)).map((c, i) => deck('other' + i, c))];
  const html = await render(rows);
  const labels = [...html.matchAll(/<h3[^>]*>(.*?)<\/h3>/g)].map(m => m[1]);
  assert.deepEqual(labels, SHADOWVERSE_CLASSES);
  assert.match(html, /2デッキ/);
  for (const c of SHADOWVERSE_CLASSES) assert.ok(decodeURIComponent(html).includes(encodeURIComponent(c)));
  const names = [...html.matchAll(/class="break-words text-sm font-semibold text-ink \[overflow-wrap:anywhere\]">(.*?)<\/div>/g)].map(m => m[1]);
  assert.deepEqual(names, SHADOWVERSE_CLASSES.flatMap(c => rows.filter(d => d.class_name === c).map(d => d.name)));
  assert.equal(new Set(names).size, rows.length);
});

test('deck management: zero decks retains guidance and proposal; empty classes absent; unknown/blank classes retained', async () => {
  const empty = await render([]);
  assert.match(empty, /標準デッキ一覧（0デッキ）/);
  assert.match(empty, /標準デッキがまだ登録されていません。/);
  assert.match(empty, /デッキ候補を申請/);
  assert.doesNotMatch(empty, /<h3/);
  const html = await render([deck('unknown1', '未来クラス'), deck('blank', ''), deck('known', 'ウィッチ'), deck('unknown2', '未来クラス')]);
  assert.deepEqual([...html.matchAll(/<h3[^>]*>(.*?)<\/h3>/g)].map(m => m[1]), ['ウィッチ', '未来クラス', 'クラス未設定']);
  assert.match(html, /標準デッキ一覧（4デッキ）/);
  assert.ok(html.indexOf('unknown1') < html.indexOf('unknown2'));
  assert.match(html, /blank/);
});

test('deck management: actual suggestion action preserves trimmed INSERT, member ID, pending status and invalidation', async () => {
  writes = []; invalidations = []; user = { id: 'member' };
  for (const memo of [' メモ ', '']) {
    const form = new FormData();
    for (const [k, v] of Object.entries({ class_name: ' ウィッチ ', suggested_name: ' 候補 ', memo })) form.set(k, v);
    await DeckSuggestionForm().props.action(form);
    assert.deepEqual(writes.at(-1), { table: 'deck_suggestions', data: { user_id: 'member', class_name: 'ウィッチ', suggested_name: '候補', memo: memo.trim() || null, status: 'pending' } });
  }
  assert.deepEqual(invalidations, ['/decks', '/decks']);
});

test('deck management: actual action refuses missing required values and unauthenticated submission', async () => {
  writes = []; invalidations = []; user = { id: 'member' };
  for (const values of [{}, { class_name: 'エルフ', suggested_name: ' ' }, { class_name: '', suggested_name: '候補' }]) {
    const form = new FormData();
    for (const [k, v] of Object.entries(values)) form.set(k, v);
    await createDeckSuggestion(form);
  }
  user = null;
  await assert.rejects(createDeckSuggestion(new FormData()), /redirect:\/login/);
  assert.deepEqual(writes, []); assert.deepEqual(invalidations, []);
});

test('deck management: exact UI revision only; all other product code, database and dependencies identical', () => {
  const cp = require('node:child_process'), fs = require('node:fs'), s = require('./deck-management-ux-scope.cjs');
  const git = (...args) => cp.execFileSync('git', args, { encoding: 'utf8' }).replaceAll('\r\n', '\n');
  const files = git('ls-tree', '-r', '--name-only', s.base).trim().split('\n').filter(f => /^(src|supabase)\//.test(f) || /^package(-lock)?\.json$/.test(f));
  for (const f of files) assert.equal(s.readBeforeDeckManagement(f), git('show', s.base + ':' + f), f);
  const selection = require('./deck-select-dialog-scope.cjs');
  const productFiles = git('ls-files', '--cached', '--others', '--exclude-standard', '--', 'src', 'supabase').trim().split('\n').filter(Boolean);
  assert.deepEqual(productFiles.sort(), [...files.filter(f => /^(src|supabase)\//.test(f)), ...selection.added].sort());
  for (const file of selection.added) { selection.assertReviewed(file); assert.equal(git('ls-tree', '--name-only', s.base, '--', file).trim(), ''); }
  assert.doesNotMatch(fs.readFileSync('src/app/decks/page.tsx', 'utf8'), /use client|useState|onToggle|fetch\(/);
});
