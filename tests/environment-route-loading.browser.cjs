/* eslint-disable @typescript-eslint/no-require-imports */
// Build with NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54329 and
// NEXT_PUBLIC_SUPABASE_ANON_KEY=test-public-key, then run this script.
// PLAYWRIGHT_MODULE / CHROME_EXECUTABLE can reuse installed browser tooling.
// --baseline records the old route fallback; the default asserts the fixed UX.
// Real Next streaming, navigation, API handlers and Server Actions; synthetic
// loopback Auth/data only. No remote service or database is contacted.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const { spawn } = require('node:child_process');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const { analysisFixture } = require('./analysis-browser-fixture.cjs');
const { periodFixture } = require('./period-report-fixture.cjs');
const baseline = process.argv.includes('--baseline');
const toastOnly = process.argv.includes('--toast-only');
const storageOnly = process.argv.includes('--storage-only');
const origin = 'http://localhost:3271', apiOrigin = 'http://127.0.0.1:54329';
const out = path.resolve(process.env.ROUTE_LOADING_OUTPUT || 'build/route-loading-final/browser', storageOnly ? 'storage' : toastOnly ? 'toast' : baseline ? 'before' : 'after');
const user = { id: 'fixture-member', aud: 'authenticated', role: 'authenticated', is_anonymous: false,
  email: 'fixture@example.test', app_metadata: {}, user_metadata: {} };
const environments = [1, 2].map(n => ({ id: `e1000000-0000-4000-8000-${String(n).padStart(12, '0')}`,
  name: `検証環境${n}`, created_at: `2026-09-0${3-n}`, allow_match_input: true,
  match_input_start_at: null, match_input_end_at: null }));
const decks = [{ id: 'A', name: 'デッキA', class_name: 'エルフ', is_active: true },
  { id: 'B', name: 'デッキB', class_name: 'ロイヤル', is_active: true }];
