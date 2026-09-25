/* eslint-disable @typescript-eslint/no-require-imports */
const http=require('node:http'),fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),{spawn}=require('node:child_process');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const fetchNetwork=global.fetch;require('./register.cjs');global.fetch=fetchNetwork;
const old=require('./fixtures/weekly-report-e430a56');
const {periodFixture}=require('./period-report-fixture.cjs');
const origin='http://localhost:3223',output=path.resolve('build/period-browser-proof');
const user={id:'fixture-admin',aud:'authenticated',role:'authenticated',email:'fixture@example.test',app_metadata:{},user_metadata:{}};
const decks=[{id:'A',name:'デッキA',class_name:'エルフ',is_active:true},{id:'B',name:'デッキB',class_name:'ロイヤル',is_active:true}];
const baseRows=Array.from({length:60},(_,i)=>({id:String(i).padStart(4,'0'),my_deck_id:i%2?'A':'B',opponent_deck_id:i%5?i%2?'B':'A':i%2?'A':'B',my_archetype_id:null,opponent_archetype_id:null,result:i%3?'win':'lose',played_at:i<40?'2026-09-05T01:00:00.000Z':'2026-09-04T01:00:00.000Z'}));
let rows=baseRows,admin=true,fail=null,rawReads=0;const calls=[],writes=[],errors=[];
const api=http.createServer(async(req,res)=>{
  res.setHeader('Content-Type','application/json');const url=new URL(req.url,'http://127.0.0.1:54329');
  if(req.method==='POST'&&url.pathname==='/rest/v1/rpc/get_period_report_aggregates_v1'){
    let body='';for await(const part of req)body+=part;calls.push(JSON.parse(body));
    if(fail==='invalid'){res.end('{"version":1}');return;}
    if(fail){res.writeHead(fail==='missing'?404:fail==='permission'?403:500);res.end(JSON.stringify({code:fail==='missing'?'PGRST202':fail==='permission'?'42501':'XX000',message:'synthetic failure'}));return;}
    res.end(JSON.stringify(periodFixture(rows,calls.at(-1))));return;
  }
  if(req.method==='POST'&&url.pathname==='/rest/v1/rpc/get_home_dashboard'){res.end(JSON.stringify({summary:{total:0,wins:0,winRate:null,firstWinRate:null,secondWinRate:null},recent:[]}));return;}
  if(!['GET','HEAD'].includes(req.method)){writes.push(url.pathname);res.writeHead(405);res.end('{}');return;}
  let data;
  if(url.pathname==='/auth/v1/user')data=user;
  else if(url.pathname.endsWith('/admin_users'))data=admin?{id:user.id}:null;
  else if(url.pathname.endsWith('/matches')){rawReads++;data=[];}
  else if(url.pathname.endsWith('/environments'))data=[];
  else data=decks;
  res.end(JSON.stringify(data));
});
(async()=>{
  fs.mkdirSync(output,{recursive:true});await new Promise(resolve=>api.listen(54329,'127.0.0.1',resolve));
  const log=fs.openSync(path.join(output,'server.log'),'w');
  const app=spawn(process.execPath,[require.resolve('next/dist/bin/next'),'start','-p','3223'],{windowsHide:true,stdio:['ignore',log,log],env:{...process.env,NEXT_PUBLIC_SUPABASE_URL:'http://127.0.0.1:54329',NEXT_PUBLIC_SUPABASE_ANON_KEY:'test-public-key',OPENAI_API_KEY:''}});
  let browser;
  try{
    for(let i=0;i<60;i++){try{if((await fetch(origin+'/privacy')).ok)break;}catch{}await new Promise(r=>setTimeout(r,500));}
    browser=await chromium.launch({headless:true,...(process.env.CHROME_EXECUTABLE?{executablePath:process.env.CHROME_EXECUTABLE}:{})});
    const context=await browser.newContext({viewport:{width:1440,height:1000}}),page=await context.newPage();
    const token=['eyJhbGciOiJIUzI1NiJ9',Buffer.from(JSON.stringify({sub:user.id,exp:Math.floor(Date.now()/1000)+3600})).toString('base64url'),'fixture'].join('.');
    const session={access_token:token,refresh_token:'fixture',expires_at:Math.floor(Date.now()/1000)+3600,expires_in:3600,token_type:'bearer',user};
    await context.addCookies([{name:'sb-127-auth-token',value:'base64-'+Buffer.from(JSON.stringify(session)).toString('base64url'),url:origin}]);
    page.on('pageerror',error=>errors.push(error.message));
    const route='/admin/weekly-report?start=2026-09-05&end=2026-09-05';
    await page.goto(origin+route,{waitUntil:'networkidle'});assert.equal(calls.length,1);assert.equal(rawReads,0);
    const sorted=items=>items.sort((a,b)=>b.played_at.localeCompare(a.played_at)||b.id.localeCompare(a.id));
    const expected=old.buildWeeklyReport(sorted(baseRows.filter(r=>r.played_at.startsWith('2026-09-05'))),sorted(baseRows.filter(r=>r.played_at.startsWith('2026-09-04'))),decks,old.buildWeeklyPeriod('2026-09-05','2026-09-05'));
    assert.deepEqual(JSON.parse(await page.locator('textarea[readonly]').first().inputValue()),expected.aiJson);
    await page.screenshot({path:path.join(output,'report.png'),fullPage:false});
    const changes=page.locator('section').filter({has:page.getByRole('heading',{name:'前期間からの環境変化',level:2,exact:true})});
    const downloading=page.waitForEvent('download');await changes.getByRole('button',{name:'PNG',exact:true}).click();const download=await downloading;
    const png=path.join(output,'changes.png');await download.saveAs(png);assert.equal(fs.readFileSync(png).subarray(1,4).toString(),'PNG');assert.equal(calls.length,1,'PNG causes no RPC refetch');
    rows=[];await page.goto(origin+route,{waitUntil:'networkidle'});assert.match(await page.locator('main').innerText(),/対象期間の戦績がありません/);assert.equal(JSON.parse(await page.locator('textarea[readonly]').first().inputValue()).summary.totalMatches,0);
    for(const kind of ['missing','database','permission','invalid']){fail=kind;await page.goto(origin+route,{waitUntil:'networkidle'});assert.match(await page.locator('main').innerText(),/期間レポートデータを取得できませんでした/);assert.equal(await page.locator('textarea[readonly]').count(),0);assert.doesNotMatch(await page.locator('main').innerText(),/対象期間の戦績がありません/);}
    fail=null;admin=false;const count=calls.length;await page.goto(origin+route,{waitUntil:'networkidle'});assert.equal(new URL(page.url()).pathname,'/');assert.equal(calls.length,count,'nonadmin cannot request the report RPC');
    assert.equal(rawReads,0);assert.deepEqual(writes,[]);assert.deepEqual(errors,[]);
    fs.writeFileSync(path.join(output,'result.json'),JSON.stringify({passed:true,initialRpcCalls:1,rawReads,exportRefetches:0,aiJsonEqualToProduction:true,trueZero:true,errorsDistinguished:['missing','database','permission','invalid'],nonAdminDenied:true,writes,errors},null,2));
    console.log('Period browser passed: exact Production AI JSON, 1 RPC, 0 raw matches, PNG without refetch, true zero, four failures and non-admin redirect.');
  }finally{if(browser)await browser.close();app.kill();api.close();fs.closeSync(log);}
})().catch(error=>{console.error(error);process.exitCode=1;});
