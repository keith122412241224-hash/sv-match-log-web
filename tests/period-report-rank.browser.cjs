/* eslint-disable @typescript-eslint/no-require-imports */
const http=require('node:http'),fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),{spawn}=require('node:child_process');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const fetchNetwork=global.fetch;require('./register.cjs');global.fetch=fetchNetwork;
const old=require('./fixtures/weekly-report-e430a56');
const {ANALYSIS_RANK_FILTERS}=require('../src/lib/analysis-rank-filter');
const accepts=(m,f)=>{if(!f||f==='all')return true;if(f==='master-plus')return ['master','grandmaster'].includes(m.rank_tier);const[t,c]=f.split(':');return m.rank_tier===t&&(!c||(t==='master'?m.master_group:m.grandmaster_rating)===c);};
const {periodFixture}=require('./period-report-fixture.cjs');
const origin='http://localhost:3244',output=path.resolve('build/period-rank-browser-proof');
const user={id:'fixture-admin',aud:'authenticated',role:'authenticated',email:'fixture@example.test',app_metadata:{},user_metadata:{}};
const decks=[{id:'A',name:'デッキA',class_name:'エルフ',is_active:true},{id:'B',name:'デッキB',class_name:'ロイヤル',is_active:true}];
const ranks=[{},...['beginner','d','c','b','a','aa'].map(rank_tier=>({rank_tier})),...['emerald','topaz','ruby','sapphire','diamond'].map(master_group=>({rank_tier:'master',master_group})),...['none','epic','ultimate','legend','beyond'].map(grandmaster_rating=>({rank_tier:'grandmaster',grandmaster_rating}))];
const baseRows=ranks.flatMap((rank,n)=>Array.from({length:60},(_,i)=>({...rank,id:String(n*60+i).padStart(6,'0'),my_deck_id:i%2?'A':'B',opponent_deck_id:i%5?i%2?'B':'A':i%2?'A':'B',my_archetype_id:null,opponent_archetype_id:null,result:i%3?'win':'lose',played_at:i<40?'2026-09-05T01:00:00.000Z':'2026-09-04T01:00:00.000Z'})));
let rows=baseRows,admin=true,fail=null,rawReads=0,aiCalls=0;const calls=[],names=[],writes=[],errors=[];
const api=http.createServer(async(req,res)=>{
  res.setHeader('Content-Type','application/json');const url=new URL(req.url,'http://127.0.0.1:54329');
  if(req.method==='POST'&&url.pathname==='/mock-ai'){aiCalls++;await new Promise(r=>setTimeout(r,700));res.end(JSON.stringify({output_text:'# Synthetic report'}));return;}
  if(req.method==='POST'&&['/rest/v1/rpc/get_period_report_aggregates_v1','/rest/v1/rpc/get_period_report_aggregates_v2'].includes(url.pathname)){
    let body='';for await(const part of req)body+=part;calls.push(JSON.parse(body));names.push(url.pathname.split('/').at(-1));
    if(fail==='invalid'){res.end('{"version":1}');return;}
    if(fail){res.writeHead(fail==='missing'?404:fail==='permission'?403:500);res.end(JSON.stringify({code:fail==='missing'?'PGRST202':fail==='permission'?'42501':'XX000',message:'synthetic failure'}));return;}
    res.end(JSON.stringify(periodFixture(rows.filter(m=>accepts(m,calls.at(-1).p_rank_filter)),calls.at(-1))));return;
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
  const app=spawn(process.execPath,['--require',path.resolve('tests/fixtures/rescue-ai-local.cjs'),require.resolve('next/dist/bin/next'),'start','-p','3244'],{windowsHide:true,stdio:['ignore',log,log],env:{...process.env,NEXT_PUBLIC_SUPABASE_URL:'http://127.0.0.1:54329',NEXT_PUBLIC_SUPABASE_ANON_KEY:'test-public-key',OPENAI_API_KEY:'synthetic-never-sent'}});
  let browser;
  try{
    for(let i=0;i<60;i++){try{if((await fetch(origin+'/privacy')).ok)break;}catch{}await new Promise(r=>setTimeout(r,500));}
    browser=await chromium.launch({headless:true,...(process.env.CHROME_EXECUTABLE?{executablePath:process.env.CHROME_EXECUTABLE}:{})});
    const context=await browser.newContext({viewport:{width:1440,height:1000},permissions:['clipboard-read','clipboard-write']}),page=await context.newPage();
    const token=['eyJhbGciOiJIUzI1NiJ9',Buffer.from(JSON.stringify({sub:user.id,exp:Math.floor(Date.now()/1000)+3600})).toString('base64url'),'fixture'].join('.');
    const session={access_token:token,refresh_token:'fixture',expires_at:Math.floor(Date.now()/1000)+3600,expires_in:3600,token_type:'bearer',user};
    await context.addCookies([{name:'sb-127-auth-token',value:'base64-'+Buffer.from(JSON.stringify(session)).toString('base64url'),url:origin}]);
    page.on('pageerror',error=>errors.push(error.message));
    const route='/admin/weekly-report?start=2026-09-05&end=2026-09-05';
    const sorted=items=>[...items].sort((a,b)=>b.played_at.localeCompare(a.played_at)||b.id.localeCompare(a.id));
    const oracle=(start,end,rank)=>{const period=old.buildWeeklyPeriod(start,end),previous=old.getPreviousWeeklyReportPeriod(period);const matching=(a,b)=>sorted(baseRows.filter(m=>m.played_at>=a&&m.played_at<=b&&accepts(m,rank)));return old.buildWeeklyReport(matching(period.startIso,period.endIso),matching(previous.startIso,previous.endIso),decks,period);};
    const expectedJson=(report,option)=>option.value==='all'?report.aiJson:{...report.aiJson,rankFilter:{value:option.value,label:option.label,description:'当期間・前期間とも登録者本人の対戦時点のランクで原本戦績を絞り込み。反転時もランクは変換しません。'}};
    const cases=[];await page.goto(origin+route,{waitUntil:'networkidle'});
    const baseline=JSON.parse(await page.locator('textarea[readonly]').first().inputValue());assert.deepEqual(baseline,oracle('2026-09-05','2026-09-05','all').aiJson);
    for(const end of ['2026-09-05','2026-09-06'])for(const option of ANALYSIS_RANK_FILTERS){
      await page.locator('input[name=end]').fill(end);await page.locator('select[name=rank]').selectOption(option.value);const before=calls.length;
      await page.getByRole('button',{name:'表示',exact:true}).click();await page.waitForLoadState('networkidle');assert.equal(calls.length,before+1);assert.equal(names.at(-1),option.value==='all'?'get_period_report_aggregates_v1':'get_period_report_aggregates_v2');
      assert.equal(calls.at(-1).p_rank_filter,option.value==='all'?undefined:option.value);assert.equal(await page.locator('select[name=rank]').inputValue(),option.value);assert.equal(new URL(page.url()).searchParams.get('rank'),option.value);assert.equal(await page.locator('select[name=rank] option').count(),14);
      const report=oracle('2026-09-05',end,option.value),expected=expectedJson(report,option),actual=JSON.parse(await page.locator('textarea[readonly]').first().inputValue());assert.deepEqual(actual,expected,'full old AI JSON');
      const previous=old.getPreviousWeeklyReportPeriod(report.period);assert.equal(calls.at(-1).p_current_end,report.period.endIso);assert.equal(calls.at(-1).p_previous_start,previous.startIso);assert.equal(calls.at(-1).p_previous_end,previous.endIso);
      await page.getByRole('button',{name:'AI用プロンプトをコピー',exact:true}).click();assert.equal((await page.evaluate(()=>navigator.clipboard.readText())).replaceAll('\r\n','\n'),old.buildWeeklyReportPrompt(expected));
      const pngBlocks=page.locator('section').filter({has:page.getByRole('button',{name:'PNG',exact:true})});assert.equal(await pngBlocks.count(),6);
      for(let i=0;i<6;i++){const text=await pngBlocks.nth(i).locator(':scope > div').last().innerText();assert.ok(text.includes('ランク: '+(option.value==='all'?'すべて（未登録含む）':option.label)),'PNG capture includes rank label');assert.ok(text.includes('登録試合数'+report.totalMatches+'件'),'PNG includes source record count');}
      cases.push({end,rank:option.value,current:report.totalMatches,previous:report.previousTotalMatches,oneRpc:true,aiJsonPromptEqual:true,pngLabels:true});
    }
    await page.goto(origin+route+'&rank=master:sapphire',{waitUntil:'networkidle'});const countBeforeTier=calls.length;
    const tierSection=page.locator('section').filter({has:page.getByRole('heading',{name:'Tier手動調整',exact:true})});await tierSection.locator('select').first().selectOption('Tier4');
    const adjusted=JSON.parse(await page.locator('textarea[readonly]').first().inputValue());assert.equal(adjusted.tierCandidates[0].finalTier,'Tier4');assert.equal(adjusted.rankFilter.value,'master:sapphire');
    await page.getByRole('button',{name:'AI用プロンプトをコピー',exact:true}).click();assert.equal((await page.evaluate(()=>navigator.clipboard.readText())).replaceAll('\r\n','\n'),old.buildWeeklyReportPrompt(adjusted));
    for(const title of ['前期間からの環境変化','Tier候補']){const block=page.locator('section').filter({has:page.getByRole('heading',{name:title,level:2,exact:true})});const downloading=page.waitForEvent('download');await block.getByRole('button',{name:'PNG',exact:true}).click();const download=await downloading;const file=path.join(output,title==='Tier候補'?'tier-rank.png':'changes-rank.png');await download.saveAs(file);assert.equal(fs.readFileSync(file).subarray(1,4).toString(),'PNG');}
    assert.equal(calls.length,countBeforeTier,'manual Tier and PNG do not refetch');
    await page.locator('select[name=rank]').selectOption('all');await page.getByRole('button',{name:'表示',exact:true}).click();await page.waitForLoadState('networkidle');assert.deepEqual(JSON.parse(await page.locator('textarea[readonly]').first().inputValue()),baseline,'rank change clears previous manual adjustment');

    // D generated Markdown contains the same population context; memo/Tier/condition changes reset it.
    const memo=page.locator('textarea:not([readonly])');
    const generate=async()=>{await page.getByRole('button',{name:'AI本文生成',exact:true}).click();await page.getByRole('button',{name:'本文コピー',exact:true}).waitFor();};
    await generate();
    const markdown=await page.locator('textarea[readonly]').last().inputValue();assert.ok(markdown.includes('登録試合数'));assert.ok(markdown.includes('全ユーザー'));assert.ok(markdown.includes('# Synthetic report'));
    const mdDownload=page.waitForEvent('download');await page.getByRole('button',{name:'Markdown保存',exact:true}).click();const md=await mdDownload;const mdFile=path.join(output,'context-report.md');await md.saveAs(mdFile);assert.equal(fs.readFileSync(mdFile,'utf8'),markdown);
    await memo.fill('memo changed');assert.equal(await page.getByRole('button',{name:'本文コピー',exact:true}).count(),0);
    await generate();await tierSection.locator('select').first().selectOption('Tier4');assert.equal(await page.getByRole('button',{name:'本文コピー',exact:true}).count(),0);
    // An old in-flight response cannot repopulate a form after its input context changes.
    const beforeAi=aiCalls;await page.getByRole('button',{name:'AI本文生成',exact:true}).click();
    for(let i=0;aiCalls===beforeAi&&i<100;i++)await page.waitForTimeout(30);assert.equal(aiCalls,beforeAi+1);
    await memo.fill('changed while request pending');await page.waitForTimeout(1100);assert.equal(await page.getByRole('button',{name:'本文コピー',exact:true}).count(),0);
    await generate();await page.locator('select[name=rank]').selectOption('master');await page.getByRole('button',{name:'表示',exact:true}).click();await page.waitForLoadState('networkidle');assert.equal(await page.getByRole('button',{name:'本文コピー',exact:true}).count(),0);

    rows=[];await page.goto(origin+route+'&rank=grandmaster:none',{waitUntil:'networkidle'});const zero=JSON.parse(await page.locator('textarea[readonly]').first().inputValue());assert.equal(zero.summary.totalMatches,0);assert.equal(zero.rankFilter.value,'grandmaster:none');assert.match(await page.locator('main').innerText(),/対象期間の戦績がありません/);
    for(const kind of ['missing','database','permission','invalid']){fail=kind;const before=calls.length;await page.goto(origin+route+'&rank=master',{waitUntil:'networkidle'});assert.match(await page.locator('main').innerText(),/期間レポートデータを取得できませんでした/);assert.equal(await page.locator('textarea[readonly]').count(),0);assert.equal(calls.length,before+1);assert.equal(names.at(-1),'get_period_report_aggregates_v2');}
    fail=null;const beforeInvalid=calls.length;await page.goto(origin+route+'&rank=aa',{waitUntil:'networkidle'});assert.match(await page.locator('main').innerText(),/ランクの絞り込み条件が不正/);assert.equal(calls.length,beforeInvalid);
    admin=false;await page.goto(origin+route+'&rank=master',{waitUntil:'networkidle'});assert.equal(new URL(page.url()).pathname,'/');assert.equal(calls.length,beforeInvalid);
    assert.equal(rawReads,0);assert.deepEqual(writes,[]);assert.deepEqual(errors,[]);
    fs.writeFileSync(path.join(output,'result.json'),JSON.stringify({passed:true,rescueD:true,aiCalls,cases,rawReads,pngExports:2,pngLabels:6,manualTierPreserved:true,filterChangeResetsTier:true,errorsNoFallback:true,adminGuard:true,writes,errors},null,2));console.log('R4 browser passed: 28 rank/date cases; full AI JSON/prompt; PNG rank labels; Tier editing/reset; 1 RPC; 0 raw/refetch; errors/admin guard.');
  }finally{if(browser)await browser.close();app.kill();api.close();fs.closeSync(log);}
})().catch(error=>{console.error(error);process.exitCode=1;});
