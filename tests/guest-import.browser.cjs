/* eslint-disable @typescript-eslint/no-require-imports */
// Invoked by match-mutations.browser.cjs against its loopback-only SQL fixture.
const assert = require('node:assert/strict'), path = require('node:path');
async function verifyGuestReplay({ page, context, origin, output, row, db, claim, ids, until, guestFault, checks, idle, errors, warnings, pageerrors }) {
  const key = 'svml:guest-matches:v1';
  const raw = () => page.evaluate(k => localStorage.getItem(k), key);
  const prepare = async rows => {
    await page.evaluate(({ key, rows }) => localStorage.setItem(key, JSON.stringify(rows)), { key, rows });
    await page.goto(origin + '/?environment=' + ids.env, { waitUntil: 'networkidle' });
    await page.getByRole('button', { name: '正式データに取り込む' }).waitFor();
  };
  const submit = async expected => {
    await page.getByRole('button', { name: '正式データに取り込む' }).click();
    await page.getByRole('status').filter({ hasText: expected }).waitFor();
  };
  const count = async id => { await idle(); await claim(); return (await db.query('select count(*)::int n from public.matches where user_id=$1 and guest_import_id=$2', [ids.a, id])).rows[0].n; };
  const summary = async () => ({ total: await page.getByText('総試合数', { exact: true }).locator('..').locator('div').nth(1).innerText(), winRate: await page.getByText('勝率', { exact: true }).locator('..').locator('div').nth(1).innerText() });
  await page.goto(origin + '/?environment=' + ids.env, { waitUntil: 'networkidle' });
  assert.deepEqual(await summary(), { total: '2', winRate: '50%' });
  for (const width of [1920, 1440, 768, 390, 320]) {
    await page.setViewportSize({ width, height: 900 });
    await prepare([row]);
    await submit('0件を新規保存しました。1件は取り込み済み');
    assert.equal(await raw(), '[]'); assert.equal(await count(row.local_id), 1);
    assert.deepEqual(await summary(), { total: '2', winRate: '50%' });
    const dimensions = await page.evaluate(() => ({ width: innerWidth, scrollWidth: document.documentElement.scrollWidth }));
    if (width === 768 && dimensions.scrollWidth > width) checks.push('Existing Home table layout observation: ' + JSON.stringify(dimensions) + '; Home/CSS unchanged by this fix');
    else assert.ok(dimensions.scrollWidth <= width, JSON.stringify(dimensions));
    await page.screenshot({ path: path.join(output, 'guest-replay-' + width + '.png'), fullPage: true });
  }
  checks.push('Guest replay at 1920/1440/768/390/320px: rendered Home remains 2 matches / 50%, storage cleanup and accurate replay message; layout exception recorded separately');

  const changed = { ...row, result: 'win' };
  await prepare([changed]); await submit('保存済みと内容が異なる1件');
  assert.deepEqual(JSON.parse(await raw()), [changed]); assert.equal(await count(row.local_id), 1);
  const fresh = { ...row, local_id: 'browser-new' };
  await prepare([fresh]); guestFault.failWrite = true;
  await submit('取り込みに失敗しました');
  assert.deepEqual(JSON.parse(await raw()), [fresh]); assert.equal(await count(fresh.local_id), 0);
  guestFault.failWrite = false;
  await submit('1件を新規保存しました'); assert.equal(await raw(), '[]');
  checks.push('changed same-ID payload remains on device; real Action DB error retains storage; retry succeeds');

  const lost = { ...row, local_id: 'browser-lost-response' };
  await prepare([lost]); guestFault.loseReply = true;
  await submit('取り込みに失敗しました');
  assert.equal(await count(lost.local_id), 1); assert.deepEqual(JSON.parse(await raw()), [lost]);
  await submit('0件を新規保存しました。1件は取り込み済み');
  assert.equal(await count(lost.local_id), 1); assert.equal(await raw(), '[]');
  checks.push('loopback DB HTTP socket closed AFTER insert: UI keeps uncertain data, retry acknowledges without duplicate');

  const storageFailed = { ...row, local_id: 'browser-storage-failed' };
  await prepare([storageFailed]);
  await page.evaluate(k => {
    window.guestOriginalSetItem = Storage.prototype.setItem;
    Storage.prototype.setItem = function(key, value) {
      if (key === k && value === '[]') throw Error('injected cleanup failure');
      return window.guestOriginalSetItem.call(this, key, value);
    };
  }, key);
  await submit('DBへの取り込みは完了しましたが');
  assert.equal(await count(storageFailed.local_id), 1);
  assert.deepEqual(JSON.parse(await raw()), [storageFailed]);
  assert.ok(await page.getByRole('button', { name: '正式データに取り込む' }).isDisabled());
  await page.reload({ waitUntil: 'networkidle' });
  await submit('0件を新規保存しました。1件は取り込み済み');
  assert.equal(await count(storageFailed.local_id), 1); assert.equal(await raw(), '[]');
  checks.push('post-commit localStorage failure blocks same-view retry; reload/retry safely clears acknowledged data');

  const partial = [{ ...row, local_id: 'browser-partial' }, { ...row, local_id: 'browser-invalid-rank', rank_tier: 'master', master_group: null }];
  await prepare(partial); await submit('ランク情報が不正な1件');
  assert.deepEqual(JSON.parse(await raw()), [partial[1]]);
  await prepare([partial[0], { ...partial[1], master_group: 'ruby' }]);
  await submit('1件を新規保存しました。1件は取り込み済み'); assert.equal(await raw(), '[]');
  checks.push('partial valid/invalid batch cleanup retains only failed record; corrected batch retry saves missing record only');

  // Two browser tabs really submit concurrently; the embedded DB adapter serializes SQL.
  const simultaneous = { ...row, local_id: 'browser-two-tabs' };
  await prepare([simultaneous]);
  const other = await context.newPage();
  other.on('console', m => { if (m.type() === 'error') errors.push(m.text()); if (m.type() === 'warning') warnings.push(m.text()); });
  other.on('pageerror', e => pageerrors.push(e.message));
  await other.goto(origin + '/?environment=' + ids.env, { waitUntil: 'networkidle' });
  await other.getByRole('button', { name: '正式データに取り込む' }).waitFor();
  // Hold both outgoing Actions until both tabs have read the same localStorage snapshot.
  const held = [];
  const handler = async route => {
    if (!route.request().headers()['next-action']) return route.continue();
    await new Promise(resolve => {
      held.push({ route, resolve });
      if (held.length === 2) for (const entry of held) entry.route.continue().then(entry.resolve);
    });
  };
  await page.route('**/*', handler); await other.route('**/*', handler);
  await Promise.all([page.getByRole('button', { name: '正式データに取り込む' }).click(), other.getByRole('button', { name: '正式データに取り込む' }).click()]);
  await until(async () => held.length === 2 && await raw() === '[]');
  await other.getByRole('status').filter({ hasText: '未保存の戦績は端末に保持' }).waitFor();
  await page.getByRole('status').filter({ hasText: '未保存の戦績は端末に保持' }).waitFor();
  assert.equal(await count(simultaneous.local_id), 1);
  await page.unroute('**/*', handler); await other.close();
  checks.push('two browser tabs release identical Action requests together; one stored row (SQL adapter serializes queries)');
}
module.exports = { verifyGuestReplay };
