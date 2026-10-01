/* eslint-disable @typescript-eslint/no-require-imports */
// Run after a local build. Uses only synthetic data and a loopback Supabase stub.
// PLAYWRIGHT_MODULE / CHROME_EXECUTABLE may point to existing local installations.
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const origin = 'http://localhost:3251';
const apiOrigin = 'http://127.0.0.1:54329';
const output = path.resolve('build/global-pending-proof');
const user = { id: 'fixture-user', aud: 'authenticated', role: 'authenticated', email: 'fixture@example.test', app_metadata: {}, user_metadata: {} };
const decks = [
  { id: 'A', name: 'デッキA', class_name: 'エルフ', is_active: true },
  { id: 'B', name: 'デッキB', class_name: 'ロイヤル', is_active: true }
];
const environment = { id: 'environment', name: '検証環境', created_at: '2026-09-01', allow_match_input: true };
const rows = [], checks = [], unexpected = [];
let saveGate, failSave = false, insertCalls = 0;
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
function gate() {
  let release;
  const promise = new Promise(resolve => { release = resolve; });
  return { promise, release };
}
async function until(check) {
  for (let i = 0; i < 200; i++) { if (check()) return; await pause(50); }
  throw new Error('Timed out waiting for local fixture request');
}
const api = http.createServer(async (req, res) => {
  res.setHeader('Content-Type', 'application/json');
  const url = new URL(req.url, apiOrigin);
  if (req.method === 'POST' && url.pathname.startsWith('/rest/v1/rpc/get_analysis_aggregates_v')) {
    let body = ''; for await (const part of req) body += part;
    const { analysisFixture } = require('./analysis-browser-fixture.cjs');
    res.end(JSON.stringify(analysisFixture([], JSON.parse(body)))); return;
  }
  if (req.method === 'POST' && url.pathname === '/rest/v1/matches') {
    let body = ''; for await (const part of req) body += part;
    insertCalls++;
    if (saveGate) await saveGate.promise;
    if (failSave) { res.writeHead(400); res.end(JSON.stringify({ message: 'fixture save failed' })); return; }
    rows.push(JSON.parse(body)); res.writeHead(201); res.end('{}'); return;
  }
  if (req.method === 'POST' && url.pathname === '/rest/v1/decks') { res.writeHead(201); res.end('{}'); return; }
  if (req.method === 'POST' && url.pathname === '/rest/v1/rpc/get_home_dashboard') {
    res.end(JSON.stringify({ summary: { total: rows.length, wins: rows.length, winRate: 100, firstWinRate: 100, secondWinRate: null }, recent: [] })); return;
  }
  if (!['GET', 'HEAD'].includes(req.method)) { unexpected.push(req.method + ' ' + url.pathname); res.writeHead(405); res.end('{}'); return; }
  let data;
  if (url.pathname === '/auth/v1/user') data = user;
  else if (url.pathname.endsWith('/admin_users')) data = null;
  else if (url.pathname.endsWith('/environments')) data = url.searchParams.has('id') ? environment : [environment];
  else if (url.pathname.endsWith('/matches')) data = [];
  else if (url.pathname.endsWith('/decks') || url.pathname.endsWith('/deck_archetypes')) {
    data = decks.filter(row => [...url.searchParams].every(([key, value]) => {
      if (!['id', 'name', 'class_name', 'is_active'].includes(key)) return true;
      if (value.startsWith('eq.')) return String(row[key]) === value.slice(3);
      if (value.startsWith('in.')) return value.slice(4, -1).split(',').map(x => x.replaceAll('"', '')).includes(row[key]);
      return true;
    }));
  }
  else { unexpected.push(url.pathname); data = []; }
  res.end(JSON.stringify(data));
});

