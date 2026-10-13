/* eslint-disable @typescript-eslint/no-require-imports */
// Built local Next server, synthetic HTTP boundary only. SQL parity is tested separately.
const fs=require('fs'),path=require('path'),http=require('http'),cp=require('child_process'),assert=require('assert/strict');
const out=path.resolve('build/qa2-005-analysis-date-validation'),baseline=process.env.DATE_BASELINE==='1',focused=process.env.DATE_FOCUSED==='1';
const work=path.resolve(baseline?'build/qa2-008-production/workspace':out+'/workspace');
const savedFetch=fetch;require('./register.cjs');globalThis.fetch=savedFetch;
const {chromium}=require(path.resolve('build/r1b-rank-compatibility/tools/node_modules/playwright'));
const f=require('./environment-dashboard-v4-fixture.cjs'),{analysisFixture}=require('./analysis-browser-fixture.cjs'),{periodFixture}=require('./period-report-fixture.cjs'),{aggregates}=require('./obs-matchups-fixture.cjs'),{invalid}=require('./analysis-date-cases.cjs');
const origin='http://localhost:3395',decks=structuredClone(f.decks).slice(0,6),environments=structuredClone(f.environments);
const user={id:f.id(90),aud:'authenticated',role:'authenticated',is_anonymous:false,email:'synthetic@example.test',app_metadata:{},user_metadata:{}};
const records=Array.from({length:60},(_,i)=>({id:f.id(100+i),user_id:user.id,environment_id:environments[0].id,my_deck_id:decks[i%6].id,opponent_deck_id:decks[(i+1)%6].id,my_archetype_id:decks[i%6].id,opponent_archetype_id:decks[(i+1)%6].id,result:i%3?'win':'lose',turn_order:i%2?'first':'second',played_at:'2026-10-10T10:00:00.000Z',rank_tier:'grandmaster',grandmaster_rating:'epic',master_group:null}));
const recent=records.slice(0,10).map(r=>({...r,my_deck:decks.find(d=>d.id===r.my_deck_id),opponent_deck:decks.find(d=>d.id===r.opponent_deck_id),environment:{name:'合成環境'}}));
const report={baseline,events:[],unexpectedHttp:[],expected400:[],apiErrors:[],routes:[],flows:[],png:[],rpc:[],external:[]};let failure=false,expectedErrors=false;
const api=http.createServer(async(req,res)=>{try{const u=new URL(req.url,'http://127.0.0.1:54329'),table=u.pathname.split('/').at(-1);let body='';for await(const b of req)body+=b;const a=body?JSON.parse(body):{};let d;
 if(u.pathname==='/auth/v1/user')d=user;
 else if(u.pathname.includes('/rpc/')){
  report.rpc.push({name:table,args:a});
  if(table.startsWith('get_analysis_aggregates')&&failure){res.writeHead(500,{'Content-Type':'application/json'});res.end(JSON.stringify({code:'XX000',message:'PRIVATE'}));return;}
  if(table==='get_home_dashboard')d={summary:{total:60,wins:40,winRate:66.6667,firstWinRate:60,secondWinRate:70},recent};
  else if(table==='get_environment_dashboard_aggregates_v4')d=f.dashboard(a);
  else if(table==='get_analysis_aggregates_v3_exclusive')d=aggregates();
  else if(table.startsWith('get_analysis_aggregates'))d=analysisFixture(records.filter(()=>!a.p_rank_filters||a.p_rank_filters.includes('grandmaster:epic')),a);
  else if(table.startsWith('get_matchup_aggregates')){const map=new Map();for(const r of records){const k=r.my_archetype_id+':'+r.opponent_archetype_id,g=map.get(k)||{myDeckId:r.my_archetype_id,opponentDeckId:r.opponent_archetype_id,total:0,wins:0};g.total++;g.wins+=r.result==='win'?1:0;map.set(k,g);}d={version:1,totalMatches:60,groups:[...map.values()]};}
  else if(table.startsWith('get_period_report_aggregates'))d=periodFixture(records,a);else throw Error('unsupported RPC '+table);
 }else if(!['GET','HEAD'].includes(req.method))throw Error('Unexpected write');
 else if(table==='admin_users')d={id:f.id(91),user_id:user.id};else if(table==='environments')d=environments;else if(['decks','deck_archetypes'].includes(table))d=decks;else if(table==='matches')d=recent;else if(['deck_suggestions','my_decks','creator_images','creator_tier_works','creator_correlations'].includes(table))d=[];else throw Error('unsupported table '+table);
 res.writeHead(200,{'Content-Type':'application/json'});res.end(JSON.stringify(d));
 }catch(e){report.apiErrors.push(e.message);res.writeHead(500);res.end('{}');}});
