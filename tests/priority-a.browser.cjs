/* eslint-disable @typescript-eslint/no-require-imports */
// Optional real-browser regression against a local production build and synthetic DB.
// Build with NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54329 and a dummy anon key.
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');
const assert = require('node:assert/strict');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const origin = 'http://localhost:3219';
const output = path.resolve(process.env.PROOF_DIR || 'build/priority-a-proof');
fs.mkdirSync(output, { recursive: true });
const storageKey = 'svml:guest-matches:v1';
const user = { id: 'fixture-user', aud: 'authenticated', role: 'authenticated', email: 'fixture@example.test', app_metadata: {}, user_metadata: {} };
const environment = { id: 'e', name: 'テスト環境', created_at: '2026-09-01', allow_match_input: true };
const records = Array.from({ length: 20 }, (_,i) => ({ id: String(i), user_id: user.id, environment_id: 'e', my_deck_id: 'a', opponent_deck_id: 'b', my_archetype_id: null, opponent_archetype_id: null, result: i < 12 ? 'win' : 'lose', turn_order: 'first', played_at: '2026-09-03T00:00:00Z' }));
let pendingInsert, releaseInsert, failInsert = false;
const saved = [], unexpected = [], errors = [];
const api = http.createServer(async (req, res) => {
  res.setHeader('Content-Type', 'application/json');
  const url = new URL(req.url, 'http://127.0.0.1:54329');
  if (req.method === 'POST' && url.pathname === '/rest/v1/rpc/get_home_dashboard') {
    res.end(JSON.stringify({ summary: { total: 20, wins: 12, winRate: 60, firstWinRate: 60, secondWinRate: null }, recent: [] })); return;
  }
  if (req.method === 'POST' && url.pathname === '/rest/v1/matches') {
    let raw = ''; for await (const chunk of req) raw += chunk;
    const rows = JSON.parse(raw);
    if (pendingInsert) { pendingInsert(); await new Promise(resolve => { releaseInsert = resolve; }); }
    if (failInsert) { res.writeHead(500); res.end(JSON.stringify({ code: 'XX000', message: 'synthetic insert failure' })); return; }
    saved.push(...rows); res.writeHead(201); res.end('{}'); return;
  }
  if (!['GET','HEAD'].includes(req.method)) { unexpected.push(req.url); res.writeHead(405); res.end('{}'); return; }
  let data = [];
  if (url.pathname === '/auth/v1/user') data = user;
  else if (url.pathname.endsWith('/admin_users')) data = { id: 'admin', user_id: user.id };
  else if (url.pathname.endsWith('/environments')) data = [environment];
  else if (url.pathname.endsWith('/matches')) data = records.filter(row => [...url.searchParams].every(([key,value]) => {
    if (value.startsWith('eq.')) return row[key] === value.slice(3);
    if (value.startsWith('gte.')) return row[key] >= value.slice(4);
    if (value.startsWith('lte.')) return row[key] <= value.slice(4);
    return true;
  }));
  // Both report deck IDs intentionally resolve to the same display name: 不明.
  res.end(JSON.stringify(data));
});
function drafts(count) { return Array.from({ length: count }, (_,i) => ({ ...records[0], id: undefined, user_id: undefined, local_id: 'guest-' + i })); }
(async () => {
  await new Promise(resolve => api.listen(54329, '127.0.0.1', resolve));
  const log = fs.openSync(path.join(output, 'server.log'), 'w');
  const app = spawn(process.execPath, [require.resolve('next/dist/bin/next'), 'start', '-p', '3219'], {
    windowsHide: true, stdio: ['ignore', log, log], env: { ...process.env, NEXT_PUBLIC_SUPABASE_URL: 'http://127.0.0.1:54329', NEXT_PUBLIC_SUPABASE_ANON_KEY: 'test-public-key', OPENAI_API_KEY: '' }
  });
  let browser;
  try {
    for (let i = 0; i < 60; i++) { try { if ((await fetch(origin + '/privacy')).ok) break; } catch {} await new Promise(resolve => setTimeout(resolve, 500)); }
    browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, permissions: ['clipboard-read','clipboard-write'] });
    const token = ['eyJhbGciOiJIUzI1NiJ9', Buffer.from(JSON.stringify({ sub: user.id, exp: Math.floor(Date.now()/1000)+3600 })).toString('base64url'), 'fixture'].join('.');
    const session = { access_token: token, refresh_token: 'fixture', expires_at: Math.floor(Date.now()/1000)+3600, expires_in: 3600, token_type: 'bearer', user };
    await context.addCookies([{ name: 'sb-127-auth-token', value: 'base64-' + Buffer.from(JSON.stringify(session)).toString('base64url'), url: origin }]);
    const page = await context.newPage();
    page.on('pageerror', error => errors.push(error.message));
    const remaining = () => page.evaluate(key => JSON.parse(localStorage.getItem(key) || '[]'), storageKey);
    async function seed(rows) {
      await page.goto(origin + '/privacy');
      await page.evaluate(([key, rows]) => localStorage.setItem(key, JSON.stringify(rows)), [storageKey, rows]);
      await page.goto(origin + '/?guest_imported=1');
      await page.getByRole('button', { name: '正式データに取り込む', exact: true }).waitFor();
      assert.deepEqual(await remaining(), JSON.parse(JSON.stringify(rows)));
    }
    const importButton = () => page.getByRole('button', { name: '正式データに取り込む', exact: true });
    await seed(drafts(10));
    await importButton().click();
    await page.getByRole('status').filter({ hasText: '10件を保存しました' }).waitFor();
    assert.equal((await remaining()).length, 0);
    await seed(drafts(250));
    const inserting = new Promise(resolve => { pendingInsert = resolve; });
    await importButton().click();
    await inserting;
    assert.ok(await page.getByRole('button', { name: '取り込み中...' }).isDisabled());
    const added = { ...drafts(1)[0], local_id: 'concurrent' };
    await page.evaluate(([key, row]) => localStorage.setItem(key, JSON.stringify([...JSON.parse(localStorage.getItem(key)), row])), [storageKey, added]);
    pendingInsert = null; releaseInsert();
    await page.getByRole('status').filter({ hasText: '200件を保存しました' }).waitFor();
    assert.deepEqual((await remaining()).map(row => row.local_id), [...drafts(250).slice(200).map(row => row.local_id), 'concurrent']);
    await importButton().click();
    await page.getByRole('status').filter({ hasText: '51件を保存しました' }).waitFor();
    assert.equal((await remaining()).length, 0);
    assert.equal(saved.length, 261);
    const mixed = [drafts(1)[0], { ...drafts(1)[0], local_id: 'invalid', result: 'invalid' }];
    await seed(mixed); await importButton().click();
    await page.getByRole('status').filter({ hasText: '1件を保存しました' }).waitFor();
    assert.deepEqual(await remaining(), JSON.parse(JSON.stringify(mixed.slice(1))));
    failInsert = true;
    await seed(drafts(2)); await importButton().click();
    await page.getByRole('status').filter({ hasText: '取り込みに失敗しました' }).waitFor();
    assert.equal((await remaining()).length, 2);
    await page.screenshot({ path: path.join(output, 'guest-failure-preserved.png'), fullPage: true });
    await page.goto(origin + '/admin/weekly-report?start=2026-09-03&end=2026-09-03');
    const jsonField = page.locator('textarea[readonly]').first();
    const before = JSON.parse(await jsonField.inputValue());
    assert.deepEqual(new Set(before.tierCandidates.map(row => row.deckId)), new Set(['a','b']));
    assert.ok(before.tierCandidates.every(row => row.deckName === '不明'));
    const adjustment = page.locator('section').filter({ has: page.getByRole('heading', { name: 'Tier手動調整', exact: true }) });
    const index = before.tierCandidates.findIndex(row => row.deckId === 'a');
    await adjustment.locator('select').nth(index).selectOption('Tier2');
    const after = JSON.parse(await jsonField.inputValue());
    assert.equal(after.tierCandidates.find(row => row.deckId === 'a').finalTier, 'Tier2');
    assert.deepEqual(after.tierCandidates.find(row => row.deckId === 'b'), before.tierCandidates.find(row => row.deckId === 'b'));
    const tierBlock = page.locator('section').filter({ has: page.getByRole('heading', { name: 'Tier候補', exact: true }) });
    assert.equal(await tierBlock.getByText('最終Tier: Tier2', { exact: true }).count(), 1);
    assert.doesNotMatch(await tierBlock.innerText(), /Strength Score/);
    const downloadPromise = page.waitForEvent('download');
    await tierBlock.getByRole('button', { name: 'PNG', exact: true }).click();
    const download = await downloadPromise;
    const file = path.join(output, 'unknown-independent-tier.png');
    await download.saveAs(file);
    assert.equal(fs.readFileSync(file).subarray(1,4).toString(), 'PNG');
    assert.ok(fs.statSync(file).size > 1000);
    await page.getByRole('button', { name: 'AI用プロンプトをコピー', exact: true }).click();
    await page.getByRole('button', { name: 'コピーしました', exact: true }).waitFor();
    const prompt = await page.evaluate(() => navigator.clipboard.readText());
    assert.deepEqual(JSON.parse(prompt.slice(prompt.indexOf('{'))), after);
    await tierBlock.screenshot({ path: path.join(output, 'unknown-independent-tier-ui.png') });
    assert.deepEqual(unexpected, []); assert.deepEqual(errors, []);
    const result = { passed: true, completed: new Date().toISOString(), checks: ['guest URL cannot delete', '10/10', '250/200 + concurrent addition', 'retry remainder', 'partial validation', 'all failed', 'unknown IDs isolated', 'Tier PNG', 'AI JSON/prompt', 'Strength hidden'], syntheticSaved: saved.length, errors };
    fs.writeFileSync(path.join(output, 'result.json'), JSON.stringify(result, null, 2));
    console.log(JSON.stringify(result));
  } finally {
    if (releaseInsert) releaseInsert();
    if (browser) await browser.close();
    app.kill(); api.close(); fs.closeSync(log);
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
