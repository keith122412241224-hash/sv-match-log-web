/* eslint-disable @typescript-eslint/no-require-imports */
// Built Next.js -> loopback HTTP adapter -> actual PostgreSQL RLS/RPCs.
// Auth is a synthetic session fixture; this is not a real Supabase Auth/PostgREST test.
const fs = require('node:fs'), path = require('node:path'), http = require('node:http');
const { spawn } = require('node:child_process'), assert = require('node:assert/strict');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const { setup, ids, quote } = require('./match-mutations-db.cjs');
const origin = 'http://localhost:3268', output = path.resolve('build/match-mutations');
const user = { id: ids.a, aud: 'authenticated', role: 'authenticated', is_anonymous: false, email: 'local@example.test', app_metadata: {}, user_metadata: {} };
const errors = [], warnings = [], pageerrors = [], calls = [], checks = [];
let failWrite = false, delayWrite = 0, chain = Promise.resolve();
async function until(fn) { for (let i = 0; i < 100; i++) { if (await fn()) return; await new Promise(r => setTimeout(r, 100)); } throw Error('Timed out'); }
(async () => {
  fs.mkdirSync(output, { recursive: true });
  const { db, claim, Query } = await setup();
  // Serialize role-setting and queries on this single embedded DB connection.
  const api = http.createServer((req, res) => {
    chain = chain.then(async () => {
      const url = new URL(req.url, 'http://127.0.0.1:54329');
      res.setHeader('Content-Type', 'application/json');
      const loggedIn = req.headers.authorization?.startsWith('Bearer ey');
      const subject = loggedIn ? JSON.parse(Buffer.from(req.headers.authorization.split('.')[1], 'base64url').toString()).sub : null;
      if (url.pathname === '/auth/v1/user') { res.statusCode = loggedIn ? 200 : 401; res.end(JSON.stringify(loggedIn ? { ...user, id: subject } : { message: 'not logged in' })); return; }
      let text = ''; for await (const part of req) text += part; const body = text ? JSON.parse(text) : {};
      await claim(subject);
      calls.push({ method: req.method, path: url.pathname });
      if (url.pathname.startsWith('/rest/v1/rpc/')) {
        const entries = Object.entries(body);
        const result = await db.query('select public.' + quote(url.pathname.split('/').at(-1)) + '(' + entries.map(([key], i) => quote(key) + ':=$' + (i + 1)).join(',') + ') payload', entries.map(([, value]) => value));
        res.end(JSON.stringify(result.rows[0].payload)); return;
      }
      const table = url.pathname.split('/').at(-1);
      const q = new Query(table);
      for (const [key, value] of url.searchParams) {
        if (key === 'select') q.select(value);
        else if (key === 'order') for (const order of value.split(',')) { const [field, direction] = order.split('.'); q.order(field, { ascending: direction !== 'desc' }); }
        else if (key === 'limit') q.limit(Number(value));
        // PostgREST coerces filters using the column type. PGlite's boolean
        // parameter serializer requires a JS boolean, not the URL text.
        else if (value.startsWith('eq.')) {
          const raw = value.slice(3);
          if ((table === 'deck_archetypes' && key === 'is_active') || (table === 'environments' && key === 'allow_match_input')) {
            assert.ok(['true', 'false'].includes(raw), 'invalid boolean fixture filter');
            q.eq(key, raw === 'true');
          } else q.eq(key, raw);
        }
        else if (value.startsWith('in.(')) q.in(key, value.slice(4, -1).split(',').map(v => v.replaceAll('"', '')));
        else if (!['on_conflict', 'columns'].includes(key)) throw Error('Unexpected query ' + key);
      }
      if (['PATCH', 'DELETE'].includes(req.method) && table === 'matches') {
        if (delayWrite) await new Promise(r => setTimeout(r, delayWrite));
        if (failWrite) { res.statusCode = 400; res.end(JSON.stringify({ message: 'local test write failure' })); return; }
      }
      if (req.method === 'PATCH') q.update(body);
      if (req.method === 'DELETE') q.delete();
      if (req.method === 'POST') {
        if (url.searchParams.has('on_conflict')) q.upsert(body, { onConflict: url.searchParams.get('on_conflict') });
        else q.insert(body);
      }
      if (req.headers.accept?.includes('vnd.pgrst.object')) q.maybeSingle();
      const result = await q;
      if (result.error) { res.statusCode = 400; res.end(JSON.stringify(result.error)); return; }
      res.end(JSON.stringify(result.data));
    }).catch(error => { console.error('LOCAL HTTP:', error.message); res.statusCode = 500; res.end(JSON.stringify({ message: error.message })); });
  });
  await new Promise(r => api.listen(54329, '127.0.0.1', r));
  const log = fs.openSync(path.join(output, 'server.log'), 'w');
  const app = spawn(process.execPath, [require.resolve('next/dist/bin/next'), 'start', '-p', '3268'], { windowsHide: true, stdio: ['ignore', log, log], env: { ...process.env, NEXT_PUBLIC_SUPABASE_URL: 'http://127.0.0.1:54329', NEXT_PUBLIC_SUPABASE_ANON_KEY: 'test-public-key', OPENAI_API_KEY: '' } });
  let browser;
  try {
    await until(async () => { try { return (await fetch(origin + '/privacy')).ok; } catch { return false; } });
    fs.writeFileSync(path.join(output, 'ready.txt'), origin);
    if (process.env.MATCH_MUTATIONS_SERVE === '1') { console.log('Local fixture ready at ' + origin); await new Promise(r => process.once('SIGINT', r)); return; }
    browser = await chromium.launch({ headless: true, ...(process.env.CHROME_EXECUTABLE ? { executablePath: process.env.CHROME_EXECUTABLE } : {}) });
    const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
    await context.route('**/*', route => ['localhost', '127.0.0.1'].includes(new URL(route.request().url()).hostname) ? route.continue() : route.abort());
    const token = ['eyJhbGciOiJIUzI1NiJ9', Buffer.from(JSON.stringify({ sub: user.id, exp: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url'), 'fixture'].join('.');
    for (const [filter, expected] of [['is_active=eq.true', [ids.arch, ids.arch2]], ['is_active=eq.false', []], ['name=eq.true', []]]) {
      const response = await fetch('http://127.0.0.1:54329/rest/v1/deck_archetypes?select=id&' + filter, { headers: { Authorization: 'Bearer ' + token } });
      assert.equal(response.status, 200);
      assert.deepEqual((await response.json()).map(row => row.id).sort(), expected);
    }
    checks.push('HTTP boolean filters preserve true/false and textual values');
    const direct = async (method, target, authorization, body) => {
      const response = await fetch('http://127.0.0.1:54329/rest/v1/matches?id=eq.' + target, {
        method, headers: { 'Content-Type': 'application/json', ...(authorization ? { Authorization: 'Bearer ' + authorization } : {}) },
        ...(body ? { body: JSON.stringify(body) } : {})
      });
      assert.equal(response.status, 200); return response.json();
    };
    for (const authorization of [token, null]) {
      assert.deepEqual(await direct('PATCH', ids.other, authorization, { result: 'lose' }), []);
      assert.deepEqual(await direct('DELETE', ids.other, authorization), []);
    }
    const bToken = ['eyJhbGciOiJIUzI1NiJ9', Buffer.from(JSON.stringify({ sub: ids.b })).toString('base64url'), 'fixture'].join('.');
    assert.deepEqual(await direct('PATCH', ids.match, bToken, { result: 'lose' }), []);
    assert.deepEqual(await direct('DELETE', ids.match, bToken), []);
    assert.equal((await direct('PATCH', ids.other, bToken, { result: 'lose' }))[0].result, 'lose');
    assert.equal((await direct('PATCH', ids.other, bToken, { result: 'win' }))[0].result, 'win');
    checks.push('direct loopback PATCH/DELETE: A/admin cannot mutate B; B cannot mutate A; anon cannot mutate; B can update own row');
    const session = { access_token: token, refresh_token: 'fixture', expires_at: Math.floor(Date.now() / 1000) + 3600, expires_in: 3600, token_type: 'bearer', user };
    const cookie = { name: 'sb-127-auth-token', value: 'base64-' + Buffer.from(JSON.stringify(session)).toString('base64url'), url: origin };
    await context.addCookies([cookie]);
    const page = await context.newPage();
    page.on('console', msg => { if (msg.type() === 'error') errors.push(msg.text()); if (msg.type() === 'warning') warnings.push(msg.text()); });
    page.on('pageerror', error => pageerrors.push(error.message));
    const menu = async () => { await page.getByRole('button', { name: '戦績の操作', exact: true }).first().click(); await page.getByRole('heading', { name: '戦績の操作' }).waitFor(); };
    const edit = async () => { await menu(); await page.getByRole('button', { name: '編集', exact: true }).click(); await page.getByRole('heading', { name: '戦績を編集' }).waitFor(); };
    const remove = async () => { await menu(); await page.getByRole('button', { name: '削除', exact: true }).click(); await page.getByRole('heading', { name: 'この戦績を削除しますか？' }).waitFor(); };
    const own = async () => { await chain; return (await db.query('select * from public.matches where id=$1', [ids.match])).rows[0]; };
    const noOverflow = async () => assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'horizontal overflow');
    await page.goto(origin + '/?environment=' + ids.env, { waitUntil: 'networkidle' });
    await page.evaluate(({ arch2, env2, a }) => {
      localStorage.setItem('svml:last-my-choice-id', arch2);
      localStorage.setItem('svml:last-environment-id', env2);
      localStorage.setItem('svml:last-rank:v1:user:' + a, 'grandmaster:beyond');
    }, ids);
    const original = await own();
    for (const width of [1920, 1440, 390, 320]) {
      await page.setViewportSize({ width, height: 900 }); await noOverflow();
      await page.screenshot({ path: path.join(output, 'home-' + width + '.png'), fullPage: true });
      await edit();
      assert.equal(await page.locator('[name=my_archetype_id]').inputValue(), ids.arch);
      assert.equal(await page.locator('[name=result]').inputValue(), 'win');
      assert.equal(await page.locator('[name=environment_id]').inputValue(), ids.env);
      assert.equal(await page.locator('[name=rank_tier]').inputValue(), '');
      await noOverflow(); await page.screenshot({ path: path.join(output, 'edit-' + width + '.png'), fullPage: true });
      await page.getByRole('button', { name: '負け', exact: true }).click();
      await page.getByRole('button', { name: '編集をキャンセル' }).click();
      assert.equal((await own()).result, 'win');
      await remove(); await noOverflow(); await page.screenshot({ path: path.join(output, 'delete-' + width + '.png'), fullPage: true });
      await page.getByRole('button', { name: 'キャンセル', exact: true }).click();
      assert.ok(await own()); checks.push(width + 'px menus/editor/delete confirmation/cancels');
    }
    await edit();
    await page.locator('dialog select').nth(1).selectOption(ids.arch2);
    await page.getByRole('button', { name: '負け', exact: true }).click();
    await page.getByRole('button', { name: '後攻', exact: true }).click();
    await page.locator('dialog button[aria-haspopup=dialog]').click();
    await page.locator('input[value="master:ruby"]').click();
    failWrite = true;
    await page.getByRole('button', { name: '変更を保存' }).click();
    await page.getByRole('alert').filter({ hasText: 'local test write failure' }).waitFor();
    assert.deepEqual(await own(), original); assert.equal(await page.locator('[name=result]').inputValue(), 'lose');
    failWrite = false; delayWrite = 500;
    const writesBefore = calls.filter(c => c.method === 'PATCH').length;
    await page.getByRole('button', { name: '変更を保存' }).evaluate(button => { button.click(); button.click(); button.form.requestSubmit(); });
    await page.getByRole('status').filter({ hasText: '戦績を更新しました' }).waitFor();
    await until(async () => (await own()).result === 'lose');
    assert.equal(calls.filter(c => c.method === 'PATCH').length - writesBefore, 1);
    const updated = await own(); assert.equal(updated.my_archetype_id, ids.arch2); assert.equal(updated.turn_order, 'second'); assert.equal(updated.master_group, 'ruby');
    for (const key of ['id', 'user_id', 'created_at', 'played_at']) assert.deepEqual(updated[key], original[key]);
    await page.reload({ waitUntil: 'networkidle' }); await edit(); assert.equal(await page.locator('[name=result]').inputValue(), 'lose');
    await page.getByRole('button', { name: '編集をキャンセル' }).click();
    await remove(); failWrite = true; await page.getByRole('button', { name: '削除する' }).click();
    await page.getByRole('alert').filter({ hasText: '削除できませんでした' }).waitFor(); assert.ok(await own());
    failWrite = false;
    const deletesBefore = calls.filter(c => c.method === 'DELETE').length;
    await page.getByRole('button', { name: '削除する' }).evaluate(button => { button.click(); button.click(); });
    await page.getByRole('status').filter({ hasText: '戦績を削除しました' }).waitFor();
    await until(async () => !(await own())); assert.equal(calls.filter(c => c.method === 'DELETE').length - deletesBefore, 1);
    await page.reload({ waitUntil: 'networkidle' }); assert.equal(await page.getByRole('button', { name: '戦績の操作' }).count(), 0);
    checks.push('authenticated update/delete persistence; failures preserve rows/draft; duplicate sends blocked');
    // Existing new registration still works with the shared form/action.
    await page.goto(origin + '/matches', { waitUntil: 'networkidle' }); await page.locator('[name=environment_id]').selectOption(ids.env);
    await page.getByRole('button', { name: '保存してホームへ' }).click(); await page.waitForURL(origin + '/');
    checks.push('authenticated new registration');
    // Guest edits/cancels/deletes and real import action, with no Guest DB mutations.
    await page.goto(origin + '/guest', { waitUntil: 'networkidle' });
    await page.getByRole('button', { name: '戦績入力', exact: true }).click();
    await page.locator('[name=environment_id]').selectOption(ids.env);
    await page.getByRole('button', { name: '入力を試す' }).click(); await page.getByRole('status').filter({ hasText: '戦績を保存しました' }).waitFor();
    await page.getByRole('button', { name: '入力を試す' }).click();
    await page.getByRole('button', { name: 'ホーム', exact: true }).click();
    const guestRaw = () => page.evaluate(() => localStorage.getItem('svml:guest-matches:v1'));
    const guestBefore = await guestRaw(); const beforeCalls = calls.length;
    await edit(); await page.getByRole('button', { name: '負け', exact: true }).click(); await page.getByRole('button', { name: '編集をキャンセル' }).click(); assert.equal(await guestRaw(), guestBefore);
    await remove(); await page.getByRole('button', { name: 'キャンセル', exact: true }).click(); assert.equal(await guestRaw(), guestBefore);
    await edit(); await page.getByRole('button', { name: '負け', exact: true }).click();
    await page.locator('dialog select').nth(1).selectOption(ids.arch2);
    await page.getByRole('button', { name: '変更を保存' }).click(); await page.getByRole('status').filter({ hasText: '戦績を更新しました' }).waitFor();
    const editedGuest = JSON.parse(await guestRaw())[0]; assert.equal(editedGuest.result, 'lose');
    assert.equal(editedGuest.my_archetype_id, ids.arch2); assert.equal(editedGuest.played_at, JSON.parse(guestBefore)[0].played_at);
    await page.reload({ waitUntil: 'networkidle' }); assert.equal(JSON.parse(await guestRaw())[0].result, 'lose');
    // Remove the unedited second row.
    await page.getByRole('button', { name: '戦績の操作' }).nth(1).click(); await page.getByRole('button', { name: '削除', exact: true }).click();
    await page.getByRole('button', { name: '削除する' }).click(); await page.getByRole('status').filter({ hasText: '戦績を削除しました' }).waitFor();
    await page.reload({ waitUntil: 'networkidle' }); assert.equal(JSON.parse(await guestRaw()).length, 1);
    assert.equal(calls.slice(beforeCalls).filter(c => ['PATCH', 'DELETE', 'POST'].includes(c.method) && c.path === '/rest/v1/matches').length, 0);
    // A denied write retains the existing row and editor; restore prototype before proceeding.
    await edit(); const persisted = await guestRaw();
    await page.evaluate(() => { window.originalSetItem = Storage.prototype.setItem; Storage.prototype.setItem = function() { throw Error('denied'); }; });
    await page.getByRole('button', { name: '変更を保存' }).click(); await page.getByRole('alert').filter({ hasText: '端末の戦績を変更できませんでした' }).waitFor(); assert.equal(await guestRaw(), persisted);
    await page.evaluate(() => { Storage.prototype.setItem = window.originalSetItem; }); await page.getByRole('button', { name: '編集をキャンセル' }).click();
    await remove(); await page.evaluate(() => { Storage.prototype.setItem = function() { throw Error('denied'); }; });
    await page.getByRole('button', { name: '削除する' }).click(); await page.getByRole('alert').filter({ hasText: '端末の戦績を変更できませんでした' }).waitFor(); assert.equal(await guestRaw(), persisted);
    await page.evaluate(() => { Storage.prototype.setItem = window.originalSetItem; }); await page.getByRole('button', { name: 'キャンセル', exact: true }).click();
    await page.goto(origin + '/', { waitUntil: 'networkidle' });
    await page.getByRole('button', { name: '正式データに取り込む' }).click(); await page.getByRole('status').filter({ hasText: '1件を保存しました' }).waitFor();
    assert.equal(await guestRaw(), '[]');
    await chain; const imported = (await db.query('select * from public.matches where user_id=$1 and result=$2', [ids.a, 'lose'])).rows;
    assert.equal(imported.length, 1); assert.equal(imported[0].my_archetype_id, ids.arch2);
    checks.push('Guest new/edit/delete/cancels/reload/storage failures; only edited remaining row imported');
    for (const route of ['/analysis', '/matrix', '/environment', '/admin/weekly-report', '/admin/obs/environment']) {
      await page.goto(origin + route, { waitUntil: 'networkidle' });
      assert.doesNotMatch(await page.locator('body').innerText(), /Application error|取得できませんでした/); checks.push(route + ' loads');
    }
    assert.deepEqual(pageerrors, []); assert.deepEqual(errors, []); assert.deepEqual(warnings, []);
    fs.writeFileSync(path.join(output, 'browser.json'), JSON.stringify({ passed: true, checks, errors, warnings, pageerrors, boundary: 'loopback HTTP adapter with real PGlite migrations/RLS/RPCs; synthetic Auth' }, null, 2));
    console.log('Browser verification passed: ' + checks.join('; '));
  } finally { if (browser) await browser.close(); app.kill(); await new Promise(r => api.close(r)); await chain; await db.close(); fs.closeSync(log); }
})().catch(error => { console.error(error); process.exitCode = 1; });
