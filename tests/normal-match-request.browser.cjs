/* eslint-disable @typescript-eslint/no-require-imports */
const assert=require('node:assert/strict'),path=require('node:path');
exports.verifyNormalReplay=async({page,context,origin,output,db,claim,ids,until,normalFault,checks,errors,idle})=>{
 const storageKey='svml:pending-match:'+ids.a;
 const pending=async(p=page)=>p.evaluate(k=>JSON.parse(sessionStorage.getItem(k)),storageKey);
 const rows=async()=>{await idle();await claim();return(await db.query('select * from public.matches where user_id=$1 and request_id is not null order by created_at,id',[ids.a])).rows;};
 const count=async()=> (await rows()).length;
 const go=async()=>{await page.goto(origin+'/matches',{waitUntil:'networkidle'});assert.equal(await page.locator('[name=environment_id]').inputValue(), ids.env);};
 const save=()=>page.getByRole('button',{name:'保存して続ける',exact:true}).click();
 const recover=async(p=page)=>{await p.getByRole('button',{name:'保存状態を確認して再試行',exact:true}).click();await until(async()=>!(await pending(p)));};
 const noOverflow=async()=>assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'normal form overflow');
 for(const width of [1920,1440,390,320]){
  await page.setViewportSize({width,height:900});await go();const before=await count();normalFault.failWrite=true;
  await save();await page.getByRole('alert').filter({hasText:'injected normal write failure'}).waitFor();const failed=await pending();assert.ok(failed);assert.equal(await count(),before);
  await page.reload({waitUntil:'networkidle'});assert.deepEqual(await pending(),failed);assert.equal(await page.locator('[name=environment_id]').inputValue(),failed.fields.environment_id);assert.equal(await page.locator('[name=result]').inputValue(),failed.fields.result);
  normalFault.failWrite=false;await recover();assert.equal(await count(),before+1);
  normalFault.loseReply=true;await save();await page.locator('p[role=alert]').waitFor();const lost=await pending();assert.notEqual(lost.id,failed.id);assert.equal(await count(),before+2);const committed=(await rows()).find(r=>r.request_id===lost.id);
  await page.getByRole('button',{name:lost.fields.result==='win'?'負け':'勝ち',exact:true}).click();await save();await page.getByRole('alert').filter({hasText:'未確認の保存'}).waitFor();assert.deepEqual(await pending(),lost);assert.equal(await count(),before+2);
  await noOverflow();await page.screenshot({path:path.join(output,'normal-retry-'+width+'.png'),fullPage:true});
  await page.reload({waitUntil:'networkidle'});assert.equal(await page.locator('[name=result]').inputValue(),lost.fields.result);await recover();assert.deepEqual((await rows()).find(r=>r.request_id===lost.id),committed);
  await page.getByRole('button',{name:'保存して続ける',exact:true}).evaluate(b=>{b.click();b.click();b.form.requestSubmit(b);});await until(async()=>await count()===before+3);await until(async()=>!(await pending()));
  const recent=(await rows()).slice(-3);assert.equal(new Set(recent.map(r=>r.request_id)).size,3);await noOverflow();checks.push(width+'px normal: DB failure/reload/retry, committed lost reply, immutable payload, changed-input rejection, double-click, new-operation UUID');
 }
 // Storage must work BEFORE issuing any registration request.
 await go();const beforeStorage=await count();await page.evaluate(()=>{window.normalSetItem=Storage.prototype.setItem;Storage.prototype.setItem=function(k,v){if(k.startsWith('svml:pending-match:'))throw Error('denied');return window.normalSetItem.call(this,k,v);};});
 await save();await page.getByRole('alert').filter({hasText:'戦績は送信していません'}).waitFor();assert.equal(await count(),beforeStorage);await page.evaluate(()=>{Storage.prototype.setItem=window.normalSetItem;});
 // Independent tab -> different operation, copied pending tab -> same operation.
 const other=await context.newPage();await other.goto(origin+'/matches',{waitUntil:'networkidle'});assert.equal(await other.locator('[name=environment_id]').inputValue(), ids.env);
 await Promise.all([save(),other.getByRole('button',{name:'保存して続ける',exact:true}).click()]);await until(async()=>await count()===beforeStorage+2);await until(async()=>!(await pending())&&!(await pending(other)));
 normalFault.loseReply=true;await save();await page.locator('p[role=alert]').waitFor();const copied=await pending(),beforeCopied=await rows();await other.evaluate(({k,v})=>sessionStorage.setItem(k,JSON.stringify(v)),{k:storageKey,v:copied});await other.reload({waitUntil:'networkidle'});
 await Promise.all([recover(),recover(other)]);assert.deepEqual(await rows(),beforeCopied);await other.close();checks.push('storage denied sends nothing; independent tabs save separately; copied pending tab replays same ID without overwrite');
 // Environment closure must not hide recovery of a committed request.
 normalFault.loseReply=true;await save();await page.locator('p[role=alert]').waitFor();const beforeClose=await rows();await idle();await db.exec('reset role');await db.exec('update public.environments set allow_match_input=false');
 await page.reload({waitUntil:'networkidle'});await page.getByText('入力できる環境がありません',{exact:true}).waitFor();await recover();assert.deepEqual(await rows(),beforeClose);
 await idle();await db.exec('reset role');await db.exec('update public.environments set allow_match_input=true');
 // Navigate home and back/forward: a completed ID must never be reused.
 await go();const beforeHome=await count();await page.getByRole('button',{name:'保存してホームへ',exact:true}).click();await page.waitForURL(origin+'/');assert.equal(await pending(),null);
 await page.goBack({waitUntil:'networkidle'});assert.equal(await pending(),null);await page.goForward({waitUntil:'networkidle'});await go();await save();await until(async()=>await count()===beforeHome+2);await until(async()=>!(await pending()));
 checks.push('closed environment committed replay; save-home/back/forward/new match rotates ID; exact committed rows retained');
 // Discard the actual Next Server Action response AFTER its request completes.
 // This is distinct from dropping the server -> PostgREST response above.
 const beforeNetwork=await count(),errorStart=errors.length;let dropped=false;
 const drop=async route=>{
  if(!dropped&&route.request().method()==='POST'&&route.request().headers()['next-action']){
   dropped=true;const response=await route.fetch();assert.equal(response.status(),200);await response.body();await route.abort('failed');
  }else await route.fallback();
 };
 await context.route('**/matches',drop);await save();await page.locator('p[role=alert]').filter({hasText:'保存状態を確認できません'}).waitFor();await context.unroute('**/matches',drop);
 assert.equal(dropped,true);assert.equal(await count(),beforeNetwork+1);const networkPending=await pending();assert.ok(networkPending);const networkRows=await rows();
 await page.reload({waitUntil:'networkidle'});assert.deepEqual(await pending(),networkPending);await recover();assert.deepEqual(await rows(),networkRows);
 const injectedErrors=errors.splice(errorStart);assert.ok(injectedErrors.every(e=>/Failed to load resource: net::ERR_FAILED/.test(e)),JSON.stringify(injectedErrors));
 checks.push({scenario:'actual browser Server Action success response discarded; reload/retry uses same ID and does not insert',expectedInjectedConsoleErrors:injectedErrors});
};
