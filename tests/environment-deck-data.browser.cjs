/* eslint-disable @typescript-eslint/no-require-imports */
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict'),{spawn}=require('node:child_process');
const network=global.fetch;require('./register.cjs');global.fetch=network;
const {chromium}=require(process.env.PLAYWRIGHT_MODULE),f=require('./environment-deck-data-fixture.cjs');
const {buildEnvironmentViewV4}=require('../src/lib/environment-dashboard-v4');
const origin='http://localhost:3297',out=process.env.ENVIRONMENT_DECK_EVIDENCE_DIR;fs.mkdirSync(out,{recursive:true});fs.mkdirSync(path.join(out,'screenshots'),{recursive:true});
const report={checks:[],events:[],unexpected:[],rpc:[],passed:false};let mode='full';
const user={id:f.id(90),aud:'authenticated',role:'authenticated',is_anonymous:false,email:'fixture@example.test',app_metadata:{},user_metadata:{}};
const api=http.createServer(async(req,res)=>{try{
 const u=new URL(req.url,'http://127.0.0.1:54339'),table=u.pathname.split('/').at(-1);let body='';for await(const c of req)body+=c;
 let data;if(u.pathname.includes('/rpc/')){assert.equal(table,'get_environment_dashboard_aggregates_v4');const args=JSON.parse(body);report.rpc.push(args);data=f.dashboard(args,mode);}
 else{assert(['GET','HEAD'].includes(req.method));if(u.pathname==='/auth/v1/user')data=user;else if(table==='admin_users')data=null;else if(table==='environments')data=f.environments;else if(table==='deck_archetypes')data=f.decks.filter(d=>d.is_active);else throw Error('Unexpected '+u.pathname);}
 res.writeHead(200,{'Content-Type':'application/json'});res.end(JSON.stringify(data));
}catch(e){report.unexpected.push(e.message);res.writeHead(500);res.end('{}');}});
async function main(){let browser,app,log;try{
 await new Promise(r=>api.listen(54339,'127.0.0.1',r));log=fs.openSync(path.join(out,'server.log'),'w');app=spawn(process.execPath,[require.resolve('next/dist/bin/next'),'start','-p','3297'],{windowsHide:true,stdio:['ignore',log,log],env:process.env});
 let ready=false;for(let i=0;i<100;i++){try{if((await fetch(origin+'/privacy')).ok){ready=true;break;}}catch{}await new Promise(r=>setTimeout(r,200));}assert(ready);
 browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_EXECUTABLE});const context=await browser.newContext({timezoneId:'Asia/Tokyo'});
 await context.route('**/*',r=>{const u=new URL(r.request().url());if(['localhost','127.0.0.1'].includes(u.hostname)||['data:','blob:'].includes(u.protocol))return r.continue();report.unexpected.push(u.origin);return r.abort();});
 const exp=Math.floor(Date.now()/1000)+3600,session={access_token:['eyJhbGciOiJIUzI1NiJ9',Buffer.from(JSON.stringify({sub:user.id,exp})).toString('base64url'),'fixture'].join('.'),refresh_token:'fixture',expires_at:exp,expires_in:3600,token_type:'bearer',user};
 await context.addCookies([{name:'sb-127-auth-token',value:'base64-'+Buffer.from(JSON.stringify(session)).toString('base64url'),url:origin}]);
 const page=await context.newPage();page.on('pageerror',e=>report.events.push(e.message));page.on('console',m=>{if(['error','warning'].includes(m.type()))report.events.push(m.text());});
 const go=async(period='7d')=>{const r=await page.goto(origin+'/environment?environment='+f.environments[0].id+'&period='+period+'&ranks=unranked',{waitUntil:'networkidle'});assert.equal(r.status(),200);await page.getByRole('heading',{name:'デッキ別データ',exact:true}).waitFor();};
 const panel=page.locator('section').filter({has:page.getByRole('heading',{name:'デッキ別データ',exact:true})});
 const classGroup=panel.getByRole('group',{name:'クラスで絞り込み',exact:true}),classButton=c=>classGroup.getByRole('button',{name:c==='all'?'すべて':c,exact:true}),pickClass=c=>classButton(c).click();
 const trend=panel.getByRole('combobox',{name:'前期間比較',exact:true}),sort=panel.getByRole('combobox',{name:'並び替え',exact:true});
 const ids=()=>panel.locator('[data-deck-id]:visible').evaluateAll(es=>es.map(e=>e.dataset.deckId));
 const reset=()=>panel.getByRole('button',{name:'表示条件をリセット',exact:true}).click();
 const fits=async()=>{assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));assert.deepEqual(await panel.evaluate(el=>[...el.querySelectorAll('select,button,article,table,h3,h4')].filter(e=>{const r=e.getBoundingClientRect();return r.width&&(r.left<0||r.right>innerWidth+1);}).map(e=>e.tagName)),[]);};
 const shot=name=>page.screenshot({path:path.join(out,'screenshots',name+'.png'),fullPage:true});
 const args={p_environment_id:f.environments[0].id,p_period:'7d',p_rank_filters:['unranked']},rows=buildEnvironmentViewV4(f.dashboard(args)).rows.filter(r=>r.key!==f.id(242));
 const classes=['all',...f.classes.map(c=>c??'クラス未設定')],sorts=['encounter','win','delta','count'];
 const expected=(c,t,s,g)=>{
  const selected=rows.filter(r=>(c==='all'||(r.className??'クラス未設定')===c)&&(t==='all'||r.trend.state===t));
  const val=r=>s==='encounter'?r.encounterRate:s==='win'?r.winRate:s==='count'?r.current.winrate.evaluationCount:r.trend.delta===null?-Infinity:Math.abs(r.trend.delta);
  selected.sort((a,b)=>val(b)-val(a)||b.encounterRate-a.encounterRate||a.key.localeCompare(b.key));
  return (g?classes.slice(1).flatMap(k=>selected.filter(r=>(r.className??'クラス未設定')===k)):selected).map(r=>r.key);
 };
 await page.setViewportSize({width:1152,height:1080});await go();const top=async()=>Promise.all(['遭遇率TOP5','勝率TOP5','増加TOP3','減少TOP3'].map(name=>page.locator('section').filter({has:page.getByRole('heading',{name,exact:true})}).innerText()));const ranking=await top(),rpcCount=report.rpc.length,originalUrl=page.url();
 for(const width of [1152,390]){await page.setViewportSize({width,height:1080});for(const c of classes)for(const t of ['all','increase','decrease','flat'])for(const s of sorts){
  await pickClass(c);await trend.selectOption(t);await sort.selectOption(s);
  assert.equal(await classGroup.locator('button[aria-pressed=true]').count(),1);assert.equal(await classButton(c).getAttribute('aria-pressed'),'true');assert((await classGroup.innerText()).includes('選択中：'+(c==='all'?'すべて':c)));
  for(const g of [false,true]){await panel.getByRole('button',{name:g?'クラス別':'一覧',exact:true}).click();assert.deepEqual(await ids(),expected(c,t,s,g),[width,c,t,s,g].join('/'));}
 }await fits();}
 assert.equal(report.rpc.length,rpcCount,'display controls issue no aggregate requests');assert.equal(page.url(),originalUrl);assert.deepEqual(await top(),ranking,'rankings unchanged by list controls');
 report.checks.push('Desktop 288 and mobile 288 class/trend/sort/view combinations; exact order/membership and selected class; no new RPC or URL changes; rankings unchanged');
 for(const width of [320,390,768,1152,1440,1920]){await page.setViewportSize({width,height:1080});await reset();assert.deepEqual(await ids(),expected('all','all','encounter',false));await fits();await shot('list-'+width);
  await panel.getByRole('button',{name:'クラス別',exact:true}).click();assert.equal(await panel.getByRole('heading',{name:/クラス未設定（3件）/}).count(),1);await fits();await shot('groups-'+width);
  await pickClass('エルフ');await trend.selectOption('increase');await sort.selectOption('win');await fits();await shot('combined-'+width);
  for(const control of [...await classGroup.getByRole('button').all(),trend,sort,panel.getByRole('button',{name:'一覧',exact:true}),panel.getByRole('button',{name:'表示条件をリセット',exact:true})])assert((await control.boundingBox()).height>=44);
  for(const button of await classGroup.getByRole('button').all())assert((await button.boundingBox()).width>=44);
  assert.notEqual(await classButton('all').evaluate(e=>getComputedStyle(e).backgroundColor),await classButton('エルフ').evaluate(e=>getComputedStyle(e).backgroundColor));
 }
 await reset();await pickClass('エルフ');await trend.selectOption('flat');assert(!(await panel.innerText()).includes('前期なし'));await reset();
 await classButton('all').focus();await page.keyboard.press('Tab');assert(await classButton('エルフ').evaluate(e=>e===document.activeElement));await page.keyboard.press('Space');assert.deepEqual(await ids(),expected('エルフ','all','encounter',false));
 await page.keyboard.press('Tab');assert(await classButton('ロイヤル').evaluate(e=>e===document.activeElement));await page.keyboard.press('Enter');assert.deepEqual(await ids(),expected('ロイヤル','all','encounter',false));
 await panel.getByRole('button',{name:'クラス別',exact:true}).focus();await page.keyboard.press('Enter');assert.equal(await panel.getByRole('button',{name:'クラス別',exact:true}).getAttribute('aria-pressed'),'true');
 await panel.getByRole('button',{name:'表示条件をリセット',exact:true}).focus();await page.keyboard.press('Enter');assert.equal(await classButton('all').getAttribute('aria-pressed'),'true');assert.equal(await sort.inputValue(),'encounter');
 assert.equal(await panel.getByRole('combobox',{name:'クラス',exact:true}).count(),0);assert.equal(await panel.locator('details').count(),0);
 for(const text of ['表示条件はこの一覧だけ','対象戦績数は勝率計算','集計について','ポイント','相手としての観測：'])assert(!(await panel.innerText()).includes(text));
 const loaded=async icon=>{await icon.scrollIntoViewIfNeeded();await page.waitForFunction(e=>e.complete&&e.naturalWidth>0,await icon.elementHandle());};
 for(const c of f.classes.filter(Boolean)){const icon=classButton(c).getByRole('img',{name:c,exact:true});await loaded(icon);assert.equal(decodeURIComponent(new URL(await icon.getAttribute('src'),origin).searchParams.get('url')),'/classicon/'+c+'.png');assert.equal(await icon.locator('..').getAttribute('title'),c);}
 for(const row of rows){const card=panel.locator('[data-deck-id="'+row.key+'"]:visible'),c=row.className??'クラス未設定';assert.equal(await card.getByRole('img',{name:c,exact:true}).count(),1);if(row.className){const icon=card.locator('img');await loaded(icon);assert.equal(decodeURIComponent(new URL(await icon.getAttribute('src'),origin).searchParams.get('url')),'/classicon/'+c+'.png');}if(row.trend.delta!==null){assert((await card.innerText()).includes(`前期間 ${row.trend.previous.toFixed(1)}% → 今期 ${row.trend.current.toFixed(1)}%`));}}
 assert.equal(await classButton('クラス未設定').getByRole('img',{name:'クラス未設定',exact:true}).getAttribute('title'),'クラス未設定');
 await sort.selectOption('delta');await page.getByText('全期間',{exact:true}).click();await page.getByText('環境データを読み込み中…').waitFor({state:'hidden'});assert(await trend.isDisabled());assert.equal(await sort.inputValue(),'encounter');assert.equal(await panel.locator('thead th').count(),4);assert.equal(await panel.getByRole('option',{name:'増減幅が大きい順'}).getAttribute('disabled'),'');await shot('all-time');
 mode='no-previous';await go();await trend.selectOption('flat');assert.equal((await ids()).length,0);assert((await panel.innerText()).includes('条件に一致するデッキがありません'));await shot('no-filter-results');await reset();assert.equal((await ids()).length,rows.length);
 mode='empty';await go();assert.equal((await ids()).length,0);assert((await panel.innerText()).includes('この期間に対象戦績のあるデッキがありません。'));await shot('empty');
 mode='full';report.brokenImageRequests=0;await page.route('**/_next/image?**',r=>{if(decodeURIComponent(new URL(r.request().url()).searchParams.get('url')||'')!=='/classicon/エルフ.png')return r.continue();report.brokenImageRequests++;return r.fulfill({status:200,contentType:'image/png',body:'invalid image fixture'});});await go();
 await classButton('エルフ').scrollIntoViewIfNeeded();try{await classButton('エルフ').locator('span[role=img]').waitFor();}catch(error){report.imageFault=await classButton('エルフ').evaluate(e=>({html:e.outerHTML,images:[...e.querySelectorAll('img')].map(i=>({complete:i.complete,width:i.naturalWidth,src:i.currentSrc}))}));throw error;}assert.equal(await classButton('エルフ').getByRole('img',{name:'エルフ',exact:true}).getAttribute('title'),'エルフ');await pickClass('エルフ');assert.deepEqual(await ids(),expected('エルフ','all','encounter',false));
 for(const card of await panel.locator('[data-deck-id]:visible').all()){await card.scrollIntoViewIfNeeded();await card.locator('span[role=img]').waitFor();assert.equal(await card.locator('span[role=img]').getAttribute('aria-label'),'エルフ');}await page.setViewportSize({width:320,height:1080});await fits();await shot('image-fallback-320');
 await page.route('**/missing-class-icon.png',r=>r.fulfill({status:200,contentType:'image/png',body:'invalid image fixture'}));await classButton('ロイヤル').scrollIntoViewIfNeeded();await classButton('ロイヤル').locator('img').evaluate(e=>{e.removeAttribute('srcset');e.src='/missing-class-icon.png';});await classButton('ロイヤル').locator('span[role=img]').waitFor();await pickClass('ロイヤル');assert.deepEqual(await ids(),expected('ロイヤル','all','encounter',false));
 report.checks.push('Six widths: list/group/combined fit; 44px icon buttons; selected styling; Tab/Space/Enter and reset; removed copy/delta/counts; rates and seven existing icons verified; unknown/broken image fallback before and after hydration; all-time disabled comparison; unavailable previous period is not flat; filtered-empty vs data-empty');
 assert.deepEqual(report.events,[]);assert.deepEqual(report.unexpected,[]);report.passed=true;
 }finally{await browser?.close();app?.kill();api.closeAllConnections();await new Promise(r=>api.close(r));if(log!==undefined)fs.closeSync(log);}}
main().catch(e=>{report.failure=e.stack;process.exitCode=1;}).finally(()=>{fs.writeFileSync(path.join(out,'report.json'),JSON.stringify(report,null,2));console.log(JSON.stringify({passed:report.passed,checks:report.checks,events:report.events,unexpected:report.unexpected,failure:report.failure}));});
