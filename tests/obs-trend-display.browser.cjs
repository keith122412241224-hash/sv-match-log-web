/* eslint-disable @typescript-eslint/no-require-imports */
// Build with localhost Supabase URL/key as in obs-environment.browser.cjs.
// Production component, route, parser and loader; synthetic localhost HTTP data.
const fs = require('node:fs'), path = require('node:path'), http = require('node:http'), assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const nativeFetch = globalThis.fetch; require('./register.cjs'); globalThis.fetch = nativeFetch;
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const fixture = require('./obs-trend-display-fixture.cjs');
const { aggregates } = require('./obs-matchups-fixture.cjs');
const { parseEnvironmentDashboardV4, buildEnvironmentViewV4 } = require('../src/lib/environment-dashboard-v4');
const { buildAnalysisFromAggregates, parseAnalysisAggregates } = require('../src/lib/analysis-aggregates');
const origin = 'http://localhost:3299', out = path.resolve('build/obs-trend-display');
const report = { localOnly: true, data: 'synthetic localhost HTTP fixtures', checks: [], events: [], unexpected: [], rpc: [] };
let mode = 'full', currentData;
const user = { id: fixture.id(90), aud: 'authenticated', role: 'authenticated', is_anonymous: false, email: 'fixture@example.test', app_metadata: {}, user_metadata: {} };
const api = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://127.0.0.1:54339'), table = url.pathname.split('/').at(-1);
    let body = ''; for await (const part of req) body += part;
    const args = body ? JSON.parse(body) : null;
    let data;
    if (url.pathname.includes('/rpc/')) {
      report.rpc.push({ name: table, args });
      if (table === 'get_environment_dashboard_aggregates_v4') {
        data = fixture.dashboard(args, mode);
        currentData = parseEnvironmentDashboardV4(data, { environment: args.p_environment_id, period: args.p_period, ranks: args.p_rank_filters });
      } else if (table === 'get_analysis_aggregates_v3_exclusive') {
        assert.equal(args.p_environment_id, currentData.environmentId);
        assert.equal(args.p_played_from, currentData.current.start);
        assert.equal(args.p_played_to, currentData.current.end);
        assert.deepEqual(args.p_rank_filters, currentData.rankFilters);
        data = aggregates();
      } else throw Error('Unexpected RPC: ' + table);
    } else {
      assert.ok(['GET', 'HEAD'].includes(req.method), 'read-only browser verification');
      if (url.pathname === '/auth/v1/user') data = user;
      else if (table === 'admin_users') data = { id: fixture.id(91), user_id: user.id };
      else if (table === 'environments') data = fixture.environments;
      else throw Error('Unexpected read: ' + table);
    }
    res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(data));
  } catch (error) { report.unexpected.push(error.message); res.writeHead(500); res.end('{}'); }
});
async function main() {
  fs.mkdirSync(out, { recursive: true });
  await new Promise(resolve => api.listen(54339, '127.0.0.1', resolve));
  const log = fs.openSync(path.join(out, 'browser-server.log'), 'w');
  const app = spawn(process.execPath, [require.resolve('next/dist/bin/next'), 'start', '-p', '3299'], {
    windowsHide: true, stdio: ['ignore', log, log], env: { ...process.env, NEXT_TELEMETRY_DISABLED: '1', NEXT_PUBLIC_SUPABASE_URL: 'http://127.0.0.1:54339', NEXT_PUBLIC_SUPABASE_ANON_KEY: 'test-public-key', OPENAI_API_KEY: '' }
  });
  let browser;
  try {
    let ready = false;
    for (let i = 0; i < 100; i++) {
      try { if ((await fetch(origin + '/privacy')).ok) { ready = true; break; } } catch {}
      await new Promise(resolve => setTimeout(resolve, 200));
    }
    assert.ok(ready, 'local Next server ready');
    browser = await chromium.launch({ headless: true, ...(process.env.CHROME_EXECUTABLE ? { executablePath: process.env.CHROME_EXECUTABLE } : {}) });
    report.browser = { version: browser.version(), executable: process.env.CHROME_EXECUTABLE || 'Chromium' };
    const context = await browser.newContext({ viewport: { width: 1152, height: 1080 }, timezoneId: 'Asia/Tokyo' });
    await context.route('**/*', route => {
      const u = new URL(route.request().url());
      if (['localhost', '127.0.0.1'].includes(u.hostname) || ['data:', 'blob:'].includes(u.protocol)) return route.continue();
      report.unexpected.push('External request ' + u.origin); return route.abort();
    });
    const exp = Math.floor(Date.now() / 1000) + 3600;
    const session = { access_token: ['eyJhbGciOiJIUzI1NiJ9', Buffer.from(JSON.stringify({ sub: user.id, exp })).toString('base64url'), 'fixture'].join('.'), refresh_token: 'fixture', expires_at: exp, expires_in: 3600, token_type: 'bearer', user };
    await context.addCookies([{ name: 'sb-127-auth-token', value: 'base64-' + Buffer.from(JSON.stringify(session)).toString('base64url'), url: origin }]);
    const page = await context.newPage();
    page.on('pageerror', error => report.events.push(error.message));
    page.on('console', message => { if (['error', 'warning'].includes(message.type())) report.events.push(message.text()); });
    const section = name => page.getByRole('region', { name, exact: true });
    const go = async (period = '7d', ranks = 'unranked') => {
      const response = await page.goto(origin + '/admin/obs/environment?' + new URLSearchParams({ environment: fixture.environments[0].id, period, ranks }), { waitUntil: 'networkidle' });
      assert.equal(response.status(), 200);
      assert.equal(await page.locator('main [role=alert]').count(), 0);
    };
    const verify = async () => {
      const view = buildEnvironmentViewV4(currentData);
      for (const [title, rows, field] of [['遭遇率TOP5', view.encounters, 'encounterRate'], ['勝率TOP5', view.wins, 'winRate'], ['増加TOP3', view.increases, 'encounterRate'], ['減少TOP3', view.decreases, 'encounterRate']]) {
        if (!currentData.previous && title.endsWith('TOP3')) { assert.equal(await section(title).count(), 0); continue; }
        const items = section(title).locator('li');
        assert.equal(await items.count(), rows.length);
        for (const [i, row] of rows.entries()) {
          assert.ok((await items.nth(i).innerText()).includes(row.name));
          assert.equal(await items.nth(i).locator('strong').innerText(), row[field].toFixed(1) + '%');
          const count = title === '勝率TOP5' ? `対象戦績 ${row.current.winrate.evaluationCount.toLocaleString('ja-JP')}戦` : title === '遭遇率TOP5' ? `${row.current.encounter.count.toLocaleString('ja-JP')}戦 / 全20,000戦` : `（${row.current.encounter.count.toLocaleString('ja-JP')}戦）`;
          assert.ok((await items.nth(i).innerText()).includes(count));
        }
        if (title.endsWith('TOP3')) assert.ok(!(await section(title).innerText()).includes('pt'));
      }
      const decks = view.encounters.map(row => ({ id: row.key, name: row.name, class_name: row.className }));
      const matrix = buildAnalysisFromAggregates(parseAnalysisAggregates(aggregates(), []), decks, decks).matrix;
      const table = page.getByRole('table', { name: '遭遇率TOP5の相性表' });
      assert.equal(await table.locator('tbody td').count(), 25);
      assert.deepEqual(await table.locator('tbody th').allTextContents(), decks.map(deck => deck.name));
      for (const row of matrix) for (const cell of row.cells) {
        const element = table.locator(`[data-row="${cell.myDeckId}"][data-column="${cell.opponentDeckId}"]`);
        assert.equal(await element.locator('strong').innerText(), cell.myDeckId === cell.opponentDeckId ? '—' : cell.winRate === null ? '—' : cell.winRate.toFixed(1) + '%');
      }
    };
    const layout = async (width, name) => {
      await page.setViewportSize({ width, height: 1080 });
      const dimensions = await page.locator('main').evaluate(main => ({
        width: innerWidth, scrollWidth: document.documentElement.scrollWidth,
        panelBottom: main.firstElementChild.getBoundingClientRect().bottom,
        escaped: [...main.querySelectorAll('section,li,strong,small')].filter(el => {
          const rect = el.getBoundingClientRect(); return rect.width && (rect.left < -1 || rect.right > innerWidth + 1);
        }).map(el => el.textContent)
      }));
      assert.ok(dimensions.scrollWidth <= width, `${name} page overflow`);
      assert.deepEqual(dimensions.escaped, [], `${name} child overflow`);
      if (name === 'full' && width >= 1056) assert.ok(dimensions.panelBottom <= 1080, 'OBS upper panel retains 1080px fit');
      report.checks.push({ mode: name, ...dimensions });
      await page.screenshot({ path: path.join(out, `obs-${name}-${width}.png`), fullPage: true });
    };
    await go(); await verify();
    assert.deepEqual(await section('増加TOP3').locator('li > span:first-child').allTextContents(), currentData.decks.slice(0, 3).map(d => d.name));
    assert.deepEqual(await section('減少TOP3').locator('li > span:first-child').allTextContents(), currentData.decks.slice(4, 7).map(d => d.name));
    for (const width of [1920, 1440, 1248, 1152, 1056, 768, 759, 390, 320]) await layout(width, 'full');
    for (const [title, color] of [['増加TOP3', 'rgb(121, 228, 177)'], ['減少TOP3', 'rgb(155, 188, 255)']]) {
      assert.equal(await section(title).locator('strong').first().evaluate(el => getComputedStyle(el).color), color);
      assert.ok(await section(title).locator('li').first().evaluate(el => parseFloat(getComputedStyle(el.querySelector('strong')).fontSize) > parseFloat(getComputedStyle(el.querySelector('small')).fontSize)));
    }
    for (const period of ['24h', '3d', '30d', 'all']) { await go(period, 'master:ruby,grandmaster:epic'); await verify(); report.checks.push(`Period/ranks ${period}: exact values, order and matrix`); }
    await layout(1152, 'all');
    mode = 'long'; await go(); await verify();
    for (const width of [1152, 1056, 768, 390, 320]) await layout(width, 'long');
    for (const [state, message] of [['no_previous', '前の期間のデータがありません。'], ['no_current', '今の期間のデータがありません。'], ['insufficient', '比較できる']]) {
      mode = state; await go();
      for (const title of ['増加TOP3', '減少TOP3']) {
        assert.equal(await section(title).locator('li').count(), 0);
        assert.ok((await section(title).innerText()).includes(message));
      }
      await layout(1152, state);
    }
    assert.deepEqual(report.events, []); assert.deepEqual(report.unexpected, []);
    report.status = 'passed';
  } finally {
    await browser?.close(); app.kill(); await new Promise(resolve => api.close(resolve)); fs.closeSync(log);
  }
}
main().catch(error => { report.status = 'failed'; report.error = error.stack; process.exitCode = 1; }).finally(() => {
  fs.writeFileSync(path.join(out, 'browser-report.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ ...report, rpc: report.rpc.length }, null, 2));
});
