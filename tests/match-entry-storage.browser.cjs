/* eslint-disable @typescript-eslint/no-require-imports */
// Called by the pinned localhost Supabase fixture in match-entry-local.browser.cjs.
const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path');

exports.runStorageRegression = async ({ browser, origin, session, environmentId, archetypeId, db, calls, output }) => {
  const report = { passed: false, localOnly: true, cases: [], failures: [] };
  const rankKey = 'svml:last-rank:v1:user:' + session.user.id;
  const deckKey = 'svml:last-my-choice-id', environmentKey = 'svml:last-environment-id';
  const cases = [
    { name: 'normal' },
    { name: 'mount-read-denied', operation: 'getItem', error: 'SecurityError' },
    { name: 'deck-write-denied', operation: 'setItem', key: deckKey, error: 'QuotaExceededError' },
    { name: 'environment-write-denied', operation: 'setItem', key: environmentKey, error: 'SecurityError' },
    { name: 'rank-write-denied', operation: 'setItem', key: rankKey, error: 'QuotaExceededError' },
    { name: 'all-methods-denied', operation: 'all', error: 'SecurityError' },
    { name: 'storage-property-denied', operation: 'property', error: 'SecurityError' },
    { name: 'invalid-rank-only', values: { [rankKey]: '{broken', [deckKey]: archetypeId, [environmentKey]: environmentId }, expectedRank: '' },
    { name: 'invalid-deck-only', values: { [rankKey]: 'grandmaster:epic', [deckKey]: 'invalid-deck', [environmentKey]: environmentId }, expectedRank: 'grandmaster' },
    { name: 'invalid-environment-only', values: { [rankKey]: 'grandmaster:epic', [deckKey]: archetypeId, [environmentKey]: 'invalid-environment' }, expectedRank: 'grandmaster' }
  ];
  try {
    for (const scenario of cases) {
      const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
      const errors = [], consoleErrors = [];
      try {
        await context.addCookies([{ name: 'sb-127-auth-token', value: 'base64-' + Buffer.from(JSON.stringify(session)).toString('base64url'), url: origin }]);
        await context.route('**/*', route => ['localhost', '127.0.0.1'].includes(new URL(route.request().url()).hostname) ? route.continue() : route.abort());
        await context.addInitScript(({ operation, key, error, values }) => {
          if (values) for (const [name, value] of Object.entries(values)) localStorage.setItem(name, value);
          if (operation === 'property') Object.defineProperty(window, 'localStorage', { get() { throw new DOMException('Test storage unavailable', error); } });
          else for (const method of ['getItem', 'setItem', 'removeItem', 'clear']) {
            if (operation !== 'all' && operation !== method) continue;
            const original = Storage.prototype[method];
            Storage.prototype[method] = function (...args) {
              if (!key || args[0] === key) throw new DOMException('Test storage unavailable', error);
              return original.apply(this, args);
            };
          }
        }, scenario);
        const page = await context.newPage();
        page.on('pageerror', error => errors.push({name:error.name,message:error.message}));
        page.on('console', message => { if(message.type() === 'error') consoleErrors.push(message.text()); });
        await page.goto(origin + '/matches', { waitUntil: 'networkidle' });
        const body = await page.locator('body').innerText();
        const saveButtons = await page.locator('button[value=continue]').count();
        if (errors.length || saveButtons !== 1 || /Application error/.test(body)) {
          const failure = { scenario: scenario.name, errors, saveButtons, body };
          report.failures.push(failure);
          await page.screenshot({ path: path.join(output, 'storage-' + scenario.name + '-failure.png'), fullPage: true });
          assert.fail(JSON.stringify(failure));
        }
        const myChoice = page.locator('form').filter({has:page.locator('button[value=continue]')}).locator('select').nth(1);
        if (scenario.values?.[deckKey] === archetypeId) assert.equal(await myChoice.inputValue(), archetypeId, 'other preference restores despite invalid rank/environment');
        if (scenario.values?.[environmentKey] === environmentId) assert.equal(await page.locator('[name=environment_id]').inputValue(), environmentId);
        if (scenario.expectedRank !== undefined) assert.equal(await page.locator('[name=rank_tier]').inputValue(), scenario.expectedRank);
        await myChoice.selectOption(archetypeId);
        await page.locator('[name=environment_id]').selectOption(environmentId);
        await page.getByRole('button', { name: 'エルフ', exact: true }).click();
        await page.getByRole('button', { name: 'Rank UX ' + archetypeId, exact: true }).click();
        await page.getByRole('button', { name: '後攻', exact: true }).click();
        await page.getByRole('button', { name: '負け', exact: true }).click();
        await page.locator('button[aria-haspopup=dialog]').click();
        await page.locator('dialog input[value="grandmaster:epic"]').click();
        const count = async () => (await db.query('select count(*)::int n from public.matches where user_id=$1 and environment_id=$2', [session.user.id, environmentId])).rows[0].n;
        const before = await count(), saveCalls = [], scroll = [];
        // Include three consecutive saves with total storage denial.
        for (let i=0; i < (['normal','all-methods-denied'].includes(scenario.name) ? 3 : 1); i++) {
          await page.locator('button[value=continue]').scrollIntoViewIfNeeded();
          await page.locator('button[value=continue]').focus();
          const y = await page.evaluate(() => scrollY), start = calls.length;
          await page.locator('button[value=continue]').click();
          await page.getByRole('status').filter({hasText:'戦績を保存しました'}).waitFor();
          await page.waitForFunction(() => document.querySelector('button[value=continue]').getAttribute('aria-disabled') === 'false');
          assert.equal(await count(), before+i+1);
          assert.equal(await page.locator('form [role=alert]').innerText(), '');
          assert.equal(await page.locator('[aria-busy=true]').count(), 0);
          assert.equal(await page.evaluate(() => document.activeElement.getAttribute('value')), 'continue');
          const afterY = await page.evaluate(() => scrollY); assert.ok(Math.abs(afterY-y) <= 2, 'scroll preserved'); scroll.push({before:y,after:afterY});
          saveCalls.push(calls.slice(start));
          assert.equal(await page.locator('[name=grandmaster_rating]').inputValue(), 'epic');
        }
        const expectedCalls = report.cases[0]?.saveCalls[0];
        if (expectedCalls) for (const sequence of saveCalls) assert.deepEqual(sequence,expectedCalls,'storage adds no network request');
        const stored = (await db.query('select rank_tier,master_group,grandmaster_rating,turn_order,result,my_archetype_id,opponent_archetype_id from public.matches where user_id=$1 and environment_id=$2 order by created_at desc limit 1',[session.user.id,environmentId])).rows[0];
        assert.deepEqual(stored,{rank_tier:'grandmaster',master_group:null,grandmaster_rating:'epic',turn_order:'second',result:'lose',my_archetype_id:archetypeId,opponent_archetype_id:archetypeId});
        await page.locator('button[value=home]').click();await page.waitForURL(origin+'/');
        assert.equal(await page.locator('[aria-busy=true]').count(),0);
        await page.goto(origin+'/matches',{waitUntil:'networkidle'});
        assert.equal(await page.locator('button[value=continue]').count(),1);
        if(scenario.name==='normal') {
          assert.equal(await myChoice.inputValue(),archetypeId);
          assert.equal(await page.locator('[name=environment_id]').inputValue(),environmentId);
          assert.equal(await page.locator('[name=grandmaster_rating]').inputValue(),'epic');
        }
        assert.deepEqual(errors,[]);assert.deepEqual(consoleErrors,[]);
        report.cases.push({name:scenario.name,passed:true,saveCalls,scroll,errors,consoleErrors,saveAndHome:true});
        console.log('Storage regression passed: '+scenario.name);
      } finally { await context.close(); }
    }
    // Guest records require local storage: failure must be visible, never a crash or false success.
    const guest = await browser.newContext();
    try {
      await guest.addInitScript(()=>{for(const method of ['getItem','setItem','removeItem'])Storage.prototype[method]=function(){throw new DOMException('Guest storage unavailable','SecurityError');};});
      const page=await guest.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
      await page.goto(origin+'/guest',{waitUntil:'networkidle'});await page.getByRole('button',{name:'戦績入力',exact:true}).click();
      await page.getByRole('button',{name:'入力を試す',exact:true}).click();
      await page.getByRole('alert').filter({hasText:'戦績の保存に失敗しました'}).waitFor();
      assert.equal(await page.getByRole('status').filter({hasText:'戦績を保存しました'}).count(),0);
      assert.equal(await page.getByRole('button',{name:'入力を試す',exact:true}).count(),1);assert.deepEqual(errors,[]);
      report.guest={crash:false,correctlyReportedLocalSaveFailure:true};
    }finally{await guest.close();}
    report.passed=true;
  } finally { fs.writeFileSync(path.join(output,'storage-regression.json'),JSON.stringify(report,null,2)); }
};
