/* eslint-disable @typescript-eslint/no-require-imports */
// Local built Next.js app + HTTP boundary stub. No production connections.
const http=require('node:http'),fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {spawn}=require('node:child_process');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const {analysisFixture}=require('./analysis-browser-fixture.cjs');
const origin='http://localhost:3240',output=path.resolve('build/analysis-rank-browser-proof');
const user={id:'fixture-owner',aud:'authenticated',role:'authenticated',email:'fixture@example.test',app_metadata:{},user_metadata:{}};
const decks=[{id:'A',name:'デッキA',class_name:'エルフ'},{id:'B',name:'デッキB',class_name:'ロイヤル'}];
const records=[{id:'match',user_id:user.id,environment_id:'environment',my_deck_id:'A',opponent_deck_id:'B',my_archetype_id:'A',opponent_archetype_id:'B',result:'win',turn_order:'first',played_at:'2026-09-20T00:00:00.000Z'}];
let admin=true,fail=null,rawReads=0;const calls=[],writes=[],errors=[],rpcNames=[];
const api=http.createServer(async(req,res)=>{
  res.setHeader('Content-Type','application/json');const url=new URL(req.url,'http://127.0.0.1:54329');
  if(req.method==='POST'&&['/rest/v1/rpc/get_analysis_aggregates_v1','/rest/v1/rpc/get_analysis_aggregates_v2'].includes(url.pathname)){
    let body='';for await(const part of req)body+=part;const args=JSON.parse(body);calls.push(args);rpcNames.push(url.pathname.split('/').at(-1));
    if(fail==='missing'){res.writeHead(404);res.end(JSON.stringify({code:'PGRST202',message:'fixture missing function'}));return;}
    if(fail==='invalid'){res.end(JSON.stringify({version:1,perspectives:-1}));return;}
    res.end(JSON.stringify(analysisFixture(records.filter(r=>{
      const rank=args.p_rank_filter;if(!rank||rank==='all')return true;
      if(rank==='master-plus')return ['master','grandmaster'].includes(r.rank_tier);
      const [tier,child]=rank.split(':');return r.rank_tier===tier&&(!child||(tier==='master'?r.master_group:r.grandmaster_rating)===child);
    }),args)));return;
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
  const app=spawn(process.execPath,[require.resolve('next/dist/bin/next'),'start','-p','3240'],{windowsHide:true,stdio:['ignore',log,log],env:{...process.env,NEXT_PUBLIC_SUPABASE_URL:'http://127.0.0.1:54329',NEXT_PUBLIC_SUPABASE_ANON_KEY:'test-public-key',OPENAI_API_KEY:''}});
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
    for(const width of [320,375,640,768,1024,1280,1440]){
      await page.setViewportSize({width,height:1000});
      const controls=await page.locator('form[action="/analysis"] select, form[action="/analysis"] input:not([type="hidden"])').evaluateAll(es=>es.map(e=>{
        const r=e.getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,right:r.right,height:r.height};
      }));
      assert.ok(controls.every(r=>r.x>=0&&r.right<=width),'no overflow at '+width);
      if(width>=1280){
        assert.ok(controls.slice(0,6).every(r=>Math.abs(r.width-controls[0].width)<1),'upper six equal widths');
        assert.ok([0,1,2].every(i=>controls[i].y===controls[0].y));
        assert.ok([3,4,5].every(i=>controls[i].y===controls[3].y));
        assert.ok([6,7,8,9,10,11].every(i=>controls[i].y===controls[6].y),'period and third row aligned');
        assert.equal(controls[6].width,controls[7].width);
        assert.ok(Math.abs((controls[11].right-controls[8].x)-controls[6].width*2)<1,'third row 1:1:2');
      }
      if(width<=375)assert.ok(controls[10].y>controls[8].y,'period wraps');
      if([320,375,1440].includes(width))await page.screenshot({path:path.join(output,`layout-${width}.png`),fullPage:true});
    }
    const help=page.locator('#analysis-rank-help'),info=page.locator('button[aria-describedby="analysis-rank-help"]');
    assert.equal(await help.isVisible(),false);
    await info.hover();await help.waitFor({state:'visible'});
    await page.mouse.move(0,0);await help.waitFor({state:'hidden'});
    await info.click();await help.waitFor({state:'visible'});
    await page.mouse.move(0,0);await page.locator('select[name="rank"]').focus();await help.waitFor({state:'hidden'});
    const downloaded=page.waitForEvent('download');await page.getByRole('button',{name:'デッキ別サマリー（反転込み）をPNG保存',exact:true}).click();
    const png=await downloaded;const saved=path.join(output,png.suggestedFilename());await png.saveAs(saved);assert.equal(fs.readFileSync(saved).subarray(1,4).toString(),'PNG');
    assert.equal(calls.length,1,'PNG must not refetch');
    await page.goto(origin+'/analysis?scope=all&myDeck=B&opponentDeck=A&result=lose&turnOrder=second');await page.waitForLoadState('networkidle');
    assert.equal(calls.length,2);assert.match(await page.locator('main').innerText(),/対象登録戦績: 1件/);assert.equal(await page.locator('article').count(),1);assert.match(await page.locator('article').innerText(),/デッキB/);
    admin=false;await page.goto(origin+'/analysis?scope=all');await page.waitForLoadState('networkidle');assert.equal(calls.at(-1).p_include_all_users,false);assert.equal(calls.at(-1).p_include_reversed,false);
    await page.goto(origin+'/analysis?environment=empty');await page.waitForLoadState('networkidle');assert.match(await page.locator('main').innerText(),/対象登録戦績: 0件/);assert.equal(await page.locator('article').count(),0);
    admin=true;
    const ranks=[{},...['beginner','d','c','b','a','aa'].map(rank_tier=>({rank_tier})),...['emerald','topaz','ruby','sapphire','diamond'].map(master_group=>({rank_tier:'master',master_group})),...['none','epic','ultimate','legend','beyond'].map(grandmaster_rating=>({rank_tier:'grandmaster',grandmaster_rating}))];
    const template=records[0];records.splice(0,records.length,...ranks.map((rank,i)=>({...template,...rank,id:'match-'+String(i).padStart(2,'0')})));
    const choices=[['all',17],...['beginner','d','c','b','a','aa'].map(r=>[r,1]),['master-plus',10],['master',5],['grandmaster',5],...ranks.filter(r=>r.master_group).map(r=>['master:'+r.master_group,1]),...ranks.filter(r=>r.grandmaster_rating).map(r=>['grandmaster:'+r.grandmaster_rating,1])];
    for(const scope of ['mine','all'])for(const mode of ['direct','combined']){
      await page.goto(origin+'/analysis?scope='+scope+'&winRateMode='+mode);await page.waitForLoadState('networkidle');
      assert.equal(await page.locator('select[name="rank"] option').count(),20);
      for(const [rank,n]of choices){
        const before=calls.length;await page.locator('select[name="rank"]').selectOption(rank);
        await page.getByRole('button',{name:'表示',exact:true}).click();await page.waitForLoadState('networkidle');
        assert.equal(calls.length,before+1);assert.equal(rpcNames.at(-1),rank==='all'?'get_analysis_aggregates_v1':'get_analysis_aggregates_v2');
        assert.equal(calls.at(-1).p_include_reversed,mode==='combined');assert.equal(calls.at(-1).p_include_all_users,scope==='all');
        assert.match(await page.locator('main').innerText(),new RegExp('対象登録戦績: '+n+'件'));
        assert.equal(await page.locator('select[name="rank"]').inputValue(),rank);
      }
    }
    await page.goto(origin+'/analysis?scope=all&rank=grandmaster%3Anone&myDeck=B&opponentDeck=A&result=lose&turnOrder=second');await page.waitForLoadState('networkidle');
    assert.match(await page.locator('main').innerText(),/対象登録戦績: 1件/);assert.equal(await page.locator('article').count(),1);
    const beforePng=calls.length;const rankDownload=page.waitForEvent('download');await page.getByRole('button',{name:'デッキ別サマリー（反転込み）をPNG保存',exact:true}).click();
    const rankPng=await rankDownload;const rankPath=path.join(output,'filtered.png');await rankPng.saveAs(rankPath);assert.equal(fs.readFileSync(rankPath).subarray(1,4).toString(),'PNG');assert.equal(calls.length,beforePng);
    await page.getByRole('link',{name:'リセット',exact:true}).click();await page.waitForURL(url=>!url.searchParams.has('rank'));await page.waitForFunction(()=>document.querySelector('select[name=rank]')?.value==='all');await page.waitForLoadState('networkidle');assert.equal(await page.locator('select[name="rank"]').inputValue(),'all');assert.equal(rpcNames.at(-1),'get_analysis_aggregates_v1');
    assert.deepEqual(errors,[]);
    for(const kind of ['missing','invalid']){fail=kind;await page.goto(origin+'/analysis?rank=master');await page.waitForFunction(()=>document.body.innerText.includes('Application error'));assert.equal(await page.locator('article').count(),0);assert.doesNotMatch(await page.locator('body').innerText(),/対象登録戦績: 0件/);}
    assert.equal(rawReads,0);assert.deepEqual(writes,[]);
    fs.writeFileSync(path.join(output,'result.json'),JSON.stringify({passed:true,initialRpcCalls:1,rawReads,writes,errors,rankCombinations:80,checks:['20 choices, direct/combined, mine/all, source rank, filter reset, filtered PNG no refetch','320-1440px layout and tooltip','combined and reverse-only','non-admin scope/default','true zero','PNG no refetch','missing and malformed RPC are errors']},null,2));
    console.log('Analysis rank browser passed (80 rank/mode/scope combinations): layout, tooltip, one RPC, zero raw reads, reverse filters, scope, PNG, zero and errors.');
  }finally{if(browser)await browser.close();app.kill();api.close();fs.closeSync(log);}
})().catch(error=>{console.error(error);process.exitCode=1;});
