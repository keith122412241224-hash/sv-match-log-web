/* eslint-disable @typescript-eslint/no-require-imports */
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
module.exports=async({page,context,db,origin,report,out,observe,files,setMode,setDashboardVariant})=>{
 const {newTierDocument}=require('../src/lib/creator/model'),{newCorrelationDocument}=require('../src/lib/creator/correlation');
 const {obsOptions,obsCompositionUrl}=require('../src/lib/creator/obs-set');
 const fixture=require('./obs-environment-fixture.cjs'),{environmentHrefV4}=require('../src/lib/environment-dashboard-period');
 const {identity}=require('./creator-db.cjs'),labels={environment:'環境データ',tier:'Tier表',correlation:'相関図'},all=Object.keys(labels);
 const shots=path.join(out,'screenshots');fs.mkdirSync(shots,{recursive:true});
 const shot=async(name,p=page)=>p.screenshot({path:path.join(shots,name+'.png'),fullPage:true});
 const raw=data=>context.request.post(origin+'/admin/creator/api',{headers:{Origin:origin},data});
 const post=async data=>{const r=await raw(data);assert.equal(r.status(),200,await r.text());return r.json();};
 const go=route=>page.goto(origin+route,{waitUntil:'networkidle'});
 const saved=()=>db.query('select * from creator_obs_sets where id=$1',[new URL(page.url()).searchParams.get('set')]).then(r=>r.rows[0]);
 const save=async()=>{await page.getByRole('button',{name:'セットを保存',exact:true}).click();await page.getByRole('status').filter({hasText:'OBSセットを保存しました'}).waitFor();return saved();};
 // Actual library upload and actual persisted source works.
 await go('/admin/creator/images');await page.getByLabel('画像アップロード').setInputFiles(files.slice(0,1));await page.getByRole('status').filter({hasText:'1枚の画像を保存'}).waitFor();
 const image=(await db.query('select * from creator_images')).rows[0],document=newTierDocument();document.rows[0].imageIds=[image.id];document.title='連続表示Tier';
 const tier=(await post({action:'save',document})).work;
 const graphDoc={...newCorrelationDocument(),title:'連続表示相関図',nodes:[{id:crypto.randomUUID(),imageId:image.id,x:100,y:200,width:160,height:184}]};
 const graph=(await post({action:'save-correlation',document:graphDoc})).correlation;
 await db.exec('reset role');for(const d of fixture.decks)await db.query('insert into deck_archetypes(id,name) values($1,$2) on conflict do nothing',[d.id,d.name]);await identity(db);
 const obs=await context.newPage();observe(obs);await obs.setViewportSize({width:1920,height:1080});
 const legacy=await context.newPage();observe(legacy);await legacy.setViewportSize({width:1152,height:1080});
 report.layouts=[];report.performance=[];
 async function layout(name,expected){
   // setViewportSize resolves before ResizeObserver/React necessarily commits.
   // Wait for the actual new scale and reserved height, not an arbitrary delay.
   await obs.waitForFunction(()=>{
     const host=document.querySelector('[data-obs-environment-wrapper]'),inner=document.querySelector('[data-obs-environment-content]');
     return [...document.querySelectorAll('[data-obs-section]')].every(e=>e.getBoundingClientRect().height>0)
       && (!host || (Math.abs(inner.getBoundingClientRect().width-host.clientWidth)<0.1 && Math.abs(host.getBoundingClientRect().height-inner.offsetHeight*host.clientWidth/1152)<0.1));
   });
   const m=await obs.evaluate(()=>({sections:[...document.querySelectorAll('[data-obs-section]')].map(e=>{const b=e.getBoundingClientRect();return {kind:e.getAttribute('data-obs-section'),x:b.x,y:b.y+scrollY,width:b.width,height:b.height,bottom:b.bottom+scrollY};}),width:innerWidth,viewportHeight:innerHeight,pageHeight:document.documentElement.scrollHeight,scrollWidth:document.documentElement.scrollWidth,maxScroll:document.documentElement.scrollHeight-innerHeight,canvas:document.querySelectorAll('canvas').length,images:[...document.images].every(i=>i.complete&&i.naturalWidth>0)}));
   assert.deepEqual(m.sections.map(s=>s.kind),expected);assert.equal(m.scrollWidth,m.width);assert.equal(m.canvas,0);assert(m.images);
   for(let i=0;i<m.sections.length;i++){const s=m.sections[i];assert.equal(s.width,m.width);assert.equal(s.x,0);assert(Math.abs(s.y-(i?m.sections[i-1].bottom:0))<1);if(s.kind!=='environment')assert.equal(s.height,m.width*1080/1920);}
   const bottom=m.sections.at(-1).bottom;assert(Math.abs(m.pageHeight-Math.max(1080,bottom))<=1,JSON.stringify(m));
   const overflow=await obs.locator('[data-obs-section="environment"]').evaluateAll(es=>es.flatMap(e=>{const box=e.getBoundingClientRect();return [...e.querySelectorAll('table,th,td,h1,h2,p,strong')].filter(n=>{const b=n.getBoundingClientRect();return b.width>0&&(b.left<box.left-1||b.right>box.right+1||b.top<box.top-1||b.bottom>box.bottom+1);}).map(n=>n.tagName);}));assert.deepEqual(overflow,[],'environment text/table stays within reserved section');
   await obs.evaluate(()=>scrollTo(0,document.documentElement.scrollHeight));await obs.waitForTimeout(60);const actualScroll=await obs.evaluate(()=>({scroll:scrollY,max:document.documentElement.scrollHeight-innerHeight}));assert(Math.abs(actualScroll.scroll-Math.max(0,m.maxScroll))<=1,JSON.stringify({measured:m,actual:actualScroll}));
   await obs.evaluate(()=>scrollTo(0,0));report.layouts.push({name,...m});await shot(name,obs);return m;
 }
 for(const width of [320,390,768,1152,1920]){
   await page.setViewportSize({width,height:1080});await go('/admin?section=tools');assert.equal(await page.getByRole('heading',{name:'環境データOBS表示',exact:true}).count(),1);await shot('admin-'+width);
   await page.getByRole('link',{name:'OBS表示管理を開く',exact:true}).click();await page.getByRole('checkbox',{name:'環境データ',exact:true}).check();await page.getByRole('button',{name:/ランク・レート帯/}).click();const dialog=page.getByRole('dialog');assert(await dialog.evaluate(e=>{const b=e.getBoundingClientRect();return b.x>=0&&b.right<=innerWidth;}));await page.getByRole('button',{name:'キャンセル',exact:true}).click();assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await shot('editor-'+width);
 }
 await page.setViewportSize({width:1152,height:1080});await go('/admin/creator/obs-sets');
 await page.getByLabel('表示するTier表',{exact:true}).selectOption(tier.id);await page.getByLabel('表示する相関図',{exact:true}).selectOption(graph.id);
 let selected;
 for(let mask=1;mask<8;mask++){
   for(let i=0;i<3;i++)await page.getByRole('checkbox',{name:labels[all[i]],exact:true}).setChecked(!!(mask&(1<<i)));
   if(mask&2)await page.getByLabel('表示するTier表',{exact:true}).selectOption(tier.id);if(mask&4)await page.getByLabel('表示する相関図',{exact:true}).selectOption(graph.id);
   if(mask&1){await page.getByLabel('環境',{exact:true}).selectOption(fixture.id(1));await page.getByLabel('期間',{exact:true}).selectOption('7d');}
   await page.getByLabel('セット名',{exact:true}).fill('組合せ'+mask);selected=await save();
   const start=performance.now(),rpcStart=(report.rpcCalls??[]).length;await obs.goto(origin+obsCompositionUrl(selected.id),{waitUntil:'networkidle'});const ms=performance.now()-start;await layout('combination-'+mask,all.filter((_,i)=>mask&(1<<i)));
   report.performance.push({name:'combination-'+mask,ms,aggregateRequests:report.rpcCalls.slice(rpcStart).filter(r=>r.name==='get_environment_dashboard_aggregates_v4').length});assert.equal(report.performance.at(-1).aggregateRequests,mask&1?1:0);
   await page.reload({waitUntil:'networkidle'});for(let i=0;i<3;i++)assert.equal(await page.getByRole('checkbox',{name:labels[all[i]],exact:true}).isChecked(),!!(mask&(1<<i)));
 }
 // Every period and multi-rank selection uses exactly the standalone URL contract.
 await context.grantPermissions(['clipboard-read','clipboard-write']);
 await page.getByRole('button',{name:/ランク・レート帯/}).click();await page.getByRole('button',{name:'Master',exact:true}).click();await page.getByRole('checkbox',{name:'GrandMaster / EPIC',exact:true}).check();await page.getByRole('button',{name:'適用',exact:true}).click();
 for(const environment of [fixture.id(1),fixture.id(2)])for(const period of ['24h','3d','7d','30d','all']){
   const previousPeriod=await page.getByLabel('期間',{exact:true}).inputValue();await page.getByLabel('環境',{exact:true}).selectOption(environment);assert.equal(await page.getByLabel('期間',{exact:true}).inputValue(),previousPeriod,'environment selection retains chosen period');await page.getByLabel('期間',{exact:true}).selectOption(period);selected=await save();
   assert.equal(selected.environment_id,environment);assert.equal(selected.environment_period,period);assert(selected.environment_ranks.includes('grandmaster:epic'));assert(selected.environment_ranks.includes('master:ruby'));
   await obs.goto(origin+obsCompositionUrl(selected.id,false,'environment'),{waitUntil:'networkidle'});await legacy.goto(origin+'/admin/obs'+environmentHrefV4({environment,period,ranks:selected.environment_ranks}),{waitUntil:'networkidle'});
   assert.equal(await obs.locator('[data-obs-environment-content]').innerText(),await legacy.locator('main').innerText(),'old/new complete text and numeric parity '+environment+period);
 }
 await shot('old-environment',legacy);
 await page.getByLabel('環境',{exact:true}).selectOption(fixture.id(1));await page.getByLabel('期間',{exact:true}).selectOption('7d');selected=await save();
 await page.getByRole('button',{name:'相関図を上へ',exact:true}).focus();await page.keyboard.press('Enter');await page.getByRole('button',{name:'相関図を上へ',exact:true}).click();selected=await save();assert.deepEqual(selected.content_order,['correlation','environment','tier']);await page.reload({waitUntil:'networkidle'});assert.deepEqual(await page.locator('[data-order-content]').evaluateAll(es=>es.map(e=>e.dataset.orderContent)),selected.content_order);
 await page.getByRole('checkbox',{name:'環境データ',exact:true}).uncheck();await page.getByRole('checkbox',{name:'環境データ',exact:true}).check();assert.deepEqual(await page.locator('[data-order-content]').evaluateAll(es=>es.map(e=>e.dataset.orderContent)),selected.content_order);selected=await save();
 await obs.goto(origin+obsCompositionUrl(selected.id),{waitUntil:'networkidle'});await layout('reordered',selected.content_order);
 for(const width of [1152,1920]){await obs.setViewportSize({width,height:1080});await layout('all-'+width,selected.content_order);}
 for(const content of all){await page.bringToFront();await page.getByLabel('OBSの表示対象',{exact:true}).selectOption(content);await page.getByRole('button',{name:'OBS URLをコピー',exact:true}).click();await page.getByRole('status').filter({hasText:'OBS URLをコピーしました'}).waitFor();const url=await page.evaluate(()=>navigator.clipboard.readText());assert.equal(url,origin+obsCompositionUrl(selected.id,false,content));await obs.goto(url,{waitUntil:'networkidle'});await layout('individual-'+content,[content]);}
 await page.getByLabel('OBSの背景を透明にする',{exact:true}).check();await page.getByLabel('OBSの表示対象',{exact:true}).selectOption('');const url=await page.getByLabel('OBS URL',{exact:true}).inputValue();await obs.goto(origin+url,{waitUntil:'networkidle'});await layout('transparent',selected.content_order);assert.equal(await obs.locator('body').evaluate(e=>getComputedStyle(e).backgroundColor),'rgba(0, 0, 0, 0)');assert.equal(await obs.locator('[data-obs-environment-content] > div').evaluate(e=>getComputedStyle(e).backgroundColor),'rgba(0, 0, 0, 0)');
 await page.getByRole('radio',{name:'個別表示',exact:true}).check();selected=await save();await page.reload({waitUntil:'networkidle'});assert(await page.getByRole('radio',{name:'個別表示',exact:true}).isChecked());await obs.goto(origin+obsCompositionUrl(selected.id),{waitUntil:'networkidle'});await layout('saved-individual',[selected.content_order[0]]);
 // Reload refreshes aggregates, and height shrinks/grows without clipping or polling.
 await page.getByRole('radio',{name:'縦連続表示',exact:true}).check();selected=await save();await obs.goto(origin+obsCompositionUrl(selected.id),{waitUntil:'networkidle'});const full=await layout('height-full',selected.content_order);
 setDashboardVariant('empty');await obs.reload({waitUntil:'networkidle'});const empty=await layout('height-empty',selected.content_order);assert(empty.sections.find(s=>s.kind==='environment').height<full.sections.find(s=>s.kind==='environment').height);assert.match(await obs.locator('[data-obs-section="environment"]').innerText(),/データなし/);setDashboardVariant('full');await obs.reload({waitUntil:'networkidle'});await layout('height-restored',selected.content_order);
 const count=report.rpcCalls.length;await obs.waitForTimeout(1200);assert.equal(report.rpcCalls.length,count,'no polling');
 await db.exec('reset role');const renamed='名称変更後の長い環境名・'.repeat(18);await db.query('update environments set name=$1 where id=$2',[renamed,fixture.id(1)]);await identity(db);await obs.reload({waitUntil:'networkidle'});assert((await obs.locator('[data-obs-section="environment"]').innerText()).includes(renamed));await layout('long-renamed-environment',selected.content_order);await db.exec('reset role');await db.query('update environments set name=$1 where id=$2',[fixture.environments[0].name,fixture.id(1)]);await identity(db);
 // Repeated resize/scroll/reload and Chromium heap collection are bounded observations, not a leak proof.
 const cdp=await context.newCDPSession(obs);const samples=[];for(let i=0;i<5;i++){await obs.setViewportSize({width:i%2?1152:1920,height:1080});await obs.reload({waitUntil:'networkidle'});await cdp.send('HeapProfiler.collectGarbage');samples.push((await cdp.send('Runtime.getHeapUsage')).usedSize);}report.heapSamples=samples;assert(samples.at(-1)<samples[0]*2+2e6);await cdp.detach();
 // Draft cancel retains all settings; discard does not persist. Save busy guard remains covered by navigation suite.
 const before=await saved();page.removeAllListeners('dialog');page.on('dialog',d=>d.dismiss());await page.getByLabel('セット名',{exact:true}).fill('未保存');await page.getByRole('link',{name:'運用ツールへ戻る',exact:true}).click();assert.equal(await page.getByLabel('セット名',{exact:true}).inputValue(),'未保存');assert.equal((await saved()).name,before.name);page.removeAllListeners('dialog');page.on('dialog',d=>d.accept());await page.getByRole('link',{name:'運用ツールへ戻る',exact:true}).click();await page.getByRole('heading',{name:'管理画面',exact:true}).waitFor();await page.waitForLoadState('networkidle');await go('/admin/creator/obs-sets?set='+before.id);assert.equal(await page.getByLabel('セット名',{exact:true}).inputValue(),before.name);
 for(const k of all)await page.getByRole('checkbox',{name:labels[k],exact:true}).uncheck();assert(await page.getByRole('button',{name:'セットを保存',exact:true}).isDisabled());await go('/admin/creator/obs-sets?set='+before.id);
 const single=(await post({action:'save-obs-set',values:{name:'環境のみ',...obsOptions(),environment_id:fixture.id(1),tier_work_id:null,correlation_id:null}})).set;
 for(const query of ['view=tier','view=correlation','view=nope','view=environment&view=tier']){const r=await context.request.get(origin+obsCompositionUrl(single.id)+'?'+query);assert.equal(r.status(),404);assert.doesNotMatch(await r.text(),/data-tier-artwork|data-correlation-artwork|data-obs-environment-wrapper/);}
 for(const v of [{environment_id:crypto.randomUUID()},{content_order:['tier','tier','environment']},{environment_period:'bad'},{environment_ranks:[]}])assert([400,409].includes((await raw({action:'save-obs-set',values:{...single,...v}})).status()));
 const changes=await Promise.all([raw({action:'save-obs-set',id:single.id,revision:single.revision,values:{...single,name:'競合A'}}),raw({action:'save-obs-set',id:single.id,revision:single.revision,values:{...single,name:'競合B'}})]);assert.deepEqual(changes.map(r=>r.status()).sort(),[200,409]);
 const routes=['/admin/creator/obs-sets',obsCompositionUrl(single.id),obsCompositionUrl(before.id),obsCompositionUrl(before.id,false,'environment')];
 for(const role of ['member','guest']){setMode(role);for(const route of routes)assert.equal((await context.request.get(origin+route,{maxRedirects:0})).status(),307);for(const action of ['save-obs-set','delete-obs-set'])assert.equal((await raw({action,id:single.id,revision:1,values:single})).status(),role==='member'?403:401);}setMode('admin');const anon=await context.browser().newContext();for(const route of routes)assert.equal((await anon.request.get(origin+route,{maxRedirects:0})).status(),307);await anon.close();
 await identity(db);
 const inherited=(await post({action:'create-correlation',tierId:tier.id,tierRevision:tier.revision})).correlation;
 const pair=(await post({action:'save-obs-set',values:{name:'旧セット互換',tier_work_id:tier.id,correlation_id:inherited.id}})).set;
 await obs.setViewportSize({width:1920,height:1080});report.oldObsTimings=[];
 for(let i=0;i<3;i++)for(const route of [`/admin/obs/set/${tier.id}`,obsCompositionUrl(pair.id)]){const start=performance.now();await obs.goto(origin+route,{waitUntil:'networkidle'});report.oldObsTimings.push({route:route.includes('/set/')?'legacy':'composition',ms:performance.now()-start});}
 await obs.goto(origin+`/admin/obs/set/${tier.id}`,{waitUntil:'networkidle'});await shot('old-set',obs);const artwork=await obs.locator('[data-tier-artwork],[data-correlation-artwork]').evaluateAll(es=>es.map(e=>e.outerHTML));await obs.goto(origin+obsCompositionUrl(pair.id),{waitUntil:'networkidle'});assert.deepEqual(await obs.locator('[data-tier-artwork],[data-correlation-artwork]').evaluateAll(es=>es.map(e=>e.outerHTML)),artwork);
 const median=kind=>report.oldObsTimings.filter(t=>t.route===kind).map(t=>t.ms).sort((a,b)=>a-b)[1];assert(median('composition')<median('legacy')*3+1000);
 report.checks.push('unified: 7 persisted combinations; 10 standalone parity conditions; responsive editor; reordered/individual/transparent/dynamic height; reload/no polling; roles/conflicts/invalid input; bounded heap; legacy artwork parity and load timing');
 await obs.close();await legacy.close();
};
