/* eslint-disable @typescript-eslint/no-require-imports */
// Actual Next pages/actions, local HTTP fixtures only. Real DB defense is tested
// separately by environment-schedule.integration.cjs.
const fs=require('fs'),path=require('path'),http=require('http'),assert=require('assert/strict'),{spawn}=require('child_process');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const origin='http://127.0.0.1:3241',out=path.resolve('build/environment-schedule-browser');
const user={id:'fixture-user',aud:'authenticated',role:'authenticated',email:'fixture@example.test',app_metadata:{},user_metadata:{}};
const decks=['a','b'].map(id=>({id,user_id:user.id,deck_type:'my_deck',name:id==='a'?'Alpha':'Beta',class_name:'エルフ',is_active:true}));
let environments=[],failedInsert=false;const saved=[],calls=[],errors=[],requests=[];
const environment=(id,extra={})=>({id,name:id,created_at:id==='old'?'2026-09-01':'2026-09-29',start_date:null,allow_match_input:true,match_input_start_at:null,match_input_end_at:null,...extra});
const api=http.createServer(async(req,res)=>{
 res.setHeader('Content-Type','application/json');const url=new URL(req.url,'http://127.0.0.1:54329');calls.push({method:req.method,path:url.pathname});
 let body;if(['POST','PATCH'].includes(req.method)){let raw='';for await(const chunk of req)raw+=chunk;body=raw?JSON.parse(raw):{};}
 if(req.method==='POST'&&url.pathname==='/rest/v1/matches'){
  if(failedInsert){res.writeHead(400);res.end(JSON.stringify({message:'保存テストエラー'}));return;}
  saved.push(...(Array.isArray(body)?body:[body]));res.writeHead(201);res.end('{}');return;
 }
 if(req.method==='POST'&&url.pathname==='/rest/v1/decks'){res.writeHead(201);res.end('{}');return;}
 if(req.method==='PATCH'&&url.pathname==='/rest/v1/environments'){
  Object.assign(environments.find(e=>'eq.'+e.id===url.searchParams.get('id')),body);res.end('{}');return;
 }
 if(req.method==='POST'&&url.pathname==='/rest/v1/rpc/get_home_dashboard'){res.end(JSON.stringify({summary:{total:saved.length,wins:saved.length,winRate:saved.length?100:null,firstWinRate:saved.length?100:null,secondWinRate:null},recent:[]}));return;}
 let data=[];if(url.pathname==='/auth/v1/user')data=user;
 else if(url.pathname.endsWith('/admin_users'))data={id:'admin',user_id:user.id};
 else if(url.pathname.endsWith('/environments'))data=environments;
 else if(url.pathname.endsWith('/decks')||url.pathname.endsWith('/deck_archetypes'))data=decks;
 if(Array.isArray(data))data=data.filter(row=>[...url.searchParams].every(([k,v])=>v.startsWith('eq.')?String(row[k])===v.slice(3):v.startsWith('in.(')?v.slice(4,-1).split(',').map(v=>v.replaceAll('"','')).includes(String(row[k])):true));
 res.end(JSON.stringify(data));
});
const until=async fn=>{const end=Date.now()+60000;while(Date.now()<end){if(await fn())return;await new Promise(r=>setTimeout(r,100));}throw Error('Timed out');};
(async()=>{
 fs.mkdirSync(out,{recursive:true});await new Promise(r=>api.listen(54329,'127.0.0.1',r));const log=fs.openSync(path.join(out,'server.log'),'w');
 const app=spawn(process.execPath,[require.resolve('next/dist/bin/next'),'start','-p','3241'],{windowsHide:true,stdio:['ignore',log,log],env:{...process.env,NEXT_PUBLIC_SUPABASE_URL:'http://127.0.0.1:54329',NEXT_PUBLIC_SUPABASE_ANON_KEY:'test-public-key',OPENAI_API_KEY:''}});let browser,page;
 try{
  await until(async()=>{try{return(await fetch(origin+'/privacy')).ok;}catch{return false;}});
  browser=await chromium.launch({headless:true,...(process.env.CHROME_EXECUTABLE?{executablePath:process.env.CHROME_EXECUTABLE}:{})});
  const context=await browser.newContext({timezoneId:'America/Los_Angeles'});
  await context.route('**/*',route=>{
    const url=new URL(route.request().url());
    if(!['127.0.0.1','localhost'].includes(url.hostname)) { errors.push('Unexpected external request: '+url.origin);return route.abort(); }
    return route.continue();
  });
  const token=['eyJhbGciOiJIUzI1NiJ9',Buffer.from(JSON.stringify({sub:user.id,exp:Math.floor(Date.now()/1000)+3600})).toString('base64url'),'fixture'].join('.');
  await context.addCookies([{name:'sb-127-auth-token',value:'base64-'+Buffer.from(JSON.stringify({access_token:token,refresh_token:'fixture',expires_at:Math.floor(Date.now()/1000)+3600,expires_in:3600,token_type:'bearer',user})).toString('base64url'),url:origin}]);
  page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>requests.push({method:r.method(),url:r.url()}));
  page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
  const blocked = await context.request.post(origin+'/admin/environments',{headers:{origin:'https://other.example'},form:{operation:'update'},maxRedirects:0});
  assert.equal(blocked.status(),403);
  // Browser timezone is deliberately non-JST. Admin round trip stays JST.
  environments=[environment('old'),environment('new',{allow_match_input:false})];await page.goto(origin+'/admin',{waitUntil:'networkidle'});
  await page.locator('[name="match_input_end_at_old"]').fill('2026-09-29T17:00');
  await page.locator('[name="match_input_start_at_new"]').fill('2026-09-29T17:00');await page.locator('[name="allow_match_input_new"]').check();
  await page.getByRole('button',{name:'環境を一括更新',exact:true}).click();await page.waitForURL(origin+'/admin?notice=environments_updated',{timeout:60000});
  assert.equal(environments[0].match_input_end_at,'2026-09-29T08:00:00.000Z');assert.equal(environments[1].match_input_start_at,'2026-09-29T08:00:00.000Z');
  await page.reload({waitUntil:'networkidle'});assert.match(await page.locator('[name="match_input_end_at_old"]').inputValue(),/^2026-09-29T17:00/);
  await page.screenshot({path:path.join(out,'admin-jst.png'),fullPage:true});
  console.log('Admin JST round trip passed.');
  // Future start with no currently open environment still arms one timer.
  const start=Date.now()+10000;environments=[environment('new',{match_input_start_at:new Date(start).toISOString()})];
  await page.goto(origin+'/matches',{waitUntil:'networkidle'});assert.equal(await page.locator('[name="environment_id"]').count(),0);
  await until(async()=>await page.locator('[name="environment_id"]').count()===1);assert.equal(await page.locator('[name="environment_id"]').inputValue(),'new');
  console.log('Empty-to-open boundary passed.');
  // Leave a selected form open. Boundary updates environment while retaining rank/deck.
  const boundary=Date.now()+10000;environments=[environment('old',{match_input_end_at:new Date(boundary).toISOString()}),environment('new',{match_input_start_at:new Date(boundary).toISOString()})];
  await page.goto(origin+'/matches',{waitUntil:'networkidle'});assert.equal(await page.locator('[name="environment_id"]').inputValue(),'old');
  await page.locator('button[aria-haspopup=dialog]').click();await page.locator('dialog input[value="aa"]').click();let count=saved.length;await page.getByRole('button',{name:'保存して続ける',exact:true}).click();await until(()=>saved.length===count+1);assert.equal(saved.at(-1).environment_id,'old');
  const before=requests.filter(r=>r.method==='GET'&&r.url.includes('/matches?_rsc')).length;
  await until(async()=>await page.locator('[name="environment_id"]').inputValue()==='new');
  assert.equal(await page.locator('[name="rank_tier"]').inputValue(),'aa');assert.deepEqual(await page.locator('[name="environment_id"] option').evaluateAll(options=>options.map(o=>o.value)),['new']);
  await page.waitForTimeout(500);assert.equal(requests.filter(r=>r.method==='GET'&&r.url.includes('/matches?_rsc')).length,before);
  count=saved.length;await page.getByRole('button',{name:'保存して続ける',exact:true}).click();await until(()=>saved.length===count+1);assert.equal(saved.at(-1).environment_id,'new');
  await page.reload({waitUntil:'networkidle'});assert.equal(await page.locator('[name="environment_id"]').inputValue(),'new');
  console.log('Old-to-new boundary, retained rank, save and reload passed.');
  // A blocked main thread delays the timer; it still updates on resuming.
  const delayedBoundary=Date.now()+6000;environments=[environment('old',{match_input_end_at:new Date(delayedBoundary).toISOString()}),environment('new',{match_input_start_at:new Date(delayedBoundary).toISOString()})];
  await page.goto(origin+'/matches',{waitUntil:'networkidle'});assert.equal(await page.locator('[name="environment_id"]').inputValue(),'old');
  await page.evaluate(ms=>{const until=performance.now()+ms;while(performance.now()<until) { /* simulate a suspended/busy tab */ } window.dispatchEvent(new Event('focus'));},Math.max(500,delayedBoundary-Date.now()+300));
  await until(async()=>await page.locator('[name="environment_id"]').inputValue()==='new');
  // An old page without a timer cannot bypass the current server schedule.
  environments=[environment('old')];await page.goto(origin+'/matches',{waitUntil:'networkidle'});environments[0].match_input_end_at=new Date(Date.now()-1).toISOString();
  count=saved.length;await page.getByRole('button',{name:'保存して続ける',exact:true}).click();await page.getByText('この環境は戦績入力を停止しています。',{exact:true}).waitFor();assert.equal(saved.length,count);assert.equal(page.url(),origin+'/matches');assert.equal(await page.getByRole('button',{name:'保存して続ける',exact:true}).isEnabled(),true);
  // DB failure also retains the existing inline error UX.
  environments=[environment('new')];await page.reload({waitUntil:'networkidle'});failedInsert=true;await page.getByRole('button',{name:'保存してホームへ',exact:true}).click();await page.getByText('保存テストエラー',{exact:true}).waitFor();assert.equal(page.url(),origin+'/matches');assert.equal(saved.length,count);failedInsert=false;
  await page.getByRole('button',{name:'保存してホームへ',exact:true}).click();await page.waitForURL(origin+'/');assert.equal(saved.at(-1).environment_id,'new');
  // Guest local storage stays compatible; UI also follows the next boundary.
  const guestBoundary=Date.now()+10000;environments=[environment('old',{match_input_end_at:new Date(guestBoundary).toISOString()}),environment('new',{match_input_start_at:new Date(guestBoundary).toISOString()})];
  await page.goto(origin+'/guest',{waitUntil:'networkidle'});await page.getByRole('button',{name:'戦績入力',exact:true}).click();assert.equal(await page.locator('[name="environment_id"]').inputValue(),'old');
  await until(async()=>await page.locator('[name="environment_id"]').inputValue()==='new');await page.getByRole('button',{name:'入力を試す',exact:true}).click();
  const rows=await page.evaluate(()=>JSON.parse(localStorage.getItem('svml:guest-matches:v1')));assert.equal(rows[0].environment_id,'new');
  assert.deepEqual(errors,[]);fs.writeFileSync(path.join(out,'result.json'),JSON.stringify({passed:true,node:process.version,nonJstBrowserAdminRoundTrip:true,closedToOpen:true,boundaryUpdateWithoutFetch:true,delayedTimer:true,rankPreserved:true,oldIdDenied:true,normalAndContinuous:true,failureUx:true,hardReload:true,guestBoundary:true,errors},null,2));console.log('Schedule browser passed: JST admin, empty-to-open, boundary update without fetch, stale save rejection, reload, guest and failure UX.');
 }catch(e){if(page)await page.screenshot({path:path.join(out,'failure.png'),fullPage:true});fs.writeFileSync(path.join(out,'failure.json'),JSON.stringify({message:e.message,errors,calls,requests,saved},null,2));throw e;}finally{if(browser)await browser.close();app.kill();api.close();fs.closeSync(log);}
})().catch(e=>{console.error(e);process.exitCode=1;});
