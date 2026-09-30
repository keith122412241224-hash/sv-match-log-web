/* eslint-disable @typescript-eslint/no-require-imports */
const assert = require('node:assert/strict');

// Reuses the real built app/Auth/RPC harness; no page or response mocks.
exports.checkAnalysisReset = async ({ page, origin, environment, atoms, custom, open, draft, apply, settled, count, report, out }) => {
  const rpc = 'get_analysis_aggregates_v3';
  const rank = () => page.locator('input[name=ranks]');
  const results = () => page.locator('main section[aria-labelledby]');
  const snapshot = async () => ({
    ranks: await rank().inputValue(),
    summary: await page.locator('main p').filter({ hasText: /^勝率集計:/ }).innerText(),
    blocks: await results().allTextContents(),
    filters: await page.locator('form[action="/analysis"] select').evaluateAll(es => es.map(e => [e.name, e.value])),
    dates: await page.locator('form[action="/analysis"]').evaluate(form => {
      const data = new FormData(form); return [data.get('playedFrom'), data.get('playedTo')];
    })
  });
  report.reset = [];
  for (const width of [1365, 390]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto(origin + '/analysis?environment=' + environment, { waitUntil: 'networkidle' });
    await settled(page);
    const baseline = await snapshot();
    assert.ok(baseline.blocks.length > 0, 'capture exported tables and recent results');
    await open(page); await draft(page, custom); await apply(page, rpc, custom);
    const selected = await snapshot();
    assert.notEqual(selected.summary, baseline.summary, 'custom ranks change the actual result');
    const form = await page.locator('form[action="/analysis"]').elementHandle();
    const select = await page.locator('select[name=environment]').elementHandle();
    const reset = page.getByRole('link', { name: 'リセット', exact: true });
    await reset.focus();
    const beforeCount = count(rpc);
    await reset.click();
    await page.waitForURL(url => !url.searchParams.has('ranks') && !url.searchParams.has('rank'));
    // Once navigation commits, controls and every PNG/recent block must already agree.
    assert.deepEqual(await snapshot(), baseline, 'reset immediately after URL commit');
    await settled(page);
    assert.deepEqual(await snapshot(), baseline, 'reset after RPC completion');
    assert.equal(await form.evaluate(e => e.isConnected), true, 'form is not remounted');
    assert.equal(await select.evaluate(e => e.isConnected), true, 'select DOM is retained');
    assert.equal(await reset.evaluate(e => e === document.activeElement), true, 'reset keeps focus');
    await page.waitForTimeout(15000);
    assert.deepEqual(await snapshot(), baseline, 'no stale state after 15 seconds');
    assert.equal(count(rpc) - beforeCount, 1, 'one server aggregate RPC per reset, no client refetch');
    await page.screenshot({ path: out + '/analysis-reset-' + width + '.png' });
    // Apply replaced the previous entry; reset pushed a new entry. Check both actual histories.
    await page.goBack({ waitUntil: 'networkidle' }); await settled(page);
    assert.equal(new URL(page.url()).searchParams.get('ranks'), custom.join(','));
    assert.deepEqual(await snapshot(), selected, 'back restores custom selection and its results');
    await page.goForward({ waitUntil: 'networkidle' }); await settled(page);
    assert.deepEqual(await snapshot(), baseline, 'forward restores reset selection and its results');
    assert.equal(await rank().inputValue(), atoms.join(','));
    // Non-rank controls also use the new server values, without replacing the form.
    await page.locator('select[name=winRateMode]').selectOption('combined');
    await page.locator('select[name=result]').selectOption('lose');
    await page.locator('select[name=turnOrder]').selectOption('second');
    for (const name of ['myDeck', 'opponentDeck']) {
      const value = await page.locator(`select[name=${name}] option`).nth(1).getAttribute('value');
      await page.locator(`select[name=${name}]`).selectOption(value);
    }
    await page.getByLabel('開始日時の日付', { exact: true }).fill('2026-09-01');
    await page.getByLabel('開始日時の時刻（日本時間）', { exact: true }).fill('09:15');
    await page.getByLabel('終了日時の日付', { exact: true }).fill('2026-10-31');
    await page.getByLabel('終了日時の時刻（日本時間）', { exact: true }).fill('21:40');
    await open(page); await draft(page, custom); await apply(page, rpc, custom);
    const changed = await snapshot(); assert.notDeepEqual(changed.filters, baseline.filters);
    const beforeSecondReset = count(rpc);
    await reset.click(); await page.waitForURL(url => !url.searchParams.has('ranks')); await settled(page);
    assert.deepEqual(await snapshot(), baseline, 'reset clears non-rank filters and restores all results');
    assert.equal(count(rpc) - beforeSecondReset, 1);
    report.reset.push({ width, immediate: true, afterRpc: true, after15s: true, rpcPerReset: 1, domRetained: true, focusRetained: true, history: true, nonRankFilters: true });
  }
  report.checks.push('analysis custom/reset/history: URL, controls, aggregates, recent and PNG content agree at 1365/390');
};
