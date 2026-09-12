/* eslint-disable @typescript-eslint/no-require-imports */
// Optional browser check: PLAYWRIGHT_MODULE and CHROME_EXECUTABLE can point to local installations.
// Uses synthetic records and a local, read-only Supabase stub. No production credentials.
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');
const assert = require('node:assert/strict');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const appPort = 3217;
const apiPort = 54329;
const origin = `http://localhost:${appPort}`;
const output = path.resolve('build/browser-proof');
fs.mkdirSync(output, { recursive: true });
const decks = [
  { id: 'A', name: 'AFネメシス', class_name: 'ネメシス', is_active: true },
  { id: 'B', name: 'ランプドラゴン', class_name: 'ドラゴン', is_active: true }
];
const records = Array.from({ length: 20 }, (_, i) => ({
  id: String(i), user_id: 'test-user', environment_id: 'environment',
  my_deck_id: i < 10 ? 'A' : 'B', opponent_deck_id: i < 10 ? 'B' : 'A',
  my_archetype_id: i < 10 ? 'A' : 'B', opponent_archetype_id: i < 10 ? 'B' : 'A',
  result: (i < 10 ? i < 5 : i >= 17) ? 'win' : 'lose', turn_order: 'first',
  played_at: '2026-09-05T01:00:00.000Z'
}));
const user = { id: 'test-user', aud: 'authenticated', role: 'authenticated', email: 'fixture@example.test', app_metadata: {}, user_metadata: {} };
const mutations = [];
const api = http.createServer((req, res) => {
  res.setHeader('Content-Type', 'application/json');
  // Existing navigation prefetch calls this read-only dashboard RPC with POST.
  if (req.method === 'POST' && req.url === '/rest/v1/rpc/get_home_dashboard') {
    res.end(JSON.stringify({ summary: { total: 20, wins: 8, winRate: 40, firstWinRate: 40, secondWinRate: null }, recent: [] }));
    return;
  }
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    mutations.push(req.url); res.writeHead(405); res.end('{}'); return;
  }
  const url = new URL(req.url, `http://localhost:${apiPort}`);
  let data;
  if (url.pathname === '/auth/v1/user') data = user;
  else if (url.pathname.endsWith('/admin_users')) data = { id: 'test-admin', user_id: user.id };
  else if (url.pathname.endsWith('/environments')) data = [{ id: 'environment', name: '動作確認用環境', created_at: '2026-09-01', allow_match_input: true }];
  else if (url.pathname.endsWith('/matches')) {
    data = records.filter(row => [...url.searchParams].every(([key, value]) => {
      if (value.startsWith('eq.')) return row[key] === value.slice(3);
      if (value.startsWith('gte.')) return row[key] >= value.slice(4);
      if (value.startsWith('lte.')) return row[key] <= value.slice(4);
      return true;
    }));
    const offset = Number(url.searchParams.get('offset') || 0);
    data = data.slice(offset, offset + Number(url.searchParams.get('limit') || 1000));
  } else data = decks;
  res.end(JSON.stringify(data));
});

