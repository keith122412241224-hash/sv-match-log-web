/* eslint-disable @typescript-eslint/no-require-imports */
// Built app -> recording localhost proxy -> real Supabase Auth/PostgREST/PG17.
// Requires Step 2 setup/integration, a build with NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:56329,
// PG_MODULE and PLAYWRIGHT_MODULE if these tools are installed outside the application.
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict'),crypto=require('node:crypto'),{spawn}=require('node:child_process');
const {Client}=require(process.env.PG_MODULE||'pg'),{chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const root=path.resolve(__dirname,'..'),out=path.join(root,'build/e1-ui-evidence');fs.mkdirSync(out,{recursive:true});
const raw=fs.readFileSync(path.join(root,'build/e1-evidence/start.log'));
const keys=JSON.parse(raw.toString(raw[0]===255?'utf16le':'utf8').replace(/^\uFEFF/,'').trim());
assert.equal(keys.API_URL,'http://127.0.0.1:56321');
const origin='http://localhost:3264',rpc='get_environment_dashboard_aggregates_v1',id=n=>`e3000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const envs={main:id(800),old:id(801),empty:id(802),private:id(803)};
const db=new Client({host:'127.0.0.1',port:56322,database:'postgres',user:'postgres',password:'postgres'});
const calls=[],errors=[],checks=[],browserRequests=[],imageRequests=[];let mode='normal',delay=0,app,browser,proxy,log;
const wait=ms=>new Promise(r=>setTimeout(r,ms));
async function auth(route,body,admin=false){const r=await fetch(keys.API_URL+'/auth/v1/'+route,{method:'POST',headers:{apikey:admin?keys.SERVICE_ROLE_KEY:keys.ANON_KEY,'Content-Type':'application/json',...(admin?{Authorization:'Bearer '+keys.SERVICE_ROLE_KEY}:{})},body:JSON.stringify(body)});assert.ok(r.ok,'Local auth request failed');return r.json();}
async function seed(){
 const password=crypto.randomBytes(18).toString('hex'),members=[];
 for(let i=0;i<3;i++){const email=`e1-ui-${Date.now()}-${i}@example.test`;const u=await auth('admin/users',{email,password,email_confirm:true},true);members.push(await auth('token?grant_type=password',{email,password}));assert.equal(members[i].user.id,u.id);}
 const anon=await auth('signup',{});await db.connect();
 const personal=[];for(const member of members){const deck=crypto.randomUUID();personal.push(deck);await db.query("insert into public.decks(id,user_id,name,class_name) values($1,$2,'PRIVATE-UI-DECK','エルフ')",[deck,member.user.id]);}
 await db.query('delete from public.matches where environment_id=any($1::uuid[])',[Object.values(envs)]);
 for(const [label,e] of Object.entries(envs))await db.query(`insert into public.environments(id,user_id,name,allow_match_input,created_at,memo) values($1,$2,$3,$4,$5,'PRIVATE-UI-MEMO') on conflict(id) do update set allow_match_input=excluded.allow_match_input`,[e,members[0].user.id,label==='main'?'検証環境・アズヴォルト能力調整後':label==='old'?'過去環境（入力終了）':label==='empty'?'データなし検証':'非公開検証',label==='main',label==='main'?'2030-01-01':'2020-01-01']);
 for(let i=0;i<8;i++)await db.query("insert into public.deck_archetypes(id,name,class_name) values($1,$2,'エルフ') on conflict(id) do nothing",[id(810+i),['ミッドレンジ・ナイトメア','アーティファクト・ネメシス','スペルウィッチ','ランプドラゴン','コントロールビショップ','アグロロイヤル','コンボエルフ','長い名前のデッキ分類・表示検証'][i]]);
 await db.query('insert into public.admin_users(user_id) values($1)',[members[2].user.id]);
 const t=Math.floor(Date.now()/1800000)*1800000;
 for(const previous of [false,true])for(let d=0;d<8;d++)for(let i=0;i<(previous?9:[24,18,12,6,3,3,3,3][d]);i++){
  const rank=['master','grandmaster',null][Math.floor(i/3)%3];
  await db.query(`insert into public.matches(user_id,environment_id,my_archetype_id,opponent_archetype_id,result,turn_order,played_at,rank_tier,master_group,grandmaster_rating,my_deck_id,opponent_deck_id)
   values($1,$2,$3,$4,$5,'first',$6,$7,$8,$9,$10,$10)`,[members[i%3].user.id,envs.main,id(810+(d+1)%8),id(810+d),i%3?'win':'lose',new Date(t-(previous?8*86400000:3600000)).toISOString(),rank,rank==='master'?'emerald':null,rank==='grandmaster'?'none':null,personal[i%3]]);
 }
 await db.query('update public.environments set allow_match_input=true where id=$1',[envs.private]);
 await db.query("insert into public.matches(user_id,environment_id,my_archetype_id,opponent_archetype_id,result,turn_order,played_at,my_deck_id,opponent_deck_id) values($1,$2,$3,$3,'win','first',$4,$5,$5)",[members[0].user.id,envs.private,id(810),new Date(t-3600000).toISOString(),personal[0]]);
 await db.query('update public.environments set allow_match_input=false where id=$1',[envs.private]);
 return {members,anon};
}
async function context(session){const c=await browser.newContext({viewport:{width:1365,height:1000}});if(session)await c.addCookies([{name:'sb-127-auth-token',value:'base64-'+Buffer.from(JSON.stringify(session)).toString('base64url'),url:origin}]);return c;}
function count(){return calls.filter(c=>c.path.endsWith('/rpc/'+rpc)).length;}
async function settled(page){await page.waitForLoadState('networkidle');await page.getByRole('status').filter({hasText:'読み込み中'}).waitFor({state:'hidden'});}
async function selectRank(page,value){await page.getByRole('combobox',{name:/^ランク/}).click();await page.locator('[role=option][id$="-option-'+value+'"]').click();}
async function noOverflow(page){assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'viewport overflow');}
(async()=>{
 const {members,anon}=await seed();
 proxy=http.createServer(async(req,res)=>{try{
  const chunks=[];for await(const c of req)chunks.push(c);const body=Buffer.concat(chunks),isRpc=req.url.split('?')[0].endsWith('/rpc/'+rpc);
  calls.push({at:Date.now(),path:req.url.split('?')[0],method:req.method,...(isRpc?{args:JSON.parse(body.toString())}:{})});
  if(isRpc&&delay)await wait(delay);
  if(isRpc&&mode==='error'){res.writeHead(503,{'Content-Type':'application/json'});res.end(JSON.stringify({message:'Local injected error'}));return;}
  const upstream=await fetch(keys.API_URL+req.url,{method:req.method,headers:Object.fromEntries(Object.entries(req.headers).filter(([k])=>!['host','connection','content-length','accept-encoding'].includes(k))),...(body.length?{body}:{}),redirect:'manual'});
  let data=Buffer.from(await upstream.arrayBuffer());
  if(isRpc&&mode==='invalid'){const p=JSON.parse(data);p.decks[0].current.encounter={status:'privacy_suppressed',count:999};data=Buffer.from(JSON.stringify(p));}
  if(isRpc&&mode==='large'){const p=JSON.parse(data);for(const label of ['current','previous']){if(p[label].total.status==='available')p[label].total.totalMatches*=100000;for(const d of p.decks){if(d[label].encounter.status==='available')d[label].encounter.count*=100000;if(d[label].winrate.status==='available')for(const k of ['targetRegistrations','evaluationCount','wins'])d[label].winrate[k]*=100000;}}data=Buffer.from(JSON.stringify(p));}
  res.writeHead(upstream.status,Object.fromEntries([...upstream.headers].filter(([k])=>!['content-length','content-encoding','transfer-encoding','connection'].includes(k))));res.end(data);
 }catch{res.writeHead(502);res.end('{}');}});
 await new Promise(r=>proxy.listen(56329,'127.0.0.1',r));
 log=fs.openSync(path.join(out,'server.log'),'w');app=spawn(process.execPath,[require.resolve('next/dist/bin/next'),'start','-p','3264'],{cwd:root,windowsHide:true,stdio:['ignore',log,log],env:{...process.env,NEXT_PUBLIC_SUPABASE_URL:'http://127.0.0.1:56329',NEXT_PUBLIC_SUPABASE_ANON_KEY:keys.ANON_KEY}});
 for(let i=0;i<60;i++){try{if((await fetch(origin+'/privacy')).ok)break;}catch{}await wait(500);}
 browser=await chromium.launch({headless:true,args:['--remote-debugging-port=9334'],...(process.env.CHROME_EXECUTABLE?{executablePath:process.env.CHROME_EXECUTABLE}:{})});
 const member=await context(members[0]),page=await member.newPage();page.on('pageerror',e=>errors.push(e.message));
 page.on('request',r=>{if(/\/(ranks|master-groups)\//.test(r.url()))imageRequests.push(new URL(r.url()).pathname);if(r.url().includes('/environment'))browserRequests.push({at:Date.now(),url:r.url(),type:r.resourceType()});});
 page.on('console',m=>{if(m.type()==='error'&&!(['error','invalid'].includes(mode)&&m.location().url.includes('/api/environment?')&&m.text().includes('503')))errors.push(m.text());});
 await page.goto(origin+'/privacy',{waitUntil:'networkidle'});
 let start=count();await page.goto(origin+'/environment',{waitUntil:'networkidle'});await settled(page);
 assert.deepEqual(imageRequests,[],'Closed all-rank selector must not load rank images');checks.push('closed selector loads no rank images');
 const initialHistoryLength=await page.evaluate(()=>history.length);
 assert.equal(count()-start,1);assert.equal(await page.locator('select[name=environment]').inputValue(),envs.main);assert.equal(await page.locator('input[name=period]:checked').inputValue(),'7d');
 assert.equal(await page.getByRole('heading',{name:'環境データ',exact:true}).count(),1);
 const section=title=>page.locator('section').filter({has:page.getByRole('heading',{name:title,exact:true})});
 assert.equal(await section('遭遇率TOP5').locator('li').count(),5);assert.ok(await section('勝率TOP5').locator('li').count()>=3);
 assert.equal(await section('増加TOP3').locator('li').count(),3);assert.equal(await section('減少TOP3').locator('li').count(),3);
 assert.ok((await page.locator('main').innerText()).includes('参考'));checks.push('member/default/TOP5/TOP3/sample');assert.ok(!(await section('デッキ別データ').innerText()).includes('Shared inactive'));assert.ok(!(await section('デッキ別データ').innerText()).includes('未分類'));checks.push('active-only catalog rows, no unclassified row');
 const before=await page.content();for(const forbidden of [...members.map(s=>s.user.id),'PRIVATE-UI-MEMO','PRIVATE-UI-DECK','access_token'])assert.ok(!before.includes(forbidden));
 assert.equal(calls.filter(c=>c.path==='/rest/v1/matches').length,0);assert.equal(calls.filter(c=>c.path.includes('/rpc/')&&!c.path.endsWith('/'+rpc)).length,0);
 fs.writeFileSync(path.join(out,'payload-summary.json'),JSON.stringify({htmlBytes:Buffer.byteLength(before),initialRpcCalls:count()-start}));
 for(const width of [1365,768,390,320,430]){await page.setViewportSize({width,height:1000});await noOverflow(page);await page.screenshot({path:path.join(out,`environment-${width}.png`),fullPage:true});checks.push('viewport '+width);}
 await page.setViewportSize({width:1365,height:1000});
 for(const period of ['24h','3d','7d','30d']){start=count();await page.locator('label').filter({has:page.locator(`input[name=period][value="${period}"]`)}).click();await settled(page);assert.equal(new URL(page.url()).searchParams.get('period'),period);assert.equal(count()-start,1);checks.push('period '+period);}
 for(const rank of ['master-plus','master','grandmaster','all']){start=count();await selectRank(page,rank);await settled(page);assert.equal(new URL(page.url()).searchParams.get('rank'),rank);assert.equal(count()-start,1);checks.push('rank '+rank);}
 const docs=[];page.on('request',r=>{if(r.resourceType()==='document')docs.push(r.url());});
 for(const [label,env] of Object.entries(envs).filter(([l])=>l!=='main')){start=count();await page.getByRole('combobox',{name:'環境',exact:true}).selectOption(env);await settled(page);assert.equal(count()-start,1);assert.equal(new URL(page.url()).searchParams.get('environment'),env);
  if(label==='empty')assert.ok((await page.locator('main').innerText()).includes('データなし'));
  if(label==='private'){const text=await page.locator('main').innerText();assert.ok(text.includes('データ量が少ないため非表示'));assert.equal(await page.locator('main .bg-amber-50').count(),0);}
  checks.push('environment '+label);
 }
 assert.equal(docs.length,0);await page.reload({waitUntil:'networkidle'});assert.equal(await page.getByRole('combobox',{name:'環境',exact:true}).inputValue(),envs.private);checks.push('SPA navigation and reload restore');
 assert.equal(await page.evaluate(()=>history.length),initialHistoryLength);await page.goBack({waitUntil:'networkidle'});assert.equal(new URL(page.url()).pathname,'/privacy');
 start=count();await page.goForward({waitUntil:'networkidle'});await page.waitForFunction(e=>document.querySelector('select[name=environment]')?.value===e,envs.private);await settled(page);assert.ok(count()-start<=1,'forward duplicate fetch');checks.push('query replacement and page-history restore without duplicate fetch');
 await page.goto(origin+`/environment?environment=${envs.old}&period=bad&rank=master:invalid`,{waitUntil:'networkidle'});assert.equal(new URL(page.url()).searchParams.get('environment'),envs.old);assert.equal(new URL(page.url()).searchParams.get('period'),'7d');assert.equal(new URL(page.url()).searchParams.get('rank'),'all');
 for(const target of ['分析','相性表']){const href=await page.getByRole('link',{name:`自分の${target}を見る`}).getAttribute('href');assert.ok(href.includes('scope=mine')&&href.includes(envs.old)&&!href.includes('period='));}
 checks.push('invalid URL normalization and own-data links');
 const rankOptions=[['all','すべて',null],['beginner','Beginner','/ranks/beginner.png'],...['d','c','b','a','aa'].map(r=>[r,r.toUpperCase()+'ランク','/ranks/'+r+'.png']),['master-plus','Master以上','/ranks/master.png'],['master','Master','/ranks/master.png'],...['emerald','topaz','ruby','sapphire','diamond'].map((r,i)=>['master:'+r,['エメラルド','トパーズ','ルビー','サファイア','ダイヤモンド'][i],'/master-groups/'+r+'.png']),['grandmaster-plus','GrandMaster以上','/ranks/grandmaster.png'],['grandmaster','GrandMaster','/ranks/grandmaster.png'],...['none','epic','ultimate','legend','beyond'].map(r=>['grandmaster:'+r,r==='none'?'なし':r.toUpperCase(),'/ranks/grandmaster.png'])];
 const combo=()=>page.getByRole('combobox',{name:/^ランク/});
 await combo().click();assert.equal(await page.getByRole('listbox').getAttribute('id'),await combo().getAttribute('aria-controls'));
 assert.deepEqual(await page.getByRole('listbox').getByRole('option').allTextContents(),rankOptions.map(([value,label])=>label+(value==='all'?'✓':'')));
 assert.equal(await page.getByRole('listbox').getByRole('group').count(),4);await page.keyboard.press('Escape');checks.push('E1.1 grouped options, Japanese labels and ARIA controls');
 for(const [value,label,icon]of rankOptions){await selectRank(page,value);await settled(page);assert.equal(await page.locator('input[name=rank]').inputValue(),value);assert.ok((await combo().innerText()).includes(label));if(icon){assert.equal(new URL(await combo().locator('img').getAttribute('src'),origin).pathname,icon);assert.ok(await combo().locator('img').evaluate(e=>e.complete&&e.naturalWidth>0));}else assert.equal(await combo().locator('img').count(),0);
 const currentUrl=new URL(page.url());assert.equal(currentUrl.searchParams.get('rank')||'all',value);
 const analysis=page.getByRole('link',{name:'自分の分析を見る'}),matrix=page.getByRole('link',{name:'自分の相性表を見る'});
 const supportedAnalysis=value!=='grandmaster-plus',supportedMatrix=supportedAnalysis&&!['beginner','d','c','b','a','aa'].includes(value);
 for(const [link,supported]of [[analysis,supportedAnalysis],[matrix,supportedMatrix]]){const href=await link.getAttribute('href');if(supported)assert.equal(new URL(href,origin).searchParams.get('rank'),value);else{assert.equal(href,null);assert.equal(await link.getAttribute('aria-disabled'),'true');}}
 checks.push('E1.1 rank '+value);
 }
 await page.reload({waitUntil:'networkidle'});await settled(page);assert.equal(await page.locator('input[name=rank]').inputValue(),'grandmaster:beyond');checks.push('E1.1 shared URL/reload exact detailed rank');
 await combo().focus();await page.keyboard.press('Enter');assert.equal(await combo().getAttribute('aria-expanded'),'true');await page.keyboard.press('Home');await page.keyboard.press('ArrowDown');assert.ok((await combo().getAttribute('aria-activedescendant')).endsWith('-option-beginner'));await page.keyboard.press('ArrowUp');await page.keyboard.press('Escape');assert.equal(await page.locator('input[name=rank]').inputValue(),'grandmaster:beyond');assert.ok(await combo().evaluate(e=>e===document.activeElement));
 await page.keyboard.press('Space');await page.keyboard.press('Home');await page.keyboard.press('ArrowDown');await page.keyboard.press('Enter');await settled(page);assert.equal(await page.locator('input[name=rank]').inputValue(),'beginner');assert.ok(await combo().evaluate(e=>e===document.activeElement));
 await page.keyboard.press('Space');await page.keyboard.press('ArrowDown');await page.keyboard.press('Tab');await settled(page);assert.equal(await page.locator('input[name=rank]').inputValue(),'d');assert.equal(await combo().getAttribute('aria-expanded'),'false');checks.push('E1.1 Enter/Space/Up/Down/Escape/Tab/focus');
 await selectRank(page,'master:diamond');await settled(page);await page.locator('label').filter({has:page.locator('input[name=period][value="3d"]')}).click();await settled(page);assert.equal(await page.locator('input[name=rank]').inputValue(),'master:diamond');await page.getByRole('combobox',{name:'環境',exact:true}).selectOption(envs.main);await settled(page);assert.equal(await page.locator('input[name=rank]').inputValue(),'master:diamond');
 await page.goto(origin+'/privacy',{waitUntil:'networkidle'});await page.goBack({waitUntil:'networkidle'});await settled(page);assert.equal(await page.locator('input[name=rank]').inputValue(),'master:diamond');await page.goForward({waitUntil:'networkidle'});assert.equal(new URL(page.url()).pathname,'/privacy');await page.goBack({waitUntil:'networkidle'});await settled(page);checks.push('E1.1 detailed rank preserved across period/environment/back/forward');
 for(const width of [320,390,430]){await page.setViewportSize({width,height:720});await combo().scrollIntoViewIfNeeded();await combo().click();await noOverflow(page);const box=await page.getByRole('listbox').boundingBox();assert.ok(box.x>=0&&box.x+box.width<=width+1&&box.y>=0&&box.y+box.height<=721);await page.keyboard.press('End');await page.waitForFunction(()=>{const list=document.querySelector('[role=listbox]'),box=list.getBoundingClientRect();return [...list.querySelectorAll('img')].filter(img=>{const r=img.getBoundingClientRect();return r.bottom>box.top&&r.top<box.bottom;}).every(img=>img.complete&&img.naturalWidth>0);});await page.screenshot({path:path.join(out,'rank-menu-'+width+'.png')});await page.keyboard.press('Enter');await settled(page);assert.equal(await page.locator('input[name=rank]').inputValue(),'grandmaster:beyond');checks.push('E1.1 menu viewport '+width);}
 const touch=await browser.newContext({viewport:{width:390,height:720},hasTouch:true,isMobile:true});await touch.addCookies(await member.cookies());const tp=await touch.newPage();await tp.goto(origin+`/environment?environment=${envs.main}&period=7d&rank=all`,{waitUntil:'networkidle'});const tc=tp.getByRole('combobox',{name:/^ランク/});await tc.tap();await tp.getByRole('listbox').evaluate(e=>e.scrollTop=e.scrollHeight);await tp.locator('[role=option][id$="-option-grandmaster:beyond"]').tap();await settled(tp);assert.equal(await tp.locator('input[name=rank]').inputValue(),'grandmaster:beyond');await touch.close();checks.push('E1.1 touch scroll and final option tap');
 for(const [rank]of rankOptions){const api=await member.request.get(origin+`/api/environment?environment=${envs.main}&period=7d&rank=${encodeURIComponent(rank)}`);assert.equal(api.status(),200);assert.equal((await api.json()).rankFilter,rank);}checks.push('E1.1 real API all 21 ranks');

 await page.setViewportSize({width:1365,height:1000});await selectRank(page,'all');await settled(page);await page.getByRole('combobox',{name:'環境',exact:true}).selectOption(envs.old);await settled(page);

 delay=1200;mode='error';start=count();await page.getByRole('combobox',{name:'環境',exact:true}).selectOption(envs.main);await page.getByRole('status').waitFor();assert.equal(await page.getByRole('heading',{name:'遭遇率TOP5'}).count(),0);await settled(page);assert.equal(await page.locator('main').getByRole('alert').count(),1);assert.equal(count()-start,1);
 mode='invalid';delay=0;await selectRank(page,'master');await settled(page);assert.equal(await page.locator('main').getByRole('alert').count(),1);assert.equal(await page.getByRole('heading',{name:'遭遇率TOP5'}).count(),0);checks.push('loading hides stale data; RPC/malformed payload fail closed');
 mode='large';start=count();await page.getByRole('button',{name:'再試行',exact:true}).click();await settled(page);assert.equal(count()-start,1);assert.equal(await page.locator('main').getByRole('alert').count(),0);
 for(const width of [1365,390,320]){await page.setViewportSize({width,height:1000});await noOverflow(page);await page.screenshot({path:path.join(out,`large-counts-${width}.png`),fullPage:true});}checks.push('retry and seven-digit counts');mode='normal';
 assert.equal(calls.filter(c=>c.path==='/rest/v1/matches').length,0);checks.push('environment flow never selects raw matches');
 for(const [target,rank]of [['analysis','beginner'],['analysis','master:diamond'],['matrix','grandmaster:none']]){const dest=await member.newPage();await dest.goto(origin+`/${target}?environment=${envs.main}&rank=${encodeURIComponent(rank)}&scope=mine`,{waitUntil:'networkidle'});assert.equal(await dest.locator('select[name=rank]').inputValue(),rank);await dest.close();}checks.push('E1.1 supported destination pages accept unchanged rank');
 const admin=await context(members[2]),ap=await admin.newPage();await ap.goto(origin+`/environment?environment=${envs.private}`,{waitUntil:'networkidle'});assert.ok((await ap.locator('main').innerText()).includes('データ量が少ないため非表示'));checks.push('admin suppression');
 for(const session of [null,anon]){const c=await context(session),p=await c.newPage();start=count();await p.goto(origin+'/environment',{waitUntil:'networkidle'});assert.ok(new URL(p.url()).pathname==='/login');assert.equal((await c.request.get(origin+`/api/environment?environment=${envs.main}&period=7d&rank=all`)).status(),401);assert.equal(count()-start,0);await c.close();}checks.push('unauthenticated/anonymous rejected before RPC, including API');
 assert.equal((await member.request.get(origin+`/api/environment?environment=${envs.main}&period=7d&rank=master:invalid`)).status(),400);
 const guest=await context(),gp=await guest.newPage();await gp.goto(origin+'/guest',{waitUntil:'networkidle'});assert.equal(await gp.getByRole('link',{name:'環境',exact:true}).count(),0);checks.push('guest remains separate');await guest.close();
 for(const route of ['/','/matches','/analysis','/matrix','/admin/weekly-report','/admin','/guest']){const response=await ap.goto(origin+route,{waitUntil:'networkidle'});assert.equal(response.status(),200,route);await noOverflow(ap);assert.equal(await ap.getByText('Application error',{exact:false}).count(),0);checks.push('regression '+route);}
 await page.goto(origin+`/environment?environment=${envs.main}&period=7d&rank=all`,{waitUntil:'networkidle'});await page.setViewportSize({width:390,height:900});await page.keyboard.press('Tab');assert.ok(await page.evaluate(()=>document.activeElement!==document.body));
 start=count();await page.getByRole('radio',{name:'3日',exact:true}).focus();await page.keyboard.press('Space');await settled(page);assert.equal(await page.locator('input[name=period]:checked').inputValue(),'3d');assert.equal(count()-start,1);checks.push('keyboard period control');
 assert.deepEqual(errors,[]);
 const e1Calls=calls.filter(c=>c.path.endsWith('/rpc/'+rpc));fs.writeFileSync(path.join(out,'result.json'),JSON.stringify({passed:true,checks,e1Calls,errors,imageRequests,realSupabase:true},null,2));console.log(JSON.stringify({passed:true,checks:checks.length,e1RpcCalls:e1Calls.length}));
 if(process.argv.includes('--inspect')){console.log('INSPECT_READY CDP 9334; local app 3264');await wait(55000);}
 await admin.close();await member.close();
})().catch(e=>{console.error(e.message,e.stack);process.exitCode=1;fs.writeFileSync(path.join(out,'failure.json'),JSON.stringify({calls,errors,browserRequests},null,2));}).finally(async()=>{if(browser)await browser.close();if(app)app.kill();if(proxy)proxy.closeAllConnections();if(proxy)proxy.close();if(log!==undefined)fs.closeSync(log);await db.end().catch(()=>{});});
