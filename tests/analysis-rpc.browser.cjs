/* eslint-disable @typescript-eslint/no-require-imports */
// Local built Next.js app + HTTP boundary stub. No production connections.
const http=require('node:http'),fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {spawn}=require('node:child_process');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const {analysisFixture}=require('./analysis-browser-fixture.cjs');
const origin='http://localhost:3222',output=path.resolve('build/analysis-browser-proof');
const user={id:'fixture-owner',aud:'authenticated',role:'authenticated',email:'fixture@example.test',app_metadata:{},user_metadata:{}};
const decks=[{id:'A',name:'デッキA',class_name:'エルフ'},{id:'B',name:'デッキB',class_name:'ロイヤル'}];
const records=[{id:'match',user_id:user.id,environment_id:'environment',my_deck_id:'A',opponent_deck_id:'B',my_archetype_id:'A',opponent_archetype_id:'B',result:'win',turn_order:'first',played_at:'2026-09-20T00:00:00.000Z'}];
let admin=true,fail=null,rawReads=0;const calls=[],writes=[],errors=[];
const api=http.createServer(async(req,res)=>{
  res.setHeader('Content-Type','application/json');const url=new URL(req.url,'http://127.0.0.1:54329');
  if(req.method==='POST'&&url.pathname==='/rest/v1/rpc/get_analysis_aggregates_v1'){
    let body='';for await(const part of req)body+=part;const args=JSON.parse(body);calls.push(args);
    if(fail==='missing'){res.writeHead(404);res.end(JSON.stringify({code:'PGRST202',message:'fixture missing function'}));return;}
    if(fail==='invalid'){res.end(JSON.stringify({version:1,perspectives:-1}));return;}
    res.end(JSON.stringify(analysisFixture(records,args)));return;
  }
  if(req.method==='POST'&&url.pathname==='/rest/v1/rpc/get_home_dashboard'){
    res.end(JSON.stringify({summary:{total:0,wins:0,winRate:null,firstWinRate:null,secondWinRate:null},recent:[]}));return;
  }
  if(!['GET','HEAD'].includes(req.method)){writes.push(url.pathname);res.writeHead(405);res.end('{}');return;}
  let data;
  if(url.pathname==='/auth/v1/user')data=user;
  else if(url.pathname.endsWith('/admin_users'))data=admin?{id:'fixture-admin'}:null;
  else if(url.pathname.endsWith('/environments'))data=[{id:'environment',name:'検証環境',created_at:'2026-09-20',allow_match_input:true},{id:'empty',name:'空',created_at:'2026-09-01',allow_match_input:true}];
  else if(url.pathname.endsWith('/matches')){rawReads++;data=[];}
  else data=decks;
  res.end(JSON.stringify(data));
});
(async()=>{
  fs.mkdirSync(output,{recursive:true});await new Promise(resolve=>api.listen(54329,'127.0.0.1',resolve));
  const log=fs.openSync(path.join(output,'server.log'),'w');
  const app=spawn(process.execPath,[require.resolve('next/dist/bin/next'),'start','-p','3222'],{windowsHide:true,stdio:['ignore',log,log],env:{...process.env,NEXT_PUBLIC_SUPABASE_URL:'http://127.0.0.1:54329',NEXT_PUBLIC_SUPABASE_ANON_KEY:'test-public-key',OPENAI_API_KEY:''}});
  let browser;
  try{
    for(let i=0;i<60;i++){try{if((await fetch(origin+'/privacy')).ok)break;}catch{}await new Promise(resolve=>setTimeout(resolve,500));}
    browser=await chromium.launch({headless:true,...(process.env.CHROME_EXECUTABLE?{executablePath:process.env.CHROME_EXECUTABLE}:{})});
    const context=await browser.newContext({viewport:{width:1440,height:1000}});
    const token=['eyJhbGciOiJIUzI1NiJ9',Buffer.from(JSON.stringify({sub:user.id,exp:Math.floor(Date.now()/1000)+3600})).toString('base64url'),'fixture'].join('.');
    const session={access_token:token,refresh_token:'fixture',expires_at:Math.floor(Date.now()/1000)+3600,expires_in:3600,token_type:'bearer',user};
    await context.addCookies([{name:'sb-127-auth-token',value:'base64-'+Buffer.from(JSON.stringify(session)).toString('base64url'),url:origin}]);
    const page=await context.newPage();page.on('pageerror',error=>{if(!fail)errors.push(error.message);});
    await page.goto(origin+'/analysis?scope=all');await page.waitForLoadState('networkidle');
    assert.equal(calls.length,1);assert.equal(calls[0].p_include_reversed,true);assert.equal(calls[0].p_include_all_users,true);
    assert.match(await page.locator('main').innerText(),/対象登録戦績: 1件/);assert.equal(await page.locator('article').count(),2);
    await page.screenshot({path:path.join(output,'combined.png'),fullPage:true});
    const downloaded=page.waitForEvent('download');await page.getByRole('button',{name:'デッキ別サマリー（反転込み）をPNG保存',exact:true}).click();
    const png=await downloaded;const saved=path.join(output,png.suggestedFilename());await png.saveAs(saved);assert.equal(fs.readFileSync(saved).subarray(1,4).toString(),'PNG');
    assert.equal(calls.length,1,'PNG must not refetch');
    await page.goto(origin+'/analysis?scope=all&myDeck=B&opponentDeck=A&result=lose&turnOrder=second');await page.waitForLoadState('networkidle');
    assert.equal(calls.length,2);assert.match(await page.locator('main').innerText(),/対象登録戦績: 1件/);assert.equal(await page.locator('article').count(),1);assert.match(await page.locator('article').innerText(),/デッキB/);
    admin=false;await page.goto(origin+'/analysis?scope=all');await page.waitForLoadState('networkidle');assert.equal(calls.at(-1).p_include_all_users,false);assert.equal(calls.at(-1).p_include_reversed,false);
    await page.goto(origin+'/analysis?environment=empty');await page.waitForLoadState('networkidle');assert.match(await page.locator('main').innerText(),/対象登録戦績: 0件/);assert.equal(await page.locator('article').count(),0);
    assert.deepEqual(errors,[]);
    for(const kind of ['missing','invalid']){fail=kind;await page.goto(origin+'/analysis');await page.waitForFunction(()=>document.body.innerText.includes('Application error'));assert.equal(await page.locator('article').count(),0);assert.doesNotMatch(await page.locator('body').innerText(),/対象登録戦績: 0件/);}
    assert.equal(rawReads,0);assert.deepEqual(writes,[]);
    fs.writeFileSync(path.join(output,'result.json'),JSON.stringify({passed:true,initialRpcCalls:1,rawReads,writes,errors,checks:['combined and reverse-only','non-admin scope/default','true zero','PNG no refetch','missing and malformed RPC are errors']},null,2));
    console.log('Analysis browser passed: one RPC, zero raw reads, reverse filters, scope, PNG, zero and errors.');
  }finally{if(browser)await browser.close();app.kill();api.close();fs.closeSync(log);}
})().catch(error=>{console.error(error);process.exitCode=1;});
