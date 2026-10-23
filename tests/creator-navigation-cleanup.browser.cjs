/* eslint-disable @typescript-eslint/no-require-imports */
const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path');
module.exports = async ({ page, context, db, origin, report, out, files, setMode }) => {
  const shots = path.join(out, 'screenshots'); fs.mkdirSync(shots, { recursive: true });
  const go = route => page.goto(origin + route, { waitUntil: 'networkidle' });
  const back = () => page.getByRole('link', { name: '運用ツールへ戻る', exact: true });
  const tools = async () => {
    await page.waitForURL(origin + '/admin?section=tools');
    assert.equal(await page.getByRole('link', { name: '運用ツール', exact: true }).getAttribute('aria-current'), 'page');
    for (const name of ['Tier表メーカー', '相関図メーカー', 'OBS表示管理', '環境データ']) assert.equal(await page.getByRole('heading', { name, exact: true }).count(), 1);
    assert.equal(await page.locator('a[href^="/admin/weekly-report"]').count(), 0);
    assert.equal(await page.getByText('OBSの設定・使い方', { exact: true }).count(), 0);
  };
  const redirect = await context.request.get(origin + '/admin/creator', { maxRedirects: 0 });
  assert.equal(redirect.status(), 307); assert.equal(redirect.headers().location, '/admin?section=tools');
  for (const width of [320, 390, 768, 1152, 1920]) {
    await page.setViewportSize({ width, height: 1080 });
    const response = await go('/admin/creator'); assert.equal(response.status(), 200); await tools();
    await page.reload({ waitUntil: 'networkidle' }); await tools();
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    await page.screenshot({ path: path.join(shots, `navigation-redirect-${width}.png`) });
    for (const route of ['tier', 'correlation', 'obs-sets', 'images']) {
      await go('/admin/creator/' + route);
      assert.equal(await back().count(), 1); assert.equal(await back().getAttribute('href'), '/admin?section=tools');
      assert.equal(await page.getByRole('link', { name: /^(クリエイターツールへ|管理画面へ)$/ }).count(), 0);
      assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), route + ' fits ' + width);
      const box = await back().boundingBox(); assert(box.height >= 44 && box.x >= 0 && box.x + box.width <= width);
      await page.screenshot({ path: path.join(shots, `navigation-${route}-${width}.png`) });
      await back().focus(); await page.keyboard.press('Enter'); await tools();
    }
  }
  report.checks.push('navigation: 307 server redirect, bookmarked/reloaded URL, no loop, four unique direct returns via keyboard; 320/390/768/1152/1920 screenshots, fit and 44px targets');
  await page.setViewportSize({ width: 1152, height: 1080 });
  const post = async data => { const r = await context.request.post(origin + '/admin/creator/api', { headers: { Origin: origin }, data }); assert.equal(r.status(), 200, await r.text()); return r.json(); };
  const { newTierDocument } = require('../src/lib/creator/model');
  const { newCorrelationDocument } = require('../src/lib/creator/correlation');
  const tier = (await post({ action: 'save', document: { ...newTierDocument(), title: '導線検証Tier' } })).work;
  const graph = (await post({ action: 'save-correlation', document: { ...newCorrelationDocument(), title: '導線検証相関図' } })).correlation;
  const set = (await post({ action: 'save-obs-set', values: { name: '導線検証セット', tier_work_id: tier.id, correlation_id: graph.id } })).set;
  let dialogMode = 'dismiss', dialogs = [];
  const dialogErrors = [];
  page.removeAllListeners('dialog');
  page.on('dialog', async d => {
    if (d.type() === 'beforeunload') {
      // A cross-layout navigation can additionally invoke the browser's native
      // unload guard (its message is intentionally empty in Chromium/Edge).
      if (dialogMode !== 'accept') dialogErrors.push('unexpected unload: ' + page.url());
      await d[dialogMode](); return;
    }
    dialogs.push(d.message());
    if (d.type() !== 'confirm' || !/未保存の変更/.test(d.message())) dialogErrors.push(d.type() + ': ' + d.message());
    await d[dialogMode]();
  });
  // Hold a real request so the pending-state click and keyboard checks cannot race completion.
  async function pending(trigger, link, settled, aria = true, method = 'POST') {
    let release, reached;
    const held = new Promise(resolve => { release = resolve; });
    const started = new Promise(resolve => { reached = resolve; });
    const handler = async route => { if (route.request().method() !== method) return route.continue(); reached(); await held; await route.continue(); };
    await page.route('**/admin/creator/api*', handler);
    let timer;
    try {
      await trigger();
      await Promise.race([started, new Promise((_, reject) => { timer = setTimeout(() => reject(Error('request did not start')), 10000); })]);
      clearTimeout(timer);
      const url = page.url(), count = dialogs.length;
      if (aria) assert.equal(await link.getAttribute('aria-disabled'), 'true');
      await link.click({ force: true }); await link.focus(); await page.keyboard.press('Enter');
      assert.equal(page.url(), url); assert.equal(dialogs.length, count, 'pending navigation does not ask to discard');
    } finally { clearTimeout(timer); release(); }
    await settled(); await page.unroute('**/admin/creator/api*', handler);
  }
  for (const spec of [
    { route: '/admin/creator/tier?work=' + tier.id, label: '作品タイトル', table: 'creator_tier_works', id: tier.id, save: 'Tier表を保存', status: 'Tier表を保存しました', link: '運用ツールへ戻る', destination: '/admin?section=tools' },
    { route: '/admin/creator/correlation/' + graph.id, label: '相関図タイトル', table: 'creator_correlations', id: graph.id, save: '相関図を保存', status: '相関図を保存しました', link: '相関図一覧へ', destination: '/admin/creator/correlation' },
    { route: '/admin/creator/obs-sets?set=' + set.id, label: 'セット名', table: 'creator_obs_sets', id: set.id, save: 'セットを保存', status: 'OBSセットを保存しました', link: '運用ツールへ戻る', destination: '/admin?section=tools' }
  ]) {
    console.log('Navigation editing checks: ' + spec.label);
    await go(spec.route);
    const before = (await db.query(`select * from ${spec.table} where id=$1`, [spec.id])).rows[0];
    const input = page.getByLabel(spec.label, { exact: true }), link = page.getByRole('link', { name: spec.link, exact: true });
    const arrive = async () => {
      await page.waitForURL(origin + spec.destination);
      await page.getByRole('heading', { name: spec.destination.endsWith('correlation') ? '相関図メーカー' : '管理画面', exact: true, level: 1 }).waitFor();
      await page.waitForLoadState('networkidle');
    };
    const name = '未保存キャンセル・' + spec.label; await input.fill(name);
    const count = dialogs.length; await link.click();
    assert.equal(dialogs.length, count + 1); assert.equal(page.url(), origin + spec.route); assert.equal(await input.inputValue(), name);
    assert.deepEqual((await db.query(`select * from ${spec.table} where id=$1`, [spec.id])).rows[0], before, 'cancel never saves');
    await pending(() => page.getByRole('button', { name: spec.save, exact: true }).click(), link,
      () => page.getByRole('status').filter({ hasText: spec.status }).waitFor(), spec.table !== 'creator_correlations');
    const saved = (await db.query(`select * from ${spec.table} where id=$1`, [spec.id])).rows[0];
    assert.equal(saved.revision, before.revision + 1); assert.equal(saved.document?.title ?? saved.name, name);
    await page.reload({ waitUntil: 'networkidle' }); assert.equal(await input.inputValue(), name);
    await link.click(); await arrive();
    await go(spec.route); await input.fill('破棄する変更'); dialogMode = 'accept';
    await link.click(); await arrive(); dialogMode = 'dismiss';
    await go(spec.route); assert.equal(await input.inputValue(), name);
    report.checks.push(`navigation: ${spec.label} dirty confirmation/cancel state and DB unchanged, pending mouse/keyboard blocked, save/revision/reload/detail URL, clean return, discard confirmed`);
  }
  // Preserve the distinct inherited-correlation return with its work ID.
  const inherited = (await db.query('select * from creator_correlations where tier_work_id is not null limit 1')).rows[0];
  assert(inherited); await go('/admin/creator/correlation/' + inherited.id);
  const tierBack = page.getByRole('link', { name: 'Tier表に戻る', exact: true });
  assert.equal(await tierBack.getAttribute('href'), '/admin/creator/tier?work=' + inherited.tier_work_id);
  await page.getByLabel('相関図タイトル', { exact: true }).fill('保持する編集'); await tierBack.click();
  assert.equal(await page.getByLabel('相関図タイトル', { exact: true }).inputValue(), '保持する編集');
  dialogMode = 'accept'; await tierBack.click(); await page.waitForURL(origin + '/admin/creator/tier?work=' + inherited.tier_work_id);
  await page.getByRole('heading', { name: 'Tier表メーカー', exact: true, level: 1 }).waitFor(); await page.waitForLoadState('networkidle'); dialogMode = 'dismiss';
  await go('/admin/creator/images');
  await pending(() => page.getByLabel('画像アップロード').setInputFiles([files[0]]), back(), () => page.getByRole('status').filter({ hasText: '1枚の画像を保存' }).waitFor());
  await back().click(); await tools();
  await go('/admin/creator/correlation');
  await pending(() => page.getByRole('button', { name: '次の相関図', exact: true }).click(), back(), () => page.getByText('2ページ', { exact: true }).waitFor(), true, 'GET');
  await back().click(); await tools();
  for (const role of ['member', 'guest']) {
    setMode(role); const r = await context.request.get(origin + '/admin/creator', { maxRedirects: 0 });
    assert.equal(r.status(), 307);
    const destination = new URL(r.headers().location, origin);
    assert.equal(destination.pathname, role === 'member' ? '/' : '/login');
    if (role === 'guest') assert.match(destination.searchParams.get('message'), /管理者ログインが必要/);
  }
  setMode('admin'); const anonymous = await context.browser().newContext();
  const denied = await anonymous.request.get(origin + '/admin/creator', { maxRedirects: 0 });
  assert.equal(denied.status(), 307);
  const login = new URL(denied.headers().location, origin); assert.equal(login.pathname, '/login');
  assert.match(login.searchParams.get('message'), /管理者ログインが必要/); await anonymous.close();
  page.removeAllListeners('dialog'); page.on('dialog', d => d.accept());
  assert.deepEqual(dialogErrors, []);
  report.checks.push('navigation: inherited correlation back preserves work ID/dirty guard; library upload and list pagination pending returns blocked; member/guest/anonymous denied before tools redirect');
};
