/* eslint-disable @typescript-eslint/no-require-imports */
// Real browser + real Next Server Actions, loopback synthetic API only.
const fs = require('node:fs'), path = require('node:path'), http = require('node:http');
const assert = require('node:assert/strict'), { spawn } = require('node:child_process');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const origin = 'http://localhost:3261', output = path.resolve('build/match-entry-ux');
const user = { id: 'fixture-user', aud: 'authenticated', role: 'authenticated', email: 'fixture@example.test', app_metadata: {}, user_metadata: {} };
const decks = [{ id: 'a', name: 'Alpha', class_name: 'エルフ', is_active: true, deck_type: 'my_deck' }, { id: 'b', name: 'Beta', class_name: 'ロイヤル', is_active: true, deck_type: 'my_deck' }];
const environment = { id: 'e', name: '入力検証', created_at: '2026-09-01', allow_match_input: true };
const rows = [], calls = [], errors = [], unexpected = [], checks = [];
let fail = false, release, hold = false;
const api = http.createServer(async (req, res) => {
  res.setHeader('Content-Type', 'application/json');
  const url = new URL(req.url, 'http://127.0.0.1:54329'); calls.push(req.method + ' ' + url.pathname);
  if (req.method === 'POST' && url.pathname === '/rest/v1/matches') {
    let raw = ''; for await (const chunk of req) raw += chunk;
    if (hold) await new Promise(resolve => { release = resolve; });
    if (fail) { res.writeHead(400); res.end(JSON.stringify({ message: '保存エラー詳細：' + '再試行する前に入力内容を確認してください。'.repeat(20) })); return; }
    rows.push(JSON.parse(raw)); res.writeHead(201); res.end('{}'); return;
  }
  if (req.method === 'POST' && url.pathname === '/rest/v1/decks') { res.writeHead(201); res.end('{}'); return; }
  if (req.method === 'POST' && url.pathname === '/rest/v1/rpc/get_home_dashboard') { res.end(JSON.stringify({ summary: { total: rows.length, wins: rows.length, winRate: 100 }, recent: [] })); return; }
  if (!['GET', 'HEAD'].includes(req.method)) { unexpected.push(req.url); res.writeHead(405); res.end('{}'); return; }
  let data = [];
  if (url.pathname === '/auth/v1/user') data = user;
  else if (url.pathname.endsWith('/admin_users')) data = null;
  else if (url.pathname.endsWith('/environments')) data = url.searchParams.has('id') ? environment : [environment];
  else if (url.pathname.endsWith('/decks') || url.pathname.endsWith('/deck_archetypes')) data = decks.filter(row => [...url.searchParams].every(([key, value]) => {
    if (!(key in row)) return true;
    if (value.startsWith('eq.')) return String(row[key]) === value.slice(3);
    if (value.startsWith('in.')) return value.slice(4, -1).split(',').map(v => v.replaceAll('"', '')).includes(row[key]);
    return true;
  }));
  res.end(JSON.stringify(data));
});
async function until(check) { for (let i = 0; i < 200; i++) { if (await check()) return; await new Promise(r => setTimeout(r, 50)); } throw Error('Timed out'); }
const key = id => 'svml:last-rank:v1:user:' + id;
(async () => {
  fs.mkdirSync(output, { recursive: true }); await new Promise(r => api.listen(54329, '127.0.0.1', r));
  const log = fs.openSync(path.join(output, 'server.log'), 'w');
  const app = spawn(process.execPath, [require.resolve('next/dist/bin/next'), 'start', '-p', '3261'], { windowsHide: true, stdio: ['ignore', log, log], env: { ...process.env, NEXT_PUBLIC_SUPABASE_URL: 'http://127.0.0.1:54329', NEXT_PUBLIC_SUPABASE_ANON_KEY: 'test-public-key', OPENAI_API_KEY: '' } });
  let browser, page;
  try {
    await until(async () => { try { return (await fetch(origin + '/privacy')).ok; } catch { return false; } });
    browser = await chromium.launch({ headless: true, ...(process.env.CHROME_EXECUTABLE ? { executablePath: process.env.CHROME_EXECUTABLE } : {}) });
    let context = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true });
    async function cookie(ctx) {
      const token = ['eyJhbGciOiJIUzI1NiJ9', Buffer.from(JSON.stringify({ sub: user.id, exp: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url'), 'fixture'].join('.');
      await ctx.addCookies([{ name: 'sb-127-auth-token', value: 'base64-' + Buffer.from(JSON.stringify({ access_token: token, refresh_token: 'fixture', expires_at: Math.floor(Date.now() / 1000) + 3600, expires_in: 3600, token_type: 'bearer', user })).toString('base64url'), url: origin }]);
    }
    async function protect(ctx) { await ctx.route('**/*', route => { if (!['localhost', '127.0.0.1'].includes(new URL(route.request().url()).hostname)) { unexpected.push(route.request().url()); return route.abort(); } return route.continue(); }); }
    await cookie(context); await protect(context); page = await context.newPage(); page.on('pageerror', e => errors.push(e.message));
    const trigger = () => page.locator('button[aria-haspopup=dialog]');
    const status = () => page.getByRole('status').filter({ hasText: '戦績を保存しました' });
    const save = async () => { const n = rows.length; await page.locator('button[value=continue]').click(); await until(() => rows.length === n + 1); await status().waitFor(); };
    const choose = async value => { await trigger().click(); await page.locator('dialog input[value="' + value + '"]').click(); };
    const rank = () => page.locator('[name=rank_tier]').inputValue();
    await page.goto(origin + '/matches', { waitUntil: 'networkidle' });
    assert.match(await trigger().innerText(), /未入力/);
    assert.equal(await page.locator('img[src^="/ranks/"],img[src^="/master-groups/"]').count(), 0);
    // Keyboard and native modal focus containment; no parent aggregate choices.
    await trigger().focus(); await page.keyboard.press('Enter');
    assert.equal(await page.getByRole('radio').count(), 17);
    assert.equal(await page.getByRole('radio', { name: 'Master', exact: true }).count(), 0);
    assert.equal(await page.locator('dialog input:checked').inputValue(), 'unranked');
    await page.keyboard.press('End'); assert.equal(await page.locator('dialog input:checked').inputValue(), 'grandmaster:beyond');
    await page.keyboard.press('Home'); await page.keyboard.press('ArrowDown'); assert.equal(await page.locator('dialog input:checked').inputValue(), 'beginner');
    await page.keyboard.press('ArrowUp'); assert.equal(await page.locator('dialog input:checked').inputValue(), 'unranked');
    await page.keyboard.press('Tab'); await page.keyboard.press('Tab'); assert.equal(await page.evaluate(() => document.activeElement.closest('dialog') !== null), true);
    await page.keyboard.press('Shift+Tab'); await page.keyboard.press('Escape'); assert.equal(await trigger().evaluate(e => e === document.activeElement), true);
    await page.keyboard.press('Space'); await page.keyboard.press('End'); await page.keyboard.press('Enter'); assert.match(await trigger().innerText(), /BEYOND/);
    checks.push('17 single-select radios, keyboard, modal focus trap/restore, lazy icon mount');
    await choose('grandmaster:epic');
    // Three sequential saves: rank/decks/turn/result, focus, scroll, API count, no global pending.
    const apiPerSave = [];
    for (let i = 0; i < 3; i++) {
      await page.locator('button[value=continue]').scrollIntoViewIfNeeded();
      await page.locator('button[value=continue]').focus(); const scroll = await page.evaluate(() => scrollY);
      const start = calls.length; hold = true; await page.locator('button[value=continue]').click(); await until(() => typeof release === 'function');
      assert.equal(await page.locator('[aria-busy=true]').count(), 0);
      assert.equal(await page.evaluate(() => document.activeElement?.getAttribute('value')), 'continue');
      assert.equal(await page.locator('button[value=continue]').evaluate(b => b.disabled), false);
      await page.locator('button[value=continue]').evaluate(b => { b.form.requestSubmit(b); b.form.requestSubmit(b); });
      hold = false; release(); release = null; await status().waitFor();
      assert.equal(rows.length, i + 1); assert.equal(rows.at(-1).grandmaster_rating, 'epic');
      assert.equal(rows.at(-1).environment_id, 'e'); assert.equal(rows.at(-1).turn_order, 'first'); assert.equal(rows.at(-1).result, 'win');
      assert.ok(Number.isFinite(Date.parse(rows.at(-1).played_at)));
      assert.ok(Math.abs(await page.evaluate(() => scrollY) - scroll) <= 2, 'save scroll preserved');
      assert.equal(await page.evaluate(() => document.activeElement?.getAttribute('value')), 'continue');
      assert.equal(await status().count(), 1); assert.equal(await page.locator('[aria-busy=true]').count(), 0);
      apiPerSave.push(calls.slice(start));
    }
    assert.deepEqual(apiPerSave[1], apiPerSave[0]); assert.deepEqual(apiPerSave[2], apiPerSave[0]);
    assert.equal(apiPerSave[0].filter(v => v === 'POST /rest/v1/matches').length, 1);
    await status().waitFor({ state: 'hidden', timeout: 6000 }); checks.push('three saves: no duplicates/global pending, focus/scroll preserved, 4s dismissal, unchanged API sequence');
    await page.reload({ waitUntil: 'networkidle' }); assert.match(await trigger().innerText(), /EPIC/);
    const tab = await context.newPage(); await tab.goto(origin + '/matches', { waitUntil: 'networkidle' }); assert.match(await tab.locator('button[aria-haspopup=dialog]').innerText(), /EPIC/); await tab.close();
    await page.goto(origin + '/privacy'); await page.goto(origin + '/matches', { waitUntil: 'networkidle' }); assert.match(await trigger().innerText(), /EPIC/);
    const persisted = await context.storageState(); await context.close(); await browser.close();
    browser = await chromium.launch({ headless: true, ...(process.env.CHROME_EXECUTABLE ? { executablePath: process.env.CHROME_EXECUTABLE } : {}) });
    context = await browser.newContext({ storageState: persisted, viewport: { width: 390, height: 844 }, hasTouch: true }); await protect(context); page = await context.newPage(); page.on('pageerror', e => errors.push(e.message));
    await page.goto(origin + '/matches', { waitUntil: 'networkidle' }); assert.match(await trigger().innerText(), /EPIC/);
    checks.push('reload, navigation return, separate tab and browser relaunch with disk-equivalent storageState');
    user.id = 'fixture-user-b'; await cookie(context); await page.reload({ waitUntil: 'networkidle' }); assert.equal(await rank(), '');
    await choose('master:sapphire'); await save();
    user.id = 'fixture-user'; await cookie(context); await page.reload({ waitUntil: 'networkidle' }); assert.match(await trigger().innerText(), /EPIC/);
    assert.equal(await page.evaluate(k => localStorage.getItem(k), key('fixture-user-b')), 'master:sapphire');
    checks.push('same browser user A/B have independent saved ranks');
    // Failed saves preserve the last success, while keeping the current draft.
    await choose('master:ruby'); fail = true; await page.locator('button[value=continue]').click(); await page.getByRole('alert').filter({ hasText: '戦績の保存に失敗しました' }).waitFor();
    assert.equal(await page.evaluate(k => localStorage.getItem(k), key(user.id)), 'grandmaster:epic'); assert.match(await trigger().innerText(), /ルビー/);
    assert.equal(await page.locator('p').filter({ hasText: '保存エラー詳細：' }).count(), 1);
    assert.equal(await page.locator('p[role=alert]').count(), 0);
    for (const width of [1365, 320, 390, 430]) {
      await page.setViewportSize({ width, height: 844 });
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
      const alert = await page.locator('form [role=alert]').boundingBox(); assert.ok(alert.x >= 0 && alert.x + alert.width <= width && alert.y >= 0 && alert.y + alert.height <= 844);
      await page.screenshot({ path: path.join(output, 'error-' + width + '.png') });
    }
    fail = false; await page.reload({ waitUntil: 'networkidle' }); assert.match(await trigger().innerText(), /EPIC/);
    await choose('unranked'); await save(); await page.reload({ waitUntil: 'networkidle' }); assert.equal(await rank(), '');
    for (const invalid of ['unknown', '{broken', '{"version":0,"rank":"aa"}', 'master:epic', 'grandmaster:ruby']) {
      await page.evaluate(([k,v]) => localStorage.setItem(k,v), [key(user.id),invalid]); await page.reload({ waitUntil: 'networkidle' }); assert.equal(await rank(), '');
    }
    await page.evaluate(k => localStorage.removeItem(k), key(user.id)); await page.reload({ waitUntil: 'networkidle' }); assert.equal(await rank(), '');
    checks.push('failed save does not persist; detailed inline error plus one live notification; NULL/invalid/cleared storage');
    for (const width of [1365, 320, 390, 430]) {
      await page.setViewportSize({ width, height: 844 }); await trigger().tap();
      const box = await page.getByRole('dialog').boundingBox(); assert.ok(box.x >= 0 && box.x + box.width <= width && box.y >= 0 && box.y + box.height <= 844);
      const radios = page.locator('[data-rank-options]'); if (width < 640) assert.equal(await radios.evaluate(e => e.scrollHeight > e.clientHeight), true);
      await page.locator('dialog input[value="grandmaster:beyond"]').scrollIntoViewIfNeeded(); await page.screenshot({ path: path.join(output, 'rank-' + width + '.png') });
      await page.locator('dialog input[value="grandmaster:beyond"]').tap(); assert.match(await trigger().innerText(), /BEYOND/);
      await trigger().tap(); await page.locator('dialog input[value=unranked]').tap(); assert.match(await trigger().innerText(), /未入力/);
      await choose('grandmaster:epic'); await save();
      const toast = await status().boundingBox(), button = await page.locator('button[value=continue]').boundingBox();
      assert.ok(toast.x >= 0 && toast.x + toast.width <= width && toast.y >= 0 && toast.y + toast.height <= 844);
      assert.ok(toast.y + toast.height <= button.y || toast.y >= button.y + button.height, 'toast does not overlap save');
      const before = toast.y; await page.mouse.wheel(0, -200); await page.waitForTimeout(100); assert.equal((await status().boundingBox()).y, before);
      await page.screenshot({ path: path.join(output, 'success-' + width + '.png') });
    }
    checks.push('1365/320/390/430: dialog/internal scroll, BEYOND/NULL tap, icons, overflow, toast fixed/does not overlap save');
    // Storage quota for the preference does not misreport a successful server save.
    await page.evaluate(() => { const original = Storage.prototype.setItem; Storage.prototype.setItem = function(k,v) { if (k.startsWith('svml:last-rank:')) throw new Error('quota'); return original.call(this,k,v); }; });
    await choose('aa'); await save(); assert.equal(await page.locator('form [role=alert]').innerText(), '');
    await page.reload({ waitUntil: 'networkidle' });
    await choose('master:diamond'); await page.locator('button[value=home]').click(); await page.waitForURL(origin + '/');
    await page.goto(origin + '/matches', { waitUntil: 'networkidle' }); assert.match(await trigger().innerText(), /ダイヤモンド/);
    checks.push('preference quota failure does not cause duplicate save; home save persists before navigation');
    assert.deepEqual(errors, []); assert.deepEqual(unexpected, []);
    fs.writeFileSync(path.join(output, 'result.json'), JSON.stringify({ passed: true, checks, apiPerSave, saved: rows.length, errors, unexpected }, null, 2)); console.log(JSON.stringify({ passed: true, checks }, null, 2));
  } catch (error) { if (page && !page.isClosed()) await page.screenshot({ path: path.join(output, 'failure.png'), fullPage: true }); throw error; }
  finally { release?.(); if (browser) await browser.close(); app.kill(); api.close(); fs.closeSync(log); }
})().catch(error => { console.error(error); process.exitCode = 1; });