(async()=>{fs.mkdirSync(out+'/screenshots',{recursive:true});await new Promise(r=>api.listen(54329,'127.0.0.1',r));
 const env={};for(const[k,v]of Object.entries(process.env))if(/^(PATH|PATHEXT|SystemRoot|WINDIR|COMSPEC|TEMP|TMP|APPDATA|LOCALAPPDATA|USERPROFILE|HOMEDRIVE|HOMEPATH|ProgramFiles|ProgramFiles\(x86\)|ProgramW6432|NUMBER_OF_PROCESSORS|PROCESSOR_ARCHITECTURE)$/i.test(k))env[k]=v;
 Object.assign(env,{NEXT_PUBLIC_SUPABASE_URL:'http://127.0.0.1:54329',NEXT_PUBLIC_SUPABASE_ANON_KEY:'test-public-key',NEXT_TELEMETRY_DISABLED:'1'});
 const log=fs.openSync(out+'/'+(baseline?'baseline':focused?'browser-focused':'browser')+'-server.log','w'),app=cp.spawn(process.execPath,[require.resolve('next/dist/bin/next'),'start','-p','3395'],{cwd:work,env,windowsHide:true,stdio:['ignore',log,log]});let browser;
 try{for(let i=0;i<100;i++){try{if((await fetch(origin+'/privacy')).ok)break;}catch{}await new Promise(r=>setTimeout(r,200));}
 for(const name of baseline?['Chromium']:['Chromium','Edge']){
 browser=await chromium.launch({headless:true,executablePath:name==='Edge'?'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe':'C:/Users/keith/AppData/Local/ms-playwright/chromium-1223/chrome-win64/chrome.exe'});
 const context=await browser.newContext({viewport:{width:1440,height:1080},timezoneId:name==='Edge'?'America/Los_Angeles':'Asia/Tokyo'}),exp=Math.floor(Date.now()/1000)+3600;
 const session={access_token:['eyJhbGciOiJIUzI1NiJ9',Buffer.from(JSON.stringify({sub:user.id,exp})).toString('base64url'),'fixture'].join('.'),refresh_token:'fixture',expires_at:exp,expires_in:3600,token_type:'bearer',user};
 await context.addCookies([{name:'sb-127-auth-token',value:'base64-'+Buffer.from(JSON.stringify(session)).toString('base64url'),url:origin}]);
 await context.route('**/*',r=>{if(['localhost','127.0.0.1'].includes(new URL(r.request().url()).hostname)||/^(data|blob):/.test(r.request().url()))return r.continue();report.external.push(new URL(r.request().url()).hostname);return r.abort();});
 const page=await context.newPage();page.on('console',m=>{if(['error','warning'].includes(m.type()))report.events.push({browser:name,type:m.type(),message:m.text(),expected:expectedErrors});});page.on('pageerror',e=>report.events.push({browser:name,type:'pageerror',message:e.message,expected:expectedErrors}));page.on('response',r=>{if(r.status()>=400&&!expectedErrors)report.unexpectedHttp.push({status:r.status(),path:new URL(r.url()).pathname});});
 const baseParams={environment:environments[0].id,ranks:'grandmaster:epic',scope:'all',winRateMode:'combined',myDeck:decks[0].id};
 async function goto(query){const r=await page.goto(origin+query,{waitUntil:'networkidle'});assert.equal(r.status(),200);assert.doesNotMatch(await page.locator('body').innerText(),/Application error|Internal Server Error/);return r;}
 if(baseline){expectedErrors=true;const q='playedFrom=2026-99-99T99%3A99',r=await page.goto(origin+'/analysis?'+q,{waitUntil:'networkidle'}),a=await context.request.get(origin+'/api/analysis?'+q);assert.equal(r.status(),500);assert.equal(a.status(),503);report.reproduction={page:r.status(),api:a.status()};expectedErrors=false;await browser.close();browser=null;continue;}
 for(const [i,value]of (focused?[]:invalid).entries())for(const field of ['playedFrom','playedTo']){const q=new URLSearchParams(baseParams);for(const v of Array.isArray(value)?value:[value])q.append(field,v);const before=report.rpc.length;const response=await context.request.get(origin+'/api/analysis?'+q);assert.equal(response.status(),400);assert.equal((await response.json()).field,field);assert.equal(report.rpc.length,before);report.expected400.push({browser:name,case:i,field,status:400});}
 for(const raw of ['playedFrom=%E0%A4%A','playedFrom=%ZZ','playedFrom=2026-10-11T00:00&playedTo=2026-10-10T00:00']){const r=await context.request.get(origin+'/api/analysis?'+raw);assert.equal(r.status(),400);report.expected400.push({browser:name,raw,status:400});}
 const anon=await browser.newContext();assert.equal((await anon.request.get(origin+'/api/analysis?playedFrom=bad')).status(),401);await anon.close();failure=true;const unavailable=await context.request.get(origin+'/api/analysis');assert.equal(unavailable.status(),503);assert.doesNotMatch(await unavailable.text(),/PRIVATE/);failure=false;
 for(const width of focused?[]:[1920,1440,768,390,320]){
  await page.setViewportSize({width,height:1080});
  const q=new URLSearchParams({...baseParams,playedFrom:'2026-02-30T00:00',playedTo:'2026-10-10T23:59'});
  const original=origin+'/analysis?'+q;await goto('/analysis?'+q);assert.equal(page.url(),original);assert.match(await page.locator('main [role=alert]').innerText(),/開始日時/);assert.equal(await page.locator('[data-png-exclude]').count(),0);
  const geometry=await page.evaluate(()=>({width:innerWidth,scroll:document.documentElement.scrollWidth,controls:[...document.querySelectorAll('input:not([type=hidden]),button')].filter(x=>x.getBoundingClientRect().width).map(x=>({left:x.getBoundingClientRect().left,right:x.getBoundingClientRect().right}))}));assert(geometry.scroll<=width);assert(geometry.controls.every(x=>x.left>=0&&x.right<=width));
  await page.screenshot({path:out+'/screenshots/'+name+'-'+width+'-error.png',fullPage:true});await page.reload({waitUntil:'networkidle'});assert.equal(page.url(),original);
  await page.getByRole('textbox',{name:'開始日時（日本時間）',exact:true}).fill('2026-10-10T00:00');await page.getByRole('button',{name:'表示',exact:true}).click();await page.waitForURL(u=>u.searchParams.get('playedFrom')==='2026-10-10T00:00');await page.waitForLoadState('networkidle');assert.match(await page.locator('main').innerText(),/対象登録戦績:/);assert.equal(await page.locator('main [role=alert]').count(),0);
  for(const[k,v]of Object.entries(baseParams))assert.equal(new URL(page.url()).searchParams.get(k),v);
  const last=report.rpc.filter(x=>x.name==='get_analysis_aggregates_v3').at(-1);assert.equal(last.args.p_played_from,'2026-10-09T15:00:00.000Z');assert.equal(last.args.p_played_to,'2026-10-10T14:59:59.999Z');
  await page.goBack({waitUntil:'networkidle'});assert.match(await page.locator('main [role=alert]').innerText(),/開始日時/);await page.goForward({waitUntil:'networkidle'});assert.match(await page.locator('main').innerText(),/対象登録戦績:/);
  await page.reload({waitUntil:'networkidle'});const wait=page.waitForEvent('download');await page.locator('button[data-png-exclude]').first().click();const d=await wait,target=out+'/'+name+'-'+width+(d.suggestedFilename().endsWith('.zip')?'.zip':'.png');await d.saveAs(target);const bytes=fs.readFileSync(target),frames=target.endsWith('.zip')?Object.values(require('fflate').unzipSync(bytes)):[bytes];for(const bytes of frames){const metadata=await require('sharp')(bytes).metadata();assert(metadata.width>0&&metadata.height>0);}report.png.push({browser:name,width,frames:frames.length});
  // A client-restored invalid history entry must hide the previous valid aggregates.
  await page.evaluate(()=>{history.pushState(history.state,'','/analysis?playedFrom=bad&ranks=a');dispatchEvent(new PopStateEvent('popstate'));});await page.locator('main [role=alert]').waitFor();assert.equal(await page.locator('button[data-png-exclude]').count(),0);await page.goBack({waitUntil:'networkidle'});await page.locator('button[data-png-exclude]').first().waitFor();
  await goto('/analysis');await page.getByRole('button',{name:'表示',exact:true}).click();await page.waitForLoadState('networkidle');assert.equal(new URL(page.url()).searchParams.has('playedFrom'),false);assert.equal(new URL(page.url()).searchParams.has('playedTo'),false);assert.equal(await page.locator('main [role=alert]').count(),0);
  for(const route of ['/','/matrix','/environment','/admin/weekly-report','/admin','/admin/creator','/admin/creator/tier','/admin/obs/environment']){await goto(route);const g=await page.evaluate(()=>({width:innerWidth,scroll:document.documentElement.scrollWidth}));report.routes.push({browser:name,width,route,...g});if(!(route==='/'&&width===768))assert(g.scroll<=width,route+' overflow');}
  report.flows.push({browser:name,width,errorRecovery:true,history:true,reload:true,filtersPreserved:true});console.log('PASS '+name+' '+width);
 }
 // Ordinary date/time controls, explicit clearing, duplicate repair and XSS-safe rendering.
 await page.setViewportSize({width:320,height:1080});await goto('/analysis?'+new URLSearchParams(baseParams));
 await page.getByLabel('開始日時の日付',{exact:true}).fill('2026-10-10');await page.getByLabel('開始日時の時刻（日本時間）',{exact:true}).fill('00:00');
 await page.getByLabel('終了日時の日付',{exact:true}).fill('2026-10-10');await page.getByLabel('終了日時の時刻（日本時間）',{exact:true}).fill('23:59');
 await page.getByRole('button',{name:'表示',exact:true}).click();await page.waitForURL(u=>u.searchParams.get('playedFrom')==='2026-10-10T00:00');await page.waitForLoadState('networkidle');assert.equal(await page.locator('main [role=alert]').count(),0);
 assert.equal(report.rpc.filter(x=>x.name==='get_analysis_aggregates_v3').at(-1).args.p_played_from,'2026-10-09T15:00:00.000Z');
 await page.getByLabel('開始日時の日付',{exact:true}).fill('');await page.getByRole('button',{name:'表示',exact:true}).click();await page.waitForURL(u=>!u.searchParams.has('playedFrom'));await page.waitForLoadState('networkidle');assert.equal(new URL(page.url()).searchParams.get('playedTo'),'2026-10-10T23:59');
 const duplicated=new URLSearchParams({...baseParams,playedFrom:'2026-10-10T00:00'});duplicated.append('playedFrom','2026-10-11T00:00');await goto('/analysis?'+duplicated);assert.match(await page.locator('main').innerText(),/重複指定/);await page.getByRole('button',{name:'表示',exact:true}).click();await page.waitForURL(u=>u.searchParams.getAll('playedFrom').length===1);await page.waitForLoadState('networkidle');assert.equal(await page.locator('main [role=alert]').count(),0);
 for(const value of ['<img src=x onerror="window.dateQueryXss=true">','x'.repeat(4096),'invalid-date','2026-01-01T00:00Z']){const q=new URLSearchParams({...baseParams,playedFrom:value});const url=origin+'/analysis?'+q;await goto('/analysis?'+q);assert.equal(page.url(),url);assert.equal(await page.getByRole('textbox',{name:'開始日時（日本時間）',exact:true}).inputValue(),value);assert.equal(await page.evaluate(()=>window.dateQueryXss),undefined);assert.equal(await page.locator('button[data-png-exclude]').count(),0);}
 report.focusedChecks ??=[];report.focusedChecks.push({browser:name,timezone:name==='Edge'?'America/Los_Angeles':'Asia/Tokyo',ordinaryInputs:true,explicitClear:true,duplicateRepair:true,xssSafe:true,longInput:true});
 await browser.close();browser=null;
 }
 assert.deepEqual(report.events.filter(x=>!x.expected),[]);assert.deepEqual(report.unexpectedHttp,[]);assert.deepEqual(report.apiErrors,[]);assert.deepEqual(report.external,[]);report.completed=true;
 }finally{await browser?.close();app.kill();api.closeAllConnections();await new Promise(r=>api.close(r));fs.closeSync(log);}
})().catch(e=>{report.error=e.stack;process.exitCode=1}).finally(()=>{fs.writeFileSync(out+'/'+(baseline?'browser-before':focused?'browser-focused':'browser-after')+'.json',JSON.stringify(report,null,2));console.log(JSON.stringify({completed:report.completed,flows:report.flows.length,expected400:report.expected400.length,focused:report.focusedChecks,events:report.events,error:report.error}));});
