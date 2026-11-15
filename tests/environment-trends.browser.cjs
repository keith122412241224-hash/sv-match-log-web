/* eslint-disable @typescript-eslint/no-require-imports */
// Actual built Next page/API -> local simulated Auth/PostgREST -> real PostgreSQL SQL.
const fs = require('node:fs'), path = require('node:path'), http = require('node:http'), assert = require('node:assert/strict'), { spawn, spawnSync } = require('node:child_process');
const nativeFetch = global.fetch; require('./register.cjs'); global.fetch = nativeFetch;
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || path.resolve('build/environment-trends-tools/node_modules/playwright'));
const h = require('./environment-trends-db.cjs');
const { analysisFixture } = require('./analysis-browser-fixture.cjs');
const origin = 'http://localhost:3296', out = path.resolve('build/environment-trends-browser');
fs.mkdirSync(out, { recursive: true });
const report = { checks: [], requests: [], errors: [], passed: false };
async function main() {
  const db = await h.createDb(); let browser, app, api, log, fail = false;
  try {
    const rows = [];
    for (let day = 1; day <= 14; day++) for (let i = 0; i < 4; i++) rows.push(h.row({ played_at: `2026-11-${String(day).padStart(2, '0')}T01:00:00Z`,
      my_archetype_id: h.decks[i].id, opponent_archetype_id: h.decks[(i + day) % 4].id, result: day % 2 ? 'win' : 'lose' }));
    await h.seed(db, rows);
    const environments = h.environments.map(e => ({ ...e, dashboard_end_at: null }));
    const decks = h.decks.map((d, i) => ({ ...d, environment_id: i === 4 ? h.OLD : null }));
    const user = { id: h.MEMBER, aud: 'authenticated', role: 'authenticated', is_anonymous: false, email: 'fixture@example.test', app_metadata: {}, user_metadata: {} };
    let chain = Promise.resolve();
    api = http.createServer((req, res) => { chain = chain.then(async () => {
      try {
        const url = new URL(req.url, 'http://127.0.0.1:54339'), table = url.pathname.split('/').at(-1);
        let body = ''; for await (const chunk of req) body += chunk;
        let data;
        if (url.pathname.includes('/rpc/')) {
          const args = JSON.parse(body); report.requests.push({ name: table, args });
          if (table === 'get_environment_dashboard_aggregates_v4') data = (await db.query('select public.get_environment_dashboard_aggregates_v4($1,$2,$3) as data', [args.p_environment_id, args.p_period, args.p_rank_filters])).rows[0].data;
          else if (table === 'get_environment_trend_aggregates_v1') {
            if (fail) { res.writeHead(503); res.end('{}'); return; }
            data = await h.query(db, { environment: args.p_environment_id, period: args.p_period, ranks: args.p_rank_filters, decks: args.p_deck_ids });
          } else if (table.startsWith('get_analysis_aggregates_')) data = analysisFixture(rows, args);
          else if (table === 'get_home_dashboard') data = { summary: { total: 0, wins: 0, winRate: null, firstWinRate: null, secondWinRate: null }, recent: [] };
          else throw Error('Unexpected RPC ' + table);
        } else {
          assert.ok(['GET', 'HEAD'].includes(req.method));
          if (url.pathname === '/auth/v1/user') data = user;
          else if (table === 'admin_users') data = null;
          else if (table === 'environments') data = environments;
          else if (['deck_archetypes', 'decks'].includes(table)) data = decks.map(d => ({ ...d, aliases: [] }));
          else if (table === 'matches') data = []; // Analysis navigation prefetches the existing home/matches pages.
          else throw Error('Unexpected read ' + url.pathname);
        }
        res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(data));
      } catch (error) { report.errors.push(error.stack); res.writeHead(500); res.end('{}'); }
    }); });
    await new Promise(resolve => api.listen(54339, '127.0.0.1', resolve));
    const env = {};
    for (const [key, value] of Object.entries(process.env)) if (/^(PATH|PATHEXT|SystemRoot|WINDIR|COMSPEC|TEMP|TMP|APPDATA|LOCALAPPDATA|USERPROFILE|HOMEDRIVE|HOMEPATH|ProgramFiles|ProgramFiles\(x86\)|ProgramW6432|NUMBER_OF_PROCESSORS|PROCESSOR_ARCHITECTURE)$/i.test(key)) env[key] = value;
    Object.assign(env, { NEXT_PUBLIC_SUPABASE_URL: 'http://127.0.0.1:54339', NEXT_PUBLIC_SUPABASE_ANON_KEY: 'fixture', NEXT_TELEMETRY_DISABLED: '1', ADMIN_SUGGESTION_WRITES: 'paused' });
    if (process.argv.includes('--build')) {
      const buildLog = fs.openSync(path.join(out, 'build.log'), 'w');
      const built = spawnSync(process.execPath, [require.resolve('next/dist/bin/next'), 'build'], { windowsHide: true, stdio: ['ignore', buildLog, buildLog], env });
      fs.closeSync(buildLog); assert.equal(built.status, 0, 'fixture build');
    }
    log = fs.openSync(path.join(out, 'server.log'), 'w');
    app = spawn(process.execPath, [require.resolve('next/dist/bin/next'), 'start', '-p', '3296'], { windowsHide: true, stdio: ['ignore', log, log], env });
    let ready = false;
    for (let i = 0; i < 100; i++) { try { if ((await fetch(origin + '/privacy')).ok) { ready = true; break; } } catch {} await new Promise(r => setTimeout(r, 200)); }
    assert.ok(ready);
    browser = await chromium.launch({ headless: true, executablePath: process.env.CHROME_EXECUTABLE || 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe' });
    const context = await browser.newContext({ timezoneId: 'Asia/Tokyo' });
    await context.route('**/*', route => { const u = new URL(route.request().url()); return ['localhost', '127.0.0.1'].includes(u.hostname) || ['data:', 'blob:'].includes(u.protocol) ? route.continue() : route.abort(); });
    const exp = Math.floor(Date.now() / 1000) + 3600, session = { access_token: ['eyJhbGciOiJIUzI1NiJ9', Buffer.from(JSON.stringify({ sub: user.id, exp })).toString('base64url'), 'fixture'].join('.'), refresh_token: 'fixture', expires_at: exp, expires_in: 3600, token_type: 'bearer', user };
    await context.addCookies([{ name: 'sb-127-auth-token', value: 'base64-' + Buffer.from(JSON.stringify(session)).toString('base64url'), url: origin }]);
    const page = await context.newPage(); page.on('pageerror', e => report.errors.push(e.message));
    await page.goto(origin + '/environment?environment=' + h.NEW + '&period=7d&ranks=unranked', { waitUntil: 'networkidle' });
    await page.getByRole('heading', { name: '遭遇率TOP5', exact: true }).waitFor();
    const total = await page.getByRole('region', { name: '集計条件' }).locator('dd').innerText();
    assert.equal(report.requests.length, 1);
    const summaryTab = page.getByRole('tab', { name: '環境サマリー' }), trendsTab = page.getByRole('tab', { name: '推移分析' });
    const panel = page.getByRole('tabpanel', { name: '推移分析' });
    const radio = value => page.locator(`input[name=period][value="${value}"]`);
    const settle = async () => { await page.waitForFunction(() => !document.querySelector('#environment-panel-trends')?.textContent.includes('読み込み中')); };
    const openDecks = async () => { await panel.getByRole('button', { name: /^デッキ選択/ }).click(); return page.getByRole('dialog'); };
    const apply = async d => { await d.getByRole('button', { name: '決定', exact: true }).click(); await settle(); };
    await trendsTab.click(); assert.ok(await radio('30d').isChecked()); assert.match(await panel.innerText(), /比較したいデッキ/);
    let dialog = await openDecks();
    assert.equal(await dialog.locator('input[type=checkbox]').count(), 4);
    assert.equal(await dialog.locator('input[type=checkbox]:visible').count(), 0);
    await dialog.getByRole('button', { name: 'すべて選択', exact: true }).click(); await dialog.getByRole('button', { name: 'キャンセル', exact: true }).click();
    assert.equal(report.requests.length, 1);
    dialog = await openDecks(); await dialog.getByRole('button', { name: /ネメシス（/ }).click();
    await dialog.getByRole('button', { name: 'ネメシスを全選択・全解除', exact: true }).click();
    await dialog.getByRole('button', { name: /ロイヤル（/ }).click(); await dialog.getByRole('checkbox', { name: h.decks[1].name }).check();
    assert.equal(report.requests.length, 1); await apply(dialog);
    assert.equal(await panel.locator('[data-trend-deck]').count(), 2);
    const colors = await panel.locator('[data-trend-deck]').evaluateAll(es => es.map(e => e.getAttribute('stroke'))), requests = report.requests.length;
    await panel.getByRole('button', { name: '勝率の推移', exact: true }).click();
    assert.deepEqual(await panel.locator('[data-trend-deck]').evaluateAll(es => es.map(e => e.getAttribute('stroke'))), colors);
    assert.equal(report.requests.length, requests); assert.match(await panel.innerText(), /有効対戦/);
    await panel.getByRole('group', { name: /推移グラフ/ }).focus(); await page.keyboard.press('Home'); assert.match(await panel.innerText(), /観測なし/);
    await page.keyboard.press('End');
    await page.locator('label').filter({ has: radio('14d') }).click(); await settle();
    await summaryTab.click(); assert.ok(await radio('7d').isChecked());
    assert.equal(await page.getByRole('region', { name: '集計条件' }).locator('dd').innerText(), total);
    await trendsTab.click(); assert.ok(await radio('14d').isChecked()); assert.equal(await panel.locator('[data-trend-deck]').count(), 2);
    report.checks.push('summary unchanged; no initial duplicate RPC; independent periods; empty/draft/cancel/class/checkbox selection; two lines; colors and selected decks retained; metric switch has no request; keyboard date details');
    for (const width of [1440, 768, 390, 320]) {
      await page.setViewportSize({ width, height: 900 });
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
      const svg = panel.locator('svg[role=group]'); await svg.scrollIntoViewIfNeeded();
      await svg.hover({ position: { x: 90, y: 100 } });
      await page.screenshot({ path: path.join(out, `chart-${width}.png`), fullPage: true });
      dialog = await openDecks(); const box = await dialog.boundingBox(); assert.ok(box.x >= 0 && box.x + box.width <= width + 1 && box.y >= 0 && box.y + box.height <= 901);
      await dialog.getByRole('button', { name: '決定', exact: true }).focus(); await page.keyboard.press('Tab'); assert.ok(await dialog.getByRole('button', { name: '閉じる', exact: true }).evaluate(e => e === document.activeElement));
      await page.keyboard.press('Escape');
    }
    report.checks.push('PC/tablet/mobile 1440/768/390/320px: no overflow, responsive chart, hover details, dialog bounds and keyboard focus containment');
    await page.route('**/api/environment/trends', async route => {
      if (route.request().postDataJSON().period === '30d') await new Promise(r => setTimeout(r, 600));
      await route.continue().catch(() => {});
    });
    await page.locator('label').filter({ has: radio('30d') }).click();
    await page.locator('label').filter({ has: radio('7d') }).click(); await settle();
    await page.waitForTimeout(800);
    assert.equal(await panel.locator('input[type=date]').getAttribute('min'), '2026-11-08');
    await page.unroute('**/api/environment/trends');
    report.checks.push('rapid period changes abort obsolete requests and keep the latest range');
    await page.getByRole('button', { name: /^ランク / }).click(); dialog = page.getByRole('dialog');
    await dialog.getByRole('button', { name: 'Master', exact: true }).click(); await dialog.getByRole('button', { name: '適用', exact: true }).click(); await settle();
    assert.match(await panel.innerText(), /表示できる勝率データがありません/);
    assert.deepEqual(report.requests.at(-1).args.p_rank_filters, ['master:emerald', 'master:topaz', 'master:ruby', 'master:sapphire', 'master:diamond']);
    fail = true; await page.locator('label').filter({ has: radio('14d') }).click(); await panel.getByRole('alert').waitFor();
    fail = false; await panel.getByRole('button', { name: '再試行', exact: true }).click(); await settle(); assert.equal(await panel.getByRole('alert').count(), 0);
    await page.getByRole('combobox', { name: '環境', exact: true }).selectOption(h.OLD); await settle();
    assert.equal(report.requests.at(-1).args.p_environment_id, h.OLD);
    dialog = await openDecks(); assert.equal(await dialog.locator('input[type=checkbox]').count(), 5);
    await dialog.getByRole('button', { name: 'すべて選択', exact: true }).click(); await apply(dialog);
    assert.equal(report.requests.at(-1).args.p_deck_ids.length, 5);
    dialog = await openDecks(); await dialog.getByRole('button', { name: '選択をクリア', exact: true }).click(); await apply(dialog);
    assert.match(await panel.innerText(), /比較したいデッキ/);
    const count = report.requests.length;
    for (const body of [{}, { environment: h.NEW, period: '7d', ranks: [], decks: [h.decks[0].id] }]) assert.equal((await page.request.post(origin + '/api/environment/trends', { data: body })).status(), 400);
    assert.equal(report.requests.length, count);
    const anonymous = await browser.newContext(); assert.equal((await anonymous.request.post(origin + '/api/environment/trends', { data: {} })).status(), 401); await anonymous.close();
    report.checks.push('rank/environment/catalog filters; all/clear; no-data/error/retry; invalid API requests and signed-out rejection');
    await page.goto(origin + '/analysis?environment=' + h.NEW, { waitUntil: 'networkidle' });
    await page.getByRole('button', { name: '分析条件を変更', exact: true }).click();
    await page.getByRole('button', { name: /^使用デッキ / }).click(); dialog = page.getByRole('dialog');
    const before = report.requests.length;
    await dialog.getByRole('button', { name: '選択をクリア', exact: true }).click();
    await dialog.getByRole('button', { name: '決定', exact: true }).click();
    assert.ok(await dialog.getByRole('alert').isVisible(), 'legacy analysis rejects explicit empty');
    await dialog.getByRole('button', { name: /ネメシス（/ }).click();
    await dialog.getByRole('checkbox', { name: h.decks[0].name, exact: true }).check();
    await dialog.getByRole('button', { name: '決定', exact: true }).click();
    assert.equal(report.requests.length, before, 'legacy confirmation changes form only');
    assert.equal(await page.locator('input[name=myDeck]').inputValue(), h.decks[0].id);
    await page.getByRole('button', { name: /^使用デッキ / }).click(); dialog = page.getByRole('dialog');
    await dialog.getByRole('button', { name: 'すべて', exact: true }).click();
    await dialog.getByRole('button', { name: '決定', exact: true }).click();
    assert.equal(await page.locator('input[name=myDeck]').inputValue(), ''); assert.equal(report.requests.length, before);
    report.checks.push('existing Analysis dialog still rejects empty, confirms form-only selection, and treats all as unrestricted');
    assert.deepEqual(report.errors, []); report.passed = true;
  } finally { await browser?.close(); app?.kill(); if (api) await new Promise(r => api.close(r)); if (log !== undefined) fs.closeSync(log); await db.close(); }
}
main().catch(error => { report.error = error.stack; process.exitCode = 1; }).finally(() => { fs.writeFileSync(path.join(out, 'report.json'), JSON.stringify(report, null, 2)); console.log(JSON.stringify({ passed: report.passed, checks: report.checks, errors: report.errors, error: report.error }, null, 2)); });
