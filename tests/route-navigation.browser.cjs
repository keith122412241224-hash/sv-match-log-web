/* eslint-disable @typescript-eslint/no-require-imports */
// Invoked by environment-route-loading.browser.cjs against its loopback fixture.
// All delay/error injection stays in the test HTTP server, never the product.
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
const headings = { '/': 'ホーム', '/environment': '環境データ', '/analysis': '分析', '/matrix': '相性表', '/matches': '戦績入力' };
const waitFor = async check => {
  for (let i=0;i<200;i++) { if (await check()) return; await pause(50); }
  throw Error('Timed out waiting for route fixture');
};
const dataPaths = { '/': '/rest/v1/rpc/get_home_dashboard', '/environment': '/rest/v1/rpc/get_environment_dashboard_aggregates_v2',
  '/analysis': '/rest/v1/rpc/get_analysis_aggregates_v3', '/matrix': '/rest/v1/rpc/get_matchup_aggregates_v1', '/matches': '/rest/v1/decks' };
exports.checkRouteNavigation = async ({ baseline, origin, out, report, newPage, calls, environments, indicator, settled, hold, release, fail, expectedErrors }) => {
  report.routes = []; report.performance = []; report.toastNavigation = [];
  const baselineFile = path.resolve(out, '../before/result.json');
  const measuredBaseline = !baseline && fs.existsSync(baselineFile) ? JSON.parse(fs.readFileSync(baselineFile, 'utf8')) : null;
  const pairs = [['/', '/environment'], ['/', '/analysis'], ['/', '/matrix'], ['/', '/matches'],
    ['/environment', '/'], ['/environment', '/analysis'], ['/environment', '/matrix'],
    ['/analysis', '/'], ['/analysis', '/environment'], ['/matrix', '/'], ['/matrix', '/environment'], ['/matches', '/environment']];
  const heading = (p, route) => p.getByRole('heading', { name: headings[route], exact: true });
  async function sourcePage(source, target, width = 1365) {
    const p = await newPage(width), requests = [];
    p.on('request', r => { const u = new URL(r.url()); if (u.pathname === target || u.pathname.startsWith('/api/')) requests.push({ path: u.pathname, rsc: !!r.headers().rsc, prefetch: !!r.headers()['next-router-prefetch'] }); });
    // Arm before loading the source so existing, allowed Home/Match prefetch can
    // also be held. Never disable or change the app's actual prefetch policy.
    const g = hold(dataPaths[target]), before = calls.length;
    await p.goto(origin+source, { waitUntil: 'load' });
    await heading(p, source).waitFor(); await pause(150);
    return { p, g, before, requests };
  }
  async function checkPending(p, source, target, label) {
    const snapshot = await p.evaluate(({ sourceTitle, targetTitle }) => {
      const visible = el => !!el && el.getBoundingClientRect().height > 0 && getComputedStyle(el).visibility !== 'hidden';
      return { source: [...document.querySelectorAll('h1')].some(e => e.textContent === sourceTitle && visible(e)),
        target: [...document.querySelectorAll('h1')].some(e => e.textContent === targetTitle && visible(e)),
        global: !!document.querySelector('.global-pending-bar'),
        fallback: [...document.querySelectorAll('[role=status]')].some(e => e.textContent.includes('環境データを読み込み中')),
        sourceConnected: window.routeSource?.isConnected === true && visible(window.routeSource),
        lostBeforeCommit: window.routeFrames?.lost === true,
        localPending: !!document.querySelector('form[aria-busy=true]') };
    }, { sourceTitle: headings[source], targetTitle: headings[target] });
    if (!baseline) {
      assert.equal(snapshot.source, true, label+' source heading visible');
      assert.equal(snapshot.sourceConnected, true, label+' original main visible');
      assert.equal(snapshot.global, true, label+' global indicator');
      assert.equal(snapshot.fallback, false, label+' no environment fallback');
      assert.equal(snapshot.target, false, label+' no premature destination');
      assert.equal(snapshot.lostBeforeCommit, false, label+' no blank intermediate frame');
      assert.equal(snapshot.localPending, false, label+' navigation has no local filter pending');
    }
    return snapshot;
  }
  async function monitor(p, target) {
    await p.evaluate(targetTitle => {
      window.routeSource = document.querySelector('main'); window.routeFrames = { lost: false };
      const frame = () => {
        if ([...document.querySelectorAll('h1')].some(e => e.textContent === targetTitle)) return;
        const source = window.routeSource;
        if (!source?.isConnected || source.getBoundingClientRect().height === 0) window.routeFrames.lost = true;
        window.routeFrameId = requestAnimationFrame(frame);
      };
      window.routeFrameId = requestAnimationFrame(frame);
    }, headings[target]);
  }
  for (const [source, target] of pairs) {
    const { p, g, before, requests } = await sourcePage(source, target);
    try {
      const commits = []; p.on('framenavigated', f => { if (f === p.mainFrame()) commits.push(new URL(f.url()).pathname); });
      const historyBefore = await p.evaluate(() => history.length);
      await monitor(p, target);
      await p.locator(`header nav a[href="${target}"]`).click();
      await waitFor(() => g.started); await pause(700);
      const pending = await checkPending(p, source, target, source+' → '+target);
      await p.screenshot({ path: path.join(out, `route-${source.replaceAll('/', '_')}-to-${target.replaceAll('/', '_')}.png`) });
      release(); await p.waitForURL(origin+target); await heading(p, target).waitFor(); await settled(p);
      const historyAdded = await p.evaluate(() => history.length)-historyBefore;
      assert.equal(historyAdded, 1, 'one navigation history entry');
      assert.ok(commits.length >= 1 && commits.every(route => route === target), 'only the intended destination commits');
      const targetRequests = requests.filter(r => r.path === target);
      if (target === '/environment') assert.equal(targetRequests.length, 1, 'environment has exactly one RSC');
      assert.ok(targetRequests.every(r => r.rsc));
      assert.equal(requests.filter(r => r.path.startsWith('/api/')).length, 0, 'no duplicate client API fetch');
      const aggregates = calls.slice(before).filter(c => c.path === dataPaths[target]);
      if (target === '/environment') assert.equal(aggregates.length, 1, 'one environment aggregate');
      report.routes.push({ source, target, pending, commits, historyAdded, requests, destinationDataCalls: aggregates.length });
      // Existing brand/body Links may prefetch independently of header links.
      // Compare measured requests with main without changing any Link policy.
      if (!baseline && measuredBaseline) {
        const prior = measuredBaseline.routes.find(r => r.source===source && r.target===target);
        assert.ok(prior, 'baseline exists for '+source+' → '+target);
        assert.ok(targetRequests.length <= prior.requests.filter(r=>r.path===target).length, 'no added RSC/prefetch');
        assert.ok(aggregates.length <= prior.destinationDataCalls, 'no added destination data fetch');
      }
      console.log('route checked', source, '→', target, baseline ? 'baseline' : 'retained');
    } finally { release(); await p.context().close(); }
  }
  // No artificial delay and no screenshots inside the measurement interval.
  for (const target of ['/environment', '/analysis', '/matrix']) for (let i=0;i<3;i++) {
    const p = await newPage(1365);
    try {
      await p.goto(origin+'/', { waitUntil: 'networkidle' });
      await p.evaluate(() => { window.routeStart = 0; document.addEventListener('click', () => { window.routeStart = performance.now(); }, { once: true, capture: true }); });
      await p.locator(`header nav a[href="${target}"]`).click(); await heading(p, target).waitFor();
      const ms = await p.evaluate(() => performance.now()-window.routeStart);
      await settled(p); report.performance.push({ source: '/', target, ms });
    } finally { await p.context().close(); }
  }
  if (baseline) return;
  for (const route of Object.keys(headings)) {
    const p = await newPage();
    try {
      await p.goto(origin+route, { waitUntil: 'networkidle' }); await heading(p, route).waitFor(); await settled(p);
      await p.reload({ waitUntil: 'networkidle' }); await heading(p, route).waitFor(); await settled(p);
      assert.equal(new URL(p.url()).pathname, route); report.checks.push('direct/reload '+route);
    } finally { await p.context().close(); }
  }
  {
    const p = await newPage();
    try {
      await p.goto(origin+'/', { waitUntil: 'networkidle' });
      for (const target of ['/environment', '/analysis', '/matrix']) {
        await p.locator(`header nav a[href="${target}"]`).click(); await p.waitForURL(origin+target); await heading(p, target).waitFor(); await settled(p);
      }
      for (const [action, target] of [['goBack','/analysis'], ['goBack','/environment'], ['goForward','/analysis']]) {
        await p[action](); await p.waitForURL(origin+target); await heading(p, target).waitFor(); await settled(p);
      }
      report.checks.push('home/environment/analysis/matrix/back/back/forward: URL, content and pending agree');
    } finally { await p.context().close(); }
  }
  const hit = locator => locator.evaluate(e => { const b=e.getBoundingClientRect(); return e.contains(document.elementFromPoint(b.x+b.width/2,b.y+b.height/2)); });
  const overlaps = (a,b) => a.x<b.x+b.width && a.x+a.width>b.x && a.y<b.y+b.height && a.y+a.height>b.y;
  for (const width of [320,390,430,1365]) for (const kind of ['success','error']) for (const target of ['/','/environment','/analysis','/matrix']) {
    const { p, g } = await sourcePage('/matches', target, width);
    try {
      // A same-page click must preserve the page without starting pending.
      const self = p.locator('header nav a[href="/matches"]');
      await self.click(); assert.equal(new URL(p.url()).pathname, '/matches');
      if (kind === 'error') fail('/rest/v1/matches');
      await p.locator('button[value=continue]').click();
      const notice = p.getByRole(kind === 'success' ? 'status' : 'alert').filter({ hasText: kind === 'success' ? '戦績を保存しました' : '戦績の保存に失敗しました' });
      await notice.waitFor(); fail(null);
      assert.equal(await notice.count(), 1);
      assert.equal(await p.evaluate(() => document.activeElement.getAttribute('value')), 'continue');
      for (const button of await p.locator('button[value=continue],button[value=home]').all()) {
        const b = await button.boundingBox(), n = await notice.boundingBox();
        assert.ok(!overlaps(b,n), 'Toast avoids save buttons');
      }
      await p.evaluate(() => scrollTo(0,0));
      const link = p.locator(`header nav a[href="${target}"]`); assert.equal(await hit(link), true);
      await monitor(p, target); await link.click(); await waitFor(() => g.started); await pause(250);
      await checkPending(p, '/matches', target, `${width} ${kind} ${target}`);
      assert.equal(await notice.isVisible(), true);
      const n = await notice.boundingBox(), badge = await indicator(p).getByText('読み込み中', { exact: true }).boundingBox();
      const header = await p.locator('header').boundingBox();
      assert.ok(!overlaps(n,badge), 'Toast avoids navigation badge');
      assert.ok(!overlaps(badge,header), 'badge avoids header/navigation');
      assert.ok(n.x>=0 && n.x+n.width<=width && n.y+n.height<=844, 'Toast stays within viewport');
      for (const href of ['/','/matches','/environment','/analysis','/matrix']) assert.equal(await hit(p.locator(`header nav a[href="${href}"]`)), true, 'all navigation hitboxes');
      for (const button of await p.locator('button[value=continue],button[value=home]').all()) {
        const b = await button.boundingBox(); assert.ok(!overlaps(b,badge), 'badge avoids save buttons');
      }
      await p.screenshot({ path: path.join(out, `toast-${width}-${kind}-${target.replaceAll('/', '_')}.png`) });
      release(); await p.waitForURL(origin+target); await heading(p,target).waitFor(); await settled(p);
      assert.equal(await p.evaluate(() => document.documentElement.style.getPropertyValue('--save-toast-clearance')), '', 'Toast position clears on navigation');
      report.toastNavigation.push({ width, kind, target, hitboxes: true, noOverlap: true });
    } finally { fail(null); release(); await p.context().close(); }
  }
  // Preserve the existing reset suite (including the 15s stale-state check).
  {
    const p = await newPage();
    const atoms = ['unranked','beginner','d','c','b','a','aa','master:emerald','master:topaz','master:ruby','master:sapphire','master:diamond','grandmaster:none','grandmaster:epic','grandmaster:ultimate','grandmaster:legend','grandmaster:beyond'];
    const custom = ['a','aa'];
    const count = name => calls.filter(c => c.path === '/rest/v1/rpc/'+name).length;
    const open = p => p.locator('button[aria-haspopup=dialog]').click();
    const draft = async (p, values) => { for (const box of await p.locator('dialog input[type=checkbox]').all()) { const value=await box.getAttribute('value'); if (atoms.includes(value)) await box.setChecked(values.includes(value)); } };
    const settleAnalysis = async p => { await p.getByRole('status').filter({ hasText:'ランク条件を適用中' }).waitFor({ state:'detached' }); await settled(p); };
    const apply = async (p, rpc, values) => {
      const before=count(rpc), g=hold('/rest/v1/rpc/'+rpc);
      await p.getByRole('dialog').getByRole('button',{name:'適用',exact:true}).click(); await waitFor(()=>g.started); await pause(150);
      assert.equal(await p.getByRole('status').filter({hasText:'ランク条件を適用中'}).isVisible(),true);
      assert.equal(await indicator(p).count(),0); release(); await settleAnalysis(p);
      assert.equal(count(rpc)-before,1); assert.equal(new URL(p.url()).searchParams.get('ranks'),values.join(','));
    };
    try {
      await require('./analysis-reset.browser.cjs').checkAnalysisReset({ page:p, origin, environment:environments[0].id, atoms, custom,
        open, draft, apply, settled:settleAnalysis, count, report, out });
    } finally { release(); await p.context().close(); }
  }
  // Inline fetch errors and the actual Next error.tsx remain independent of loading.
  {
    const p = await newPage();
    try {
      await p.goto(origin+'/environment',{waitUntil:'networkidle'});
      fail(dataPaths['/environment']);
      await p.locator('label').filter({has:p.locator('input[name=period][value="3d"]')}).click();
      await p.getByRole('alert').filter({hasText:'環境データを取得できませんでした'}).waitFor();
      assert.equal(await indicator(p).count(),0); fail(null);
      const retryResponse = p.waitForResponse(r => new URL(r.url()).pathname==='/api/environment' && r.status()===200);
      await p.getByRole('button',{name:'再試行',exact:true}).click(); await retryResponse;
      const environmentError = p.getByRole('alert').filter({hasText:'環境データを取得できませんでした'});
      await environmentError.waitFor({state:'detached'}); await settled(p);
      assert.equal(await environmentError.count(),0);
      fail('/rest/v1/deck_archetypes');
      await p.goto(origin+'/environment',{waitUntil:'networkidle'});
      await p.getByRole('alert').filter({hasText:'環境データを取得できませんでした。'}).waitFor();
      assert.equal(await p.locator('select[name=environment]').count(),0,'actual route error boundary');
      assert.equal(await p.getByRole('button',{name:'再試行',exact:true}).count(),1);
      assert.equal(await indicator(p).count(),0); fail(null);
      await p.reload({waitUntil:'networkidle'}); await settled(p);
      assert.equal(await p.locator('select[name=environment]').count(),1);
      report.checks.push('environment API error/retry and actual route error boundary/reload recover');
      report.expectedErrorFixtureMessages = expectedErrors;
    } finally { fail(null); await p.context().close(); }
  }
};
