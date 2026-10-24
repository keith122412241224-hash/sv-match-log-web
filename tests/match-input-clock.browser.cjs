/* eslint-disable @typescript-eslint/no-require-imports */
// Actual built UI -> Server Actions -> loopback PostgREST adapter -> real SQL/RLS/trigger.
// Only the browser wall clock is changed; server/DB clocks and acceptance code remain real.
const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path');
exports.verifyClockIndependence = async ({ page, context, origin, output, db, ids, until, calls, normalFault, environmentFault, idle, checks }) => {
  const sql = async (query, args = []) => { await idle(); await db.exec('reset role'); return (await db.query(query, args)).rows; };
  const rows = () => sql('select * from public.matches where request_id is not null order by created_at');
  const original = (await sql('select * from public.matches where id=$1', [ids.match]))[0];
  const out = path.join(output, 'clock'); fs.mkdirSync(out, { recursive: true });
  const report = { passed: false, clocks: [], exactSqlBoundaries: [], races: [], lifecycle: [], guest: [] };
  const key = 'svml:pending-match:' + ids.a;
  const pending = () => page.evaluate(k => JSON.parse(sessionStorage.getItem(k)), key);
  const go = () => page.goto(origin + '/matches', { waitUntil: 'networkidle' });
  const value = () => page.locator('[name=environment_id]').inputValue();
  const save = () => page.getByRole('button', { name: '保存して続ける', exact: true }).click();
  const recover = async () => { await page.getByRole('button', { name: '保存状態を確認して再試行', exact: true }).click(); await until(async () => !await pending()); };
  const installClock = () => {
    const NativeDate = Date;
    window.testClockOffset = Number(sessionStorage.getItem('test:wall-clock-offset') || 0);
    window.Date = new Proxy(NativeDate, {
      construct(target, args, next) { return Reflect.construct(target, args.length ? args : [NativeDate.now() + window.testClockOffset], next); },
      apply() { return new NativeDate(NativeDate.now() + window.testClockOffset).toString(); },
      get(target, property) { return property === 'now' ? () => NativeDate.now() + window.testClockOffset : Reflect.get(target, property); }
    });
  };
  await page.addInitScript(installClock);
  await go();
  const clock = ms => page.evaluate(ms => { window.testClockOffset = ms; sessionStorage.setItem('test:wall-clock-offset', String(ms)); }, ms);
  const success = async (before, environment) => {
    await until(async () => (await rows()).length === before + 1 && !await pending());
    await page.getByRole('status').filter({ hasText: '戦績を保存しました' }).waitFor();
    const row = (await rows()).at(-1);
    assert.equal(row.environment_id, environment);
    assert.ok(Math.abs(Date.parse(row.played_at) - Date.now()) < 15000, 'member played_at comes from server, not device');
    return row;
  };
  await sql('update public.environments set allow_match_input=false');
  for (const offset of [0, 600000, -600000, 3600000, -3600000, 86400000, -86400000]) {
    await clock(offset);
    const scenario = { offset, normal: false, scheduled: false, edit: false, retry: false, closedRejected: false };
    // Null bounds (normal) and currently-open scheduled input use identical registration code.
    for (const scheduled of [false, true]) {
      await sql(`update public.environments set allow_match_input=true,match_input_start_at=${scheduled ? "now()-interval '1 minute'" : 'null'},match_input_end_at=${scheduled ? "now()+interval '5 minutes'" : 'null'} where id=$1`, [ids.env]);
      await go(); assert.equal(await value(), ids.env);
      const device = await page.evaluate(() => ({ now: Date.now(), date: +new Date() }));
      assert.ok(Math.abs(device.now - Date.now() - offset) < 3000); assert.ok(Math.abs(device.date - device.now) < 100);
      const n = (await rows()).length;
      await save(); const row = await success(n, ids.env); assert.equal(row.rank_tier, null);
      scenario[scheduled ? 'scheduled' : 'normal'] = true;
    }
    // A historical record stays on its original environment even with another active candidate.
    await page.goto(origin + '/?environment=' + ids.env, { waitUntil: 'networkidle' });
    await page.getByRole('button', { name: '戦績の操作', exact: true }).last().click();
    await page.getByRole('button', { name: '編集', exact: true }).click();
    assert.equal(await value(), ids.env);
    await page.getByRole('button', { name: '負け', exact: true }).click();
    await page.getByRole('button', { name: '変更を保存', exact: true }).click();
    await page.getByRole('status').filter({ hasText: '戦績を更新しました' }).waitFor();
    const edited = (await sql('select * from public.matches where id=$1', [ids.match]))[0];
    assert.equal(edited.result, 'lose');
    for (const field of ['environment_id', 'played_at', 'created_at', 'user_id', 'id']) assert.deepEqual(edited[field], original[field]);
    await sql("update public.matches set result='win' where id=$1", [ids.match]); scenario.edit = true;
    // A failed write keeps the original ID and request UUID across reload; retry really inserts once.
    await go(); normalFault.failWrite = true; const n = (await rows()).length;
    await save(); await page.getByRole('alert').filter({ hasText: 'injected normal write failure' }).waitFor();
    const failed = await pending(); assert.equal(failed.fields.environment_id, ids.env); assert.equal((await rows()).length, n);
    normalFault.failWrite = false; await go(); assert.deepEqual(await pending(), failed); await recover();
    const retried = await rows(); assert.equal(retried.length, n + 1); assert.equal(retried.at(-1).request_id, failed.id); scenario.retry = true;
    // Device clock never authorizes a stale form after an administrator closes input.
    await go(); await sql('update public.environments set allow_match_input=false where id=$1', [ids.env]);
    const closed = await rows(); await save(); await page.getByRole('alert').filter({ hasText: 'この環境は戦績入力を停止しています' }).waitFor();
    assert.deepEqual(await rows(), closed); scenario.closedRejected = true;
    await page.evaluate(k => sessionStorage.removeItem(k), key); // Known failed fixture only, never an uncertain committed operation.
    report.clocks.push(scenario);
    await sql('update public.environments set allow_match_input=true where id=$1', [ids.env]);
    await go(); await page.setViewportSize({ width: offset < 0 ? 320 : 1152, height: 900 });
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    await page.screenshot({ path: path.join(out, 'clock-' + offset + '.png'), fullPage: true });
    // Guest uses server-filtered candidates too. Its local played_at is intentionally retained on edit.
    await page.goto(origin + '/guest', { waitUntil: 'networkidle' });
    await page.getByRole('button', { name: '戦績入力', exact: true }).click();
    const beforeCalls = calls.length;
    await page.getByRole('button', { name: '入力を試す', exact: true }).click();
    await page.getByRole('status').filter({ hasText: '戦績を保存しました' }).waitFor();
    const guestBefore = await page.evaluate(() => JSON.parse(localStorage.getItem('svml:guest-matches:v1')));
    assert.equal(guestBefore.length, 1); assert.equal(guestBefore[0].environment_id, ids.env);
    await page.getByRole('button', { name: 'ホーム', exact: true }).click();
    await page.getByRole('button', { name: '戦績の操作', exact: true }).click();
    await page.getByRole('button', { name: '編集', exact: true }).click();
    await page.getByRole('button', { name: '負け', exact: true }).click();
    await page.getByRole('button', { name: '変更を保存', exact: true }).click();
    await page.getByRole('status').filter({ hasText: '戦績を更新しました' }).waitFor();
    const guestAfter = await page.evaluate(() => JSON.parse(localStorage.getItem('svml:guest-matches:v1')));
    assert.equal(guestAfter[0].result, 'lose'); assert.equal(guestAfter[0].played_at, guestBefore[0].played_at); assert.equal(guestAfter[0].environment_id, ids.env);
    assert.equal(calls.length, beforeCalls); report.guest.push({ offset, created: true, edited: true, originalEnvironmentRetained: true });
    await page.evaluate(() => localStorage.removeItem('svml:guest-matches:v1'));
    // Keep the original record inside Home's bounded recent list for the next edit case.
    await sql('delete from public.matches where request_id is not null');
  }
  await clock(86400000);
  // Exercise the actual SQL predicate at millisecond-exact start/end, independently of browser timing.
  const start = '2026-10-24T00:00:00.000Z', end = '2026-10-24T01:00:00.000Z';
  for (const [when, want] of [[Date.parse(start) - 1, false], [Date.parse(start), true], [Date.parse(end) - 1, true], [Date.parse(end), false], [Date.parse(end) + 1, false]]) {
    const actual = (await sql('select public.is_match_input_window_open(true,$1,$2,$3) allowed', [start, end, new Date(when).toISOString()]))[0].allowed;
    assert.equal(actual, want); report.exactSqlBoundaries.push({ when: new Date(when).toISOString(), allowed: actual });
  }
  // Change the environment after BOTH action checks but immediately before its INSERT: DB trigger must refuse it.
  await go(); const beforeRace = await rows(); normalFault.expireAtWrite = true;
  await save(); await page.getByRole('alert').filter({ hasText: 'この環境は現在戦績を入力できません' }).waitFor();
  assert.deepEqual(await rows(), beforeRace); report.races.push('DB trigger rejects expiry after action checks before INSERT');
  await page.evaluate(k => sessionStorage.removeItem(k), key);
  // Real-time automatic switch with a +1 day device clock: save on each side and inspect actual rows.
  const boundary = new Date(Date.now() + 5000).toISOString();
  await sql('update public.environments set allow_match_input=true,match_input_start_at=null,match_input_end_at=$2 where id=$1', [ids.env, boundary]);
  await sql('update public.environments set allow_match_input=true,match_input_start_at=$2,match_input_end_at=null where id=$1', [ids.env2, boundary]);
  await go(); assert.equal(await value(), ids.env);
  let n = (await rows()).length; await save(); await success(n, ids.env);
  await until(async () => await value() === ids.env2);
  n = (await rows()).length; await save(); await success(n, ids.env2);
  report.lifecycle.push('real scheduled switch: original environment saved before boundary; next ID saved after boundary with +1 day device clock');
  // Freeze the real page lifecycle across a boundary, then resume/focus (no mocked save or server clock).
  const resumeBoundary = new Date(Date.now() + 3500).toISOString();
  await sql('update public.environments set match_input_start_at=null,match_input_end_at=$2 where id=$1', [ids.env2, resumeBoundary]);
  await sql('update public.environments set match_input_start_at=$2,match_input_end_at=null where id=$1', [ids.env, resumeBoundary]);
  await go(); assert.equal(await value(), ids.env2);
  const cdp = await context.newCDPSession(page);
  await cdp.send('Page.setWebLifecycleState', { state: 'frozen' });
  await new Promise(r => setTimeout(r, 4500));
  await cdp.send('Page.setWebLifecycleState', { state: 'active' }); await cdp.detach();
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await until(async () => await value() === ids.env);
  n = (await rows()).length; await save(); await success(n, ids.env);
  report.lifecycle.push('frozen tab across a real boundary: resume/focus follows server schedule and saves new ID');
  // A long-open tab's already loaded data is made stale; simulate an hour of monotonic elapsed time.
  // No server result is mocked: the closed environment must still be refused by the real action.
  await go(); await sql('update public.environments set allow_match_input=false');
  await page.evaluate(() => { const now = performance.now.bind(performance); Object.defineProperty(performance, 'now', { configurable: true, value: () => now() + 3600000 }); });
  const stale = await rows(); await save(); await page.getByRole('alert').filter({ hasText: 'この環境は戦績入力を停止しています' }).waitFor();
  assert.deepEqual(await rows(), stale); report.lifecycle.push('simulated 1-hour elapsed stale tab rejects admin-closed environment without changing ID');
  await page.evaluate(k => sessionStorage.removeItem(k), key);
  await go(); await page.getByText('入力できる環境がありません', { exact: true }).waitFor(); assert.equal(await page.locator('[name=environment_id]').count(), 0);
  environmentFault.read = true; await go(); await page.getByText('環境がまだありません', { exact: true }).waitFor();
  assert.equal(await page.locator('[name=environment_id]').count(), 0); environmentFault.read = false;
  await sql('update public.environments set allow_match_input=true,match_input_start_at=null,match_input_end_at=null');
  // A committed, lost reply can be acknowledged after its environment closes, using its original ID.
  await go(); normalFault.loseReply = true; await save(); await page.locator('p[role=alert]').waitFor();
  const lost = await pending(), committed = await rows();
  await sql('update public.environments set allow_match_input=false where id=$1', [ids.env]);
  await go(); assert.equal(await value(), ids.env2); assert.equal((await pending()).fields.environment_id, ids.env);
  await recover(); assert.deepEqual(await rows(), committed); assert.equal(committed.at(-1).request_id, lost.id);
  report.races.push('lost committed reply replays original ID after closure, no new row or reassignment');
  await sql('update public.environments set allow_match_input=true,match_input_start_at=null,match_input_end_at=null');
  await sql('delete from public.matches where request_id is not null'); await clock(0);
  await page.evaluate(() => { localStorage.removeItem('svml:guest-matches:v1'); sessionStorage.removeItem('test:wall-clock-offset'); });
  assert.deepEqual((await sql('select * from public.matches where id=$1', [ids.match]))[0], original);
  report.passed = true; fs.writeFileSync(path.join(out, 'results.json'), JSON.stringify(report, null, 2));
  checks.push('clock independence: 7 real browser wall clocks, normal/scheduled SQL saves, original-ID edits, failed-write retries, server rejection, Guest create/edit, exact SQL boundaries, INSERT race, real automatic switch/frozen-tab resume, simulated long-open tab, read failure, immutable replay');
};
