/* eslint-disable @typescript-eslint/no-require-imports */
const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path');
exports.verifyFixedEnvironment = async ({ page, origin, output, db, ids, until, calls, normalFault, environmentFault, idle, checks }) => {
  const sql = async (query, args = []) => { await idle(); await db.exec('reset role'); return (await db.query(query, args)).rows; };
  const original = (await sql('select * from public.matches where id=$1', [ids.match]))[0];
  const pendingKey = 'svml:pending-match:' + ids.a;
  const pending = () => page.evaluate(k => JSON.parse(sessionStorage.getItem(k)), pendingKey);
  const rows = () => sql('select * from public.matches where request_id is not null order by created_at');
  const go = () => page.goto(origin + '/matches', { waitUntil: 'networkidle' });
  const value = () => page.locator('input[name=environment_id]').inputValue();
  const save = () => page.getByRole('button', { name: '保存して続ける', exact: true }).click();
  const recover = async () => { await page.getByRole('button', { name: '保存状態を確認して再試行', exact: true }).click(); await until(async () => !await pending()); };
  const shots = path.join(output, 'fixed-environment'); fs.mkdirSync(shots, { recursive: true });
  await go();
  await page.evaluate(({ env2, arch2, a }) => {
    localStorage.setItem('svml:last-environment-id', env2);
    localStorage.setItem('svml:last-my-choice-id', arch2);
    localStorage.setItem('svml:last-rank:v1:user:' + a, 'master:ruby');
  }, ids);
  await go();
  assert.equal(await value(), ids.env, 'old device selection cannot override current environment');
  assert.equal(await page.locator('[name=my_archetype_id]').inputValue(), ids.arch2);
  assert.equal(await page.locator('[name=master_group]').inputValue(), 'ruby');
  assert.equal(await page.locator('select[name=environment_id]').count(), 0);
  assert.equal(await page.getByRole('status', { name: '環境', exact: true }).innerText(), '検証環境');
  assert.doesNotMatch(await page.locator('main').innerText(), /未入力でも保存できます|前回選択はこの端末|環境を選んで/);
  for (const width of [320, 390, 768, 1152, 1920]) {
    await page.setViewportSize({ width, height: 900 });
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    await page.screenshot({ path: path.join(shots, 'input-' + width + '.png'), fullPage: true });
  }
  // Rank remains optional and keyboard-operable; exact stored ID equals visible environment.
  const rank = page.getByRole('button', { name: /^対戦時点の自分のランク/ });
  await rank.focus(); await page.keyboard.press('Enter');
  await page.keyboard.press('Home'); await page.keyboard.press('Enter');
  await save(); await until(async () => (await rows()).length === 1 && !await pending());
  let saved = (await rows())[0];
  assert.equal(saved.environment_id, ids.env); assert.equal(saved.rank_tier, null); assert.equal(saved.my_archetype_id, ids.arch2);
  // Admin configuration changes: focus refresh updates fixed display without resetting other input.
  await page.getByRole('button', { name: '負け', exact: true }).click();
  await sql("update public.environments set created_at='2026-10-03'::timestamptz where id=$1", [ids.env2]);
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await until(async () => await value() === ids.env2);
  assert.equal(await page.getByRole('status', { name: '環境', exact: true }).innerText(), '別の環境');
  assert.equal(await page.locator('[name=result]').inputValue(), 'lose');
  assert.equal(await page.locator('[name=my_archetype_id]').inputValue(), ids.arch2);
  await save(); await until(async () => (await rows()).length === 2 && !await pending());
  saved = (await rows())[1]; assert.equal(saved.environment_id, ids.env2); assert.equal(saved.result, 'lose');
  // A committed operation with a lost response keeps its original environment on recovery.
  normalFault.loseReply = true; await save(); await page.locator('p[role=alert]').waitFor();
  const beforeRetry = await rows(), lost = await pending(); assert.equal(lost.fields.environment_id, ids.env2);
  await sql("update public.environments set created_at='2026-10-01'::timestamptz where id=$1", [ids.env2]);
  await go(); assert.equal(await value(), ids.env); assert.deepEqual(await pending(), lost);
  await save(); await page.getByRole('alert').filter({ hasText: '未確認の保存' }).waitFor();
  assert.deepEqual(await rows(), beforeRetry); await recover(); assert.deepEqual(await rows(), beforeRetry);
  // Editing a stopped historical environment must never migrate a record into today's environment.
  await sql('update public.environments set allow_match_input=false where id=$1', [ids.env]);
  await page.goto(origin + '/?environment=' + ids.env, { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: '戦績の操作', exact: true }).last().click();
  await page.getByRole('button', { name: '編集', exact: true }).click();
  assert.equal(await value(), ids.env);
  assert.match(await page.getByRole('dialog').innerText(), /管理者による入力再開が必要/);
  await page.getByRole('button', { name: '変更を保存', exact: true }).click();
  await page.getByRole('alert').filter({ hasText: 'この環境は戦績入力を停止しています' }).waitFor();
  assert.deepEqual((await sql('select * from public.matches where id=$1', [ids.match]))[0], original);
  await page.getByRole('button', { name: '編集をキャンセル', exact: true }).click();
  await sql('update public.environments set allow_match_input=true');
  // Stale loaded form is rejected by the unchanged server guard when input is closed.
  await go(); await sql('update public.environments set allow_match_input=false');
  const beforeClosed = await rows(); await save();
  await page.getByRole('alert').filter({ hasText: 'この環境は戦績入力を停止しています' }).waitFor();
  assert.deepEqual(await rows(), beforeClosed);
  // No row was committed for this injected rejection; only the test tab's pending fixture is cleared.
  await page.evaluate(k => sessionStorage.removeItem(k), pendingKey);
  await go(); assert.equal(await page.locator('input[name=environment_id]').count(), 0);
  await page.getByText('入力できる環境がありません', { exact: true }).waitFor();
  // A known scheduled boundary updates automatically, with no page refresh or extra RPC.
  await sql("update public.environments set allow_match_input=true, match_input_start_at=now()+interval '3 seconds', match_input_end_at=now()+interval '7 seconds' where id=$1", [ids.env]);
  await go(); await page.getByText('入力できる環境がありません', { exact: true }).waitFor();
  const beforeBoundary = calls.length;
  await until(async () => await page.locator('input[name=environment_id]').count() === 1);
  assert.equal(await value(), ids.env);
  await until(async () => await page.locator('input[name=environment_id]').count() === 0);
  assert.equal(calls.length, beforeBoundary, 'known schedule changes do not fetch again');
  await sql('update public.environments set allow_match_input=true,match_input_start_at=null,match_input_end_at=null');
  environmentFault.read = true; await go();
  await page.getByText('環境がまだありません', { exact: true }).waitFor();
  assert.equal(await page.locator('input[name=environment_id]').count(), 0);
  assert.equal(await page.getByRole('button', { name: '保存して続ける', exact: true }).count(), 0);
  environmentFault.read = false;
  // Long admin-provided names remain readable at 320px, with no selection affordance.
  await sql('update public.environments set name=$2 where id=$1', [ids.env, '長い環境名'.repeat(25)]);
  await go(); await page.setViewportSize({ width: 320, height: 900 });
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  await page.screenshot({ path: path.join(shots, 'long-name-320.png'), fullPage: true });
  await sql('update public.environments set name=$2 where id=$1', [ids.env, '検証環境']);
  await sql('delete from public.matches where request_id is not null');
  await page.evaluate(({ a }) => { localStorage.removeItem('svml:last-my-choice-id'); localStorage.removeItem('svml:last-rank:v1:user:' + a); }, ids);
  assert.deepEqual((await sql('select * from public.matches where id=$1', [ids.match]))[0], original);
  checks.push('fixed environment: 5 widths, keyboard optional rank, actual stored IDs, obsolete preference ignored, admin focus refresh, immutable pending recovery, stopped edit/no overwrite, stale save rejected, no available/fetch failure fail closed, automatic scheduled start/end, long names');
};