(async () => {
  fs.mkdirSync(output, { recursive: true });
  await new Promise(resolve => api.listen(54329, '127.0.0.1', resolve));
  const log = fs.openSync(path.join(output, 'server.log'), 'w');
  const app = spawn(process.execPath, [require.resolve('next/dist/bin/next'), 'start', '-p', '3251'], {
    windowsHide: true, stdio: ['ignore', log, log],
    env: { ...process.env, NEXT_PUBLIC_SUPABASE_URL: apiOrigin, NEXT_PUBLIC_SUPABASE_ANON_KEY: 'test-public-key', NEXT_TELEMETRY_DISABLED: '1', OPENAI_API_KEY: '' }
  });
  let browser, navigationGate;
  try {
    for (let i = 0; i < 60; i++) {
      try { if ((await fetch(origin + '/privacy')).ok) break; } catch { /* server starting */ }
      await pause(500);
    }
    browser = await chromium.launch({ headless: true, ...(process.env.CHROME_EXECUTABLE ? { executablePath: process.env.CHROME_EXECUTABLE } : {}) });
    const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
    await context.route('**/*', async route => {
      const request = route.request(), url = new URL(request.url());
      if (!['localhost', '127.0.0.1'].includes(url.hostname)) { unexpected.push(url.origin); await route.abort(); return; }
      if (navigationGate && request.method() === 'GET' && url.pathname === navigationGate.pathname && request.headers().rsc) {
        navigationGate.started = true;
        await navigationGate.promise;
      }
      await route.continue();
    });
    const token = ['eyJhbGciOiJIUzI1NiJ9', Buffer.from(JSON.stringify({ sub: user.id, exp: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url'), 'fixture'].join('.');
    const session = { access_token: token, refresh_token: 'fixture', expires_at: Math.floor(Date.now() / 1000) + 3600, expires_in: 3600, token_type: 'bearer', user };
    await context.addCookies([{ name: 'sb-127-auth-token', value: 'base64-' + Buffer.from(JSON.stringify(session)).toString('base64url'), url: origin }]);
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(origin + '/matches');
    await page.waitForLoadState('networkidle');
    await page.locator('button[aria-haspopup=dialog]').click();
    await page.locator('dialog input[value="master:diamond"]').click();
    await page.evaluate(() => {
      window.pendingAppearances = 0;
      new MutationObserver(records => {
        for (const record of records) for (const node of record.addedNodes) {
          if (node instanceof Element && (node.matches('[aria-busy="true"]') || node.querySelector('[aria-busy="true"]'))) window.pendingAppearances++;
        }
      }).observe(document.body, { childList: true, subtree: true });
    });
    const indicator = page.locator('[aria-busy="true"]');
    const savingMessage = page.getByText('戦績を保存しています。完了するまでこのままお待ちください。', { exact: true });
    const success = page.getByText('戦績を保存しました', { exact: true });
    const form = page.locator('form').filter({ has: page.locator('button[value=continue]') });
    async function beginSave(value) {
      saveGate = gate();
      const before = insertCalls;
      await form.locator(`button[value=${value}]`).click();
      await until(() => insertCalls > before);
      // Longer than the 80ms display delay, while the save remains unresolved.
      await pause(180);
      assert.equal(await indicator.count(), 0);
      assert.equal(await form.locator('button[type=submit][aria-disabled=true]').count(), 2);
      assert.equal(await form.locator('button[value=continue] .animate-spin').count(), 1);
      assert.equal(await savingMessage.isVisible(), true);
      assert.equal(await page.evaluate(() => window.pendingAppearances), 0);
    }
    async function assertSaveFinished() {
      await page.waitForFunction(() => document.querySelector('button[value=continue]').getAttribute('aria-disabled') !== 'true');
      assert.equal(await form.locator('.animate-spin').count(), 0);
      assert.equal(await savingMessage.count(), 0);
      assert.equal(await indicator.count(), 0);
      assert.equal(await page.evaluate(() => window.pendingAppearances), 0);
    }
    for (let i = 0; i < 3; i++) {
      await beginSave('continue');
      // Disabled buttons prevent a duplicate request while saving.
      await page.evaluate(() => document.querySelector('button[value=continue]').click());
      saveGate.release();
      await success.waitFor();
      await assertSaveFinished();
      assert.equal(await page.locator('input[name=rank_tier]').inputValue(), 'master');
      assert.equal(await page.locator('input[name=master_group]').inputValue(), 'diamond');
      assert.equal(new URL(page.url()).pathname, '/matches');
    }
    assert.equal(rows.length, 3);
    assert.equal(insertCalls, 3);
    checks.push('continue x3: zero global appearances; local spinner ends; selections retained; no duplicate saves');

    for (const value of ['continue', 'home']) {
      failSave = true;
      await beginSave(value);
      saveGate.release();
      await page.getByText('fixture save failed', { exact: true }).waitFor();
      await assertSaveFinished();
      assert.equal(new URL(page.url()).pathname, '/matches');
    }
    failSave = false;
    checks.push('both save failures: zero global appearances; no navigation; buttons re-enabled');

    navigationGate = { ...gate(), pathname: '/', started: false };
    await beginSave('home');
    assert.equal(navigationGate.started, false);
    saveGate.release();
    await until(() => navigationGate.started);
    await indicator.waitFor();
    assert.equal(rows.length, 4);
    assert.equal(await indicator.getByText('読み込み中', { exact: true }).isVisible(), true);
    assert.equal(await indicator.locator('.global-pending-bar').count(), 1);
    assert.equal(await page.evaluate(() => window.pendingAppearances), 1);
    await page.screenshot({ path: path.join(output, 'home-navigation.png'), fullPage: true });
    navigationGate.release(); navigationGate = null;
    await page.waitForURL(origin + '/');
    await page.getByRole('heading', { name: 'ホーム', exact: true }).waitFor();
    await indicator.waitFor({ state: 'detached' });
    checks.push('home: save completes before navigation/global display; indicator clears on home');

    // A real Next Link navigation with its response held past the display delay.
    navigationGate = { ...gate(), pathname: '/analysis', started: false };
    await page.getByRole('navigation').getByRole('link', { name: '分析', exact: true }).click();
    await until(() => navigationGate.started);
    await indicator.waitFor();
    navigationGate.release(); navigationGate = null;
    await page.waitForURL(origin + '/analysis');
    await page.getByRole('heading', { name: '分析', exact: true }).waitFor();
    await indicator.waitFor({ state: 'detached' });
    checks.push('ordinary internal Link: indicator appears and clears');

    // Complete a URL change inside the 80ms window: the pending timer must be cancelled.
    await page.evaluate(() => {
      window.pendingAppearances = 0;
      const anchor = document.createElement('a');
      anchor.href = '/analysis?fast=1';
      anchor.addEventListener('click', event => {
        event.preventDefault();
        window.history.pushState(null, '', anchor.href);
      });
      document.body.append(anchor); anchor.click(); anchor.remove();
    });
    await page.waitForURL(/fast=1/);
    await pause(180);
    assert.equal(await indicator.count(), 0);
    assert.equal(await page.evaluate(() => window.pendingAppearances), 0);
    checks.push('fast URL change: no delayed indicator reappearance');
    assert.deepEqual(errors, []);
    assert.deepEqual(unexpected, []);
    fs.writeFileSync(path.join(output, 'result.json'), JSON.stringify({ passed: true, checks, savedRows: rows.length, insertCalls, errors, unexpected }, null, 2));
    console.log(JSON.stringify({ passed: true, checks }, null, 2));
  } finally {
    saveGate?.release(); navigationGate?.release();
    if (browser) await browser.close();
    app.kill(); api.close(); fs.closeSync(log);
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