const report = { baseline, passed: false, navigation: [], toastOverlap: [], checks: [], errors: [], unexpected: [] };
let rpcGate, rpcCalls = 0, admin = false, anonymous = false, failure = null;
const calls = [], expectedErrors = [], savedRows = [], requestLog = [];
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
function gate() {
  let release;
  const promise = new Promise(resolve => { release = resolve; });
  return { promise, release, started: false };
}
async function until(check) {
  for (let i = 0; i < 200; i++) { if (await check()) return; await pause(50); }
  throw Error('Timed out waiting for local test condition');
}
function dashboard(args) {
  const end = Date.parse('2026-09-30T00:00:00Z');
  const span = { '24h': 1, '3d': 3, '7d': 7, '30d': 30 }[args.p_period] * 86400000;
  const period = t => ({ start: new Date(t-span).toISOString(), end: new Date(t).toISOString(),
    total: { status: 'no_data', totalMatches: null } });
  const metric = { encounter: { status: 'no_data', count: null },
    winrate: { status: 'no_data', targetRegistrations: null, evaluationCount: null, wins: null } };
  return { version: 2, period: args.p_period, rankFilters: args.p_rank_filters,
    environmentId: args.p_environment_id, aggregatedAt: '2026-09-30T00:14:00Z',
    dataThrough: new Date(end).toISOString(), current: period(end), previous: period(end-span),
    decks: [{ key: 'unclassified', name: '未分類', className: null, current: metric, previous: metric }] };
}
const api = http.createServer(async (req, res) => {
  res.setHeader('Content-Type', 'application/json');
  const url = new URL(req.url, apiOrigin);
  let body = ''; for await (const part of req) body += part;
  const args = body ? JSON.parse(body) : {};
  requestLog.push(req.method+' '+url.pathname);
  calls.push({ path: url.pathname, method: req.method, args });
  if (rpcGate && url.pathname === (rpcGate.path || '/rest/v1/rpc/get_environment_dashboard_aggregates_v2')) {
    rpcGate.started = true; await rpcGate.promise;
  }
  if (failure === url.pathname) { res.statusCode = 503; res.end(JSON.stringify({ message: 'Local route loading error fixture' })); return; }
  let data;
  if (url.pathname === '/rest/v1/rpc/get_environment_dashboard_aggregates_v2') {
    rpcCalls++;
    data = dashboard(args);
  } else if (url.pathname.startsWith('/rest/v1/rpc/get_analysis_aggregates_v')) {
    const rows = args.p_rank_filters?.length < 17 ? [] : [{ id: 'fixture-match', environment_id: environments[0].id, my_deck_id: 'A', opponent_deck_id: 'B',
      my_archetype_id: 'A', opponent_archetype_id: 'B', result: 'win', turn_order: 'first', played_at: '2026-09-30T01:00:00Z' }];
    data = analysisFixture(rows, args);
  }
  else if (url.pathname.startsWith('/rest/v1/rpc/get_matchup_aggregates_v')) data = { version: 1, totalMatches: 0, groups: [] };
  else if (url.pathname.startsWith('/rest/v1/rpc/get_period_report_aggregates_v')) data = periodFixture([], args);
  else if (url.pathname === '/rest/v1/rpc/get_home_dashboard') data = { summary: { total: 0, wins: 0, winRate: null, firstWinRate: null, secondWinRate: null }, recent: [] };
  else if (req.method === 'POST' && ['/rest/v1/matches', '/rest/v1/decks'].includes(url.pathname)) {
    if (url.pathname === '/rest/v1/matches') savedRows.push(args);
    res.statusCode = 201; data = {};
  }
  else if (!['GET', 'HEAD'].includes(req.method)) { report.unexpected.push(req.method+' '+url.pathname); res.statusCode = 405; data = {}; }
  else if (url.pathname === '/auth/v1/user') data = { ...user, is_anonymous: anonymous };
  else if (url.pathname === '/rest/v1/admin_users') data = admin ? { id: 'fixture-admin' } : null;
  else if (url.pathname === '/rest/v1/environments') data = url.searchParams.has('id')
    ? environments.find(e => 'eq.'+e.id === url.searchParams.get('id')) : environments;
  else if (['/rest/v1/decks', '/rest/v1/deck_archetypes'].includes(url.pathname)) {
    data = decks.filter(row => [...url.searchParams].every(([key, value]) => {
      if (!['id', 'name', 'class_name', 'is_active'].includes(key)) return true;
      if (value.startsWith('eq.')) return String(row[key]) === value.slice(3);
      if (value.startsWith('in.')) return value.slice(4, -1).split(',').map(v => v.replaceAll('"', '')).includes(row[key]);
      return true;
    }));
  }
  else if (['/rest/v1/matches', '/rest/v1/deck_archetype_aliases', '/rest/v1/deck_suggestions'].includes(url.pathname)) data = [];
  else { report.unexpected.push(req.method+' '+url.pathname); data = []; }
  res.end(JSON.stringify(data));
});

