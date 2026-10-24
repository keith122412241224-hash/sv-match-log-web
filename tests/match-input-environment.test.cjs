/* eslint-disable @typescript-eslint/no-require-imports */
const { test } = require('node:test'), assert = require('node:assert/strict');
const React = require('react'), { renderToStaticMarkup: render } = require('react-dom/server');
const navigation = require.resolve('next/navigation');
require.cache[navigation] = { id: navigation, filename: navigation, loaded: true, exports: { useRouter: () => ({ refresh() {} }) } };
const { QuickMatchForm } = require('../src/components/matches/QuickMatchForm');
const { ScheduledMatchForm } = require('../src/components/matches/ScheduledMatchForm');
const now = Date.parse('2026-10-24T00:00:00Z');
const env = (id, overrides = {}) => ({ id, name: '環境 ' + id, created_at: '2026-10-01T00:00:00Z', allow_match_input: true, ...overrides });
const props = { decks: [{ id: 'deck', name: 'デッキ', class_name: 'エルフ' }], archetypes: [], serverNow: now };
const html = environments => render(React.createElement(ScheduledMatchForm, { ...props, environments }));

test('fixed input environment uses latest created input-enabled environment, never future/closed or start-date ordering', () => {
  const rows = [env('future', { created_at: '2026-10-23T00:00:00Z', match_input_start_at: '2026-10-25T00:00:00Z' }),
    env('stopped', { created_at: '2026-10-22T00:00:00Z', allow_match_input: false }),
    env('old'), env('current', { created_at: '2026-10-02T00:00:00Z', start_date: '2020-01-01' })];
  const output = html(rows);
  assert.match(output, /type="hidden"[^>]*value="current"/);
  assert.match(output, /aria-label="環境">環境 current<\/p>/);
  assert.doesNotMatch(output, /<select|前回選択は|未入力でも保存できます|aria-describedby/);
  assert.match(output, /name="rank_tier" value=""/);
  assert.equal(html(rows), html([...rows].reverse()));
});

test('input boundaries remain start-inclusive and end-exclusive, with no fallback to disabled environments', () => {
  const rows = [env('old', { match_input_end_at: new Date(now).toISOString() }), env('new', { match_input_start_at: new Date(now).toISOString() })];
  assert.match(html(rows), /name="environment_id"[^>]*value="new"/);
  for (const rows of [[], [env('stopped', { allow_match_input: false })], [env('future', { match_input_start_at: '2026-10-25T00:00:00Z' })]]) {
    assert.match(html(rows), /入力できる環境がありません/);
    assert.doesNotMatch(html(rows), /name="environment_id"|type="submit"/);
  }
});

test('editor keeps original environment, including stopped/missing environments, never substitutes latest ID', () => {
  const match = { environment_id: 'old', my_deck_id: 'deck', opponent_deck_id: 'deck', result: 'win', turn_order: 'first' };
  for (const rows of [[env('old'), env('new', { created_at: '2026-10-02T00:00:00Z' })], [env('old', { allow_match_input: false })], []]) {
    const output = render(React.createElement(QuickMatchForm, { ...props, environments: rows, initialMatch: match }));
    assert.match(output, /name="environment_id"[^>]*value="old"/);
    assert.doesNotMatch(output, /<select/);
    if (!rows.length) assert.match(output, /環境を取得できません/);
    if (!rows.length || !rows[0].allow_match_input) assert.match(output, /管理者による入力再開が必要/);
  }
});

test('match input scope pins five UI files; APIs, DB, RLS, aggregation, preferences and all other source bytes unchanged', () => {
  const s = require('./match-input-environment-scope.cjs');
  assert.deepEqual(Object.keys(s.hashes).sort(), ['src/app/matches/page.tsx', 'src/components/matches/QuickMatchForm.tsx', 'src/components/matches/RankFields.tsx', 'src/components/matches/ScheduledMatchForm.tsx', 'src/components/guest/GuestApp.tsx'].sort());
  Object.keys(s.hashes).forEach(s.assertReviewed);
  const files = s.git('ls-tree', '-r', '--name-only', s.base).trim().split('\n').filter(f => /^(src|supabase)\//.test(f) || /^package(-lock)?\.json$/.test(f));
  for (const f of files) assert.equal(s.readBeforeMatchInput(f), s.git('show', s.base + ':' + f), f);
  assert.deepEqual(s.git('ls-files', '--cached', '--others', '--exclude-standard', '--', 'src', 'supabase').trim().split('\n').sort(), files.filter(f => /^(src|supabase)\//.test(f)).sort());
  assert.doesNotMatch(s.read('src/components/matches/QuickMatchForm.tsx'), /last-environment-id|setEnvironmentId/);
  for (const file of ['src/components/matches/QuickMatchForm.tsx', 'src/components/guest/GuestApp.tsx']) {
    assert.doesNotMatch(s.read(file), /isEnvironmentInputEnabled|Date\.now\(/, 'save acceptance must not use device time');
  }
});

test('server-derived input candidates ignore all seven device clocks at each exact boundary', () => {
  const original = Date.now;
  const rows = [env('old', { match_input_end_at: new Date(now).toISOString() }), env('new', { match_input_start_at: new Date(now).toISOString() })];
  try {
    for (const skew of [0, 600000, -600000, 3600000, -3600000, 86400000, -86400000]) {
      Date.now = () => now + skew;
      for (const delta of [-1, 0, 1]) {
        const output = render(React.createElement(ScheduledMatchForm, { ...props, serverNow: now + delta, environments: rows }));
        assert.match(output, new RegExp('name="environment_id"[^>]*value="' + (delta < 0 ? 'old' : 'new') + '"'));
      }
    }
  } finally { Date.now = original; }
});
