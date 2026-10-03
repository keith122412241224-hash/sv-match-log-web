/* eslint-disable @typescript-eslint/no-require-imports */
// UI-only regression: two local production builds, identical synthetic HTTP data.
// No database, real credentials, or external API is used.
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict');
const {spawn,execFile}=require('node:child_process'),{promisify}=require('node:util');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const {analysisFixture}=require('./analysis-browser-fixture.cjs');
const {periodFixture}=require('./period-report-fixture.cjs');
const out=path.resolve('build/ui-display'),origin='http://localhost:3266';
const id=n=>`f6000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const environments=[{id:id(1),name:'表示確認用の長い環境名（能力調整後の環境・表示折り返し確認）',created_at:'2026-09-29T00:00:00Z',allow_match_input:true,match_input_start_at:null,match_input_end_at:null}];
const decks=[{id:id(2),name:'ランプドラゴン',class_name:'ドラゴン',is_active:true},{id:id(3),name:'AFネメシス',class_name:'ネメシス',is_active:true}];
const user={id:id(4),aud:'authenticated',role:'authenticated',is_anonymous:false,email:'fixture@example.test',app_metadata:{},user_metadata:{}};
const records=Array.from({length:90},(_,i)=>({id:id(100+i),user_id:user.id,environment_id:id(1),my_deck_id:id(2),my_archetype_id:id(2),opponent_deck_id:id(i%45<2?2:3),opponent_archetype_id:id(i%45<2?2:3),result:i%3?'win':'lose',turn_order:i%2?'first':'second',played_at:i<45?'2026-09-29T01:00:00.000Z':'2026-09-26T01:00:00.000Z'}));
const empty=()=>({encounter:{status:'no_data',count:null},winrate:{status:'no_data',targetRegistrations:null,evaluationCount:null,wins:null}});
const metric=(targetRegistrations,evaluationCount,wins,count)=>({encounter:{status:'available',count},winrate:{status:'available',targetRegistrations,evaluationCount,wins}});
function environmentFixture(args){
 const end=Date.parse('2026-10-02T05:00:00Z'),span=({'24h':1,'3d':3,'7d':7,'30d':30}[args.p_period])*86400000;
 const current={start:new Date(end-span).toISOString(),end:new Date(end).toISOString(),total:{status:'available',totalMatches:45}};
 const previous={start:new Date(end-2*span).toISOString(),end:current.start,total:{status:'available',totalMatches:45}};
 return {version:3,environmentId:args.p_environment_id,period:args.p_period,rankFilters:args.p_rank_filters,aggregatedAt:'2026-10-02T05:10:00Z',dataThrough:'2026-10-02T05:00:00Z',current,previous,decks:[
  {key:id(2),name:decks[0].name,className:'ドラゴン',current:metric(45,47,31,2),previous:metric(45,47,31,2)},
  {key:id(3),name:decks[1].name,className:'ネメシス',current:metric(43,43,14,43),previous:metric(43,43,14,43)},
  {key:'unclassified',name:'未分類',className:null,current:empty(),previous:empty()}]};
}
const calls=[],unexpected=[],events=[],snapshots={};
const api=http.createServer(async(req,res)=>{
 try {
  res.setHeader('Content-Type','application/json');const url=new URL(req.url,'http://127.0.0.1:54329');let data;
  if(req.method==='POST'){
   let body='';for await(const part of req)body+=part;const args=JSON.parse(body||'{}');calls.push({rpc:url.pathname,args});
   if(url.pathname.endsWith('/get_analysis_aggregates_v3'))data=analysisFixture(records,args);
   else if(/\/get_period_report_aggregates_v[123]$/.test(url.pathname))data=periodFixture(records,args);
   else if(url.pathname.endsWith('/get_environment_dashboard_aggregates_v3'))data=environmentFixture(args);
   else if(url.pathname.endsWith('/get_home_dashboard'))data={summary:{total:90,wins:60,winRate:66.7,firstWinRate:66.7,secondWinRate:66.7},recent:[]};
   else throw Error('Unexpected RPC '+url.pathname);
  }else if(!['GET','HEAD'].includes(req.method))throw Error('Unexpected mutation '+url.pathname);
  else if(url.pathname==='/auth/v1/user')data=user;
  else if(url.pathname.endsWith('/admin_users'))data={id:user.id,user_id:user.id};
  else if(url.pathname.endsWith('/environments'))data=environments;
  else if(/\/(decks|deck_archetypes|my_decks)$/.test(url.pathname))data=decks;
  else throw Error('Unexpected read '+url.pathname);
  res.end(JSON.stringify(data));
 }catch(e){unexpected.push(e.message);res.writeHead(500);res.end('{}');}
});
async function run(label){
 const dir=path.resolve(process.env[label==='baseline'?'UI_BASELINE_DIR':'UI_CANDIDATE_DIR']||`build/ui-display/${label}`);
 const log=fs.openSync(path.join(out,`${label}-server.log`),'w');
 const app=spawn(process.execPath,[require.resolve('next/dist/bin/next'),'start',dir,'-p','3266'],{windowsHide:true,stdio:['ignore',log,log],env:{...process.env,NEXT_TELEMETRY_DISABLED:'1',NEXT_PUBLIC_SUPABASE_URL:'http://127.0.0.1:54329',NEXT_PUBLIC_SUPABASE_ANON_KEY:'test-public-key'}});
 let browser;
 try {
  let ready=false;for(let n=0;n<100;n++){try{if((await fetch(origin+'/privacy')).ok){ready=true;break;}}catch{}await new Promise(r=>setTimeout(r,250));}assert.ok(ready,'local server ready');
  browser=await chromium.launch({headless:true,args:['--remote-debugging-port=9351'],...(process.env.CHROME_EXECUTABLE?{executablePath:process.env.CHROME_EXECUTABLE}:{})});
  const context=await browser.newContext({viewport:{width:1440,height:1000},timezoneId:'Asia/Tokyo',permissions:['clipboard-read','clipboard-write']});
  await context.route('**/*',route=>{
   const u=new URL(route.request().url());if(['localhost','127.0.0.1'].includes(u.hostname)||['data:','blob:'].includes(u.protocol))return route.continue();
   unexpected.push('External request blocked: '+u.origin);return route.abort();
  });
  const token=['eyJhbGciOiJIUzI1NiJ9',Buffer.from(JSON.stringify({sub:user.id,exp:Math.floor(Date.now()/1000)+3600})).toString('base64url'),'fixture'].join('.');
  const session={access_token:token,refresh_token:'fixture',expires_at:Math.floor(Date.now()/1000)+3600,expires_in:3600,token_type:'bearer',user};
  await context.addCookies([{name:'sb-127-auth-token',value:'base64-'+Buffer.from(JSON.stringify(session)).toString('base64url'),url:origin}]);
  const page=await context.newPage();page.on('pageerror',e=>events.push({label,type:'pageerror',message:e.message}));page.on('console',m=>{if(['warning','error'].includes(m.type()))events.push({label,type:m.type(),message:m.text()});});
  await page.addInitScript(()=>{
   window.exportSnapshots=[];
   for(const method of ['toDataURL','toBlob']){
    const original=HTMLCanvasElement.prototype[method];HTMLCanvasElement.prototype[method]=function(...args){
     const node=document.querySelector('div[inert] > section')||document.querySelector('body > div[aria-hidden="true"] > div')||document.querySelector('[data-ui-export] > div:last-child');
     if(node)window.exportSnapshots.push({text:node.innerText,headers:[...node.querySelectorAll('th')].map(n=>n.innerText),width:node.getBoundingClientRect().width});
     return original.apply(this,args);
    };
   }
  });
  const section=title=>page.locator('section').filter({has:page.getByRole('heading',{name:title,exact:true})});
  const table=locator=>locator.locator('tbody tr').evaluateAll(rows=>rows.map(row=>[...row.children].map(cell=>cell.innerText)));
  const shot=async(name)=>page.screenshot({path:path.join(out,`${label}-${name}.png`),fullPage:true});
  snapshots[label]={};
  async function download(button,name){
   const before=calls.length;await page.evaluate(()=>window.exportSnapshots=[]);
   await page.locator('[data-ui-export]').evaluateAll(nodes=>nodes.forEach(n=>n.removeAttribute('data-ui-export')));
   await button.evaluate(n=>n.closest('section').setAttribute('data-ui-export',''));
   const wait=page.waitForEvent('download');await button.click();const d=await wait;const file=path.join(out,`${label}-${name}.png`);await d.saveAs(file);
   assert.equal(fs.readFileSync(file).subarray(1,4).toString(),'PNG');assert.equal(calls.length,before,'export does not refetch aggregates');
   const exported=await page.evaluate(()=>window.exportSnapshots);assert.ok(exported.length,'observed actual canvas serialization');
   return exported.at(-1);
  }
  for(const width of [1440,390,320]){
   await page.setViewportSize({width,height:1000});
   await page.goto(origin+'/analysis?scope=all',{waitUntil:'networkidle'});
   if(label==='candidate'&&width===1440&&process.env.AGENT_BROWSER_EXE){
    const result=await promisify(execFile)(process.env.AGENT_BROWSER_EXE,['--session','ui-display','--cdp','9351','snapshot','-i'],{windowsHide:true,timeout:30000,env:{...process.env,AGENT_BROWSER_SOCKET_DIR:path.join(out,'agent-sockets')}});
    fs.writeFileSync(path.join(out,'candidate-agent-browser.txt'),result.stdout);assert.match(result.stdout,/対面別勝率/);
   }
   const matchup=section('対面別勝率');assert.ok(await matchup.isVisible());
   const rows=await table(matchup);snapshots[label][`analysis-${width}`]=rows.map(row=>row.slice(0,4));
   assert.equal(await matchup.locator('thead th').count(),label==='baseline'?5:4);
   const analysisApi=await (await context.request.get(origin+'/api/analysis?scope=all')).json();snapshots[label].analysisData=analysisApi;
   if(width!==320){const png=await download(page.getByRole('button',{name:'対面別勝率をPNG保存',exact:true}),`analysis-export-${width}`);assert.equal(png.headers.includes('環境指数'),label==='baseline');}
   assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'analysis overflow');await shot(`analysis-${width}`);
   await page.goto(origin+'/environment?period=7d',{waitUntil:'networkidle'});
   const top=section('勝率TOP5'),deck=section('デッキ別データ');assert.equal(await top.locator('li').count(),2);
   assert.ok((await top.innerText()).includes(label==='baseline'?'勝率集計47件・対象戦績45件':'対象戦績数47件'));
   if(label==='candidate'){assert.doesNotMatch(await deck.innerText(),/勝率集計|対象戦績45件/);assert.equal(await deck.locator('thead th').count(),5);}
   snapshots[label][`environment-${width}`]=(await table(deck)).map(row=>[...row.slice(0,4),row.at(-1)]);
   const environmentResponse=await context.request.get(origin+'/api/environment?environment='+id(1)+'&period=7d&rank=all');assert.equal(environmentResponse.status(),200);
   const environmentApi=await environmentResponse.json();snapshots[label].environmentData=environmentApi;
   assert.equal(environmentApi.decks[0].current.winrate.evaluationCount,47);assert.equal(environmentApi.decks[0].current.winrate.targetRegistrations,45);
   assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'environment overflow');await shot(`environment-${width}`);
   await page.goto(origin+'/admin/weekly-report?start=2026-09-29&end=2026-10-02&environment='+id(1),{waitUntil:'networkidle'});
   const json=JSON.parse(await page.locator('textarea[readonly]').first().inputValue());snapshots[label].periodData=json;assert.equal(json.summary.totalMatches,45);
   const blocks=page.locator('section').filter({has:page.getByRole('button',{name:'PNG',exact:true})});assert.equal(await blocks.count(),6);
   if(label==='candidate'){
    assert.equal(await page.locator('p').filter({hasText:/^対象期間：/}).count(),1);
    for(let i=0;i<6;i++)assert.doesNotMatch(await blocks.nth(i).innerText(),/対象期間：|Asia\/Tokyo|全ユーザー|評価対象は使用側|環境勝率 =/);
    assert.equal(await page.locator('details').first().getAttribute('open'),null);
   }
   if(width!==320)for(let i=0;i<6;i++){
    const png=await download(blocks.nth(i).getByRole('button',{name:'PNG',exact:true}),`period-export-${width}-${i}`);
    assert.ok(png.text.includes(environments[0].name));assert.ok(png.text.includes(label==='baseline'?'2026-09-29':'対象期間：2026/9/29〜10/2'));
   }
   assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'period overflow');await shot(`period-${width}`);
  }
  snapshots[label].calls=calls.splice(0);
 } finally {
  if(label==='candidate'&&process.env.AGENT_BROWSER_EXE)await promisify(execFile)(process.env.AGENT_BROWSER_EXE,['--session','ui-display','close'],{windowsHide:true,timeout:10000,env:{...process.env,AGENT_BROWSER_SOCKET_DIR:path.join(out,'agent-sockets')}}).catch(()=>{});
  if(browser)await browser.close();app.kill();await new Promise(r=>app.once('exit',r));fs.closeSync(log);
 }
}
(async()=>{
 fs.mkdirSync(out,{recursive:true});await new Promise(r=>api.listen(54329,'127.0.0.1',r));
 try{
  await run('baseline');await run('candidate');
  assert.deepEqual(snapshots.candidate,snapshots.baseline,'identical raw data, retained displayed values and API arguments');
  assert.deepEqual(events,[]);assert.deepEqual(unexpected,[]);
  fs.writeFileSync(path.join(out,'browser-result.json'),JSON.stringify({passed:true,viewports:[1440,390,320],routes:['analysis','environment','admin/weekly-report'],pngExportsPerBuild:14,aggregateParity:true,events,unexpected,snapshots},null,2));
  console.log('PASS: before/after aggregate and request parity; 3 viewports; 28 PNGs; no warning/error/pageerror.');
 }finally{fs.writeFileSync(path.join(out,'browser-events.json'),JSON.stringify({events,unexpected},null,2));api.closeAllConnections();api.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
