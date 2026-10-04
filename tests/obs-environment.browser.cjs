/* eslint-disable @typescript-eslint/no-require-imports */
// Build first with NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54339 and
// NEXT_PUBLIC_SUPABASE_ANON_KEY=test-public-key (Next inlines these at build time).
// Then run this script with PLAYWRIGHT_MODULE / CHROME_EXECUTABLE as needed.
// All test requests and writes use an in-memory localhost stub.
const http = require('node:http'), fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict');
const { spawn, execFile } = require('node:child_process'), { promisify } = require('node:util');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const fixture = require('./obs-environment-fixture.cjs'), { periodFixture } = require('./period-report-fixture.cjs');
const { aggregates: matchupFixture } = require('./obs-matchups-fixture.cjs');
const origin = 'http://localhost:3292', apiPort = 54339, out = path.resolve(process.env.OBS_EVIDENCE_DIR || 'build/obs-evidence');
fs.mkdirSync(out, { recursive: true });
const environments = structuredClone(fixture.environments), decks = structuredClone(fixture.decks);
const user = { id: fixture.id(90), aud: 'authenticated', role: 'authenticated', is_anonymous: false, email: 'fixture@example.test', app_metadata: {}, user_metadata: {} };
const suggestions = [{ id: fixture.id(91), user_id: user.id, class_name: 'エルフ', suggested_name: '候補デッキ', status: 'pending', memo: null }];
let admin = true, mode = 'full';
let sqlState = null;
const report = { checks: [], events: [], mutations: [], rpc: [], unexpected: [] };
const api = http.createServer(async (req, res) => {
  try {
    res.setHeader('Content-Type', 'application/json');
    const url = new URL(req.url, `http://127.0.0.1:${apiPort}`), table = url.pathname.split('/').at(-1);
    let body = ''; for await (const part of req) body += part;
    const args = body ? JSON.parse(body) : null;
    let data;
    if (url.pathname.includes('/rpc/')) {
      report.rpc.push({ name: table, args });
      if (table === 'get_environment_dashboard_aggregates_v3') {
        if (mode === 'failure') { res.writeHead(500); res.end(JSON.stringify({ message: 'fixture unavailable' })); return; }
        data = sqlState ? await sqlState.h.environment(sqlState.db, args.p_environment_id, args.p_rank_filters, args.p_period) : fixture.dashboard(args, mode);
        if (sqlState) sqlState.dashboard = data;
      } else if (table === 'get_analysis_aggregates_v3_exclusive') {
        const envArgs = report.rpc.filter(r => r.name === 'get_environment_dashboard_aggregates_v3').at(-1).args;
        const d = sqlState ? sqlState.dashboard : fixture.dashboard(envArgs);
        assert.deepEqual(args, { p_environment_id: d.environmentId, p_played_from: d.current.start, p_played_to: d.current.end,
          p_rank_filters: d.rankFilters, p_include_all_users: true, p_include_reversed: false, p_use_archetype: true,
          p_recent_deck_ids: [], p_my_deck_id: null, p_opponent_deck_id: null, p_result: null, p_turn_order: null });
        if (mode === 'matchupFailure') { res.writeHead(500); res.end(JSON.stringify({ message: 'fixture matchup unavailable' })); return; }
        data = sqlState ? await sqlState.h.analysis(sqlState.db, d) : matchupFixture();
        if (sqlState) sqlState.aggregates = data;
      } else if (/get_period_report_aggregates_v[123]/.test(table)) data = periodFixture([], args);
      else if (table === 'get_home_dashboard') data = { summary: { total: 0, wins: 0, winRate: null, firstWinRate: null, secondWinRate: null }, recent: [] };
      else throw Error('Unexpected RPC: ' + table);
    } else if (!['GET', 'HEAD'].includes(req.method)) {
      assert.ok(admin, 'non-admin mutation');
      const rows = { environments, deck_archetypes: decks, deck_suggestions: suggestions }[table];
      assert.ok(rows, 'Unexpected mutation table ' + table);
      report.mutations.push({ method: req.method, table, args });
      if (req.method === 'POST') rows.push({ id: fixture.id(100 + report.mutations.length), created_at: new Date().toISOString(), aliases: [], ...args });
      else if (req.method === 'PATCH') Object.assign(rows.find(r => r.id === url.searchParams.get('id')?.slice(3)), args);
      else throw Error('Unexpected mutation method ' + req.method);
      data = null;
    } else if (url.pathname === '/auth/v1/user') data = user;
    else if (table === 'admin_users') data = admin ? { id: fixture.id(92), user_id: user.id } : null;
    else if (table === 'environments') data = environments;
    else if (table === 'deck_archetypes' || table === 'decks') data = decks;
    else if (table === 'deck_suggestions') data = suggestions;
    else if (table === 'my_decks') data = [];
    else throw Error('Unexpected read ' + url.pathname);
    res.end(JSON.stringify(data));
  } catch (e) { report.unexpected.push(e.message); res.writeHead(500); res.end('{}'); }
});

