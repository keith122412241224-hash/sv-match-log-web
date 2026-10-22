/* eslint-disable @typescript-eslint/no-require-imports */
// Actual built Next page + original Server Action -> isolated localhost Supabase boundary.
const fs = require('node:fs'), path = require('node:path'), http = require('node:http'), cp = require('node:child_process'), assert = require('node:assert/strict');
const savedFetch = fetch; require('./register.cjs'); globalThis.fetch = savedFetch;
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const { SHADOWVERSE_CLASSES } = require('../src/lib/constants');
assert.equal(process.env.NEXT_PUBLIC_SUPABASE_URL, 'http://127.0.0.1:54339');
assert.equal(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, 'test-public-key');
const label = process.env.DECK_UX_BROWSER || 'chromium', out = path.resolve('build/deck-management-ux');
const origin = 'http://localhost:3306', id = n => '00000000-0000-4000-8000-' + String(n).padStart(12, '0');
const user = { id: id(1), aud: 'authenticated', role: 'authenticated', is_anonymous: false, email: 'local@example.test', app_metadata: {}, user_metadata: {} };
const original = SHADOWVERSE_CLASSES.flatMap((class_name, i) => Array.from({ length: i % 3 + 1 }, (_, j) => ({ id: id(100 + i * 10 + j), class_name, name: `${class_name}検証デッキ${j + 1}`, is_active: true, sort_order: j })));
original[0].name = 'LongUnbrokenDeckName'.repeat(12); original[4].name = 'とても長い日本語のデッキ名'.repeat(8);
let decks = original, delay = 0;
const report = { browser: label, checks: [], requests: [], writes: [], errors: [], unexpected: [], passed: false };
const check = name => { report.checks.push(name); console.log('PASS ' + name); };
const api = http.createServer(async (req, res) => {
  try {
    const u = new URL(req.url, 'http://127.0.0.1:54339'), table = u.pathname.split('/').at(-1);
    report.requests.push({ method: req.method, path: u.pathname, query: u.search });
    let data;
    if (req.method === 'POST' && table === 'deck_suggestions') {
      let raw = ''; for await (const b of req) raw += b;
      report.writes.push(JSON.parse(raw)); if (delay) await new Promise(r => setTimeout(r, delay));
      res.writeHead(201, { 'Content-Type': 'application/json' }); res.end('{}'); return;
    }
    if (u.pathname === '/auth/v1/user') data = user;
    else if (table === 'get_home_dashboard') data = { summary: { total: 0, wins: 0, winRate: null, firstWinRate: null, secondWinRate: null }, recent: [] };
    else if (!['GET', 'HEAD'].includes(req.method)) throw Error('unexpected write ' + u.pathname);
    else if (table === 'admin_users') data = null;
    else if (table === 'environments') data = [{ id: id(2), name: 'ローカル検証環境', created_at: '2026-01-01', allow_match_input: true }];
    else if (['decks', 'deck_archetypes'].includes(table)) data = decks;
    else throw Error('unexpected read ' + u.pathname);
    res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(data));
  } catch (e) { report.unexpected.push(e.message); res.writeHead(500); res.end('{}'); }
});
const suggestion = page => page.locator('main > div > details');
const list = page => page.getByRole('region', { name: /^標準デッキ一覧/ });
const groups = page => list(page).locator('details');
const isOpen = locator => locator.evaluate(e => e.open);
const shot = (page, name) => page.screenshot({ path: path.join(out, 'screenshots', label + '-' + name + '.png'), fullPage: true });
async function expandedAX(context, page, name, expected) {
  const cdp = await context.newCDPSession(page);
  try {
    const { nodes } = await cdp.send('Accessibility.getFullAXTree');
    const node = nodes.find(n => n.name?.value === name && n.properties?.some(p => p.name === 'expanded'));
    assert.ok(node, 'native disclosure available in accessibility tree: ' + name);
    assert.equal(node.properties.find(p => p.name === 'expanded').value.value, expected);
  } finally { await cdp.detach(); }
}
async function closeAll(page) {
  for (const d of [suggestion(page), ...await groups(page).all()]) if (await isOpen(d)) await d.locator(':scope > summary').click();
}
(async () => {
  fs.mkdirSync(path.join(out, 'screenshots'), { recursive: true });
  await new Promise(r => api.listen(54339, '127.0.0.1', r));
  const fd = fs.openSync(path.join(out, label + '-server.log'), 'w');
  const app = cp.spawn(process.execPath, [require.resolve('next/dist/bin/next'), 'start', '-p', '3306', '-H', '127.0.0.1'], { env: process.env, windowsHide: true, stdio: ['ignore', fd, fd] });
  let browser, page;
  try {
    let ready = false;
    for (let i = 0; i < 100; i++) { try { if ((await fetch(origin + '/privacy')).ok) { ready = true; break; } } catch {} await new Promise(r => setTimeout(r, 200)); }
    assert.ok(ready, 'local Next server ready');
    browser = await chromium.launch({ headless: true, executablePath: process.env.CHROME_EXECUTABLE });
    report.version = browser.version();
    const context = await browser.newContext({ viewport: { width: 1152, height: 1000 }, timezoneId: 'Asia/Tokyo' });
    const exp = Math.floor(Date.now() / 1000) + 3600;
    const session = { access_token: ['eyJhbGciOiJIUzI1NiJ9', Buffer.from(JSON.stringify({ sub: user.id, exp })).toString('base64url'), 'fixture'].join('.'), refresh_token: 'fixture', expires_at: exp, expires_in: 3600, token_type: 'bearer', user };
    await context.addCookies([{ name: 'sb-127-auth-token', value: 'base64-' + Buffer.from(JSON.stringify(session)).toString('base64url'), url: origin }]);
    await context.route('**/*', route => {
      const u = new URL(route.request().url());
      if (['localhost', '127.0.0.1'].includes(u.hostname) || ['data:', 'blob:'].includes(u.protocol)) return route.continue();
      report.unexpected.push('external browser request ' + u.hostname); return route.abort();
    });
    page = await context.newPage(); page.setDefaultTimeout(15000);
    page.on('pageerror', e => report.errors.push(e.message));
    page.on('console', m => { if (m.type() === 'error') report.errors.push(m.text()); });
    await page.goto(origin + '/decks', { waitUntil: 'networkidle' });
    assert.equal(await page.getByRole('heading', { name: 'デッキ管理', exact: true }).count(), 1);
    const proposal = suggestion(page), head = proposal.locator(':scope > summary');
    assert.equal(await isOpen(proposal), false);
    assert.equal(await proposal.locator('form').isVisible(), false);
    assert.equal(await groups(page).count(), 7);
    assert.deepEqual(await groups(page).evaluateAll(es => es.map(e => e.open)), Array(7).fill(false));
    assert.ok((await proposal.boundingBox()).y < (await list(page).boundingBox()).y);
    assert.equal(await list(page).getByRole('heading', { level: 2 }).innerText(), `標準デッキ一覧（${decks.length}デッキ）`);
    assert.deepEqual(await groups(page).locator('h3').allTextContents(), SHADOWVERSE_CLASSES);
    for (let i = 0; i < 7; i++) {
      const d = groups(page).nth(i), name = SHADOWVERSE_CLASSES[i];
      assert.equal(await d.locator('summary img').getAttribute('alt'), name);
      assert.equal(await d.locator('summary img').evaluate(e => e.complete && e.naturalWidth > 0), true);
      assert.ok((await d.locator('summary').innerText()).includes(`${decks.filter(v => v.class_name === name).length}デッキ`));
    }
    await shot(page, 'pc-initial'); await expandedAX(context, page, 'デッキ候補を申請', false);
    check('initial order, all closed, actual counts, seven class names and loaded icons');
    const readsBefore = report.requests.length;
    await head.focus(); await page.keyboard.press('Enter'); assert.equal(await isOpen(proposal), true);
    await expandedAX(context, page, 'デッキ候補を申請', true);
    assert.equal(await head.evaluate(e => getComputedStyle(e).outlineWidth), '2px');
    await page.keyboard.press('Tab'); assert.equal(await proposal.getByRole('button', { name: 'エルフ', exact: true }).evaluate(e => e === document.activeElement), true);
    await proposal.locator('input[name=suggested_name]').fill('保持される入力');
    await shot(page, 'pc-form-open');
    await head.focus(); await page.keyboard.press('Space'); assert.equal(await isOpen(proposal), false);
    await head.click(); assert.equal(await proposal.locator('input[name=suggested_name]').inputValue(), '保持される入力');
    await head.click(); assert.equal(await isOpen(proposal), false);
    check('proposal click/reclose, Enter/Space, Tab, visible focus, accessibility expanded state, input retained');
    const first = groups(page).nth(0), second = groups(page).nth(2);
    await first.locator('summary').focus(); await page.keyboard.press('Space'); assert.equal(await isOpen(first), true);
    await shot(page, 'pc-class-open');
    await second.locator('summary').click(); assert.equal(await isOpen(first), true); assert.equal(await isOpen(second), true);
    await shot(page, 'pc-multiple-classes');
    await first.locator('summary').focus(); await page.keyboard.press('Enter'); assert.equal(await isOpen(first), false); assert.equal(await isOpen(second), true);
    for (const d of await groups(page).all()) if (!await isOpen(d)) await d.locator('summary').click();
    const actual = await groups(page).locator(':scope > div > div > div').allTextContents();
    assert.deepEqual(actual, SHADOWVERSE_CLASSES.flatMap(c => decks.filter(d => d.class_name === c).map(d => d.name)));
    assert.equal(new Set(actual).size, decks.length);
    await page.waitForLoadState('networkidle'); assert.equal(report.requests.length, readsBefore, 'disclosures do not refetch data or RPC');
    check('independent multi-class expansion, class keyboard controls, exact names/order, no duplicates, zero refetch');
    for (const width of [320, 390, 768, 1152, 1920]) {
      await page.setViewportSize({ width, height: 1000 });
      if (!await isOpen(proposal)) await head.click();
      await proposal.locator('summary').filter({ hasText: 'メモを添える' }).click();
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'page fits at ' + width);
      assert.ok(await page.locator('main input:not([type=hidden]),main textarea,main summary,main button').evaluateAll(es => es.filter(e => e.getClientRects().length).every(e => { const b = e.getBoundingClientRect(); return b.left >= 0 && b.right <= innerWidth && e.scrollWidth <= e.clientWidth; })), 'controls fit at ' + width);
      assert.ok(await groups(page).locator(':scope > div > div').evaluateAll(es => es.every(e => e.scrollWidth <= e.clientWidth)), 'long names fit at ' + width);
      const columns = await second.locator(':scope > div').evaluate(e => getComputedStyle(e).gridTemplateColumns.split(' ').length);
      assert.equal(columns, width < 640 ? 1 : width < 1024 ? 2 : 3);
      assert.ok(await groups(page).locator('summary').evaluateAll(es => es.every(e => e.getBoundingClientRect().height >= 44)));
      if (width === 390) {
        await closeAll(page); await shot(page, 'mobile-initial'); await head.click(); await shot(page, 'mobile-form-open'); await head.click(); await second.locator('summary').click(); await shot(page, 'mobile-class-open');
        for (const d of await groups(page).all()) if (!await isOpen(d)) await d.locator('summary').click();
      }
    }
    check('320/390/768/1152/1920px: no overflow, long names, one/two/three columns, touch target size');
    await page.setViewportSize({ width: 1152, height: 1000 });
    if (!await isOpen(proposal)) await head.click();
    const form = proposal.locator('form'), input = form.locator('input[name=suggested_name]');
    await input.fill(''); await form.getByRole('button', { name: '候補を申請', exact: true }).click();
    assert.equal(await input.evaluate(e => e.validity.valueMissing), true); assert.equal(report.writes.length, 0);
    await form.getByRole('button', { name: 'ウィッチ', exact: true }).click(); await input.fill(' 新しい候補 ');
    const memoDetails = form.locator('details'); if (!await isOpen(memoDetails)) await memoDetails.locator('summary').click();
    await form.locator('textarea[name=memo]').fill(' 任意のメモ '); delay = 700;
    await form.getByRole('button', { name: '候補を申請', exact: true }).click();
    const pending = form.getByRole('button', { name: '申請中...', exact: true }); await pending.waitFor(); assert.equal(await pending.isDisabled(), true);
    await form.getByRole('button', { name: '候補を申請', exact: true }).waitFor(); await page.waitForLoadState('networkidle');
    assert.equal(report.writes.length, 1);
    assert.deepEqual(report.writes[0], { user_id: user.id, class_name: 'ウィッチ', suggested_name: '新しい候補', memo: '任意のメモ', status: 'pending' });
    await form.getByRole('button', { name: 'エルフ', exact: true }).click(); await input.fill('メモなし候補'); await form.locator('textarea[name=memo]').fill('');
    await form.getByRole('button', { name: '候補を申請', exact: true }).click(); await pending.waitFor(); await form.getByRole('button', { name: '候補を申請', exact: true }).waitFor();
    assert.deepEqual(report.writes[1], { user_id: user.id, class_name: 'エルフ', suggested_name: 'メモなし候補', memo: null, status: 'pending' });
    check('real Server Action after expansion: required validation, selected class, trimmed values, optional memo, member ID, pending status/disabled button');
    decks = []; await page.reload({ waitUntil: 'networkidle' });
    assert.equal(await groups(page).count(), 0); assert.equal(await page.getByText('標準デッキがまだ登録されていません。', { exact: true }).count(), 1);
    assert.equal(await list(page).getByRole('heading', { level: 2 }).innerText(), '標準デッキ一覧（0デッキ）');
    assert.equal(await isOpen(suggestion(page)), false);
    check('zero decks keeps empty guidance, proposal, zero total, no empty groups');
    decks = [...original.slice(0, 1), { id: id(900), name: '未知のデッキ', class_name: '未知のクラス', is_active: true }, { id: id(901), name: '未設定のデッキ', class_name: '', is_active: true }];
    await page.reload({ waitUntil: 'networkidle' });
    assert.deepEqual(await groups(page).locator('h3').allTextContents(), ['エルフ', '未知のクラス', 'クラス未設定']);
    for (const d of await groups(page).all()) await d.locator('summary').click();
    assert.deepEqual(await groups(page).locator(':scope > div > div > div').allTextContents(), decks.map(d => d.name));
    check('unknown and blank classes retained after canonical classes, missing classes absent');
    // Optional read-only catalog evidence is replayed through the same local boundary.
    // The synthetic edge-case and mutation tests above always run independently.
    if (process.env.DECK_UX_SNAPSHOT) {
      const snapshot = JSON.parse(fs.readFileSync(process.env.DECK_UX_SNAPSHOT, 'utf8'));
      decks = snapshot.decks.map(d => ({ ...d, is_active: true }));
      await page.reload({ waitUntil: 'networkidle' });
      assert.equal(await list(page).getByRole('heading', { level: 2 }).innerText(), `標準デッキ一覧（${decks.length}デッキ）`);
      const expectedClasses = [...new Set([...SHADOWVERSE_CLASSES, ...decks.map(d => d.class_name)])].filter(c => decks.some(d => d.class_name === c));
      assert.deepEqual(await groups(page).locator('h3').allTextContents(), expectedClasses.map(c => c || 'クラス未設定'));
      for (const d of await groups(page).all()) await d.locator('summary').click();
      assert.deepEqual(await groups(page).locator(':scope > div > div > div').allTextContents(), expectedClasses.flatMap(c => decks.filter(d => d.class_name === c).map(d => d.name)));
      report.catalog = { source: snapshot.source, count: decks.length, classes: expectedClasses.map(c => ({ name: c, count: decks.filter(d => d.class_name === c).length })) };
      await closeAll(page); await shot(page, 'snapshot-pc-initial');
      await head.click(); await shot(page, 'snapshot-pc-form-open'); await head.click();
      await groups(page).nth(2).locator('summary').click(); await shot(page, 'snapshot-pc-class-open');
      await groups(page).nth(3).locator('summary').click(); await shot(page, 'snapshot-pc-multiple-classes');
      await closeAll(page); await page.setViewportSize({ width: 390, height: 1000 }); await shot(page, 'snapshot-mobile-initial');
      await head.click(); await shot(page, 'snapshot-mobile-form-open'); await head.click();
      await groups(page).nth(2).locator('summary').click(); await shot(page, 'snapshot-mobile-class-open');
      check('read-only current catalog replayed locally: exact total, per-class counts, names and ordering; seven screenshots');
    }
    const guest = await browser.newContext();
    const guestPage = await guest.newPage(); await guestPage.goto(origin + '/decks', { waitUntil: 'networkidle' });
    assert.equal(new URL(guestPage.url()).pathname, '/login'); await guest.close();
    check('existing unauthenticated /decks redirect preserved');
    assert.deepEqual(report.errors, []); assert.deepEqual(report.unexpected, []); report.passed = true;
  } finally {
    if (page && !report.passed) await shot(page, 'failure').catch(() => {});
    await browser?.close(); app.kill(); await new Promise(r => api.close(r)); fs.closeSync(fd);
  }
})().catch(e => { report.failure = e.stack; process.exitCode = 1; }).finally(() => {
  fs.writeFileSync(path.join(out, label + '-browser.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ passed: report.passed, checks: report.checks.length, failure: report.failure }));
});
