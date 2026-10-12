/* eslint-disable @typescript-eslint/no-require-imports */
// Build with NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54339 and
// NEXT_PUBLIC_SUPABASE_ANON_KEY=test-public-key. Uses only in-memory HTTP fixtures.
const http = require('node:http'), fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const nativeFetch = globalThis.fetch;
require('./register.cjs'); globalThis.fetch = nativeFetch;
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || path.resolve('build/r1b-rank-compatibility/tools/node_modules/playwright'));
const fixture = require('./environment-dashboard-v4-fixture.cjs');
const { periodFixture } = require('./period-report-fixture.cjs');
const { aggregates } = require('./obs-matchups-fixture.cjs');
const origin = 'http://localhost:3299', out = path.resolve('build/admin-tools-evidence');
fs.mkdirSync(out, { recursive: true });
const report = { checks: [], events: [], unexpected: [], rpc: [], mutations: [], browsers: [] };
const environments = [...structuredClone(fixture.environments), { ...fixture.environments[0], id: fixture.id(2), name: '以前の環境', created_at: '2026-09-01T00:00:00Z' }];
const decks = structuredClone(fixture.decks);
const user = { id: fixture.id(90), aud: 'authenticated', role: 'authenticated', is_anonymous: false, email: 'fixture@example.test', app_metadata: {}, user_metadata: {} };
const suggestions = [{ id: fixture.id(91), user_id: user.id, class_name: 'エルフ', suggested_name: '候補デッキ', status: 'pending', memo: null }];
const admin = true;
const api = http.createServer(async (req, res) => {
  try {
    res.setHeader('Content-Type', 'application/json');
    const url = new URL(req.url, 'http://127.0.0.1:54339'), table = url.pathname.split('/').at(-1);
    let body = ''; for await (const part of req) body += part;
    const args = body ? JSON.parse(body) : null;
    let data;
    if (url.pathname.includes('/rpc/')) {
      report.rpc.push({ name: table, args });
      if (table === 'get_environment_dashboard_aggregates_v4') data = fixture.dashboard(args);
      else if (table === 'get_analysis_aggregates_v3_exclusive') data = aggregates();
      else if (/get_period_report_aggregates_v[123]/.test(table)) data = periodFixture([], args);
      else if (table === 'get_home_dashboard') data = { summary: { total: 0, wins: 0, winRate: null, firstWinRate: null, secondWinRate: null }, recent: [] };
      else throw Error('Unexpected RPC: ' + table);
    } else if (!['GET', 'HEAD'].includes(req.method)) {
      assert.ok(admin);
      const rows = { environments, deck_archetypes: decks, deck_suggestions: suggestions }[table];
      assert.ok(rows, 'Unexpected mutation: ' + table);
      report.mutations.push({ method: req.method, table, args });
      if (req.method === 'POST') rows.push({ id: fixture.id(100 + report.mutations.length), created_at: new Date().toISOString(), aliases: [], ...args });
      else if (req.method === 'PATCH') Object.assign(rows.find(r => r.id === url.searchParams.get('id')?.slice(3)), args);
      else throw Error('Unexpected method: ' + req.method);
      data = null;
    } else if (url.pathname === '/auth/v1/user') data = user;
    else if (table === 'admin_users') data = admin ? { id: fixture.id(92), user_id: user.id } : null;
    else if (table === 'environments') data = environments;
    else if (table === 'deck_archetypes' || table === 'decks') data = decks;
    else if (table === 'deck_suggestions') data = suggestions;
    else if (['my_decks', 'matches', 'creator_images', 'creator_tier_works', 'creator_correlations'].includes(table)) data = [];
    else throw Error('Unexpected read: ' + url.pathname);
    res.end(JSON.stringify(data));
  } catch (error) { report.unexpected.push(error.message); res.writeHead(500); res.end('{}'); }
});

