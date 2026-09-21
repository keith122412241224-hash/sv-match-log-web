/* eslint-disable @typescript-eslint/no-require-imports */
// Local HTTP contract/browser test. Actual SQL/RLS parity is tested separately
// in matchup-rpc.integration.cjs; this server never connects to a real service.
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const origin = 'http://localhost:3221';
const output = path.resolve('build/matchup-browser-proof');
const decks = [{ id: 'A', name: 'デッキA', class_name: 'エルフ' }, { id: 'B', name: 'デッキB', class_name: 'ロイヤル' }];
const user = { id: 'fixture-owner', aud: 'authenticated', role: 'authenticated', email: 'fixture@example.test', app_metadata: {}, user_metadata: {} };
let admin = true, fail = false, rawReads = 0;
const calls = [], writes = [], browserErrors = [];
const api = http.createServer(async (req, res) => {
  res.setHeader('Content-Type', 'application/json');
  const url = new URL(req.url, 'http://127.0.0.1:54329');
  if (req.method === 'POST' && url.pathname === '/rest/v1/rpc/get_matchup_aggregates_v1') {
    let body = ''; for await (const part of req) body += part;
    const args = JSON.parse(body); calls.push(args);
    if (fail) { res.writeHead(500); res.end(JSON.stringify({ code: 'XX000', message: 'fixture failure' })); return; }
    const groups = args.p_environment_id === 'empty' ? [] : [
      { myDeckId: 'A', opponentDeckId: 'B', total: args.p_include_all_users && admin ? 4 : 3, wins: 2 },
      { myDeckId: 'B', opponentDeckId: 'A', total: 2, wins: 1 },
      { myDeckId: 'A', opponentDeckId: 'A', total: 1, wins: 1 },
      { myDeckId: 'unknown', opponentDeckId: 'B', total: 1, wins: 0 }
    ];
    res.end(JSON.stringify({ version: 1, totalMatches: groups.reduce((n, g) => n + g.total, 0), groups })); return;
  }
  if (req.method === 'POST' && url.pathname === '/rest/v1/rpc/get_home_dashboard') {
    res.end(JSON.stringify({ summary: { total: 0, wins: 0, winRate: null, firstWinRate: null, secondWinRate: null }, recent: [] })); return;
  }
  if (req.method !== 'GET' && req.method !== 'HEAD') { writes.push(url.pathname); res.writeHead(405); res.end('{}'); return; }
  let data;
  if (url.pathname === '/auth/v1/user') data = user;
  else if (url.pathname.endsWith('/admin_users')) data = admin ? { id: 'fixture-admin' } : null;
  else if (url.pathname.endsWith('/environments')) data = [
    { id: 'environment', name: '検証環境', created_at: '2026-09-20', allow_match_input: true },
    { id: 'empty', name: '空の環境', created_at: '2026-09-01', allow_match_input: true }
  ];
  else if (url.pathname.endsWith('/matches')) { rawReads++; data = []; }
  else data = decks;
  res.end(JSON.stringify(data));
});
(async () => {
  fs.mkdirSync(output, { recursive: true });
  await new Promise(resolve => api.listen(54329, '127.0.0.1', resolve));
  const log = fs.openSync(path.join(output, 'server.log'), 'w');
  const app = spawn(process.execPath, [require.resolve('next/dist/bin/next'), 'start', '-p', '3221'], {
    windowsHide: true, stdio: ['ignore', log, log],
    env: { ...process.env, NEXT_PUBLIC_SUPABASE_URL: 'http://127.0.0.1:54329', NEXT_PUBLIC_SUPABASE_ANON_KEY: 'test-public-key', OPENAI_API_KEY: '' }
  });
  let browser;
  try {
    for (let i = 0; i < 60; i++) {
      try { if ((await fetch(origin + '/privacy')).ok) break; } catch {}
      await new Promise(resolve => setTimeout(resolve, 500));
    }
    browser = await chromium.launch({ headless: true, ...(process.env.CHROME_EXECUTABLE ? { executablePath: process.env.CHROME_EXECUTABLE } : {}) });
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
    const token = ['eyJhbGciOiJIUzI1NiJ9', Buffer.from(JSON.stringify({ sub: user.id, exp: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url'), 'fixture'].join('.');
    const session = { access_token: token, refresh_token: 'fixture', expires_at: Math.floor(Date.now() / 1000) + 3600, expires_in: 3600, token_type: 'bearer', user };
    await context.addCookies([{ name: 'sb-127-auth-token', value: 'base64-' + Buffer.from(JSON.stringify(session)).toString('base64url'), url: origin }]);
    const page = await context.newPage();
    page.on('pageerror', error => { if (!fail) browserErrors.push(error.message); });
    await page.goto(origin + '/matrix?scope=all');
    await page.waitForLoadState('networkidle');
    assert.equal(calls.length, 1);
    assert.deepEqual(calls[0], { p_environment_id: 'environment', p_include_all_users: true });
    assert.equal(await page.locator('tbody td').count(), 4);
    const cellTexts = await page.locator('tbody td').allTextContents();
    assert.match(cellTexts[0], /100%.*1勝 \/ 1戦/);
    assert.match(cellTexts[1], /50%.*2勝 \/ 4戦/);
    assert.match(cellTexts[2], /50%.*1勝 \/ 2戦/);
    assert.equal(cellTexts[3], '未対戦');
    await page.screenshot({ path: path.join(output, 'matrix.png'), fullPage: true });
    await page.locator('button[aria-pressed]').filter({ hasText: 'デッキB' }).click();
    assert.equal(await page.locator('tbody td').count(), 1);
    await page.getByRole('button', { name: '全表示', exact: true }).click();
    assert.equal(await page.locator('tbody td').count(), 4);
    const downloaded = page.waitForEvent('download');
    await page.getByRole('button', { name: 'PNG保存', exact: true }).click();
    const file = await downloaded;
    const png = path.join(output, 'matrix-export.png');
    await file.saveAs(png);
    assert.equal(fs.readFileSync(png).subarray(1, 4).toString(), 'PNG');
    assert.equal(calls.length, 1, 'display toggles and PNG do not refetch');
    admin = false;
    await page.goto(origin + '/matrix?scope=all');
    await page.waitForLoadState('networkidle');
    assert.equal(calls.at(-1).p_include_all_users, false);
    assert.match(await page.locator('tbody td').nth(1).innerText(), /66.7%/);
    await page.goto(origin + '/matrix?environment=empty');
    await page.waitForLoadState('networkidle');
    assert.deepEqual(await page.locator('tbody td').allTextContents(), Array(4).fill('未対戦'));
    assert.equal(rawReads, 0);
    assert.deepEqual(writes, []);
    assert.deepEqual(browserErrors, []);
    fail = true;
    await page.goto(origin + '/matrix');
    await page.waitForFunction(() => document.body.innerText.includes('Application error'));
    assert.equal(await page.locator('tbody td').count(), 0, 'RPC failure is not a zero matrix');
    fs.writeFileSync(path.join(output, 'result.json'), JSON.stringify({ passed: true, initialRpcCalls: 1, rawReads, writes, browserErrors,
      checks: ['directional cells and mirrors', 'scope enforcement', 'zero results', 'visible deck toggles without refetch', 'PNG without refetch', 'RPC error is not zero'] }, null, 2));
    console.log('Matrix browser checks passed: one RPC, zero raw match reads, unchanged cells/PNG/toggles, scope, real zero and RPC failure.');
  } finally {
    if (browser) await browser.close();
    app.kill(); api.close(); fs.closeSync(log);
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
