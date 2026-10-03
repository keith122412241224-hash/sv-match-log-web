/* eslint-disable @typescript-eslint/no-require-imports */
const http=require('node:http'),fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),{spawn,execFile}=require('node:child_process');
const {promisify}=require('node:util'),exec=promisify(execFile);
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const networkFetch=global.fetch;require('./register.cjs');global.fetch=networkFetch;
const f=require('./period-report-environment-db.cjs');
const old=require('./fixtures/weekly-report-e430a56');
const {withPeriodReportEnvironment}=require('../src/lib/period-report-environment');
const {withPeriodReportRank}=require('../src/lib/period-report-rank');
const {buildWeeklyReportPrompt}=require('../src/lib/weekly-report');
const origin='http://localhost:3255',out=path.resolve('build/period-environment/browser');
const user={id:f.ADMIN,aud:'authenticated',role:'authenticated',email:'local@example.test',is_anonymous:false,app_metadata:{},user_metadata:{}};
const rows=f.ranks.flatMap(rank=>[f.NEW,f.OLD,null].flatMap(environment_id=>Array.from({length:24},(_,i)=>f.row({...rank,environment_id,user_id:i%2?f.MEMBER:f.OTHER,played_at:i<16?'2026-09-29T01:00:00.000Z':'2026-09-26T01:00:00.000Z',result:i%3?'win':'lose',opponent_archetype_id:i%5?f.decks[1].id:f.decks[0].id}))));
let admin=true,fail=false,rawReads=0,aiCalls=0;const calls=[],errors=[],writes=[];
(async()=>{
 fs.mkdirSync(out,{recursive:true});const db=await f.createDb();await f.seed(db,rows);
 let serial=Promise.resolve();
 const api=http.createServer((req,res)=>{
  serial=serial.then(async()=>{
   res.setHeader('Content-Type','application/json');const url=new URL(req.url,'http://127.0.0.1:54329');
   if(req.method==='POST'&&url.pathname==='/mock-ai'){aiCalls++;res.end(JSON.stringify({output_text:'# Synthetic report'}));return;}
   const rpc=url.pathname.match(/^\/rest\/v1\/rpc\/get_period_report_aggregates_v([123])$/);
   if(req.method==='POST'&&rpc){
    let body='';for await(const part of req)body+=part;const args=JSON.parse(body);calls.push({version:Number(rpc[1]),args});
    if(fail){res.writeHead(404);res.end(JSON.stringify({code:'PGRST202'}));return;}
    await f.identity(db,admin?f.ADMIN:f.MEMBER);
    const values=[args.p_current_start,args.p_current_end,args.p_previous_start,args.p_previous_end];
    if(rpc[1]!=='1')values.push(args.p_rank_filter);if(rpc[1]==='3')values.push(args.p_environment_id);
    try{const result=await db.query(`select public.get_period_report_aggregates_v${rpc[1]}(${values.map((_,i)=>'$'+(i+1)).join(',')}) p`,values);res.end(JSON.stringify(result.rows[0].p));}
    catch(e){res.writeHead(400);res.end(JSON.stringify({code:e.code,message:'Local SQL rejected request'}));}return;
   }
   if(req.method==='POST'&&url.pathname==='/rest/v1/rpc/get_home_dashboard'){res.end(JSON.stringify({summary:{total:0,wins:0,winRate:null,firstWinRate:null,secondWinRate:null},recent:[]}));return;}
   if(!['GET','HEAD'].includes(req.method)){writes.push(url.pathname);res.writeHead(405);res.end('{}');return;}
   let data=[];
   if(url.pathname==='/auth/v1/user')data=user;
   else if(url.pathname.endsWith('/admin_users'))data=admin?{id:f.ADMIN}:null;
   else if(url.pathname.endsWith('/environments'))data=f.environments;
   else if(url.pathname.endsWith('/matches'))rawReads++;
   else data=f.decks;
   res.end(JSON.stringify(data));
  }).catch(e=>{errors.push(e.message);res.writeHead(500);res.end('{}');});
 });
 await new Promise(resolve=>api.listen(54329,'127.0.0.1',resolve));
 const log=fs.openSync(path.join(out,'server.log'),'w');
 const app=spawn(process.execPath,['--require',path.resolve('tests/fixtures/rescue-ai-local.cjs'),require.resolve('next/dist/bin/next'),'start',process.env.PERIOD_REPORT_APP_DIR||process.cwd(),'-p','3255'],{windowsHide:true,stdio:['ignore',log,log],env:{...process.env,NEXT_TELEMETRY_DISABLED:'1',NEXT_PUBLIC_SUPABASE_URL:'http://127.0.0.1:54329',NEXT_PUBLIC_SUPABASE_ANON_KEY:'test-public-key',OPENAI_API_KEY:'synthetic-never-sent'}});
 let browser;
 try{
  for(let i=0;i<80;i++){try{if((await fetch(origin+'/privacy')).ok)break;}catch{}await new Promise(r=>setTimeout(r,250));}
  browser=await chromium.launch({headless:true,args:['--remote-debugging-port=9345'],...(process.env.CHROME_EXECUTABLE?{executablePath:process.env.CHROME_EXECUTABLE}:{})});
  const context=await browser.newContext({viewport:{width:1440,height:1000},permissions:['clipboard-read','clipboard-write']}),page=await context.newPage();
  await context.route('**/*',route=>{const u=new URL(route.request().url());return ['localhost','127.0.0.1'].includes(u.hostname)||['data:','blob:'].includes(u.protocol)?route.continue():route.abort();});
  const token=['eyJhbGciOiJIUzI1NiJ9',Buffer.from(JSON.stringify({sub:user.id,exp:Math.floor(Date.now()/1000)+3600})).toString('base64url'),'fixture'].join('.');
  const session={access_token:token,refresh_token:'fixture',expires_at:Math.floor(Date.now()/1000)+3600,expires_in:3600,token_type:'bearer',user};
  await context.addCookies([{name:'sb-127-auth-token',value:'base64-'+Buffer.from(JSON.stringify(session)).toString('base64url'),url:origin}]);
  page.on('pageerror',e=>errors.push(e.message));
  const route='/admin/weekly-report?start=2026-09-29&end=2026-10-02';
  const readJson=async()=>JSON.parse(await page.locator('textarea[readonly]').first().inputValue());
  const oracle=(environment,rank='all')=>{
   const period=old.buildWeeklyPeriod('2026-09-29','2026-10-02'),previous=old.getPreviousWeeklyReportPeriod(period);
   const matching=(start,end)=>rows.filter(r=>r.played_at>=start&&r.played_at<=end&&(!environment||r.environment_id===environment)&&f.accepts(r,rank)).sort((a,b)=>b.played_at.localeCompare(a.played_at)||b.id.localeCompare(a.id));
   return withPeriodReportEnvironment(withPeriodReportRank(old.buildWeeklyReport(matching(period.startIso,period.endIso),matching(previous.startIso,previous.endIso),f.decks,period),rank),f.environments.find(e=>e.id===environment)||null).aiJson;
  };
  const cases=[];
  for(const environment of [undefined,'all',f.NEW,f.OLD,f.EMPTY])for(const rank of ['all','master:sapphire','grandmaster:none']){
   const before=calls.length;await page.goto(origin+route+(environment?'&environment='+environment:'')+'&rank='+rank,{waitUntil:'networkidle'});
   const env=!environment||environment==='all'?null:environment;
   assert.deepEqual(await readJson(),oracle(env,rank),'independent full report data');
   assert.equal(calls.length,before+1);assert.equal(calls.at(-1).version,env?3:rank==='all'?1:2);
   assert.equal(await page.locator('select[name=environment] option').count(),4,'all historical environments available');
   const blocks=page.locator('section').filter({has:page.getByRole('button',{name:'PNG',exact:true})});assert.equal(await blocks.count(),6);
   const context=page.locator('p').filter({hasText:/^対象期間：/});assert.equal(await context.count(),1);
   assert.ok((await context.innerText()).includes(env?f.environments.find(e=>e.id===env).name:'環境：すべて'));
   assert.ok((await context.innerText()).includes('2026/9/29〜10/2'));
   for(let i=0;i<6;i++){
    const text=await blocks.nth(i).locator(':scope > div').last().innerText();assert.doesNotMatch(text,/対象期間：|JST・各日終日/);
   }
   cases.push({environment:env?env===f.NEW?'new':env===f.OLD?'old':'empty':'all',rank,total:(await readJson()).summary.totalMatches});
  }
  await page.goto(origin+route+'&environment='+f.NEW,{waitUntil:'networkidle'});
  // agent-browser independently inspects the live browser through CDP.
  if(process.env.AGENT_BROWSER_EXE){
   const options={windowsHide:true,timeout:30000,env:{...process.env,AGENT_BROWSER_SOCKET_DIR:path.join(out,'agent-sockets')}};
   const result=await exec(process.env.AGENT_BROWSER_EXE,['--session','period-environment','--cdp','9345','snapshot','-i'],options);
   fs.writeFileSync(path.join(out,'agent-browser.txt'),result.stdout);assert.match(result.stdout,/環境/);
  }
  for(const width of [1440,390,320]){
   await page.setViewportSize({width,height:1000});await page.screenshot({path:path.join(out,'viewport-'+width+'.png')});
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,'no document overflow at '+width);
   assert.equal(await page.locator('select[name=environment]').isVisible(),true);
  }
  await page.setViewportSize({width:1440,height:1000});
  const beforeExports=calls.length;
  const blocks=page.locator('section').filter({has:page.getByRole('button',{name:'PNG',exact:true})});
  for(let i=0;i<6;i++){
   const wait=page.waitForEvent('download');await blocks.nth(i).getByRole('button',{name:'PNG',exact:true}).click();const download=await wait;
   const file=path.join(out,'export-'+i+'.png');await download.saveAs(file);assert.equal(fs.readFileSync(file).subarray(1,4).toString(),'PNG');
  }
  assert.equal(calls.length,beforeExports);
  await page.getByRole('button',{name:'AI用プロンプトをコピー',exact:true}).click();assert.equal((await page.evaluate(()=>navigator.clipboard.readText())).replaceAll('\r\n','\n'),buildWeeklyReportPrompt(await readJson()));
  const tier=page.locator('section').filter({has:page.getByRole('heading',{name:'Tier手動調整',exact:true})});
  await tier.locator('select').first().selectOption('Tier4');
  await page.getByRole('button',{name:'AI本文生成',exact:true}).click();await page.getByRole('button',{name:'本文コピー',exact:true}).waitFor();
  const markdown=await page.locator('textarea[readonly]').last().inputValue();assert.ok(markdown.includes(f.environments[0].name));
  const downloading=page.waitForEvent('download');await page.getByRole('button',{name:'Markdown保存',exact:true}).click();const md=await downloading;await md.saveAs(path.join(out,'report.md'));assert.equal(fs.readFileSync(path.join(out,'report.md'),'utf8'),markdown);
  await page.locator('select[name=environment]').selectOption(f.OLD);await page.getByRole('button',{name:'表示',exact:true}).click();await page.waitForLoadState('networkidle');
  assert.equal(new URL(page.url()).searchParams.get('environment'),f.OLD);assert.deepEqual(await readJson(),oracle(f.OLD));assert.equal(await page.getByRole('button',{name:'本文コピー',exact:true}).count(),0,'environment change clears old generated output and Tier override');
  await f.seed(db,rows.filter(r=>r.played_at>='2026-09-29T00:00:00Z'));
  await page.goto(origin+route+'&environment='+f.NEW,{waitUntil:'networkidle'});const noPrevious=await readJson();assert.equal(noPrevious.summary.matchDelta,null);assert.match(await page.locator('main').innerText(),/比較対象なし/);assert.ok(Object.values(noPrevious.changes).every(r=>r.length===0));
  for(const invalid of ['', 'bad',f.uuid(999),'all&environment='+f.NEW]){
   const before=calls.length;await page.goto(origin+route+'&environment='+invalid,{waitUntil:'networkidle'});assert.equal(await page.locator('textarea[readonly]').count(),0);assert.equal(calls.length,before,'invalid environment never broadens scope');
  }
  fail=true;const before=calls.length;await page.goto(origin+route+'&environment='+f.NEW,{waitUntil:'networkidle'});assert.equal(calls.length,before+1);assert.equal(await page.locator('textarea[readonly]').count(),0);fail=false;
  admin=false;const beforeDenied=calls.length;await page.goto(origin+route+'&environment='+f.NEW,{waitUntil:'networkidle'});assert.equal(new URL(page.url()).pathname,'/');assert.equal(calls.length,beforeDenied);
  assert.equal(rawReads,0);assert.deepEqual(writes,[]);assert.deepEqual(errors,[]);
  fs.writeFileSync(path.join(out,'result.json'),JSON.stringify({passed:true,cases,pngExports:6,viewports:[1440,390,320],aiCalls,rawReads,writes,errors,realSql:true,auth:'synthetic local Auth HTTP responses and SQL JWT claims; not real Supabase Auth'},null,2));
  console.log('Environment browser passed: 15 full report cases, 6 PNG files, Markdown, memo/Tier reset, 3 viewports, actual isolated SQL, fail-closed URLs/RPC and admin guard.');
 }finally{
  if(process.env.AGENT_BROWSER_EXE)await exec(process.env.AGENT_BROWSER_EXE,['--session','period-environment','close'],{windowsHide:true,timeout:10000,env:{...process.env,AGENT_BROWSER_SOCKET_DIR:path.join(out,'agent-sockets')}}).catch(()=>{});
  if(browser)await browser.close();app.kill();api.closeAllConnections();api.close();await db.close();fs.closeSync(log);
 }
})().catch(e=>{console.error(e);process.exitCode=1;});
