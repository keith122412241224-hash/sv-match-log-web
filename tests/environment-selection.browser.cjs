/* eslint-disable @typescript-eslint/no-require-imports */
// Local built application + HTTP fixtures only. No Production connection.
const http=require('node:http'),fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),{spawn}=require('node:child_process');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const {analysisFixture}=require('./analysis-browser-fixture.cjs');
const origin='http://localhost:3261',out=path.resolve('build/environment-selection-browser');
const user={id:'fixture-owner',aud:'authenticated',role:'authenticated',email:'fixture@example.test',app_metadata:{},user_metadata:{}};
const decks=[{id:'A',name:'デッキA',class_name:'エルフ'},{id:'B',name:'デッキB',class_name:'ロイヤル'}];
const old={id:'old',name:'アズヴォルト・レヴナント（2026/8/27～）',created_at:'2026-08-26',allow_match_input:true};
const next={...old,id:'new',name:'アズヴォルト・レヴナント（9/29能力調整後～）',created_at:'2026-09-28'};
let environments=[],admin=true;const calls=[],writes=[],errors=[],checks=[];
const api=http.createServer(async(req,res)=>{
 res.setHeader('Content-Type','application/json');const url=new URL(req.url,'http://127.0.0.1:54329');
 if(req.method==='POST'&&url.pathname.startsWith('/rest/v1/rpc/')){
  let body='';for await(const part of req)body+=part;const args=JSON.parse(body),name=url.pathname.split('/').at(-1);calls.push({name,args});
  if(name==='get_home_dashboard')res.end(JSON.stringify({summary:{total:0,wins:0,winRate:null,firstWinRate:null,secondWinRate:null},recent:[]}));
  else if(name.startsWith('get_analysis_aggregates_'))res.end(JSON.stringify(analysisFixture([],args)));
  else if(name.startsWith('get_matchup_aggregates_'))res.end(JSON.stringify({version:1,totalMatches:0,groups:[]}));
  else {writes.push(name);res.writeHead(405);res.end('{}');}return;
 }
 if(!['GET','HEAD'].includes(req.method)){writes.push(url.pathname);res.writeHead(405);res.end('{}');return;}
 const data=url.pathname==='/auth/v1/user'?user:url.pathname.endsWith('/admin_users')?(admin?{id:'admin'}:null):url.pathname.endsWith('/environments')?environments:decks;res.end(JSON.stringify(data));
});
(async()=>{
 fs.mkdirSync(out,{recursive:true});await new Promise(resolve=>api.listen(54329,'127.0.0.1',resolve));const log=fs.openSync(path.join(out,'server.log'),'w');
 const app=spawn(process.execPath,[require.resolve('next/dist/bin/next'),'start','-p','3261'],{windowsHide:true,stdio:['ignore',log,log],env:{...process.env,NEXT_PUBLIC_SUPABASE_URL:'http://127.0.0.1:54329',NEXT_PUBLIC_SUPABASE_ANON_KEY:'test-public-key',OPENAI_API_KEY:''}});let browser;
 try{
  for(let i=0;i<60;i++){try{if((await fetch(origin+'/privacy')).ok)break;}catch{}await new Promise(r=>setTimeout(r,500));}
  browser=await chromium.launch({headless:true,...(process.env.CHROME_EXECUTABLE?{executablePath:process.env.CHROME_EXECUTABLE}:{})});const context=await browser.newContext();
  const token=['eyJhbGciOiJIUzI1NiJ9',Buffer.from(JSON.stringify({sub:user.id,exp:Math.floor(Date.now()/1000)+3600})).toString('base64url'),'fixture'].join('.');
  await context.addCookies([{name:'sb-127-auth-token',value:'base64-'+Buffer.from(JSON.stringify({access_token:token,refresh_token:'fixture',expires_at:Math.floor(Date.now()/1000)+3600,expires_in:3600,token_type:'bearer',user})).toString('base64url'),url:origin}]);
  const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
  for(const state of ['before','after','none','multiple']){
   const date=new Date(Date.now()+(state==='before'?86400000:-86400000)).toISOString();
   environments=[{...next,match_input_start_at:date,match_input_end_at:null},{...old,match_input_start_at:null,match_input_end_at:date}];
   if(state==='none')environments=environments.map(e=>({...e,allow_match_input:false}));
   if(state==='multiple')environments=environments.map(e=>({...e,match_input_start_at:null,match_input_end_at:null}));
   for(const route of ['/','/analysis','/matrix'])for(const explicit of [false,true]){
    const expected=explicit?'old':state==='before'?'old':'new';
    const queries=route==='/'?[{}]:route==='/analysis'?[{scope:'mine',rank:'all',winRateMode:'direct'},{scope:'all',rank:'master',winRateMode:'combined'}]:[{scope:'mine',rank:'all'},{scope:'all',rank:'master'}];
    for(const filters of queries){const q=new URLSearchParams({...filters,...(explicit?{environment:'old'}:{})});calls.length=0;
     const response=await page.goto(origin+route+'?'+q,{waitUntil:'networkidle'});assert.equal(response.status(),200);assert.equal(await page.locator('select[name="environment"]').inputValue(),expected);
     const prefix=route==='/'?'get_home_dashboard':route==='/analysis'?'get_analysis_aggregates_':'get_matchup_aggregates_';const call=calls.find(c=>c.name.startsWith(prefix));assert.ok(call);assert.equal(call.args.p_environment_id,expected);
     if(route!=='/'){assert.equal(call.args.p_include_all_users,filters.scope==='all');if(filters.rank==='master')assert.equal(call.args.p_rank_filter,'master');if(route==='/analysis')assert.equal(call.args.p_include_reversed,filters.winRateMode==='combined');}
     checks.push({state,route,explicit,filters,selected:expected});
    }
   }
  }
  admin=false;calls.length=0;await page.goto(origin+'/analysis?scope=all&environment=old',{waitUntil:'networkidle'});assert.equal(calls.find(c=>c.name.startsWith('get_analysis_aggregates_')).args.p_include_all_users,false);assert.equal(await page.locator('select[name="environment"]').inputValue(),'old');
  await page.screenshot({path:path.join(out,'analysis.png'),fullPage:true});assert.deepEqual(errors,[]);assert.deepEqual(writes,[]);
  fs.writeFileSync(path.join(out,'result.json'),JSON.stringify({passed:true,checks,nonAdmin:true,errors,writes},null,2));console.log(`Initial environment browser passed: ${checks.length} cases, explicit history, scope, rank, modes and empty input candidates.`);
 }finally{if(browser)await browser.close();app.kill();api.close();fs.closeSync(log);}
})().catch(e=>{console.error(e);process.exitCode=1;});
