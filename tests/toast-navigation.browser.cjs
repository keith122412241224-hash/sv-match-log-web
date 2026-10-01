/* eslint-disable @typescript-eslint/no-require-imports */
// Run through MATCH_ENTRY_TOAST_ONLY=1 tests/match-entry-local.browser.cjs.
// Real local Auth, Server Actions, DB and destination pages; never Production.
const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path');
exports.runToastRegression = async function ({browser,origin,session,environmentId,output}) {
  const evidence = {passed:false,cases:[],errors:[]};
  const context = await browser.newContext({viewport:{width:320,height:844}});
  await context.route('**/*',route=>['localhost','127.0.0.1'].includes(new URL(route.request().url()).hostname)?route.continue():route.abort());
  await context.addCookies([{name:'sb-127-auth-token',value:'base64-'+Buffer.from(JSON.stringify(session)).toString('base64url'),url:origin}]);
  const page = await context.newPage();
  page.on('pageerror',error=>evidence.errors.push(error.message));
  page.on('console',message=>{if(message.type()==='error')evidence.errors.push(message.text());});
  async function show(kind) {
    await page.goto(origin+'/matches',{waitUntil:'networkidle'});
    await page.locator('[name=environment_id]').selectOption(environmentId);
    if(kind==='failure')await page.evaluate(()=>{document.querySelector('[name=rank_tier]').value='invalid';});
    await page.locator('button[value=continue]').click();
    await page.getByRole(kind==='failure'?'alert':'status').filter({hasText:kind==='failure'?'戦績の保存に失敗しました':'戦績を保存しました'}).waitFor();
    assert.equal(await page.evaluate(()=>document.activeElement?.getAttribute('value')),'continue');
  }
  async function targetHit(locator) {
    return locator.evaluate(element=>{
      const rect=element.getBoundingClientRect(),x=rect.x+rect.width/2,y=rect.y+rect.height/2;
      const hit=document.elementFromPoint(x,y);
      return {x,y,correct:element.contains(hit),hit:hit?.closest('button,a')?.getAttribute('aria-label')||hit?.closest('button,a')?.textContent};
    });
  }
  try {
    for(const width of [320,390,430,1365])for(const kind of ['failure','success']) {
      await page.setViewportSize({width,height:844});
      await show(kind);
      const form=page.locator('form').filter({has:page.locator('button[value=continue]')});
      for(const control of await form.locator('button:not([aria-label="通知を閉じる"]),select').all()) {
        const box=await control.boundingBox();
        if(box&&box.y>=0&&box.y+box.height<=844) {
          assert.equal((await targetHit(control)).correct,true,`form hit ${width} ${kind}`);
        }
      }
      await form.getByRole('button',{name:'後攻',exact:true}).click();
      assert.equal(await form.locator('[name=turn_order]').inputValue(),'second');
      await form.getByRole('button',{name:'先攻',exact:true}).click();
      for(const control of await form.locator('button[value=continue],button[value=home]').all()) {
        await control.scrollIntoViewIfNeeded();
        assert.equal((await targetHit(control)).correct,true,'save buttons remain clickable');
      }
      // Matrix first: this is the original blocker, with an actual pointer click.
      for(const href of ['/matrix','/','/analysis','/environment','/decks','/matches']) {
        await show(kind);await page.evaluate(()=>scrollTo(0,0));
        const link=page.locator('header nav a[href="'+href+'"]');
        const hit=await targetHit(link);
        const notification=page.locator('form [role='+ (kind==='failure'?'alert':'status') +']');
        const toast=await notification.boundingBox(),header=await page.locator('header').boundingBox();
        const close=kind==='failure'?await page.getByRole('button',{name:'通知を閉じる'}).boundingBox():null;
        const result={width,kind,href,hit,toast,header,close};evidence.cases.push(result);
        await page.screenshot({path:path.join(output,`toast-${width}-${kind}.png`)});
        await page.mouse.click(hit.x,hit.y);
        if(href!=='/matches') {
          await page.waitForURL(url=>url.pathname===href,{timeout:5000});
          await page.waitForLoadState('networkidle');
          assert.equal(await page.getByRole('button',{name:'通知を閉じる'}).count(),0);
          assert.equal(await page.getByText('戦績を保存しました',{exact:true}).count(),0);
          await page.goBack({waitUntil:'networkidle'});assert.equal(new URL(page.url()).pathname,'/matches');
        }
        assert.equal(hit.correct,true,`navigation hit ${width} ${kind} ${href}`);
        assert.ok(toast.y>=header.y+header.height,`Toast below header ${width} ${kind}`);
        assert.ok(toast.x>=0&&toast.x+toast.width<=width,'Toast stays within viewport');
        result.passed=true;
      }
      console.log(`Toast navigation ${width} ${kind}: passed`);
    }
    // Keyboard focus stays in the page; close remains a 44px accessible target.
    await page.setViewportSize({width:390,height:420});await show('failure');
    const close=page.getByRole('button',{name:'通知を閉じる'});
    await close.focus();await page.keyboard.press('Tab');await page.keyboard.press('Shift+Tab');
    assert.equal(await close.evaluate(e=>e===document.activeElement),true);
    const size=await close.boundingBox();assert.equal(size.width,44);assert.equal(size.height,44);
    await page.keyboard.press('Enter');assert.equal(await close.count(),0);
    await page.locator('button[aria-haspopup=dialog]').click();await page.keyboard.press('Escape');
    assert.equal(await page.locator('button[aria-haspopup=dialog]').evaluate(e=>e===document.activeElement),true);
    await show('success');
    const home=page.locator('header nav a[href="/"]');await home.focus();
    await page.keyboard.press('Tab');await page.keyboard.press('Shift+Tab');
    assert.equal(await home.evaluate(e=>e===document.activeElement),true);
    await page.keyboard.press('Enter');await page.waitForURL(origin+'/');
    await page.waitForTimeout(4200);
    assert.equal(await page.getByText('戦績を保存しました',{exact:true}).count(),0);
    assert.deepEqual(evidence.errors,[]);evidence.passed=true;
  } catch(error) {
    evidence.failure=error.message;
    await page.screenshot({path:path.join(output,'toast-regression-failure.png')});
    throw error;
  } finally {
    fs.writeFileSync(path.join(output,'toast-regression.json'),JSON.stringify(evidence,null,2));
    await context.close();
  }
};