(async () => {
  fs.mkdirSync(out, { recursive: true });
  await new Promise(resolve => api.listen(54329, '127.0.0.1', resolve));
  const log = fs.openSync(path.join(out, 'server.log'), 'w');
  const app = spawn(process.execPath, [require.resolve('next/dist/bin/next'), 'start', '-p', '3271'], {
    windowsHide: true, stdio: ['ignore', log, log],
    env: { ...process.env, NEXT_PUBLIC_SUPABASE_URL: apiOrigin, NEXT_PUBLIC_SUPABASE_ANON_KEY: 'test-public-key', OPENAI_API_KEY: '', NEXT_TELEMETRY_DISABLED: '1' }
  });
  let browser, page;
  try {
    await until(async () => { try { return (await fetch(origin+'/privacy')).ok; } catch { return false; } });
    browser = await chromium.launch({ headless: true,
      ...(process.env.CHROME_EXECUTABLE ? { executablePath: process.env.CHROME_EXECUTABLE } : {}) });
    const token = ['eyJhbGciOiJIUzI1NiJ9', Buffer.from(JSON.stringify({ sub: user.id, exp: Math.floor(Date.now()/1000)+3600 })).toString('base64url'), 'fixture'].join('.');
    const session = { access_token: token, refresh_token: 'fixture', expires_at: Math.floor(Date.now()/1000)+3600, expires_in: 3600, token_type: 'bearer', user };
    async function newPage(width = 390) {
      const context = await browser.newContext({ viewport: { width, height: 844 } });
      await context.route('**/*', route => {
        const url = new URL(route.request().url());
        if (['localhost', '127.0.0.1'].includes(url.hostname)) return route.continue();
        report.unexpected.push(url.origin); return route.abort();
      });
      await context.addCookies([{ name: 'sb-127-auth-token', value: 'base64-'+Buffer.from(JSON.stringify(session)).toString('base64url'), url: origin }]);
      const p = await context.newPage();
      const recordError = message => {
        if (failure && /An error occurred in the Server Components render|Failed to load resource.*50[03]|環境データを取得できませんでした|デッキ分類を取得できませんでした/.test(message)) expectedErrors.push(message);
        else report.errors.push(message);
      };
      p.on('pageerror', e => recordError(e.message));
      p.on('console', m => { if (m.type() === 'error' || /hydration|#418/i.test(m.text())) recordError(m.text()); });
      return p;
    }
    const indicator = p => p.locator('[aria-busy="true"]').filter({ has: p.locator('.global-pending-bar') });
    const localPending = p => p.getByRole('status').filter({ hasText: '環境データを読み込み中' });
    async function settled(p) {
      await p.waitForLoadState('networkidle');
      await indicator(p).waitFor({ state: 'detached' });
      await localPending(p).waitFor({ state: 'detached' });
      assert.equal(await p.getByText('Application error', { exact: false }).count(), 0);
    }
    async function observe(p) {
      await p.evaluate(() => {
        window.routeEvidence = { fallback: false, sourceLost: false, global: false };
        const source = document.querySelector('main');
        window.routeObserver = new MutationObserver(() => {
          const e = window.routeEvidence;
          e.fallback ||= [...document.querySelectorAll('[role=status]')].some(n => n.textContent.includes('環境データを読み込み中'));
          e.global ||= !!document.querySelector('.global-pending-bar');
          if (!document.querySelector('select[name=environment]')) e.sourceLost ||= !source.isConnected;
        });
        window.routeObserver.observe(document.body, { subtree: true, childList: true, attributes: true });
        window.sourceMain = source;
      });
    }
    async function navigate(source, width = 390, toast = false, existingPage) {
      page = existingPage || await newPage(width);
      if (!existingPage) await page.goto(origin+source, { waitUntil: 'networkidle' });
      assert.equal(new URL(page.url()).pathname, source);
      assert.ok(await page.locator('h1').count());
      if (toast) {
        await page.locator('button[value=continue]').click();
        await page.getByText('戦績を保存しました', { exact: true }).waitFor();
      }
      const requests = [], commits = [];
      page.on('request', r => { const u = new URL(r.url()); if (u.pathname === '/environment' || u.pathname === '/api/environment') requests.push({ path: u.pathname, rsc: !!r.headers().rsc }); });
      page.on('framenavigated', f => { if (f === page.mainFrame()) commits.push(new URL(f.url()).pathname); });
      await observe(page);
      const before = rpcCalls;
      rpcGate = gate();
      const start = Date.now();
      await page.locator('header nav a[href="/environment"]').click();
      await until(() => rpcGate.started);
      // Hold the server-side RPC, not the browser's RSC response: Next is free
      // to stream its actual loading boundary. A network gate would hide the bug.
      await pause(700);
      const pending = { sourceRetained: await page.evaluate(() => window.sourceMain.isConnected),
        global: await indicator(page).isVisible(), fallback: await localPending(page).isVisible() };
      if (baseline) assert.equal(pending.fallback, true, 'baseline must reproduce the actual route fallback');
      else {
        assert.equal(pending.sourceRetained, true, 'source main stays mounted until data is ready');
        assert.equal(pending.global, true);
        assert.equal(pending.fallback, false);
        assert.equal(await indicator(page).count(), 1);
        assert.equal(await page.evaluate(() => getComputedStyle(document.querySelector('.global-pending-bar').parentElement.parentElement).pointerEvents), 'none');
        const link = page.locator('header nav a[href="/environment"]');
        assert.equal(await link.evaluate(e => { const r=e.getBoundingClientRect(); return e.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2)); }), true);
        assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth+1));
        if (toast) {
          const notice = page.getByText('戦績を保存しました', { exact: true });
          assert.equal(await notice.isVisible(), true);
          const n = await notice.boundingBox(), h = await page.locator('header').boundingBox();
          assert.ok(n.y >= h.y+h.height);
          const badge = await indicator(page).getByText('読み込み中', { exact: true }).boundingBox();
          if (!(n.y+n.height <= badge.y || badge.y+badge.height <= n.y)) report.toastOverlap.push({ width, toast: n, badge });
        }
      }
      await page.screenshot({ path: path.join(out, `pending-${source.replaceAll('/', '_')}-${width}${toast?'-toast':''}.png`) });
      rpcGate.release(); rpcGate = null;
      await page.getByRole('heading', { name: '環境データ', exact: true }).waitFor();
      const durationMs = Date.now()-start;
      await settled(page);
      assert.equal(await page.getByRole('heading', { name: '遭遇率TOP5', exact: true }).count(), 1);
      assert.equal(rpcCalls-before, 1);
      assert.deepEqual(requests, [{ path: '/environment', rsc: true }]);
      assert.deepEqual(commits, ['/environment']);
      const observed = await page.evaluate(() => { window.routeObserver.disconnect(); return window.routeEvidence; });
      if (!baseline) { assert.equal(observed.fallback, false); assert.equal(observed.sourceLost, false); assert.equal(observed.global, true); }
      report.navigation.push({ source, width, toast, durationMs, rpc: rpcCalls-before, requests, commits, pending, observed });
      console.log('navigation passed', source, width, toast ? 'toast' : '', durationMs+'ms');
      await page.context().close();
    }
    if (storageOnly) {
      decks[0].name = 'Rank UX '+decks[0].id;
      // Reuse the existing storage scenario assertions over captured HTTP inserts.
      // This adapter never executes SQL or connects to any database.
      const recordedInserts = { query: async (sql, [userId, environmentId]) => {
        const rows = savedRows.filter(row => row.user_id===userId && row.environment_id===environmentId);
        if (sql.startsWith('select count(*)::int n ')) return { rows: [{ n: rows.length }] };
        assert.ok(sql.startsWith('select rank_tier,master_group,grandmaster_rating,turn_order,result,my_archetype_id,opponent_archetype_id '), 'only the existing fixture assertion is supported');
        const row = rows.at(-1);
        return { rows: [Object.fromEntries(['rank_tier','master_group','grandmaster_rating','turn_order','result','my_archetype_id','opponent_archetype_id'].map(k => [k,row[k]]))] };
      } };
      await require('./match-entry-storage.browser.cjs').runStorageRegression({ browser, origin, session, environmentId: environments[0].id,
        archetypeId: decks[0].id, db: recordedInserts, calls: requestLog, output: out });
      assert.deepEqual(report.unexpected, []);
      report.checks.push('existing storage scenarios over recorded loopback HTTP inserts; no DB connection');
      report.passed = true;
      return;
    }
    if (toastOnly) {
      await require('./toast-navigation.browser.cjs').runToastRegression({ browser, origin, session, environmentId: environments[0].id, output: out });
      assert.deepEqual(report.unexpected, []);
      report.checks.push('existing Toast navigation regression with loopback-only Auth/Server Actions');
      report.passed = true;
      return;
    }
    // Fresh contexts ensure the router cache cannot conceal a route fallback.
    for (let i=0; i<3; i++) await navigate('/');
    await require('./route-navigation.browser.cjs').checkRouteNavigation({
      baseline, origin, out, report, newPage, calls, environments, indicator, settled,
      hold: pathname => { rpcGate = { ...gate(), path: pathname }; return rpcGate; },
      release: () => { rpcGate?.release(); rpcGate = null; },
      fail: pathname => { failure = pathname; }, expectedErrors
    });
    if (!baseline) {
      for (const source of ['/matches', '/analysis', '/matrix']) await navigate(source);
      for (const width of [320, 390, 430]) await navigate('/matches', width, true);
      page = await newPage();
      await page.goto(origin+'/environment', { waitUntil: 'networkidle' }); await settled(page);
      await page.reload({ waitUntil: 'networkidle' }); await settled(page);
      assert.equal(await page.getByRole('heading', { name: '環境データ', exact: true }).count(), 1);
      report.checks.push('direct access and reload: content, no hydration/console errors');
      async function filter(label, act, check) {
        const before = rpcCalls, requests = [];
        const listen = r => { if (new URL(r.url()).pathname.startsWith('/environment') || new URL(r.url()).pathname === '/api/environment') requests.push(new URL(r.url()).pathname); };
        page.on('request', listen); rpcGate = gate();
        await act(); await until(() => rpcGate.started); await pause(180);
        assert.equal(await localPending(page).isVisible(), true);
        assert.equal(await indicator(page).count(), 0);
        assert.equal(await page.getByRole('heading', { name: '環境データ', exact: true }).count(), 1);
        rpcGate.release(); rpcGate = null; await settled(page);
        assert.equal(rpcCalls-before, 1); assert.deepEqual(requests, ['/api/environment']);
        await check(); page.off('request', listen); report.checks.push('local pending only: '+label);
      }
      await filter('environment', () => page.locator('select[name=environment]').selectOption(environments[1].id),
        async () => assert.equal(new URL(page.url()).searchParams.get('environment'), environments[1].id));
      for (const period of ['24h', '3d', '7d', '30d']) await filter(period,
        () => page.locator('label').filter({ has: page.locator(`input[name=period][value="${period}"]`) }).click(),
        async () => assert.equal(new URL(page.url()).searchParams.get('period'), period));
      await page.locator('button[aria-haspopup=dialog]').click();
      await page.locator('dialog input[value=unranked]').click();
      await filter('rank Apply', () => page.getByRole('dialog').getByRole('button', { name: '適用', exact: true }).click(),
        async () => assert.ok(!new URL(page.url()).searchParams.get('ranks').split(',').includes('unranked')));
      await page.context().close();
      page = await newPage();
      await page.goto(origin+'/', { waitUntil: 'networkidle' });
      await page.locator('header nav a[href="/environment"]').click();
      await page.waitForURL(origin+'/environment'); await settled(page);
      await page.locator('header nav a[href="/analysis"]').click();
      await page.waitForURL(origin+'/analysis'); await settled(page);
      await page.goBack(); await page.waitForURL(origin+'/environment'); await settled(page);
      assert.equal(new URL(page.url()).pathname, '/environment');
      assert.equal(await page.getByRole('heading', { name: '環境データ', exact: true }).count(), 1);
      await page.goForward(); await page.waitForURL(origin+'/analysis'); await settled(page);
      assert.equal(new URL(page.url()).pathname, '/analysis');
      assert.equal(await page.getByRole('heading', { name: '分析', exact: true }).count(), 1);
      report.checks.push('home/environment/analysis/back/forward: URL, content, no stuck indicator');
      admin = true;
      for (const route of ['/admin', '/admin/weekly-report', '/guest']) {
        await page.goto(origin+route, { waitUntil: 'networkidle' }); await settled(page);
        assert.equal(new URL(page.url()).pathname, route); assert.ok(await page.locator('h1').count());
        report.checks.push('screen regression '+route);
      }
      // Period report has no environment link. Exercise its existing return
      // route into the shared navigation instead of inventing a product link.
      await page.goto(origin+'/admin/weekly-report', { waitUntil: 'networkidle' });
      assert.equal(await page.locator('a[href="/environment"]').count(), 0);
      await page.getByRole('link', { name: '通常画面へ', exact: true }).click();
      await page.waitForURL(origin+'/'); await settled(page);
      await navigate('/', 390, false, page);
      report.checks.push('period report → 通常画面へ → home navigation → environment');
      admin = false; anonymous = true; page = await newPage();
      await page.goto(origin+'/environment', { waitUntil: 'networkidle' });
      assert.equal(new URL(page.url()).pathname, '/login');
      await page.goto(origin+'/guest', { waitUntil: 'networkidle' });
      assert.equal(await page.getByRole('link', { name: '環境', exact: true }).count(), 0);
      report.checks.push('anonymous environment redirect and guest navigation');
      await page.context().close();
    }
    assert.deepEqual(report.errors, []); assert.deepEqual(report.unexpected, []);
    assert.deepEqual(report.toastOverlap, [], 'toast and pending badge do not overlap');
    report.passed = true;
  } catch (error) {
    report.failure = error.stack;
    if (page && !page.isClosed()) {
      report.failureUrl = page.url();
      report.failureText = await page.locator('body').innerText().catch(() => '');
      await page.screenshot({ path: path.join(out, 'failure.png') }).catch(() => {});
    }
    throw error;
  } finally {
    rpcGate?.release();
    fs.writeFileSync(path.join(out, 'result.json'), JSON.stringify(report, null, 2));
    if (browser) await browser.close();
    app.kill(); api.close(); fs.closeSync(log);
  }
  console.log(JSON.stringify({ passed: report.passed, checks: report.checks, navigation: report.navigation.length }));
})().catch(error => { console.error(error); process.exitCode = 1; });
