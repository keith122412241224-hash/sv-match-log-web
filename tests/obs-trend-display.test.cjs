/* eslint-disable @typescript-eslint/no-require-imports */
const { test } = require('node:test'), assert = require('node:assert/strict'), cp = require('node:child_process');
const React = require('react'), { renderToStaticMarkup: render } = require('react-dom/server');
require.extensions['.css'] = module => { module.exports = { __esModule: true, default: new Proxy({}, { get: (_, key) => String(key) }) }; };
const { ObsEnvironmentView } = require('../src/components/environment/ObsEnvironmentView');
const { parseEnvironmentDashboardV4, buildEnvironmentViewV4 } = require('../src/lib/environment-dashboard-v4');
const { RANK_PRESETS } = require('../src/lib/rank-selection');
const fixture = require('./obs-trend-display-fixture.cjs');
const scope = require('./obs-trend-display-scope.cjs');
const selection = { environment: fixture.environments[0].id, period: '7d', ranks: ['unranked'] };
const dataFor = (s = selection, mode) => parseEnvironmentDashboardV4(fixture.dashboard({ p_environment_id: s.environment, p_period: s.period, p_rank_filters: s.ranks }, mode), s);
const htmlFor = data => render(React.createElement(ObsEnvironmentView, { data, environmentName: '環境' }));
const section = (html, title) => html.match(new RegExp(`<section[^>]*aria-label="${title}"[^>]*>(.*?)</section>`))[1];

test('OBS trends show exact current encounter percentages/counts for every fixed period and rank preset', () => {
  for (const period of ['24h', '3d', '7d', '30d']) for (const preset of RANK_PRESETS) {
    const data = dataFor({ ...selection, period, ranks: preset.ranks }), view = buildEnvironmentViewV4(data);
    const html = htmlFor(data);
    for (const [title, rows] of [['増加TOP3', view.increases], ['減少TOP3', view.decreases]]) {
      const part = section(html, title), items = [...part.matchAll(/<li[^>]*>(.*?)<\/li>/g)].map(m => m[1]);
      assert.equal(items.length, 3);
      assert.match(part, /順位：遭遇率の前期間比 ／ 表示：当期の遭遇率・対戦数/);
      assert.doesNotMatch(part, /pt/);
      rows.forEach((row, i) => {
        assert.ok(items[i].includes(row.name));
        assert.ok(items[i].includes(`<strong>${row.encounterRate.toFixed(1)}%</strong>`));
        assert.ok(items[i].includes(`（${row.current.encounter.count.toLocaleString('ja-JP')}戦）`));
        assert.ok(!items[i].includes(`（${row.current.winrate.evaluationCount.toLocaleString('ja-JP')}戦）`));
        assert.ok(!items[i].includes(`（${row.previous.encounter.count.toLocaleString('ja-JP')}戦）`));
      });
    }
    assert.match(section(html, '増加TOP3'), /9\.2%<\/strong><small[^>]*>（1,831戦）/);
    assert.match(section(html, '減少TOP3'), /4\.2%<\/strong><small[^>]*>（830戦）/);
    assert.notEqual(Math.round(9.2 / 100 * 20000), 1831, 'counts cannot be reconstructed from rounded rates');
  }
});

test('OBS trends preserve delta selection, TOP3 cutoff and key tie order even when current-rate order differs', () => {
  const data = dataFor();
  data.decks.reverse();
  const before = structuredClone(data), view = buildEnvironmentViewV4(data), html = htmlFor(data);
  assert.deepEqual(view.increases.map(r => r.key), [10, 11, 12].map(fixture.id));
  assert.deepEqual(view.decreases.map(r => r.key), [14, 15, 16].map(fixture.id));
  assert.ok(view.increases[0].encounterRate < view.increases[1].encounterRate);
  assert.ok(view.decreases[0].encounterRate > view.decreases[1].encounterRate);
  for (const [title, rows] of [['増加TOP3', view.increases], ['減少TOP3', view.decreases]]) {
    const part = section(html, title);
    assert.deepEqual([...part.matchAll(/class="trendDeck">(.*?)<\/span>/g)].map(m => m[1]), rows.map(r => r.name));
  }
  assert.deepEqual(data, before, 'rendering must not mutate rankings or input');
});

test('OBS trends retain previous/current empty, insufficient sample and all-period behavior', () => {
  for (const [mode, message] of [['no_previous', '前の期間のデータがありません。'], ['no_current', '今の期間のデータがありません。'], ['insufficient', '比較できる']]) {
    const html = htmlFor(dataFor(selection, mode));
    for (const title of ['増加TOP3', '減少TOP3']) {
      const part = section(html, title);
      assert.ok(part.includes(message));
      assert.doesNotMatch(part, /<li|NaN|0\.0%|null戦/);
    }
  }
  const all = htmlFor(dataFor({ ...selection, period: 'all' }));
  assert.doesNotMatch(all, /増加TOP3|減少TOP3|前期間比/);
  assert.match(all, /遭遇率TOP5/); assert.match(all, /勝率TOP5/);
});

test('OBS display changes only two pinned presentation files; aggregation, TOP5, matrix, auth, SQL and dependencies stay unchanged', () => {
  const git = args => cp.execFileSync('git', args, { encoding: 'utf8', maxBuffer: 64e6 }).replaceAll('\r\n', '\n');
  const files = git(['ls-tree', '-r', '--name-only', scope.base]).trim().split('\n').filter(f => /^(src|supabase)\//.test(f) || /^package(-lock)?\.json$/.test(f));
  for (const file of files) assert.equal(scope.readBeforeObsTrendDisplay(file), git(['show', scope.base + ':' + file]), file);
  assert.deepEqual(git(['ls-files', '--cached', '--others', '--exclude-standard', '--', 'src', 'supabase']).trim().split('\n').sort(), [...files.filter(f => /^(src|supabase)\//.test(f)), ...require('./member-matrix-scope.cjs').added].sort());
  const file = 'src/components/environment/ObsEnvironmentView.tsx';
  const before = scope.readBeforeObsTrendDisplay(file), after = require('./obs-unified-scope.cjs').readBeforeUnified(file);
  assert.equal(before.split('          <h2>{title}<span>')[0], after.split('          <h2>{title}<span>')[0]);
  assert.equal(before.slice(before.indexOf('            : <p className={styles.empty}>')), after.slice(after.indexOf('            : <p className={styles.empty}>')));
});
