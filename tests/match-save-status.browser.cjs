/* eslint-disable @typescript-eslint/no-require-imports */
const assert = require('node:assert/strict'), path = require('node:path');

exports.verifySaveStatus = async ({ page, context, origin, output, db, claim, ids, until, checks, errors, idle }) => {
  const storageKey = 'svml:pending-match:' + ids.a;
  const pending = () => page.evaluate(k => JSON.parse(sessionStorage.getItem(k)), storageKey);
  const rows = async () => {
    await idle(); await claim();
    return (await db.query('select * from public.matches where user_id=$1 and request_id is not null order by created_at,id', [ids.a])).rows;
  };
  const recovery = () => page.getByRole('region', { name: '未確認の戦績保存' });
  const save = () => page.getByRole('button', { name: '保存して続ける', exact: true });
  const success = () => page.getByRole('status').filter({ hasText: '保存しました' });
  const isAction = route => route.request().method() === 'POST' && route.request().headers()['next-action'];
  const go = () => page.goto(origin + '/matches', { waitUntil: 'networkidle' });
  // Hold the real Server Action response, after the real local DB commit.
  async function holdResponse() {
    let release, received = false, calls = 0;
    const gate = new Promise(resolve => { release = resolve; });
    const handler = async route => {
      if (!isAction(route)) return route.fallback();
      calls++;
      const response = await route.fetch();
      assert.equal(response.status(), 200);
      await response.body(); received = true;
      await gate;
      await route.fulfill({ response });
    };
    await context.route('**/matches', handler);
    return { release, ready: () => until(() => received), calls: () => calls, stop: () => context.unroute('**/matches', handler) };
  }
  await go();
  const before = (await rows()).length;
  // Observe all DOM updates, including a transient warning during normal save.
  await page.evaluate(() => {
    window.saveWarningSeen = false;
    window.saveObserver = new MutationObserver(() => {
      if (document.querySelector('[aria-label="未確認の戦績保存"]')) window.saveWarningSeen = true;
    });
    window.saveObserver.observe(document.body, { childList: true, subtree: true });
  });
  let held = await holdResponse();
  await save().evaluate(b => { b.click(); b.click(); b.form.requestSubmit(b); });
  await held.ready();
  const first = await pending(); assert.ok(first);
  assert.equal(await recovery().count(), 0);
  assert.equal(await page.getByRole('button', { name: '保存中...', exact: true }).count(), 2);
  assert.equal(await success().count(), 0);
  await page.evaluate(() => window.dispatchEvent(new Event('pageshow')));
  assert.equal(await recovery().count(), 0);
  await page.locator('button[name=next_action]').first().evaluate(b => { b.click(); b.form.requestSubmit(b); });
  assert.equal(held.calls(), 1);
  await page.screenshot({ path: path.join(output, 'save-status-saving.png'), fullPage: true });
  held.release(); await success().waitFor(); await held.stop();
  assert.equal(await pending(), null);
  assert.equal(await recovery().count(), 0);
  assert.equal(await page.evaluate(() => window.saveWarningSeen), false);
  await page.evaluate(() => window.saveObserver.disconnect());
  assert.equal((await rows()).length, before + 1);
  await page.screenshot({ path: path.join(output, 'save-status-success.png'), fullPage: true });
  checks.push('save status: no warning at any DOM update during delayed normal save/pageshow; success after acknowledgement; rapid clicks send once');

  // Offline before the action reaches the server: inputs and ID must survive.
  await go();
  await page.getByRole('button', { name: '負け', exact: true }).click();
  await page.getByRole('button', { name: '後攻', exact: true }).click();
  const errorStart = errors.length;
  const offline = route => isAction(route) ? route.abort('failed') : route.fallback();
  await context.route('**/matches', offline);
  await save().click();
  await recovery().getByText('保存結果を確認できませんでした', { exact: true }).waitFor();
  await context.unroute('**/matches', offline);
  const failed = await pending();
  assert.equal(failed.fields.result, 'lose'); assert.equal(failed.fields.turn_order, 'second');
  assert.equal(await page.locator('[name=result]').inputValue(), 'lose');
  assert.equal(await page.locator('[name=turn_order]').inputValue(), 'second');
  assert.equal(await success().count(), 0);
  assert.equal((await rows()).length, before + 1);
  assert.doesNotMatch(await page.locator('body').innerText(), /戦績の保存に失敗しました/);
  await page.screenshot({ path: path.join(output, 'save-status-unknown.png'), fullPage: true });
  held = await holdResponse();
  await recovery().getByRole('button', { name: '保存状態を確認して再試行', exact: true }).evaluate(b => { b.click(); b.click(); });
  await held.ready();
  const checking = recovery().getByRole('button', { name: '保存状態を確認中...', exact: true });
  assert.equal(await checking.isDisabled(), true);
  assert.deepEqual(await pending(), failed);
  assert.equal(await success().count(), 0);
  await page.screenshot({ path: path.join(output, 'save-status-checking.png'), fullPage: true });
  held.release(); await success().waitFor(); await held.stop();
  assert.equal(held.calls(), 1);
  assert.equal(await pending(), null);
  assert.equal(await recovery().count(), 0);
  assert.equal(await page.locator('p[role=alert]').count(), 0);
  assert.doesNotMatch(await page.locator('body').innerText(), /戦績の保存に失敗しました/);
  const afterRetry = await rows();
  assert.equal(afterRetry.length, before + 2);
  assert.equal(afterRetry.filter(r => r.request_id === failed.id).length, 1);
  const injected = errors.splice(errorStart);
  assert.ok(injected.every(e => /Failed to load resource: net::ERR_FAILED/.test(e)), JSON.stringify(injected));
  checks.push('save status: offline retains input/ID; explicit unknown warning; retry disabled while checking; one row on retry; green success and stale errors cleared');

  // Reload while the initial response is still pending. The old in-memory phase
  // must not hide recovery on the new document, even though the row exists.
  await go(); held = await holdResponse(); await save().click(); await held.ready();
  const inFlight = await pending();
  assert.equal(await recovery().count(), 0);
  await page.reload({ waitUntil: 'domcontentloaded' });
  held.release(); await held.stop();
  await recovery().getByText('保存結果を確認できませんでした', { exact: true }).waitFor();
  assert.deepEqual(await pending(), inFlight);
  const committed = await rows();
  await recovery().getByRole('button', { name: '保存状態を確認して再試行', exact: true }).click();
  await success().waitFor();
  assert.equal(await pending(), null);
  assert.deepEqual(await rows(), committed);
  checks.push('save status: reload during initial in-flight save restores warning and same ID; committed replay inserts nothing');

  // These timings cover only the local fixture, with no injected delay. They
  // must not be interpreted as measurements of Production network/DB latency.
  const localSaveMilliseconds = [];
  for (let i = 0; i < 3; i++) {
    await go();
    const start = performance.now();
    await save().click(); await success().waitFor();
    localSaveMilliseconds.push(Math.round(performance.now() - start));
    assert.equal(await recovery().count(), 0);
  }
  checks.push({ scenario: 'local click-to-success without injected delay', localSaveMilliseconds, productionLatencyMeasured: false });
};
