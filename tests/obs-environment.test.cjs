/* eslint-disable @typescript-eslint/no-require-imports */
const { test } = require('node:test'), assert = require('node:assert/strict');
const React = require('react'), { renderToStaticMarkup: render } = require('react-dom/server');
require.extensions['.css'] = module => { module.exports = new Proxy({}, { get: (_, key) => String(key) }); };
const { getAdminNavigation } = require('../src/lib/admin-navigation');
const { dashboard, environments, decks } = require('./obs-environment-fixture.cjs');
const { parseEnvironmentDashboardV3, buildEnvironmentViewV3 } = require('../src/lib/environment-dashboard-v3');
const { environmentHrefV2 } = require('../src/lib/environment-dashboard-v2');
const { parseRankSelection, RANK_PRESETS } = require('../src/lib/rank-selection');
const { ObsEnvironmentView } = require('../src/components/environment/ObsEnvironmentView');
const { EnvironmentData } = require('../src/components/environment/EnvironmentData');
const { ObsEnvironmentSettings } = require('../src/components/admin/ObsEnvironmentSettings');

test('admin navigation preserves existing filters and action redirect destinations', () => {
  assert.deepEqual(getAdminNavigation({}), { section: 'environments', deckSection: 'list' });
  for (const notice of ['environment_created', 'environments_updated', 'environment_delete_failed', 'environment_create_failed']) assert.equal(getAdminNavigation({ notice }).section, 'environments');
  for (const notice of ['created', 'create_failed']) assert.deepEqual(getAdminNavigation({ notice }), { section: 'decks', deckSection: 'create' });
  for (const notice of ['suggestion_updated', 'suggestion_approved', 'suggestion_status_after_approve_failed']) assert.deepEqual(getAdminNavigation({ notice }), { section: 'decks', deckSection: 'suggestions' });
  for (const notice of ['updated', 'batch_updated', 'deactivated', 'batch_update_failed']) assert.deepEqual(getAdminNavigation({ notice }), { section: 'decks', deckSection: 'list' });
  for (const params of [{ q: '' }, { class: 'エルフ' }, { active: 'inactive' }]) assert.equal(getAdminNavigation(params).section, 'decks');
  assert.equal(getAdminNavigation({ section: 'tools' }).section, 'tools');
  assert.equal(getAdminNavigation({ section: 'invalid' }).section, 'environments');
});

test('OBS uses the same URL rank encoding and v3 result for every period/preset', () => {
  for (const period of ['24h', '3d', '7d', '30d']) for (const preset of RANK_PRESETS) {
    const selection = { environment: environments[0].id, period, ranks: preset.ranks };
    const href = '/admin/obs' + environmentHrefV2(selection);
    const params = Object.fromEntries(new URL(href, 'http://localhost').searchParams);
    assert.deepEqual(parseRankSelection(params), [...preset.ranks]);
    const data = parseEnvironmentDashboardV3(dashboard({ p_environment_id: params.environment, p_period: params.period, p_rank_filters: parseRankSelection(params) }), selection);
    const obs = render(React.createElement(ObsEnvironmentView, { data, environmentName: environments[0].name }));
    const normal = render(React.createElement(EnvironmentData, { data, activeDeckIds: decks.map(d => d.id) }));
    const view = buildEnvironmentViewV3(data);
    for (const [title, rows] of [['遭遇率TOP5', view.encounters], ['勝率TOP5', view.wins], ['増加TOP3', view.increases], ['減少TOP3', view.decreases]]) {
      const a = obs.match(new RegExp(`<section[^>]*aria-label="${title}"[^>]*>(.*?)</section>`))[1];
      const b = normal.match(new RegExp(`<h2[^>]*>${title}</h2>(.*?)</section>`))[1];
      let last = -1;
      for (const row of rows) { assert.ok(a.indexOf(row.name) > last); last = a.indexOf(row.name); assert.ok(b.includes(row.name)); }
      const field = title === '遭遇率TOP5' ? 'encounterRate' : title === '勝率TOP5' ? 'winRate' : null;
      if (field) for (const row of rows) { const pct = row[field].toFixed(1) + '%'; assert.ok(a.includes(pct)); assert.ok(b.includes(pct)); }
    }
    assert.match(obs, /800<small>戦/); assert.match(normal, /登録戦績：800件/);
    assert.doesNotMatch(obs, /<form|<button|<input|<nav|対象戦績数|登録800件/);
  }
});

test('OBS empty state, custom rate labels and settings provide honest session/update instructions', () => {
  const data = dashboard({ p_environment_id: environments[0].id, p_period: '7d', p_rank_filters: ['grandmaster:epic'] }, 'empty');
  const html = render(React.createElement(ObsEnvironmentView, { data, environmentName: '環境' }));
  assert.match(html, /GrandMaster \/ EPIC/); assert.match(html, /データなし/); assert.match(html, /前の期間のデータがありません/); assert.doesNotMatch(html, /0\.0%/);
  const settings = render(React.createElement(ObsEnvironmentSettings, { environments, initialEnvironment: environments[0].id }));
  assert.match(settings, /\/admin\/obs\/environment\?/); assert.match(settings, /ログイン状態を共有しません/); assert.match(settings, /再読み込み/);
});

test('OBS page denies unsigned/member access before aggregation and handles invalid filters/errors', async () => {
  let user = null, admin = false, fail = false, calls = [];
  const mock = (file, exports) => { const id = require.resolve(file); require.cache[id] = { id, filename: id, loaded: true, exports }; };
  mock('next/navigation', { redirect: href => { throw Error('REDIRECT:' + href); } });
  mock('../src/lib/data', { getCurrentUser: async () => user, getIsAdmin: async () => admin, getEnvironments: async () => environments });
  mock('../src/lib/environment-dashboard-data', { getEnvironmentDashboard: async s => { calls.push(s); if (fail) throw Error('down'); return dashboard({ p_environment_id: s.environment, p_period: s.period, p_rank_filters: s.ranks }); } });
  const page = require('../src/app/admin/obs/environment/page').default;
  const open = params => page({ searchParams: Promise.resolve(params) });
  await assert.rejects(() => open({}), /REDIRECT:\/login/);
  user = { is_anonymous: true }; await assert.rejects(() => open({}), /REDIRECT:\/login/);
  user = { is_anonymous: false }; await assert.rejects(() => open({}), /REDIRECT:\//); assert.equal(calls.length, 0);
  admin = true;
  assert.match(render(await open({ ranks: 'bad' })), /条件が不正/); assert.equal(calls.length, 0);
  const result = await open({ period: '3d', rank: 'master' });
  assert.equal(result.type, ObsEnvironmentView); assert.equal(calls.length, 1); assert.equal(calls[0].period, '3d'); assert.equal(calls[0].environment, environments[0].id);
  fail = true; assert.match(render(await open({})), /取得できませんでした/);
  await assert.rejects(() => open({ period: 'bad' }), /REDIRECT:\/admin\/obs\/environment\?/);
});
