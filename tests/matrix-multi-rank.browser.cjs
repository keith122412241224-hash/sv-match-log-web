/* eslint-disable @typescript-eslint/no-require-imports */
// Built Next UI -> localhost Auth/PostgREST boundary -> actual isolated PostgreSQL.
const fs = require('node:fs'), path = require('node:path'), http = require('node:http'), assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const nativeFetch = globalThis.fetch; require('./register.cjs'); globalThis.fetch = nativeFetch;
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const h = require('./matrix-multi-rank-db.cjs');
const { RANK_ATOMS, RANK_PRESETS, expandLegacyRankFilter } = require('../src/lib/rank-selection');
const { ANALYSIS_RANK_FILTERS } = require('../src/lib/analysis-rank-filter');
const { buildWinRateMatrix } = require('../src/lib/analytics');
const origin = 'http://localhost:3301', out = path.resolve('build/matrix-multi-rank/browser');
const report = { localOnly: true, checks: [], calls: [], errors: [], unexpected: [], conditions: 0 };
let who = h.ADMIN, db, rows, app, api, browser, fail = false;
const user = () => ({ id: who, aud: 'authenticated', role: 'authenticated', is_anonymous: false, email: 'local@example.test', app_metadata: {}, user_metadata: {} });
const wait = ms => new Promise(r => setTimeout(r, ms));
async function main() {
  fs.mkdirSync(out, { recursive: true }); db = await h.createDb(); rows = h.fixture(); await h.seed(db, rows);
  api = http.createServer(async (req, res) => {
    try {
      const u = new URL(req.url, 'http://127.0.0.1:54339'), name = u.pathname.split('/').at(-1);
      let body = ''; for await (const chunk of req) body += chunk;
      let data;
      if (u.pathname.includes('/rpc/')) {
        // AppShell prefetches Home independently of the matrix under test.
        if (name === 'get_home_dashboard') { res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ summary: { total: 0, wins: 0, winRate: null, firstWinRate: null, secondWinRate: null }, recent: [] })); return; }
        const args = JSON.parse(body); report.calls.push({ name, args });
        if (fail) { res.writeHead(500, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ code: 'XX000' })); return; }
        await h.identity(db, who); data = await h.rpc(db, name, args);
      } else {
        assert.ok(['GET', 'HEAD'].includes(req.method), 'No writes allowed');
        if (u.pathname === '/auth/v1/user') data = user();
        else if (name === 'admin_users') data = who === h.ADMIN ? { user_id: who } : null;
        else if (name === 'environments') data = h.environments;
        else if (['decks', 'deck_archetypes'].includes(name)) data = h.decks;
        else throw Error('Unexpected read ' + name);
      }
      res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(data));
    } catch (e) { report.unexpected.push(e.stack); res.writeHead(500); res.end('{}'); }
  });
  await new Promise(r => api.listen(54339, '127.0.0.1', r));
  const log = fs.openSync(path.join(out, 'server.log'), 'w');
  app = spawn(process.execPath, [require.resolve('next/dist/bin/next'), 'start', '-p', '3301'], { windowsHide: true, stdio: ['ignore', log, log], env: { ...process.env, NEXT_PUBLIC_SUPABASE_URL: 'http://127.0.0.1:54339', NEXT_PUBLIC_SUPABASE_ANON_KEY: 'test-public-key', NEXT_TELEMETRY_DISABLED: '1' } });
  fs.closeSync(log);
  let ready = false;
  for (let i = 0; i < 100; i++) { try { if ((await fetch(origin + '/privacy')).ok) { ready = true; break; } } catch {} await wait(200); }
  assert.ok(ready);
  browser = await chromium.launch({ headless: true, executablePath: process.env.CHROME_EXECUTABLE }); report.browser = browser.version();
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, timezoneId: 'Asia/Tokyo' });
  await context.route('**/*', route => { const u = new URL(route.request().url()); if (['localhost', '127.0.0.1'].includes(u.hostname) || ['data:', 'blob:'].includes(u.protocol)) return route.continue(); report.unexpected.push('External request ' + u.origin); return route.abort(); });
  async function login(id) {
    who = id; const exp = Math.floor(Date.now() / 1000) + 3600;
    const session = { access_token: ['eyJhbGciOiJIUzI1NiJ9', Buffer.from(JSON.stringify({ sub: who, exp })).toString('base64url'), 'fixture'].join('.'), refresh_token: 'fixture', expires_at: exp, expires_in: 3600, token_type: 'bearer', user: user() };
    await context.addCookies([{ name: 'sb-127-auth-token', value: 'base64-' + Buffer.from(JSON.stringify(session)).toString('base64url'), url: origin }]);
  }
  await login(h.ADMIN);
  const page = await context.newPage(); page.on('pageerror', e => { if (!fail) report.errors.push({ url: page.url(), message: e.message }); });
  const settled = async () => { await page.waitForLoadState('networkidle'); assert.equal(await page.locator('main [role=alert]').count(), 0); };
  const trigger = () => page.locator('button[aria-haspopup=dialog]');
  const dialog = () => page.getByRole('dialog', { name: 'ランクを選択' });
  const boxes = () => dialog().locator('input[type=checkbox][value]');
  const open = async () => { await trigger().click(); await dialog().waitFor(); };
  async function draft(selection) {
    await dialog().getByRole('button', { name: 'Master', exact: true }).click();
    await dialog().getByRole('checkbox', { name: 'Masterすべて', exact: true }).uncheck();
    for (const atom of selection) await dialog().locator(`input[value="${atom}"]`).check();
  }
  async function verify(selection, scope = 'mine', env = h.NEW) {
    await page.waitForURL(u => u.pathname === '/matrix');
    await page.getByRole('heading', { name: '相性表', exact: true }).waitFor();
    await page.waitForFunction(value => document.querySelector('input[name=ranks]')?.value === value, selection.join(','));
    const source = rows.filter(r => r.environment_id === env && (r.user_id === who || (who === h.ADMIN && scope === 'all')) && selection.includes(h.atom(r)));
    assert.match(await page.locator('main').innerText(), new RegExp(`対象登録戦績: ${source.length}件`));
    const cells = buildWinRateMatrix(source, h.decks, h.decks).flatMap(r => r.cells);
    const actual = await page.locator('tbody td').allTextContents(); assert.equal(actual.length, cells.length);
    for (let i = 0; i < cells.length; i++) {
      const c = cells[i]; if (!c.total) assert.equal(actual[i], '未対戦');
      else { assert.ok(actual[i].includes(`${c.wins}勝 / ${c.total}戦`), actual[i]); assert.ok(actual[i].includes(`${Math.round(c.winRate * 10) / 10}%`), actual[i]); }
    }
    assert.equal(await page.locator('input[name=ranks]').inputValue(), selection.join(',')); report.conditions++;
  }
  const custom = ['master:ruby', 'master:sapphire', 'grandmaster:epic'];
  await page.goto(origin + '/matrix', { waitUntil: 'networkidle' }); await verify(RANK_ATOMS);
  await open(); assert.equal(await boxes().count(), 17);
  assert.ok(await dialog().locator('img').count() >= 16);
  for (const p of RANK_PRESETS) { await dialog().getByRole('button', { name: p.label, exact: true }).click(); assert.deepEqual(await boxes().evaluateAll(es => es.filter(e => e.checked).map(e => e.value)), p.ranks); }
  await dialog().getByRole('checkbox', { name: 'GrandMasterすべて', exact: true }).uncheck();
  assert.equal(await dialog().getByRole('button', { name: '適用', exact: true }).getAttribute('aria-disabled'), 'true');
  const noCalls = report.calls.length; await dialog().getByRole('button', { name: '適用', exact: true }).click({ force: true }); assert.equal(await dialog().count(), 1); assert.equal(report.calls.length, noCalls);
  await dialog().getByRole('button', { name: 'キャンセル', exact: true }).click(); assert.equal(await trigger().evaluate(e => e === document.activeElement), true); await verify(RANK_ATOMS);
  await open(); await draft(custom);
  assert.equal(await dialog().getByRole('checkbox', { name: 'Masterすべて', exact: true }).evaluate(e => e.indeterminate), true);
  const before = report.calls.length; await dialog().getByRole('button', { name: '適用', exact: true }).click();
  await page.waitForURL(u => u.searchParams.get('ranks') === custom.join(',')); await settled(); assert.equal(report.calls.length, before + 1); await verify(custom);
  report.checks.push('icons, presets, parents, empty prevention, cancel, custom apply: one RPC');
  await page.screenshot({ path: path.join(out, 'matrix-desktop.png'), fullPage: true });
  await page.reload({ waitUntil: 'networkidle' }); await verify(custom);
  await page.goBack({ waitUntil: 'networkidle' }); await verify(RANK_ATOMS);
  await page.goForward({ waitUntil: 'networkidle' }); await verify(custom);
  await page.locator('select[name=environment]').selectOption(h.OLD); await page.getByRole('button', { name: '表示', exact: true }).click(); await settled(); await verify(custom, 'mine', h.OLD);
  await page.locator('select[name=scope]').selectOption('all'); await page.getByRole('button', { name: '表示', exact: true }).click(); await settled(); await verify(custom, 'all', h.OLD);
  report.checks.push('reload/back/forward; environment/scope keep ranks');
  for (const scope of ['mine', 'all']) for (const selection of [RANK_ATOMS, ...RANK_ATOMS.map(a => [a]), ['a', 'aa'], ['unranked', 'a'], custom]) {
    const n = report.calls.length;
    await page.goto(origin + '/matrix?' + new URLSearchParams({ environment: h.NEW, scope, ranks: selection.join(',') }), { waitUntil: 'networkidle' });
    await verify(selection, scope); assert.equal(report.calls.length, n + 1);
  }
  for (const { value } of [...ANALYSIS_RANK_FILTERS, { value: 'grandmaster-plus' }]) {
    await page.goto(origin + '/matrix?rank=' + encodeURIComponent(value), { waitUntil: 'networkidle' }); await verify(expandLegacyRankFilter(value));
  }
  await page.goto(origin + '/matrix?' + new URLSearchParams({ environment: h.EMPTY, ranks: custom.join(',') }), { waitUntil: 'networkidle' }); await verify(custom, 'mine', h.EMPTY);
  for (const query of ['ranks=', 'ranks=bad', 'rank=', 'rank=bad', 'ranks=a&rank=master', 'ranks=a&ranks=b', 'environment=invalid', 'environment=']) {
    const n = report.calls.length; await page.goto(origin + '/matrix?' + query, { waitUntil: 'networkidle' }); assert.equal(await page.locator('main [role=alert]').count(), 1); assert.equal(report.calls.length, n);
  }
  await login(h.MEMBER);
  await page.goto(origin + '/matrix?' + new URLSearchParams({ environment: h.NEW, scope: 'all', ranks: custom.join(',') }), { waitUntil: 'networkidle' });
  await verify(custom); assert.equal(await page.locator('select[name=scope]').count(), 0); assert.equal(report.calls.at(-1).args.p_include_all_users, false);
  for (const selection of [custom, ['unranked'], ['a', 'aa']]) {
    await page.goto(origin + '/environment?' + new URLSearchParams({ environment: h.NEW, period: 'all', ranks: selection.join(',') }), { waitUntil: 'networkidle' });
    const link = page.getByRole('link', { name: '自分の相性表を見る', exact: true });
    const url = new URL(await link.getAttribute('href'), origin); assert.equal(url.searchParams.get('ranks'), selection.join(',')); assert.equal(url.searchParams.get('scope'), 'mine'); assert.equal(url.searchParams.get('environment'), h.NEW); assert.equal(url.searchParams.has('period'), false);
    await link.click(); await settled(); await verify(selection);
  }
  report.checks.push('all atoms/mixed/all/old URLs/empty; invalid URL no RPC; member cannot fetch all; environment links reach exact SQL population');
  for (const width of [320, 390, 768, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto(origin + '/matrix?' + new URLSearchParams({ ranks: custom.join(',') }), { waitUntil: 'networkidle' });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, 'page overflow ' + width);
    await open(); assert.equal(await dialog().evaluate(e => e.scrollWidth <= e.clientWidth), true);
    await page.screenshot({ path: path.join(out, `rank-picker-${width}.png`), fullPage: true });
    if (width === 390) {
      await dialog().locator('input[value="grandmaster:epic"]').scrollIntoViewIfNeeded();
      await page.screenshot({ path: path.join(out, 'rank-picker-groups-mobile.png') });
    }
    await page.keyboard.press('Escape');
  }
  const n = report.calls.length, download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'PNG保存', exact: true }).click(); const png = await download; await png.saveAs(path.join(out, 'matrix-export.png'));
  assert.equal(fs.readFileSync(path.join(out, 'matrix-export.png')).subarray(1, 4).toString(), 'PNG');
  await page.locator('button[aria-pressed]').filter({ hasText: h.decks[1].name }).click(); assert.equal(await page.locator('tbody td').count(), 16);
  await page.getByRole('button', { name: '全表示', exact: true }).click(); assert.equal(await page.locator('tbody td').count(), 25); assert.equal(report.calls.length, n);
  report.checks.push('320/390/768/1440px no page/dialog overflow; PNG and deck visibility no refetch');
  fail = true; const beforeFail = report.calls.length;
  await page.goto(origin + '/matrix?ranks=a,aa', { waitUntil: 'networkidle' }); assert.match(await page.locator('body').innerText(), /Application error/); assert.equal(await page.locator('tbody td').count(), 0); assert.equal(report.calls.length, beforeFail + 1);
  assert.deepEqual(report.errors, []); assert.deepEqual(report.unexpected, []); report.passed = true;
}
main().catch(e => { report.failure = e.stack; console.error(e); process.exitCode = 1; }).finally(async () => {
  if (browser) await browser.close(); if (app) app.kill(); if (api) await new Promise(r => api.close(r)); if (db) await db.close();
  fs.mkdirSync(out, { recursive: true }); fs.writeFileSync(path.join(out, 'report.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ passed: report.passed, conditions: report.conditions, failure: report.failure }));
});
