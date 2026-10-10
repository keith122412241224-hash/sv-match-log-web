/* eslint-disable @typescript-eslint/no-require-imports */
// Built local Next app -> simulated Auth/PostgREST transport -> real PGlite SQL.
const fs = require('node:fs'), path = require('node:path'), http = require('node:http'), assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const nativeFetch = globalThis.fetch;
require('./register.cjs'); globalThis.fetch = nativeFetch;
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || path.resolve('build/r1b-rank-compatibility/tools/node_modules/playwright'));
const h = require('./obs-matchups-db.cjs');
const { RANK_ATOMS } = require('../src/lib/rank-selection');
const { buildEnvironmentViewV4, parseEnvironmentDashboardV4 } = require('../src/lib/environment-dashboard-v4');
const { buildAnalysisFromAggregates, parseAnalysisAggregates } = require('../src/lib/analysis-aggregates');
const { periodFixture } = require('./period-report-fixture.cjs');
const origin = 'http://localhost:3298', out = path.resolve('build/dashboard-v4-browser');
fs.mkdirSync(out, { recursive: true });
const report = { checks: [], events: [], unexpected: [], requests: [], status: 'running' };
let stage = 'setup';
async function main() {
  const db = await h.createDb();
  let browser, app, api, log;
  try {
    await db.exec(h.read(h.migration));
    await db.exec(h.read('supabase/migrations/20261010042525_environment_dashboard_v4.sql'));
    const environments = h.environments.map(e => ({ ...e, dashboard_end_at: e.id === h.OLD ? '2026-09-29T08:00:00.000Z' : null }));
    environments.find(e => e.id === h.OLD).name = 'アズヴォルト・レヴナント（8/27〜）';
    await db.query('update public.environments set dashboard_end_at=$1 where id=$2', [environments[1].dashboard_end_at, h.OLD]);
    for (const version of [3, 4]) {
      const def = (await db.query(`select pg_get_functiondef('private.get_environment_dashboard_aggregates_v${version}(uuid,text,text[])'::regprocedure) as d`)).rows[0].d;
      await db.exec(def.replace('pg_catalog.statement_timestamp()', "timestamptz '2026-10-10T04:13:00Z'"));
    }
    const rows = [];
    for (const environment of [h.OLD, h.NEW]) for (let i = 0; i < 5; i++) for (let j = 0; j < 5; j++) for (const day of [1, 2, 5, 15, 32, 44]) {
      const end = Date.parse(environment === h.OLD ? '2026-09-29T08:00:00Z' : '2026-10-10T04:00:00Z');
      rows.push(h.row({ environment_id: environment, my_archetype_id: h.decks[i].id, opponent_archetype_id: h.decks[j].id,
        played_at: new Date(end - day * 86400000).toISOString(), result: (i + j + day) % 2 ? 'win' : 'lose' }));
    }
    rows.push(h.row({ environment_id: h.OLD, played_at: '2026-09-29T08:00:00Z' }));
    await h.seed(db, rows);
    const user = { id: h.ADMIN, aud: 'authenticated', role: 'authenticated', is_anonymous: false, email: 'local@example.test', app_metadata: {}, user_metadata: {} };
    let chain = Promise.resolve();
    api = http.createServer((req, res) => { chain = chain.then(async () => {
      try {
        const url = new URL(req.url, 'http://127.0.0.1:54339'), table = url.pathname.split('/').at(-1);
        let body = ''; for await (const part of req) body += part;
        const args = body ? JSON.parse(body) : null;
        let data;
        if (url.pathname.includes('/rpc/')) {
          report.requests.push({ name: table, args });
          if (table === 'get_environment_dashboard_aggregates_v4') data = (await db.query('select public.get_environment_dashboard_aggregates_v4($1,$2,$3) as data', [args.p_environment_id, args.p_period, args.p_rank_filters])).rows[0].data;
          else if (table === 'get_analysis_aggregates_v3_exclusive') data = await h.analysis(db, { environmentId: args.p_environment_id, current: { start: args.p_played_from, end: args.p_played_to }, rankFilters: args.p_rank_filters }, { combined: true });
          else if (table.startsWith('get_analysis_aggregates_')) data = { version: 1, registeredMatches: 0, perspectives: 0, totalWins: 0, groups: [], recent: [] };
          else if (table.startsWith('get_matchup_aggregates_')) data = { version: 1, totalMatches: 0, groups: [] };
          else if (table.startsWith('get_period_report_aggregates_')) data = periodFixture([], args);
          else if (table === 'get_home_dashboard') data = { summary: { total: 0, wins: 0, winRate: null, firstWinRate: null, secondWinRate: null }, recent: [] };
          else throw Error('Unexpected RPC ' + table);
        } else if (url.pathname === '/auth/v1/user') data = user;
        else if (!['GET', 'HEAD'].includes(req.method)) throw Error('Unexpected write ' + table);
        else if (table === 'admin_users') data = { id: h.ADMIN, user_id: h.ADMIN };
        else if (table === 'environments') data = environments;
        else if (['deck_archetypes', 'decks'].includes(table)) data = h.decks.map(d => ({ ...d, aliases: [] }));
        else if (['matches', 'my_decks', 'deck_suggestions', 'creator_images', 'creator_tier_works', 'creator_correlations', 'creator_saved_sets'].includes(table)) data = [];
        else throw Error('Unexpected read ' + url.pathname);
        res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(data));
      } catch (error) { report.unexpected.push(error.message); res.writeHead(500, { 'Content-Type': 'application/json' }); res.end('{}'); }
    }); });
    await new Promise(resolve => api.listen(54339, '127.0.0.1', resolve));
    log = fs.openSync(path.join(out, 'server.log'), 'w');
    app = spawn(process.execPath, [require.resolve('next/dist/bin/next'), 'start', '-p', '3298'], { windowsHide: true, stdio: ['ignore', log, log], env: { ...process.env, NEXT_PUBLIC_SUPABASE_URL: 'http://127.0.0.1:54339', NEXT_PUBLIC_SUPABASE_ANON_KEY: 'test-public-key', NEXT_TELEMETRY_DISABLED: '1', OPENAI_API_KEY: '' } });
    for (let i = 0; i < 100; i++) { try { if ((await fetch(origin + '/privacy')).ok) break; } catch {} await new Promise(r => setTimeout(r, 200)); }
    browser = await chromium.launch({ headless: true, ...(process.env.CHROME_EXECUTABLE ? { executablePath: process.env.CHROME_EXECUTABLE } : {}) });
    const context = await browser.newContext({ timezoneId: 'Asia/Tokyo' });
    await context.route('**/*', route => { const u = new URL(route.request().url()); if (['localhost', '127.0.0.1'].includes(u.hostname) || ['data:', 'blob:'].includes(u.protocol)) return route.continue(); report.unexpected.push('External request ' + u.origin); return route.abort(); });
    const exp = Math.floor(Date.now() / 1000) + 3600;
    const session = { access_token: ['eyJhbGciOiJIUzI1NiJ9', Buffer.from(JSON.stringify({ sub: user.id, exp })).toString('base64url'), 'fixture'].join('.'), refresh_token: 'fixture', expires_at: exp, expires_in: 3600, token_type: 'bearer', user };
    await context.addCookies([{ name: 'sb-127-auth-token', value: 'base64-' + Buffer.from(JSON.stringify(session)).toString('base64url'), url: origin }]);
    const page = await context.newPage();
    page.on('pageerror', error => report.events.push({ type: 'pageerror', message: error.message }));
    page.on('console', message => { if (['warning', 'error'].includes(message.type())) report.events.push({ type: message.type(), message: message.text() }); });
    const go = async route => { const response = await page.goto(origin + route, { waitUntil: 'networkidle' }); assert.equal(response.status(), 200, route); assert.deepEqual((await page.locator('main [role="alert"]').allTextContents()).filter(text => text.trim()), [], route); };
    const section = name => page.locator('section').filter({ has: page.getByRole('heading', { name, exact: true }) });
    const query = (env, period) => '?' + new URLSearchParams({ environment: env, ...(period ? { period } : {}), ranks: RANK_ATOMS.join(',') });
    stage = 'responsive Environment/OBS real SQL';
    for (const width of [1920, 1440, 390, 320]) for (const period of ['all', '7d']) {
      await page.setViewportSize({ width, height: 1080 });
      const args = { environment: h.OLD, period, ranks: RANK_ATOMS };
      const raw = (await db.query('select public.get_environment_dashboard_aggregates_v4($1,$2,$3) as data', [h.OLD, period, RANK_ATOMS])).rows[0].data;
      const data = parseEnvironmentDashboardV4(raw, args), view = buildEnvironmentViewV4(data);
      const aggregates = await h.analysis(db, data, { combined: true });
      const decks = view.encounters.map(d => ({ id: d.key, name: d.name, class_name: d.className }));
      const matrix = buildAnalysisFromAggregates(parseAnalysisAggregates(aggregates, []), decks, decks).matrix;
      for (const route of ['/environment', '/admin/obs/environment']) {
        await go(route + query(h.OLD, period));
        const text = await page.locator('main').innerText();
        assert.ok(text.includes('2026/09/29') && text.includes('17:00'));
        assert.equal(text.includes('増加TOP3'), period !== 'all'); assert.equal(text.includes('減少TOP3'), period !== 'all');
        if (period === 'all') assert.ok(text.includes('環境全期間'));
        const total = data.current.total.totalMatches;
        assert.ok(route === '/environment' ? text.includes(`登録戦績：${total}件`) : text.includes(String(total)));
        for (const [title, expected] of [['遭遇率TOP5', view.encounters], ['勝率TOP5', view.wins]]) {
          const shown = await section(title).locator('li').allTextContents();
          assert.equal(shown.length, expected.length);
          expected.forEach((row, i) => { assert.ok(shown[i].includes(row.name)); assert.ok(shown[i].includes((title === '遭遇率TOP5' ? row.encounterRate : row.winRate).toFixed(1) + '%')); });
        }
        if (route.includes('/obs/')) {
          const table = page.getByRole('table', { name: '遭遇率TOP5の相性表' });
          assert.equal(await table.locator('tbody td').count(), 25);
          for (const row of matrix) for (const cell of row.cells) {
            const element = table.locator(`[data-row="${cell.myDeckId}"][data-column="${cell.opponentDeckId}"]`);
            assert.equal(await element.locator('strong').innerText(), cell.myDeckId === cell.opponentDeckId ? '—' : cell.winRate.toFixed(1) + '%');
          }
          const latest = report.requests.filter(r => r.name === 'get_analysis_aggregates_v3_exclusive').at(-1).args;
          assert.equal(latest.p_played_from, data.current.start); assert.equal(latest.p_played_to, data.current.end);
        } else {
          assert.equal(await section('デッキ別データ').locator('thead th').count(), period === 'all' ? 4 : 5);
        }
        assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'horizontal overflow');
        assert.deepEqual(report.events, []); assert.deepEqual(report.unexpected, []);
        await page.screenshot({ path: path.join(out, `${route.includes('/obs/') ? 'obs' : 'environment'}-${period}-${width}.png`), fullPage: true });
      }
      report.checks.push(`Environment/OBS ${period} ${width}px: counts, rankings, 25 cells, no trends for all, no overflow/errors`);
    }
    stage = 'selection, API, ranks and defaults';
    await go('/environment' + query(h.OLD));
    assert.equal(await page.locator('input[name=period]:checked').inputValue(), 'all');
    await page.getByText('3日', { exact: true }).click();
    await page.getByText('環境データを読み込み中…').waitFor({ state: 'hidden' });
    assert.equal(new URL(page.url()).searchParams.get('period'), '3d');
    await page.locator('select[name=environment]').selectOption(h.NEW);
    await page.getByText('環境データを読み込み中…').waitFor({ state: 'hidden' });
    assert.equal(await page.locator('input[name=period]:checked').inputValue(), '3d');
    await go('/environment' + query(h.NEW)); assert.equal(await page.locator('input[name=period]:checked').inputValue(), '7d');
    for (const period of ['24h', '3d', '7d', '30d', 'all']) for (const rankQuery of [{ rank: 'grandmaster' }, { ranks: 'unranked,master:ruby' }]) {
      const response = await context.request.get(origin + '/api/environment?' + new URLSearchParams({ environment: h.OLD, period, ...rankQuery }));
      assert.equal(response.status(), 200); assert.equal(response.headers()['cache-control'], 'private, no-store');
      const data = await response.json(); assert.equal(data.version, 4); assert.equal(data.period, period);
    }
    report.checks.push('Ended default all/current default 7d; explicit period survives environment switch; five periods and legacy/new rank URLs work');
    stage = 'main route smoke';
    for (const route of ['/', '/analysis', '/matrix', '/admin/weekly-report', '/matches', '/admin', '/admin?section=tools', '/admin/creator', '/admin/creator/tier']) {
      await go(route); report.checks.push(`Route rendered: ${route}`);
      assert.deepEqual(report.events, []); assert.deepEqual(report.unexpected, []);
    }
    await go('/admin'); assert.equal(await page.locator('input[name="dashboard_end_at_' + h.OLD + '"]').inputValue(), '2026-09-29T17:00');
    report.status = 'passed';
  } finally {
    await browser?.close(); app?.kill(); if (api?.listening) await new Promise(resolve => api.close(resolve)); await db.close(); if (log !== undefined) fs.closeSync(log);
  }
}
main().catch(error => { report.status = 'failed'; report.stage = stage; report.error = error.stack; process.exitCode = 1; }).finally(() => {
  fs.writeFileSync(path.join(out, 'report.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ ...report, requests: report.requests.length }, null, 2));
});
