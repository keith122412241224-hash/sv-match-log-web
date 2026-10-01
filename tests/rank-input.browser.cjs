/* eslint-disable @typescript-eslint/no-require-imports */
// R2 browser coverage against only a local synthetic Supabase service.
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict'),{spawn}=require('node:child_process');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const origin='http://localhost:3235',output=path.resolve('build/rank-input-browser'),storageKey='svml:guest-matches:v1';
const user={id:'fixture-user',aud:'authenticated',role:'authenticated',email:'fixture@example.test',app_metadata:{},user_metadata:{}};
const decks=[{id:'a',user_id:user.id,deck_type:'my_deck',name:'Alpha',class_name:'エルフ',is_active:true},{id:'b',user_id:user.id,deck_type:'my_deck',name:'Beta',class_name:'エルフ',is_active:true}];
const saved=[],unexpected=[],errors=[],calls=[];let hold=false,release,homeRecent=[],homeRanks=[],rankReadFails=false;
const api=http.createServer(async(req,res)=>{
 res.setHeader('Content-Type','application/json');const url=new URL(req.url,'http://127.0.0.1:54329');calls.push({method:req.method,path:url.pathname,query:url.search});
 if(req.method==='POST'&&url.pathname==='/rest/v1/rpc/get_home_dashboard'){res.end(JSON.stringify({summary:{total:saved.length,wins:saved.length,winRate:100,firstWinRate:100,secondWinRate:null},recent:homeRecent}));return;}
 if(req.method==='POST'&&url.pathname==='/rest/v1/matches'){let raw='';for await(const part of req)raw+=part;const body=JSON.parse(raw);if(hold)await new Promise(r=>{release=r;});saved.push(...(Array.isArray(body)?body:[body]));res.writeHead(201);res.end('{}');return;}
 if(req.method==='POST'&&url.pathname==='/rest/v1/decks'){res.writeHead(201);res.end('{}');return;}
 if(!['GET','HEAD'].includes(req.method)){unexpected.push(url.pathname);res.writeHead(405);res.end('{}');return;}
 let data=[];
 if(url.pathname==='/auth/v1/user')data=user;
 else if(url.pathname.endsWith('/admin_users'))data={id:'admin',user_id:user.id};
 else if(url.pathname.endsWith('/matches')){if(rankReadFails){res.writeHead(500);res.end('{}');return;}data=homeRanks;}
 else if(url.pathname.endsWith('/environments'))data=[{id:'e',name:'入力検証',created_at:'2026-09-01',allow_match_input:true}];
 else if(url.pathname.endsWith('/deck_archetypes')||url.pathname.endsWith('/decks'))data=decks;
 if(Array.isArray(data))data=data.filter(row=>[...url.searchParams].every(([key,value])=>{if(value.startsWith('eq.'))return String(row[key])===value.slice(3);if(value.startsWith('in.('))return value.slice(4,-1).split(',').map(v=>v.replaceAll('"','')).includes(String(row[key]));return true;}));
 res.end(JSON.stringify(data));
});
const nil={rank_tier:null,master_group:null,grandmaster_rating:null};
const ranks=[nil,...['beginner','d','c','b','a','aa'].map(rank_tier=>({...nil,rank_tier})),...['emerald','topaz','ruby','sapphire','diamond'].map(master_group=>({...nil,rank_tier:'master',master_group})),...['none','epic','ultimate','legend','beyond'].map(grandmaster_rating=>({...nil,rank_tier:'grandmaster',grandmaster_rating}))];
async function until(check){for(let i=0;i<120;i++){if(await check())return;await new Promise(r=>setTimeout(r,100));}throw new Error('Timed out waiting for local action');}
(async()=>{
 fs.mkdirSync(output,{recursive:true});await new Promise(r=>api.listen(54329,'127.0.0.1',r));
 const log=fs.openSync(path.join(output,'server.log'),'w');const app=spawn(process.execPath,[require.resolve('next/dist/bin/next'),'start','-p','3235'],{windowsHide:true,stdio:['ignore',log,log],env:{...process.env,NEXT_PUBLIC_SUPABASE_URL:'http://127.0.0.1:54329',NEXT_PUBLIC_SUPABASE_ANON_KEY:'test-public-key',OPENAI_API_KEY:''}});let browser, auditPage;
 try{
 await until(async()=>{try{return(await fetch(origin+'/privacy')).ok;}catch{return false;}});
 browser=await chromium.launch({headless:true,...(process.env.CHROME_EXECUTABLE?{executablePath:process.env.CHROME_EXECUTABLE}:{})});const context=await browser.newContext();
 const token=['eyJhbGciOiJIUzI1NiJ9',Buffer.from(JSON.stringify({sub:user.id,exp:Math.floor(Date.now()/1000)+3600})).toString('base64url'),'fixture'].join('.');
 await context.addCookies([{name:'sb-127-auth-token',value:'base64-'+Buffer.from(JSON.stringify({access_token:token,refresh_token:'fixture',expires_at:Math.floor(Date.now()/1000)+3600,expires_in:3600,token_type:'bearer',user})).toString('base64url'),url:origin}]);
 const page=await context.newPage();auditPage=page;page.on('pageerror',e=>errors.push(e.message));
 const choose=async rank=>{const value=rank.rank_tier==='master'?'master:'+rank.master_group:rank.rank_tier==='grandmaster'?'grandmaster:'+rank.grandmaster_rating:rank.rank_tier||'unranked';await page.locator('button[aria-haspopup="dialog"]').click();await page.locator('dialog input[value="'+value+'"]').click();};
 await page.goto(origin+'/matches',{waitUntil:'networkidle'});
 for(const rank of ranks){console.log("UI case "+JSON.stringify(rank));await choose(rank);const count=saved.length;await page.getByRole('button',{name:'保存して続ける',exact:true}).click();await until(()=>saved.length===count+1);await page.getByRole('button',{name:'保存して続ける',exact:true}).waitFor();for(const key of Object.keys(nil))assert.equal(saved.at(-1)[key],rank[key]);assert.equal(await page.locator('[name="rank_tier"]').inputValue(),rank.rank_tier||'');}
 // Consecutive submissions preserve the selected rank and deck.
 const selected=await page.locator('[name="my_archetype_id"]').inputValue();let count=saved.length;
 await page.getByRole('button',{name:'保存して続ける',exact:true}).click();await until(()=>saved.length===count+1);await page.getByRole('button',{name:'保存して続ける',exact:true}).waitFor();assert.equal(saved.at(-1).grandmaster_rating,'beyond');assert.equal(await page.locator('[name="my_archetype_id"]').inputValue(),selected);
 // Atomic choices discard incompatible children; tampered fields still hit server validation.
 await choose({rank_tier:'master',master_group:'ruby'});await choose({rank_tier:'grandmaster',grandmaster_rating:'none'});
 assert.equal(await page.locator('[name="master_group"]').inputValue(),'');
 count=saved.length;
 await page.locator('[name="master_group"]').evaluate(e=>e.value='ruby');
 await page.getByRole('button',{name:'保存して続ける',exact:true}).click();
 await page.getByRole('alert').filter({hasText:'戦績の保存に失敗しました'}).waitFor();assert.equal(saved.length,count);
 await choose({rank_tier:'aa'});assert.equal(await page.locator('[name="master_group"]').inputValue(),'');
 assert.equal(await page.locator('[name="grandmaster_rating"]').inputValue(),'');
 await page.getByRole('button',{name:'保存してホームへ',exact:true}).click();await page.waitForURL(origin+'/');await until(()=>saved.length===count+1);assert.equal(saved.at(-1).rank_tier,'aa');assert.equal(saved.at(-1).master_group,null);assert.equal(saved.at(-1).grandmaster_rating,null);
 await page.goto(origin+'/matches',{waitUntil:'networkidle'});assert.equal(await page.locator('[name="rank_tier"]').inputValue(),'aa');
 // Legacy guest rows survive loading; new guest saves serialize rank metadata.
 const legacy={local_id:'legacy',environment_id:'e',my_deck_id:'a',opponent_deck_id:'b',my_archetype_id:'a',opponent_archetype_id:'b',result:'win',turn_order:'first',played_at:'2026-09-20T00:00:00Z'};
 await page.evaluate(([k,row])=>localStorage.setItem(k,JSON.stringify([row])),[storageKey,legacy]);await page.goto(origin+'/guest',{waitUntil:'networkidle'});await page.getByRole('button',{name:'戦績入力',exact:true}).click();
 for(const rank of [nil,ranks[9],ranks[12]]){await choose(rank);await page.getByRole('button',{name:'入力を試す',exact:true}).click();const rows=await page.evaluate(k=>JSON.parse(localStorage.getItem(k)),storageKey);for(const key of Object.keys(nil))assert.equal(rows[0][key],rank[key]);assert.equal(rows.at(-1).local_id,'legacy');assert.equal('rank_tier' in rows.at(-1),false);}
 await page.reload({waitUntil:'networkidle'});await page.getByRole('button',{name:'戦績入力',exact:true}).click();assert.equal(await page.locator('[name="rank_tier"]').inputValue(),'grandmaster');
 // Adding after reload must not erase ranks from previously saved guest rows.
 await page.locator('button[value="continue"]').click();
 const rows=await page.evaluate(k=>JSON.parse(localStorage.getItem(k)),storageKey);assert.equal(rows.length,5);
 assert.equal(rows.filter(r=>r.grandmaster_rating==='none').length,2);assert.equal(rows.filter(r=>r.master_group==='ruby').length,1);
 // Real import action: invalid ranks stay local; same-ID rank changes while pending stay local.
 const invalid={...legacy,local_id:'bad',rank_tier:'master'},noId={...legacy};delete noId.local_id;
 const input=[...rows,invalid,noId];await page.evaluate(([k,r])=>localStorage.setItem(k,JSON.stringify(r)),[storageKey,input]);await page.goto(origin+'/',{waitUntil:'networkidle'});
 hold=true;count=saved.length;const importsBefore=calls.filter(c=>c.method==='POST'&&c.path==='/rest/v1/matches').length;
 await page.getByRole('button',{name:'正式データに取り込む',exact:true}).click();await until(()=>typeof release==='function');assert.equal(await page.getByRole('button',{name:'取り込み中...',exact:true}).isDisabled(),true);
 await page.getByRole('button',{name:'取り込み中...',exact:true}).evaluate(b=>{b.form.requestSubmit();b.form.requestSubmit();});
 await page.evaluate(k=>{const r=JSON.parse(localStorage.getItem(k));r[0]={...r[0],rank_tier:'master',master_group:'diamond',grandmaster_rating:null};localStorage.setItem(k,JSON.stringify(r));},storageKey);
 hold=false;release();release=null;await page.getByRole('status').filter({hasText:'6件を保存しました'}).waitFor();assert.equal(saved.length,count+6);assert.equal(calls.filter(c=>c.method==='POST'&&c.path==='/rest/v1/matches').length,importsBefore+1);
 const remaining=await page.evaluate(k=>JSON.parse(localStorage.getItem(k)),storageKey);assert.equal(remaining.length,2);assert.equal(remaining[0].master_group,'diamond');assert.equal(remaining[1].local_id,'bad');assert.match(await page.getByRole('status').innerText(),/ランク情報が不正/);

 // C failures are visible, unknown data survives, and a stale view rereads latest local records.
 await page.evaluate(k=>localStorage.setItem(k,'{broken'),storageKey);await page.goto(origin+'/guest',{waitUntil:'networkidle'});
 assert.match(await page.locator('p[role=alert]').innerText(),/削除していません/);assert.equal(await page.evaluate(k=>localStorage.getItem(k),storageKey),'{broken');
 const future={schema:99,data:{keep:'verbatim'}};
 await page.evaluate(([k,r])=>localStorage.setItem(k,JSON.stringify(r)),[storageKey,[legacy,future]]);
 await page.reload({waitUntil:'networkidle'});await page.getByRole('button',{name:'戦績入力',exact:true}).click();
 await page.evaluate(([k,r])=>{const rows=JSON.parse(localStorage.getItem(k));rows.push(r);localStorage.setItem(k,JSON.stringify(rows));},[storageKey,{...legacy,local_id:'concurrent'}]);
 await page.getByRole('button',{name:'入力を試す',exact:true}).click();
 const reread=await page.evaluate(k=>JSON.parse(localStorage.getItem(k)),storageKey);assert.equal(reread.length,4);assert.deepEqual(reread[2],future);assert.equal(reread[3].local_id,'concurrent');
 const rawBefore=await page.evaluate(k=>localStorage.getItem(k),storageKey);
 await page.evaluate(()=>{window.originalSetItem=Storage.prototype.setItem;Storage.prototype.setItem=function(){throw new DOMException('quota','QuotaExceededError');};});
 await page.getByRole('button',{name:'入力を試す',exact:true}).click();assert.match(await page.locator('p').filter({hasText:'端末に保存できませんでした。保存設定・容量'}).first().innerText(),/保存できません/);assert.equal(await page.evaluate(k=>localStorage.getItem(k),storageKey),rawBefore);
 await page.evaluate(()=>{Storage.prototype.setItem=window.originalSetItem;});
 // DB save succeeds but updating local acknowledged IDs fails: all re-import paths remain blocked.
 await page.evaluate(([k,r])=>localStorage.setItem(k,JSON.stringify([r])),[storageKey,{...legacy,local_id:'post-db-failure'}]);
 await page.goto(origin+'/',{waitUntil:'networkidle'});
 await page.evaluate(k=>{let writes=0;const original=Storage.prototype.setItem;Storage.prototype.setItem=function(key,value){if(key===k&&++writes===2)throw new DOMException('quota','QuotaExceededError');return original.call(this,key,value);};},storageKey);
 const dbBefore=saved.length;await page.getByRole('button',{name:'正式データに取り込む',exact:true}).click();
 await page.getByRole('status').filter({hasText:'DBへの取り込みは完了'}).waitFor();
 assert.equal(saved.length,dbBefore+1);const blocked=page.getByRole('button',{name:'正式データに取り込む',exact:true});assert.equal(await blocked.isDisabled(),true);assert.equal(await page.getByRole('button',{name:'破棄',exact:true}).isDisabled(),true);
 await blocked.evaluate(b=>{b.form.requestSubmit();b.form.requestSubmit();});await page.waitForTimeout(300);assert.equal(saved.length,dbBefore+1);
 assert.equal((await page.evaluate(k=>JSON.parse(localStorage.getItem(k)),storageKey))[0].local_id,'post-db-failure');
 // B owner-scoped rank supplement, mobile and desktop labels, image failure and query failure.
 homeRecent=['master','grandmaster','legacy','aa'].map(id=>({id,played_at:'2026-09-20T00:00:00Z',result:'win',turn_order:'first',environment:{name:'入力検証'},my_deck:{name:'Alpha',class_name:'エルフ'},opponent_deck:{name:'Beta',class_name:'エルフ'}}));
 homeRanks=[{id:'master',rank_tier:'master',master_group:'ruby',grandmaster_rating:null},{id:'grandmaster',rank_tier:'grandmaster',master_group:null,grandmaster_rating:'beyond'},{id:'legacy',rank_tier:null,master_group:null,grandmaster_rating:null},{id:'aa',rank_tier:'aa',master_group:null,grandmaster_rating:null}].map(row=>({...row,user_id:user.id}));
 await page.route('**/ranks/aa.png',route=>route.abort());await page.goto(origin+'/',{waitUntil:'networkidle'});
 for(const viewport of [{width:1440,height:1000},{width:390,height:844}]){
  await page.setViewportSize(viewport);const text=await page.locator('main').innerText();for(const label of ['ルビー','BEYOND','ランク未登録','AAランク'])assert.ok(text.includes(label),label);
  const missingIcon=page.locator('img[src$="/ranks/aa.png"]:visible');
  if(await missingIcon.count()){await missingIcon.scrollIntoViewIfNeeded();await missingIcon.waitFor({state:'detached'});}
  assert.equal(await page.locator('img[src$="/ranks/aa.png"]:visible').count(),0);
  const icon = page.locator('img[src$="/ranks/master.png"]:visible');
  await icon.scrollIntoViewIfNeeded();await icon.evaluate(img=>img.decode());assert.ok(await icon.evaluate(img=>img.naturalWidth>0));
  await page.screenshot({path:path.join(output,'home-'+viewport.width+'.png'),fullPage:true});
 }
 const rankQueries=calls.filter(c=>c.path==='/rest/v1/matches'&&c.method==='GET');assert.ok(rankQueries.length>0);for(const q of rankQueries){const p=new URLSearchParams(q.query);assert.equal(p.get('user_id'),'eq.'+user.id);assert.equal(p.get('limit'),'50');assert.equal(p.get('select'),'id,rank_tier,master_group,grandmaster_rating');assert.ok(p.get('id').startsWith('in.('));}
 rankReadFails=true;await page.reload({waitUntil:'networkidle'});assert.match(await page.locator('main').innerText(),/ランク取得不可/);assert.match(await page.locator('main').innerText(),/総試合数/);rankReadFails=false;

 assert.deepEqual(unexpected,[]);assert.deepEqual(errors,[]);
 fs.writeFileSync(path.join(output,'result.json'),JSON.stringify({passed:true,rescueB:true,rescueC:true,validUiCombinations:17,normalAndContinuous:true,rankRetained:true,childClear:true,invalidCombinationBlocked:true,reloadRestored:true,guestNewAndLegacy:true,partialImport:true,identityAdded:true,duplicateSubmitBlocked:true,concurrentRankChangePreserved:true,syntheticSaved:saved.length,errors},null,2));console.log('R2 browser passed: 17 combinations, continuous/normal saves, child clearing, guest persistence/import and concurrent edit protection.');
 }catch(error){fs.writeFileSync(path.join(output,'failure.json'),JSON.stringify({message:error.message,saved,calls,errors,main:auditPage?await auditPage.locator('main').innerText():null},null,2));throw error;}finally{if(release)release();if(browser)await browser.close();app.kill();api.close();fs.closeSync(log);}
})().catch(e=>{console.error(e);process.exitCode=1;});
