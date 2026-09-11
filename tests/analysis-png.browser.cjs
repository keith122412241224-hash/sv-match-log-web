/* eslint-disable @typescript-eslint/no-require-imports */
// Optional browser check: PLAYWRIGHT_MODULE and CHROME_EXECUTABLE can point to local installations.
// Uses synthetic records and a local, read-only Supabase stub. No production credentials.
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');
const assert = require('node:assert/strict');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const appPort = 3218;
const apiPort = 54330;
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
    env: { ...process.env, NEXT_PUBLIC_SUPABASE_URL: `http://127.0.0.1:${apiPort}`, NEXT_PUBLIC_SUPABASE_ANON_KEY: 'test-public-key' }
  });
  let browser;
  try {
    for (let i = 0; i < 60; i++) {
      try { if ((await fetch(`${origin}/privacy`)).ok) break; } catch {}
      await new Promise(resolve => setTimeout(resolve, 500));
    }
    browser = await chromium.launch({ headless: true, ...(process.env.CHROME_EXECUTABLE ? { executablePath: process.env.CHROME_EXECUTABLE } : {}) });
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, timezoneId: 'Asia/Tokyo' });
    const token = ['eyJhbGciOiJIUzI1NiJ9', Buffer.from(JSON.stringify({ sub: user.id, exp: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url'), 'fixture'].join('.');
    const session = { access_token: token, refresh_token: 'fixture', expires_at: Math.floor(Date.now() / 1000) + 3600, expires_in: 3600, token_type: 'bearer', user };
    await context.addCookies([{ name: 'sb-127-auth-token', value: 'base64-' + Buffer.from(JSON.stringify(session)).toString('base64url'), url: origin }]);
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    // Observe the actual snapshot at canvas encoding, without replacing image generation.
    await page.addInitScript(() => {
      window.originalToBlob = HTMLCanvasElement.prototype.toBlob;
      HTMLCanvasElement.prototype.toBlob = function (...args) {
        const snapshot = document.querySelector('div[inert] > section');
        window.lastSnapshot = snapshot ? {
          text: snapshot.innerText, buttons: snapshot.querySelectorAll('button').length,
          width: snapshot.getBoundingClientRect().width,
          clipped: [...snapshot.querySelectorAll('.overflow-x-auto')].some(node => node.scrollWidth > node.clientWidth + 1),
          icons: [...snapshot.querySelectorAll('img')].map(img => {
            const rect = img.getBoundingClientRect(), root = snapshot.getBoundingClientRect();
            return { src: img.src, x: rect.x - root.x, y: rect.y - root.y, width: rect.width, height: rect.height };
          }),
          images: [...snapshot.querySelectorAll('img')].every(img => img.complete && img.naturalWidth > 0)
        } : null;
        return window.originalToBlob.apply(this, args);
      };
    });
    await page.goto(`${origin}/analysis`);
    await page.getByRole('button', { name: '使用デッキ別サマリーをPNG保存', exact: true }).waitFor();
    assert.equal(await page.locator('button[data-png-exclude]').count(), 5);
    const blocks = [
      ['使用デッキ別サマリー', 'usage-summary'], ['使用デッキ別の勝率', 'deck-winrate'],
      ['相手デッキ別の勝率', 'opponent-winrate'], ['先攻/後攻別の勝率', 'turn-order-winrate'],
      ['対面別勝率', 'matchup-winrate']
    ];
    const results = [];
    async function downloadBlock(title, slug, label) {
      const button = page.getByRole('button', { name: `${title}をPNG保存`, exact: true });
      const section = page.locator('section').filter({ has: button });
      const before = await section.evaluate(node => ({ width: node.getBoundingClientRect().width, text: [...node.querySelectorAll('[data-png-exclude]')].reduce((text, excluded) => text.replace(excluded.innerText, ''), node.innerText).replace(/\s+/g, ' ').trim() }));
      await section.locator('.overflow-x-auto').evaluateAll(nodes => nodes.forEach(node => { node.scrollLeft = 100; }));
      const scrolling = await section.locator('.overflow-x-auto').evaluateAll(nodes => nodes.map(node => node.scrollLeft));
      const waiting = page.waitForEvent('download');
      await button.click();
      const download = await waiting;
      const filename = download.suggestedFilename();
      assert.match(filename, new RegExp(`^analysis-${slug}-\\d{8}-\\d{6}\\.png$`));
      const target = path.join(output, `${label}-${filename}`);
      await download.saveAs(target);
      const png = fs.readFileSync(target);
      assert.equal(png.subarray(1, 4).toString(), 'PNG');
      assert.ok(png.length > 1000);
      const snapshot = await page.evaluate(() => window.lastSnapshot);
      assert.equal(snapshot.buttons, 0);
      assert.equal(snapshot.clipped, false);
      assert.equal(snapshot.images, true);
      assert.equal(snapshot.text.replace(/\s+/g, ' ').trim(), before.text);
      assert.equal(png.readUInt32BE(16), Math.ceil(snapshot.width) * 2);
      assert.equal(await section.evaluate(node => node.getBoundingClientRect().width), before.width);
      assert.deepEqual(await section.locator('.overflow-x-auto').evaluateAll(nodes => nodes.map(node => node.scrollLeft)), scrolling);
      assert.equal(await page.locator('div[inert] > section').count(), 0);
      const pixels = await page.evaluate(async ({ data, icons }) => {
        const img = new Image(); img.src = data; await img.decode();
        const canvas = document.createElement('canvas'); canvas.width = img.width; canvas.height = img.height;
        const ctx = canvas.getContext('2d'); ctx.drawImage(img, 0, 0);
        const rgba = ctx.getImageData(0, 0, img.width, img.height).data;
        let opaque = true, dark = 0;
        for (let i = 0; i < rgba.length; i += 4) { if (rgba[i + 3] !== 255) opaque = false; if (rgba[i] < 100 && rgba[i + 1] < 100 && rgba[i + 2] < 100) dark++; }
        const iconPixels = icons.map(icon => Array.from(ctx.getImageData(Math.round(icon.x * 2), Math.round(icon.y * 2), Math.round(icon.width * 2), Math.round(icon.height * 2)).data).join(','));
        return { opaque, dark, distinctIcons: new Set(iconPixels).size };
      }, { data: `data:image/png;base64,${png.toString('base64')}`, icons: snapshot.icons });
      assert.equal(pixels.opaque, true); assert.ok(pixels.dark > 100);
      assert.ok(pixels.distinctIcons >= new Set(snapshot.icons.map(icon => icon.src)).size, 'Distinct Next/Image URLs must retain distinct class icons');
      results.push({ label, filename, width: png.readUInt32BE(16), height: png.readUInt32BE(20), bytes: png.length });
    }
    for (const [width, label] of [[1440, 'desktop'], [390, 'mobile']]) {
      await page.setViewportSize({ width, height: 1000 });
      for (const [title, slug] of blocks) await downloadBlock(title, slug, label);
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
      await page.screenshot({ path: path.join(output, `${label}-analysis.png`), fullPage: true });
    }
    // Real filter navigation must change the captured table, with no extra data fetch on export.
    await page.selectOption('select[name=myDeck]', 'A');
    await page.locator('input[name=playedFrom]').fill('2026-09-05T00:00');
    await page.locator('input[name=playedTo]').fill('2026-09-05T23:59');
    await Promise.all([page.waitForURL(/myDeck=A/), page.getByRole('button', { name: '表示', exact: true }).click()]);
    await page.waitForLoadState('networkidle');
    const table = page.locator('section').filter({ has: page.getByRole('heading', { name: '使用デッキ別の勝率', exact: true }) });
    assert.match(await table.innerText(), /AFネメシス[\s\S]*10[\s\S]*50%/);
    assert.doesNotMatch(await table.innerText(), /ランプドラゴン/);
    await downloadBlock('使用デッキ別の勝率', 'deck-winrate', 'filtered');
    // Encoding failure recovers, announces an error, and permits a successful retry.
    await page.evaluate(() => { window.observedToBlob = HTMLCanvasElement.prototype.toBlob; HTMLCanvasElement.prototype.toBlob = function (callback) { setTimeout(() => callback(null), 300); }; });
    const retryButton = page.getByRole('button', { name: '使用デッキ別の勝率をPNG保存', exact: true });
    await retryButton.click();
    assert.equal(await retryButton.isDisabled(), true);
    await table.getByRole('alert').waitFor();
    assert.equal(await retryButton.isEnabled(), true);
    assert.equal(await page.locator('div[inert] > section').count(), 0);
    await page.evaluate(() => { HTMLCanvasElement.prototype.toBlob = window.observedToBlob; });
    await downloadBlock('使用デッキ別の勝率', 'deck-winrate', 'retry');
    assert.equal(await table.getByRole('alert').count(), 0);
    await page.locator('input[name=playedFrom]').fill('2026-09-06T00:00');
    await page.locator('input[name=playedTo]').fill('2026-09-06T23:59');
    await Promise.all([page.waitForURL(/playedFrom=2026-09-06/), page.getByRole('button', { name: '表示', exact: true }).click()]);
    await page.waitForLoadState('networkidle');
    assert.match(await table.innerText(), /表示できるデータがありません/);
    for (const [title, slug] of blocks) await downloadBlock(title, slug, 'empty');
    assert.deepEqual(mutations, []);
    assert.deepEqual(errors, []);
    fs.writeFileSync(path.join(output, 'results.json'), JSON.stringify(results, null, 2));
    console.log(`Passed: ${results.length} PNG downloads; desktop/mobile, Japanese titles/icons, full table width, filters, empty data, failure/retry, opaque pixels, no layout/scroll changes or DB writes.`);
  } finally {
    if (browser) await browser.close();
    app.kill();
    api.close();
    fs.closeSync(log);
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