async function main() {
  await new Promise(resolve => api.listen(54339, '127.0.0.1', resolve));
  const log = fs.openSync(path.join(out, 'server.log'), 'w');
  const app = spawn(process.execPath, [require.resolve('next/dist/bin/next'), 'start', '-p', '3299'], {
    windowsHide: true, stdio: ['ignore', log, log],
    env: { ...process.env, NEXT_TELEMETRY_DISABLED: '1', NEXT_PUBLIC_SUPABASE_URL: 'http://127.0.0.1:54339', NEXT_PUBLIC_SUPABASE_ANON_KEY: 'test-public-key', OPENAI_API_KEY: '' },
  });
  let browser;
  try {
    let ready = false;
    for (let i = 0; i < 100; i++) { try { if ((await fetch(origin + '/privacy')).ok) { ready = true; break; } } catch {} await new Promise(resolve => setTimeout(resolve, 300)); }
    assert.ok(ready, 'local server ready');
    const browsers = [{ name: 'chromium', ...(process.env.CHROME_EXECUTABLE ? { executablePath: process.env.CHROME_EXECUTABLE } : {}) }];
    const edge = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
    if (fs.existsSync(edge)) browsers.push({ name: 'edge', executablePath: edge });
    for (const config of browsers) {
      const { name, ...options } = config;
      browser = await chromium.launch({ headless: true, ...options });
      report.browsers.push({ name, version: browser.version() });
      const context = await browser.newContext({ viewport: { width: 1440, height: 1080 }, timezoneId: 'Asia/Tokyo' });
      await context.route('**/*', route => {
        const url = new URL(route.request().url());
        if (['localhost', '127.0.0.1'].includes(url.hostname) || ['data:', 'blob:'].includes(url.protocol)) return route.continue();
        report.unexpected.push('External browser request: ' + url.origin); return route.abort();
      });
      const exp = Math.floor(Date.now() / 1000) + 3600;
      const session = { access_token: ['eyJhbGciOiJIUzI1NiJ9', Buffer.from(JSON.stringify({ sub: user.id, exp })).toString('base64url'), 'fixture'].join('.'), refresh_token: 'fixture', expires_at: exp, expires_in: 3600, token_type: 'bearer', user };
      await context.addCookies([{ name: 'sb-127-auth-token', value: 'base64-' + Buffer.from(JSON.stringify(session)).toString('base64url'), url: origin }]);
      context.on('page', p => {
        p.on('pageerror', e => report.events.push({ browser: name, type: 'pageerror', message: e.message }));
        p.on('console', m => { if (['warning', 'error'].includes(m.type())) report.events.push({ browser: name, type: m.type(), message: m.text() }); });
      });
      const page = await context.newPage();
      const go = async url => { const response = await page.goto(origin + url, { waitUntil: 'networkidle' }); assert.equal(response.status(), 200, url); };
      const section = title => page.locator('section').filter({ has: page.getByRole('heading', { name: title, exact: true }) });
      const checkFits = async () => {
        const escaped = await page.locator('main').evaluate(el => [...el.querySelectorAll('section, input:not([type=hidden]), select, button, a, summary, h2')].filter(n => {
          const r = n.getBoundingClientRect(); return r.width && (r.right > innerWidth + 1 || r.left < -1);
        }).map(n => n.tagName + ':' + n.textContent.slice(0, 40)));
        assert.deepEqual(escaped, [], 'all visible controls and cards fit viewport');
      };
      for (const width of [1920, 1440, 768, 390, 320]) {
        await page.setViewportSize({ width, height: 1080 });
        await go('/admin?section=tools');
        assert.deepEqual(await page.getByRole('navigation', { name: '管理機能', exact: true }).getByRole('link').allTextContents(), ['環境管理', '標準デッキ管理', '運用ツール']);
        assert.deepEqual(await page.locator('main section > h2, main section > div > h2').allTextContents(), ['Tier表・相関図制作', '期間レポート', '環境データOBS表示']);
        await checkFits();
        const cards = await page.locator('main section').evaluateAll(nodes => nodes.map(n => { const r = n.getBoundingClientRect(); return { x: r.x, y: r.y, right: r.right, bottom: r.bottom }; }));
        if (width >= 1024) { assert.equal(cards[1].y, cards[2].y); assert.ok(cards[1].right < cards[2].x); }
        else { assert.ok(cards[0].bottom < cards[1].y && cards[1].bottom < cards[2].y); }
        const details = page.locator('details');
        assert.equal(await details.getAttribute('open'), null);
        await page.screenshot({ path: path.join(out, `${name}-tools-${width}.png`), fullPage: true });
        const summary = page.locator('summary'); await summary.focus(); await page.keyboard.press('Enter');
        assert.notEqual(await details.getAttribute('open'), null);
        for (const text of ['1152 × 高さ1080', 'ログイン状態を共有しません', '管理者ログインが必要', '再読み込み', 'GrandMaster']) assert.ok((await details.innerText()).includes(text));
        await checkFits();
        await page.screenshot({ path: path.join(out, `${name}-help-${width}.png`), fullPage: true });
        await summary.click(); assert.equal(await details.getAttribute('open'), null);
        await section('環境データOBS表示').getByRole('button', { name: /ランク・レート帯/ }).click();
        const dialog = page.getByRole('dialog'); await dialog.waitFor();
        assert.ok(await dialog.evaluate(n => { const r = n.getBoundingClientRect(); return r.left >= 0 && r.right <= innerWidth && r.top >= 0 && r.bottom <= innerHeight; }));
        await page.screenshot({ path: path.join(out, `${name}-ranks-${width}.png`), fullPage: true });
        await page.getByRole('button', { name: 'キャンセル', exact: true }).click();
        for (const [tab, title] of [['環境管理', '環境管理'], ['標準デッキ管理', '標準デッキ一覧']]) {
          await page.getByRole('link', { name: tab, exact: true }).click(); await page.getByRole('heading', { name: title, exact: true }).waitFor(); await checkFits();
        }
        for (const [tab, title] of [['新規追加', '標準デッキの追加'], ['候補承認', '標準デッキ候補']]) {
          await page.getByRole('link', { name: tab, exact: true }).click();
          if (tab === '新規追加') await page.getByRole('heading', { name: title, exact: true }).waitFor();
          else await page.getByRole('button', { name: '採用', exact: true }).waitFor();
          await checkFits();
        }
        await page.getByRole('link', { name: '運用ツール', exact: true }).click(); await page.getByRole('heading', { name: 'Tier表・相関図制作', exact: true }).waitFor();
        report.checks.push(`${name} ${width}px: cards, filters, rank dialog, keyboard disclosure, tabs and deck sub-tabs`);
      }
      await page.setViewportSize({ width: 1440, height: 1080 });
      const visits = []; page.on('framenavigated', frame => { if (frame === page.mainFrame()) visits.push(new URL(frame.url()).pathname); });
      await page.getByRole('link', { name: '制作画面を開く', exact: true }).click();
      await page.getByRole('heading', { name: 'Tier表メーカー', exact: true }).waitFor();
      assert.equal(new URL(page.url()).pathname, '/admin/creator/tier'); assert.ok(!visits.includes('/admin/creator'));
      await page.getByRole('link', { name: '管理画面へ', exact: true }).click(); await page.waitForURL(origin + '/admin?section=tools');
      await go('/admin/creator'); await page.getByRole('heading', { name: 'クリエイターツール', exact: true }).waitFor();
      await page.getByRole('link', { name: 'Tier表メーカーを開く', exact: true }).click(); await page.getByRole('heading', { name: 'Tier表メーカー', exact: true }).waitFor();
      await go('/admin/creator/tier'); await page.getByRole('heading', { name: 'Tier表メーカー', exact: true }).waitFor();
      await page.getByRole('link', { name: '管理画面へ', exact: true }).click();
      await page.getByRole('link', { name: 'レポートを開く', exact: true }).click(); await page.getByRole('heading', { name: '期間環境レポート', exact: true }).waitFor();
      assert.equal(new URL(page.url()).pathname, '/admin/weekly-report');
      await go('/admin/weekly-report?start=2026-10-01&end=2026-10-07&rank=master'); await page.getByRole('heading', { name: '期間環境レポート', exact: true }).waitFor();
      report.checks.push(`${name}: direct Creator entry/return, both existing Creator URLs, report entry and bookmarked URL`);
      await go('/admin?section=tools');
      const settings = section('環境データOBS表示');
      await settings.getByRole('combobox', { name: /^環境/ }).selectOption(fixture.id(2));
      for (const period of ['24h', '3d', '7d', '30d', 'all']) {
        await settings.getByRole('combobox', { name: /^期間/ }).selectOption(period);
        const href = new URL(await settings.getByRole('link').getAttribute('href'), origin);
        assert.equal(href.searchParams.get('environment'), fixture.id(2)); assert.equal(href.searchParams.get('period'), period);
      }
      await settings.getByRole('button', { name: /ランク・レート帯/ }).click();
      await page.getByRole('button', { name: 'Master', exact: true }).click();
      await page.getByRole('checkbox', { name: 'GrandMaster / EPIC', exact: true }).check();
      await page.getByRole('button', { name: '適用', exact: true }).click();
      const link = settings.getByRole('link'), href = new URL(await link.getAttribute('href'), origin);
      assert.equal(await link.getAttribute('target'), '_blank');
      assert.ok(href.searchParams.get('ranks').includes('master:') && href.searchParams.get('ranks').includes('grandmaster:epic'));
      const popupReady = context.waitForEvent('page'); await link.click(); const popup = await popupReady;
      await popup.waitForLoadState('networkidle'); assert.equal(popup.url(), href.href);
      assert.match(await popup.locator('main').innerText(), /環境全期間/);
      const rpc = report.rpc.filter(r => r.name === 'get_environment_dashboard_aggregates_v4').at(-1);
      assert.equal(rpc.args.p_environment_id, fixture.id(2)); assert.equal(rpc.args.p_period, 'all');
      assert.deepEqual(rpc.args.p_rank_filters, href.searchParams.get('ranks').split(','));
      await popup.reload({ waitUntil: 'networkidle' }); assert.equal(popup.url(), href.href); await popup.close();
      await settings.getByRole('combobox', { name: /^期間/ }).selectOption('3d');
      const fixedReady = context.waitForEvent('page'); await link.click(); const fixed = await fixedReady;
      await fixed.waitForLoadState('networkidle'); assert.match(await fixed.locator('main').innerText(), /直近3日/); await fixed.close();
      await page.getByRole('link', { name: '通常画面へ', exact: true }).click(); await page.waitForURL(origin + '/');
      report.checks.push(`${name}: all periods, environment, multiple ranks, all-time/fixed OBS new tabs, query persistence/RPC args, normal screen`);
      if (config === browsers.at(-1)) {
        await go('/admin');
        const create = page.locator('form').filter({ has: page.locator('input[name=operation][value=create]') });
        await create.locator('input[name=name]').fill('追加確認環境'); await create.locator('input[name=start_date]').fill('2026-10-03');
        await create.locator('input[name=match_input_start_at]').fill('2026-10-03T12:00');
        await create.locator('input[name=match_input_end_at]').fill('2026-10-04T12:00');
        await create.getByRole('button', { name: '環境を追加', exact: true }).click();
        await page.getByText('環境を追加しました。', { exact: true }).waitFor();
        const added = environments.find(e => e.name === '追加確認環境'); assert.equal(added.match_input_start_at, '2026-10-03T03:00:00.000Z');
        await page.locator(`input[name="name_${added.id}"]`).fill('更新確認環境');
        await page.getByRole('button', { name: '環境を一括更新', exact: true }).click();
        await page.getByText('環境を一括更新しました。', { exact: true }).waitFor(); assert.equal(added.name, '更新確認環境');
        await page.getByRole('link', { name: '標準デッキ管理', exact: true }).click(); await page.getByRole('link', { name: '新規追加', exact: true }).click();
        await page.getByRole('heading', { name: '標準デッキの追加', exact: true }).waitFor();
        await page.getByLabel('標準デッキ名', { exact: true }).fill('追加確認デッキ');
        await page.getByRole('button', { name: '標準デッキを追加', exact: true }).click();
        await page.getByText('標準デッキを追加しました。', { exact: true }).waitFor(); assert.ok(decks.some(d => d.name === '追加確認デッキ'));
        await page.getByRole('link', { name: '一覧・更新', exact: true }).click();
        await page.getByRole('heading', { name: '標準デッキ一覧', exact: true }).waitFor();
        await page.locator(`input[name="name_${fixture.decks[0].id}"]`).fill('更新確認デッキ');
        await page.getByRole('button', { name: '一括更新', exact: true }).first().click();
        await page.getByText('標準デッキを一括更新しました。', { exact: true }).waitFor(); assert.equal(decks[0].name, '更新確認デッキ');
        await page.getByRole('link', { name: '候補承認', exact: true }).click(); await page.getByRole('button', { name: '採用', exact: true }).click();
        await page.getByText('候補を標準デッキとして採用しました。', { exact: true }).waitFor(); assert.equal(suggestions[0].status, 'approved');
        report.checks.push(`${name}: environment create/update; deck create/update/approval through unchanged actions (in-memory writes only)`);
      }
      await context.close(); await browser.close(); browser = null;
    }
    assert.deepEqual(report.unexpected, []); assert.deepEqual(report.events, []);
    report.status = 'passed'; console.log(JSON.stringify({ status: report.status, browsers: report.browsers, checks: report.checks, events: report.events }, null, 2));
  } finally {
    fs.writeFileSync(path.join(out, 'browser-result.json'), JSON.stringify(report, null, 2));
    if (browser) await browser.close(); app.kill(); api.closeAllConnections(); api.close(); fs.closeSync(log);
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