(async () => {
  await new Promise(resolve => api.listen(apiPort, '127.0.0.1', resolve));
  const log = fs.openSync(path.join(out, 'server.log'), 'w');
  const app = spawn(process.execPath, [require.resolve('next/dist/bin/next'), 'start', '-p', '3292'], { windowsHide: true, stdio: ['ignore', log, log],
    env: { ...process.env, NEXT_TELEMETRY_DISABLED: '1', NEXT_PUBLIC_SUPABASE_URL: `http://127.0.0.1:${apiPort}`, NEXT_PUBLIC_SUPABASE_ANON_KEY: 'test-public-key', OPENAI_API_KEY: '' } });
  let browser;
  try {
    let ready = false;
    for (let i = 0; i < 100; i++) { try { if ((await fetch(origin + '/privacy')).ok) { ready = true; break; } } catch {} await new Promise(r => setTimeout(r, 300)); }
    assert.ok(ready, 'local server ready');
    browser = await chromium.launch({ headless: true, args: ['--remote-debugging-port=9352'], ...(process.env.CHROME_EXECUTABLE ? { executablePath: process.env.CHROME_EXECUTABLE } : {}) });
    const context = await browser.newContext({ viewport: { width: 1152, height: 1080 }, timezoneId: 'Asia/Tokyo' });
    await context.route('**/*', route => { const u = new URL(route.request().url()); if (['localhost', '127.0.0.1'].includes(u.hostname) || ['data:', 'blob:'].includes(u.protocol)) return route.continue(); report.unexpected.push('External request ' + u.origin); return route.abort(); });
    const exp = Math.floor(Date.now() / 1000) + 3600;
    const token = ['eyJhbGciOiJIUzI1NiJ9', Buffer.from(JSON.stringify({ sub: user.id, exp })).toString('base64url'), 'fixture'].join('.');
    const session = { access_token: token, refresh_token: 'fixture', expires_at: exp, expires_in: 3600, token_type: 'bearer', user };
    await context.addCookies([{ name: 'sb-127-auth-token', value: 'base64-' + Buffer.from(JSON.stringify(session)).toString('base64url'), url: origin }]);
    const page = await context.newPage();
    const observe = p => { p.on('pageerror', e => report.events.push({ type: 'pageerror', message: e.message })); p.on('console', m => { if (['warning', 'error'].includes(m.type())) report.events.push({ type: m.type(), message: m.text() }); }); };
    observe(page);
    const go = async url => { await page.goto(origin + url, { waitUntil: 'networkidle' }); };
    const section = title => page.locator('section').filter({ has: page.getByRole('heading', { name: title, exact: true }) });
    const shot = async name => page.screenshot({ path: path.join(out, name + '.png'), fullPage: true });
    const overflow = async () => {
      const escaped = await page.locator('main').evaluate(el => [...el.querySelectorAll('input,select,button,a,section,li')].filter(n => n.getBoundingClientRect().width && (n.getBoundingClientRect().right > innerWidth + 1 || n.getBoundingClientRect().left < -1)).map(n => n.tagName + ':' + n.textContent.slice(0, 30)));
      assert.deepEqual(escaped, [], 'controls/content must fit viewport');
    };
    const query = '?environment=' + fixture.environments[0].id + '&period=7d&rank=master';
    await go('/admin/obs/environment' + query);
    assert.equal(await page.getByRole('heading', { name: '環境データ', exact: true }).count(), 1);
    if (process.env.AGENT_BROWSER_EXE) {
      const result = await promisify(execFile)(process.env.AGENT_BROWSER_EXE, ['--session', 'obs-check', '--cdp', '9352', 'snapshot'], { windowsHide: true, timeout: 30000, env: { ...process.env, AGENT_BROWSER_SOCKET_DIR: path.join(out, 'agent-sockets') } });
      fs.writeFileSync(path.join(out, 'agent-browser.txt'), result.stdout); assert.match(result.stdout, /遭遇率TOP5/);
    }
    const titles = ['遭遇率TOP5', '勝率TOP5', '増加TOP3', '減少TOP3'];
    const matrix = page.getByRole('table', { name: '遭遇率TOP5の相性表' });
    assert.equal(await matrix.locator('tbody td').count(), 25);
    assert.deepEqual(await matrix.locator('tbody th').allTextContents(), fixture.decks.slice(0, 5).map(d => d.name));
    for (const group of matchupFixture().groups) {
      const cell = matrix.locator(`[data-row="${group.myDeckId}"][data-column="${group.opponentDeckId}"]`);
      assert.equal(await cell.locator('strong').innerText(), `${(group.wins / group.total * 100).toFixed(1)}%`);
      assert.ok((await cell.locator('small').innerText()).startsWith(`${group.total}戦`));
    }
    report.checks.push('25 cells: row/column direction, exact aggregate counts, percentages, mirrors and encounter order');
    for (const width of [1920, 1440, 1248, 1152, 1056, 390, 320]) {
      await page.setViewportSize({ width, height: 1080 }); await overflow();
      assert.equal(await page.locator('main form, main button, main nav').count(), 0);
      await page.evaluate(() => scrollTo(0, 0));
      await shot('obs-' + width);
      if (width >= 1056) {
        const height = await page.locator('main > div').first().evaluate(n => n.getBoundingClientRect().bottom);
        assert.ok(height <= 1080, `upper panel height ${height} fits at ${width}`);
      }
      const dimensions = await matrix.evaluate(el => ({ width: el.getBoundingClientRect().width, pageWidth: document.documentElement.scrollWidth, viewport: innerWidth,
        rateSize: getComputedStyle(el.querySelector('strong')).fontSize, countSize: getComputedStyle(el.querySelector('small')).fontSize,
        overflow: [...el.querySelectorAll('th,td,strong,small')].filter(n => n.scrollWidth > n.clientWidth + 1 && getComputedStyle(n).display !== 'inline').map(n => n.textContent) }));
      assert.ok(dimensions.pageWidth <= width); assert.deepEqual(dimensions.overflow, []);
      await page.getByRole('heading', { name: '遭遇率TOP5｜相性関係', exact: true }).evaluate(n => n.scrollIntoView());
      assert.ok(await page.evaluate(() => scrollY > 0));
      await page.screenshot({ path: path.join(out, `matrix-${width}.png`) });
      report.checks.push({ viewport: `${width}x1080`, dimensions, verticalScroll: true });
    }
    await page.setViewportSize({ width: 1152, height: 1080 });
    const obsRows = {};
    for (const title of titles) obsRows[title] = await page.getByRole('region', { name: title, exact: true }).locator('li').allTextContents();
    const obsRpc = report.rpc.filter(r => r.name === 'get_environment_dashboard_aggregates_v3').at(-1);
    const mutationsBefore = report.mutations.length;
    await go('/environment' + query);
    assert.deepEqual(report.rpc.filter(r => r.name === 'get_environment_dashboard_aggregates_v3').at(-1), obsRpc);
    assert.match(await page.locator('main').innerText(), /登録戦績：800件/);
    for (const title of titles) {
      const normalRows = await section(title).locator('li').allTextContents(); assert.equal(normalRows.length, obsRows[title].length);
      normalRows.forEach((row, i) => {
        const name = fixture.decks.find(d => row.includes(d.name)).name; assert.ok(obsRows[title][i].includes(name));
        if (title.includes('TOP5')) {
          assert.ok(obsRows[title][i].includes(row.match(/\d+\.\d%/)[0]));
          assert.ok(obsRows[title][i].startsWith(String(i + 1)));
          assert.ok(row.startsWith(`${i + 1}.`));
          if (title === '遭遇率TOP5') {
            const [, count, total] = row.match(/([\d,]+)件 \/ 登録([\d,]+)件/);
            assert.ok(obsRows[title][i].includes(`${count}戦 / 全${total}戦`));
          } else {
            const [, count] = row.match(/対象戦績数([\d,]+)件/);
            assert.ok(obsRows[title][i].includes(`対象戦績 ${count}戦`));
          }
        }
        else { const data = fixture.dashboard(obsRpc.args); const deck = data.decks.find(d => d.name === name); const delta = (deck.current.encounter.count / data.current.total.totalMatches * 100 - deck.previous.encounter.count / data.previous.total.totalMatches * 100).toFixed(1); assert.ok(obsRows[title][i].includes(delta)); }
      });
    }
    assert.equal(await page.locator('a[href*="/obs/"]').count(), 0);
    assert.equal(report.mutations.length, mutationsBefore);
    report.checks.push('Normal/OBS: same RPC args, total, ordered TOP5/TOP3, percentages/deltas, actual encounter counts and combined evaluation counts; no OBS links in normal page');
    if (process.env.PGLITE_MODULE) await require('./obs-matchups-browser-sql.cjs').verifySqlMatchups({ page, origin, out, report, setState: value => { sqlState = value; } });
    for (const width of [1920, 1440, 768, 390, 320]) {
      await page.setViewportSize({ width, height: 1080 });
      for (const [suffix, label] of [['', 'environments'], ['?section=decks', 'decks'], ['?section=decks&deckSection=create', 'create'], ['?section=decks&deckSection=suggestions', 'suggestions'], ['?section=tools', 'tools']]) {
        await go('/admin' + suffix); await overflow(); await shot(`admin-${label}-${width}`);
        assert.equal(await page.getByRole('navigation', { name: '管理機能', exact: true }).count(), 1);
      }
      report.checks.push(`Admin all 5 sections at ${width}px: controls fit`);
    }
    await page.setViewportSize({ width: 1440, height: 1080 });
    await go('/admin');
    const create = page.locator('form').filter({ has: page.locator('input[name=operation][value=create]') });
    await create.locator('input[name=name]').fill('追加確認環境'); await create.locator('input[name=start_date]').fill('2026-10-03');
    await create.locator('input[name=match_input_start_at]').fill('2026-10-03T12:00');
    await create.locator('input[name=match_input_end_at]').fill('2026-10-04T12:00');
    await create.getByRole('button', { name: '環境を追加', exact: true }).click();
    await page.getByText('環境を追加しました。', { exact: true }).waitFor();
    const added = environments.find(e => e.name === '追加確認環境'); assert.equal(added.match_input_start_at, '2026-10-03T03:00:00.000Z'); assert.equal(added.allow_match_input, true);
    await page.locator(`input[name="name_${added.id}"]`).fill('更新確認環境');
    await page.locator(`input[name="allow_match_input_${added.id}"]`).uncheck();
    await page.getByRole('button', { name: '環境を一括更新', exact: true }).click(); await page.getByText('環境を一括更新しました。', { exact: true }).waitFor();
    assert.equal(added.name, '更新確認環境'); assert.equal(added.allow_match_input, false);
    assert.equal(await page.getByRole('link', { name: '環境管理', exact: true }).getAttribute('aria-current'), 'page');
    report.checks.push('Environment native POST: create, JST windows, update, input kill switch and redirect');
    await page.getByRole('link', { name: '標準デッキ管理', exact: true }).click(); await page.getByRole('link', { name: '新規追加', exact: true }).click();
    await page.getByRole('heading', { name: '標準デッキの追加', exact: true }).waitFor();
    await page.getByLabel('標準デッキ名', { exact: true }).fill('追加確認デッキ');
    await page.getByRole('button', { name: '標準デッキを追加', exact: true }).click(); await page.getByText('標準デッキを追加しました。', { exact: true }).waitFor();
    assert.ok(decks.some(d => d.name === '追加確認デッキ'));
    await page.getByRole('link', { name: '一覧・更新', exact: true }).click();
    await page.locator(`input[name="name_${fixture.decks[0].id}"]`).fill('更新確認デッキ');
    await page.getByRole('button', { name: '一括更新', exact: true }).first().click(); await page.getByText('標準デッキを一括更新しました。', { exact: true }).waitFor(); assert.equal(decks[0].name, '更新確認デッキ');
    await page.getByRole('link', { name: '候補承認', exact: true }).click(); await page.getByRole('button', { name: '採用', exact: true }).click(); await page.getByText('候補を標準デッキとして採用しました。', { exact: true }).waitFor();
    assert.equal(suggestions[0].status, 'approved'); assert.ok(decks.some(d => d.name === '候補デッキ'));
    report.checks.push('Existing deck Server Actions: create, batch update, approve; notices return to correct section');
    await go('/admin?class=' + encodeURIComponent('ネメシス')); assert.equal(await page.getByRole('link', { name: '一覧・更新', exact: true }).getAttribute('aria-current'), 'page');
    await page.getByRole('link', { name: '運用ツール', exact: true }).click(); await page.getByRole('link', { name: '期間レポートを開く', exact: true }).click();
    await page.getByRole('heading', { name: '期間環境レポート', exact: true }).waitFor(); assert.equal(new URL(page.url()).pathname, '/admin/weekly-report');
    await page.reload(); await page.getByRole('heading', { name: '期間環境レポート', exact: true }).waitFor();
    report.checks.push('Legacy deck query and weekly-report URL work, tools link opens report');
    await go('/admin?section=tools'); await page.locator('label').filter({ hasText: '期間' }).locator('select').selectOption('3d');
    await page.getByRole('button', { name: 'ランク・レート帯 すべて', exact: true }).click(); await page.getByRole('button', { name: 'Master', exact: true }).click(); await page.getByRole('button', { name: '適用', exact: true }).click();
    const newPage = context.waitForEvent('page'); await page.getByRole('link', { name: 'OBSビューを開く（別タブ）', exact: true }).click();
    const obs = await newPage; observe(obs); await obs.waitForLoadState('networkidle');
    assert.ok(obs.url().includes('period=3d')); assert.ok(obs.url().includes('ranks=master')); assert.match(await obs.locator('main').innerText(), /直近3日.*Master/s); await obs.close();
    await page.getByRole('link', { name: '通常画面へ', exact: true }).click(); await page.waitForURL(origin + '/');
    report.checks.push('Tools period/rank selection produces fixed URL, new tab renders matching conditions, normal-screen link works');
    mode = 'matchupFailure'; await go('/admin/obs/environment' + query); assert.match(await page.locator('main').getByRole('alert').innerText(), /相性データを取得できませんでした/);
    assert.equal(await page.getByRole('region', { name: '遭遇率TOP5', exact: true }).locator('li').count(), 5);
    mode = 'empty'; await go('/admin/obs/environment' + query); assert.match(await page.locator('main').innerText(), /データなし/);
    mode = 'failure'; await go('/admin/obs/environment' + query); assert.match(await page.locator('main').getByRole('alert').innerText(), /取得できませんでした/);
    mode = 'full'; await go('/admin/obs/environment?ranks=invalid'); assert.match(await page.locator('main').getByRole('alert').innerText(), /条件が不正/);
    report.checks.push('OBS no-data, fetch-failure and invalid-rank states');
    admin = false; await go('/admin/obs/environment' + query); assert.equal(new URL(page.url()).pathname, '/');
    await go('/admin'); assert.equal(new URL(page.url()).pathname, '/');
    await go('/environment' + query); assert.equal(await page.locator('a[href="/admin"],a[href*="/obs/"]').count(), 0);
    const unsigned = await browser.newContext(); const unsignedPage = await unsigned.newPage(); observe(unsignedPage); await unsignedPage.goto(origin + '/admin/obs/environment' + query); assert.equal(new URL(unsignedPage.url()).pathname, '/login'); await unsigned.close();
    report.checks.push('Member denied admin/OBS and no management links; unsigned OBS redirected to login');
    assert.deepEqual(report.unexpected, []); assert.deepEqual(report.events, []);
    fs.writeFileSync(path.join(out, 'result.json'), JSON.stringify(report, null, 2));
    console.log(JSON.stringify({ checks: report.checks, events: report.events, mutations: report.mutations.length }, null, 2));
  } finally {
    fs.writeFileSync(path.join(out, 'last-run.json'), JSON.stringify(report, null, 2));
    if (browser) await browser.close(); app.kill(); api.closeAllConnections(); api.close();
  }
})().catch(e => { console.error(e); process.exitCode = 1; });