(async () => {
  await new Promise(resolve => api.listen(apiPort, '127.0.0.1', resolve));
  const log = fs.openSync(path.join(output, 'server.log'), 'w');
  const app = spawn(process.execPath, [require.resolve('next/dist/bin/next'), 'start', '-p', String(appPort)], {
    cwd: process.cwd(), windowsHide: true, stdio: ['ignore', log, log],
    env: { ...process.env, NEXT_PUBLIC_SUPABASE_URL: `http://127.0.0.1:${apiPort}`, NEXT_PUBLIC_SUPABASE_ANON_KEY: 'test-public-key', OPENAI_API_KEY: '' }
  });
  let browser;
  try {
    for (let i = 0; i < 60; i++) {
      try { if ((await fetch(`${origin}/privacy`)).ok) break; } catch {}
      await new Promise(resolve => setTimeout(resolve, 500));
    }
    browser = await chromium.launch({ headless: true, ...(process.env.CHROME_EXECUTABLE ? { executablePath: process.env.CHROME_EXECUTABLE } : {}) });
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, permissions: ['clipboard-read', 'clipboard-write'] });
    const token = ['eyJhbGciOiJIUzI1NiJ9', Buffer.from(JSON.stringify({ sub: user.id, exp: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url'), 'fixture'].join('.');
    const session = { access_token: token, refresh_token: 'fixture', expires_at: Math.floor(Date.now() / 1000) + 3600, expires_in: 3600, token_type: 'bearer', user };
    await context.addCookies([{ name: 'sb-127-auth-token', value: 'base64-' + Buffer.from(JSON.stringify(session)).toString('base64url'), url: origin }]);
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(`${origin}/analysis?scope=all`);
    await page.getByText('勝率集計: 対戦相手反転込み', { exact: false }).waitFor();
    assert.match(await page.locator('main').innerText(), /対象登録戦績: 20件/);
    const card = page.locator('article').filter({ has: page.locator('h3').filter({ hasText: 'AFネメシス' }) });
    assert.match(await card.innerText(), /60%/);
    await page.screenshot({ path: path.join(output, 'analysis-desktop.png'), fullPage: true });
    await page.selectOption('select[name=winRateMode]', 'direct');
    await Promise.all([page.waitForURL(/winRateMode=direct/), page.getByRole('button', { name: '表示', exact: true }).click()]);
    await page.waitForLoadState('networkidle');
    assert.match(await card.innerText(), /50%/);
    await page.selectOption('select[name=winRateMode]', 'combined');
    await page.selectOption('select[name=myDeck]', 'B');
    await page.selectOption('select[name=turnOrder]', 'second');
    await Promise.all([page.waitForURL(/winRateMode=combined/), page.getByRole('button', { name: '表示', exact: true }).click()]);
    await page.waitForLoadState('networkidle');
    assert.match(await page.locator('main').innerText(), /対象登録戦績: 10件/);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.screenshot({ path: path.join(output, 'analysis-mobile.png'), fullPage: true });
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    await page.goto(`${origin}/admin/weekly-report?start=2026-09-05&end=2026-09-05`);
    const json = JSON.parse(await page.locator('textarea[readonly]').first().inputValue());
    assert.equal(json.summary.totalMatches, 20);
    assert.equal(json.myDeckWinRates.find(row => row.deckName === 'AFネメシス').environmentWinRate, 60);
    const tier = json.tierCandidates.find(row => row.deckName === 'AFネメシス');
    assert.deepEqual([tier.matches, tier.directMatches, tier.reversedMatches, tier.winRate, tier.strengthScore, tier.suggestedTier], [20, 10, 10, 60, 81.5, 'Tier1']);
    assert.equal(tier.previousMatches, 0);
    assert.equal(tier.previousWinRate, null);
    assert.equal(tier.isWinRateComparisonReliable, false);
    const tierBlock = page.locator('section').filter({ has: page.getByRole('heading', { name: 'Tier候補', exact: true }) });
    const adjustment = page.locator('section').filter({ has: page.getByRole('heading', { name: 'Tier手動調整', exact: true }) });
    for (const area of [tierBlock, adjustment]) {
      assert.match(await area.innerText(), /評価対象：20戦/);
      assert.match(await area.innerText(), /使用側10戦 \/ 相手側10戦/);
      assert.match(await area.innerText(), /環境勝率：60%/);
    }
    assert.doesNotMatch(await tierBlock.innerText(), /Strength Score/);
    assert.match(await adjustment.innerText(), /Strength Score：81.5/);
    assert.match(await page.locator('main').innerText(), /登録試合数\s+20/);
    await page.screenshot({ path: path.join(output, 'report-mobile.png'), fullPage: true });
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    await page.setViewportSize({ width: 1440, height: 1000 });
    const block = page.locator('section').filter({ has: page.getByRole('heading', { name: 'デッキ別の環境勝率（対戦相手反転込み）', exact: true }) });
    await block.scrollIntoViewIfNeeded();
    await page.screenshot({ path: path.join(output, 'report-desktop.png'), fullPage: true });
    const downloadPromise = page.waitForEvent('download');
    await block.getByRole('button', { name: 'PNG', exact: true }).click();
    const download = await downloadPromise;
    await download.saveAs(path.join(output, download.suggestedFilename()));
    assert.ok(fs.statSync(path.join(output, download.suggestedFilename())).size > 1000);
    const control = adjustment.locator('label').filter({ hasText: 'AFネメシス' });
    await control.locator('select').selectOption('Tier2');
    assert.match(await tierBlock.innerText(), /自動Tier候補: Tier1/);
    const adjustedJson = JSON.parse(await page.locator('textarea[readonly]').first().inputValue());
    assert.equal(adjustedJson.tierCandidates.find(row => row.deckName === 'AFネメシス').finalTier, 'Tier2');
    const tierDownloadPromise = page.waitForEvent('download');
    await tierBlock.getByRole('button', { name: 'PNG', exact: true }).click();
    const tierDownload = await tierDownloadPromise;
    const tierPath = path.join(output, tierDownload.suggestedFilename());
    await tierDownload.saveAs(tierPath);
    assert.ok(fs.statSync(tierPath).size > 1000);
    assert.equal(fs.readFileSync(tierPath).subarray(1, 4).toString(), 'PNG');
    await tierBlock.screenshot({ path: path.join(output, 'tier-desktop.png') });
    await page.getByRole('button', { name: 'AI用プロンプトをコピー', exact: true }).click();
    assert.match(await page.evaluate(() => navigator.clipboard.readText()), /総登録試合数として合計しない/);
    assert.deepEqual(mutations, []);
    assert.deepEqual(errors, []);
    console.log('Browser checks passed: scope/mode/filter, mobile layout, report JSON, Tier counts/rates/score, manual Tier adjustment, actual Tier PNG download, prompt clipboard; no DB writes or browser errors.');
  } finally {
    if (browser) await browser.close();
    app.kill();
    api.close();
    fs.closeSync(log);
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
