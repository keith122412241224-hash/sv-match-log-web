/* eslint-disable @typescript-eslint/no-require-imports */
// Actual built Next UI -> /api/analysis -> localhost RPC boundary. No production access.
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),cp=require('node:child_process'),assert=require('node:assert/strict');
const savedFetch=fetch;require('./register.cjs');globalThis.fetch=savedFetch;
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright'),{unzipSync}=require('fflate'),sharp=require('sharp');
const {analysisFixture}=require('./analysis-browser-fixture.cjs'),{buildAnalysisFromAggregates}=require('../src/lib/analysis-aggregates');
const {selectAnalysisSummaries}=require('../src/lib/analysis-presentation');
const React=require('react'),{renderToStaticMarkup}=require('react-dom/server'),{DeckAnalysisCards}=require('../src/components/analysis/DeckAnalysisCards');
const {expandLegacyRankFilter}=require('../src/lib/rank-selection');
const {SHADOWVERSE_CLASSES}=require('../src/lib/constants');
const origin='http://localhost:3302',out=path.resolve(process.env.MATCHUP_OUTPUT||'build/analysis-matchups/browser');
const id=n=>'00000000-0000-4000-8000-'+String(n).padStart(12,'0'),envId=id(1),owner=id(2),other=id(3);
const user={id:owner,aud:'authenticated',role:'authenticated',is_anonymous:false,email:'local@example.test',app_metadata:{},user_metadata:{}};
let admin=true,delay=0,fail=false,environmentName='検証環境';const report={checks:[],rpc:[],errors:[],unexpected:[],exports:[],timings:[]};
function check(message){report.checks.push(message);console.log('PASS '+message);}
let decks,records;
function fixtures(many=false){decks=Array.from({length:many?40:5},(_,i)=>({id:id(100+i),name:i===2?'長いデッキ名'.repeat(9):`検証${i+1}${SHADOWVERSE_CLASSES[i%7]}`,class_name:SHADOWVERSE_CLASSES[i%7],is_active:true,user_id:owner}));
 records=decks.flatMap((d,i)=>Array.from({length:many?12:[16,14,9,3,0][i]},(_,j)=>({id:id(1000+i*100+j),user_id:j%4===3?other:owner,environment_id:envId,my_deck_id:d.id,opponent_deck_id:decks[(i+j%2+1)%decks.length].id,my_archetype_id:d.id,opponent_archetype_id:decks[(i+j%2+1)%decks.length].id,result:j<3||j%2===0?'win':'lose',turn_order:j%2?'second':'first',played_at:new Date(Date.parse('2026-10-21T09:59:00Z')-j*86400000).toISOString(),rank_tier:j%2?'master':'grandmaster',master_group:j%2?'ruby':null,grandmaster_rating:j%2?null:'epic'})));
}
fixtures();
const ranksOf=r=>r.rank_tier==='master'?'master:'+r.master_group:r.rank_tier==='grandmaster'?'grandmaster:'+r.grandmaster_rating:r.rank_tier||'unranked';
function expected(args){return analysisFixture(records.filter(r=>(args.p_include_all_users||r.user_id===owner)&&(!args.p_rank_filters||args.p_rank_filters.includes(ranksOf(r)))&&(!args.p_rank_filter||expandLegacyRankFilter(args.p_rank_filter).includes(ranksOf(r)))),args);}
const api=http.createServer(async(req,res)=>{try{const u=new URL(req.url,'http://127.0.0.1:54339'),table=u.pathname.split('/').at(-1);let text='';for await(const b of req)text+=b;const args=text?JSON.parse(text):{};let data;
 if(u.pathname==='/auth/v1/user')data=user;
 else if(table.startsWith('get_analysis_aggregates')){report.rpc.push({name:table,args});const dataBeforeDelay=expected(args);if(delay)await new Promise(r=>setTimeout(r,delay));if(fail){res.writeHead(500);res.end('{}');return;}data=dataBeforeDelay;}
 else if(table==='get_home_dashboard')data={summary:{total:0,wins:0,winRate:null,firstWinRate:null,secondWinRate:null},recent:[]};
 else if(!['GET','HEAD'].includes(req.method))throw Error('Unexpected write '+table);
 else if(table==='admin_users')data=admin?{user_id:owner}:null;
 else if(table==='environments')data=[{id:envId,name:environmentName,created_at:'2026-01-01',allow_match_input:true},{id:id(4),name:'戦績なし環境',created_at:'2025-01-01',allow_match_input:true}];
 else if(['decks','deck_archetypes'].includes(table))data=decks;
 else throw Error('Unexpected read '+table);
 res.writeHead(200,{'Content-Type':'application/json'});res.end(JSON.stringify(data));
 }catch(e){report.unexpected.push(e.message);res.writeHead(500);res.end('{}');}});
function matchupGeometry(root) {
 const table=root.querySelector('[data-analysis-matchups]');if(!table)return null;
 const rect=table.getBoundingClientRect(),clipped=[];
 for(const cell of table.querySelectorAll('th,td')){
  const box=cell.getBoundingClientRect();if(!box.height)continue;
  const walker=document.createTreeWalker(cell,NodeFilter.SHOW_TEXT);let node;
  while((node=walker.nextNode())){if(!node.textContent.trim())continue;const range=document.createRange();range.selectNodeContents(node);
   for(const text of range.getClientRects())if(text.width&&text.height&&(text.left<box.left-1||text.right>box.right+1||text.top<box.top-1||text.bottom>box.bottom+1))clipped.push(node.textContent);
  }
 }
 const heading=table.querySelector('[data-matchup-heading]'),rows=[...table.querySelectorAll('[data-matchup-cell]')].filter(e=>e.getBoundingClientRect().height);
 return {width:rect.width,center:rect.x+rect.width/2,columns:[...table.querySelectorAll('thead th')].map(e=>e.getBoundingClientRect().width),clipped,
  headingBackground:heading?getComputedStyle(heading).backgroundColor:null,rowBackgrounds:rows.slice(0,2).map(e=>getComputedStyle(e).backgroundColor),
  headingWeight:heading?getComputedStyle([...heading.querySelectorAll('.truncate')].find(e=>e.getBoundingClientRect().height)).fontWeight:null,
  nameWeight:rows.length?getComputedStyle(rows[0].querySelector('.truncate')).fontWeight:null,
  numeric:rows.length?[...rows[0].querySelectorAll('td')].map(e=>({align:getComputedStyle(e).textAlign,weight:getComputedStyle(e).fontWeight})):[]};
}
async function verifyPixels(bytes, snapshot) {
 const metadata=await sharp(bytes).metadata(),stats=await sharp(bytes).stats();
 assert.ok(stats.channels.slice(0,3).every(c=>c.min<100),'PNG must contain visible text');
 if(metadata.hasAlpha)assert.equal(stats.channels[3].min,255,'PNG background must be opaque');
 const scale=metadata.width/snapshot.width,distinct=new Set();
 for(const icon of snapshot.icons){
  const left=Math.round(icon.x*scale),top=Math.round(icon.y*scale),width=Math.min(Math.round(icon.w*scale),metadata.width-left),height=Math.min(Math.round(icon.h*scale),metadata.height-top);
  assert.ok(left>=0&&top>=0&&width>0&&height>0,'class icon inside PNG');
  const crop=sharp(bytes).extract({left,top,width,height}),colors=await crop.clone().stats();
  assert.ok(colors.channels.slice(0,3).some(c=>c.max-c.min>30),'class icon contains rendered detail');
  distinct.add((await crop.raw().toBuffer()).toString('base64'));
 }
 assert.ok(distinct.size>=new Set(snapshot.icons.map(i=>i.src)).size,'different classes retain different icons');
}
(async()=>{fs.mkdirSync(out+'/screenshots',{recursive:true});await new Promise(r=>api.listen(54339,'127.0.0.1',r));const fd=fs.openSync(out+'/server.log','w'),app=cp.spawn(process.execPath,[require.resolve('next/dist/bin/next'),'start','-p','3302'],{env:process.env,windowsHide:true,stdio:['ignore',fd,fd]});let browser,page;
 try{
 for(let i=0;i<100;i++){try{if((await fetch(origin+'/privacy')).ok)break;}catch{}await new Promise(r=>setTimeout(r,200));}
 browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_EXECUTABLE});report.browser=browser.version();const context=await browser.newContext({viewport:{width:1440,height:1000},timezoneId:process.env.CHROME_EXECUTABLE?.includes('Edge')?'America/Los_Angeles':'Asia/Tokyo'});
 const exp=Math.floor(Date.now()/1000)+3600,session={access_token:['eyJhbGciOiJIUzI1NiJ9',Buffer.from(JSON.stringify({sub:owner,exp})).toString('base64url'),'fixture'].join('.'),refresh_token:'fixture',expires_at:exp,expires_in:3600,token_type:'bearer',user};await context.addCookies([{name:'sb-127-auth-token',value:'base64-'+Buffer.from(JSON.stringify(session)).toString('base64url'),url:origin}]);
 await context.route('**/*',r=>{const u=new URL(r.request().url());if(['localhost','127.0.0.1'].includes(u.hostname)||['data:','blob:'].includes(u.protocol))return r.continue();report.unexpected.push('external '+u.hostname);return r.abort();});
 page=await context.newPage();page.setDefaultTimeout(30000);page.on('pageerror',e=>report.errors.push(e.message));page.on('console',m=>{if(m.type()==='error'&&!fail)report.errors.push(m.text());});
 await page.addInitScript({content:'window.matchupGeometry = '+matchupGeometry.toString()});
 await page.clock.setFixedTime(new Date('2026-10-21T10:00:45.123Z'));
 await page.addInitScript(()=>{const original=HTMLCanvasElement.prototype.toBlob;HTMLCanvasElement.prototype.toBlob=function(...args){const s=document.querySelector('[data-report-png] > section');if(s)(window.exportPages??=[]).push({items:[...s.querySelectorAll(s.querySelector('table')?'tbody > tr':'article')].map(e=>e.textContent.replace(/\s+/g,' ').trim()),text:s.innerText,hidden:s.querySelector('[data-png-expand]')?.hidden,width:s.getBoundingClientRect().width,height:s.getBoundingClientRect().height,buttons:s.querySelectorAll('button,select').length,images:[...s.querySelectorAll('img')].every(e=>e.complete&&e.naturalWidth>0),overflow:s.scrollWidth>s.clientWidth+1,icons:[...s.querySelectorAll('img')].map(e=>({alt:e.alt,src:e.currentSrc,x:e.getBoundingClientRect().x-s.getBoundingClientRect().x,y:e.getBoundingClientRect().y-s.getBoundingClientRect().y,w:e.width,h:e.height}))});return original.apply(this,args);};});
 const region=name=>page.getByRole('region',{name,exact:true});
 const matchup=()=>region('デッキ別対面分析');
 const {selectAnalysisMatchups}=require('../src/lib/analysis-matchups');
 const {formatPercent}=require('../src/lib/utils');
 async function go(query=''){
  const before=report.rpc.length;await page.goto(origin+'/analysis'+query,{waitUntil:'networkidle'});
  assert.equal(report.rpc.length,before+1);assert.equal(await page.getByRole('region',{name:'相手デッキ別の勝率',exact:true}).count(),0);
  assert.equal(await page.getByRole('heading',{name:'対面別勝率',exact:true}).count(),0);
  for(const name of ['使用デッキ別の勝率','デッキ別の環境勝率'])assert.equal(await region(name).count(),0);
  assert.equal(await page.locator('[data-analysis-rate]').count(),0);
  assert.equal(await page.getByRole('button',{name:/をPNG保存$/}).count(),2);
  const summary=region(report.rpc.at(-1).args.p_include_reversed?'デッキ別サマリー（反転込み）':'使用デッキ別サマリー');
  assert.equal(await summary.evaluate(e=>e.nextElementSibling?.querySelector('h2')?.textContent),'デッキ別対面分析');
  assert.equal(Math.round(await summary.evaluate(e=>e.nextElementSibling.getBoundingClientRect().top-e.getBoundingClientRect().bottom)),24,'only the existing grid gap remains');
 }
 async function compare(){
  assert.equal(await matchup().getByText('少数データ',{exact:true}).count(),0);
  const args=report.rpc.at(-1).args,model=buildAnalysisFromAggregates(expected(args),decks,decks);
  const sort=await matchup().getByLabel('並び替え',{exact:true}).inputValue(),min=Number(await matchup().getByLabel('件数フィルター',{exact:true}).inputValue());
  const selected=new URL(page.url()).searchParams.get('myDeck')||'';
  const groups=selectAnalysisMatchups(model.matrix,sort,min,selected);
  const actual=await matchup().locator('[data-matchup-cell]').evaluateAll(rows=>rows.map(r=>({id:r.dataset.matchupCell,rate:r.cells[1].textContent,wins:r.cells[2].textContent,total:r.cells[3].textContent})));
  assert.deepEqual(actual,groups.flatMap(g=>g.cells.map(c=>({id:g.myDeck.id+'/'+c.opponentDeckId,rate:formatPercent(c.winRate),wins:c.wins.toLocaleString('ja-JP'),total:c.total.toLocaleString('ja-JP')}))));
  assert.deepEqual(await matchup().locator('[data-matchup-heading]').evaluateAll(rows=>rows.map(r=>r.dataset.matchupHeading)),groups.map(g=>g.myDeck.id));
  for(const g of groups)assert.ok((await matchup().locator(`[data-matchup-heading="${g.myDeck.id}"]`).innerText()).includes(String(g.total)));
  const summary=region(args.p_include_reversed?'デッキ別サマリー（反転込み）':'使用デッキ別サマリー');
  const summarySort=await summary.getByLabel('並び順',{exact:true}).inputValue(),minimum=(await summary.locator('button[aria-pressed=true]').textContent()).includes('10')?10:0;
  const html=renderToStaticMarkup(React.createElement(DeckAnalysisCards,{summaries:selectAnalysisSummaries(model.summaries,summarySort,minimum),combined:args.p_include_reversed,showTitle:false,recentDetails:true,showStreak:!args.p_include_all_users&&!args.p_include_reversed}));
  const expectedCards=await page.evaluate(html=>{const template=document.createElement('template');template.innerHTML=html;return [...template.content.querySelectorAll('article')].map(e=>e.textContent);},html);
  assert.deepEqual(await summary.locator('article').allTextContents(),expectedCards,'summary counts, rates, turns, TOP3, recent results and streaks are unchanged');
  return groups;
 }
 async function exportBlock(name,label,{zip=false,mobile=false}={}){
  const section=region(name),before=report.rpc.length;
  const state=await section.evaluate(e=>({articles:[...e.querySelectorAll('article')].map(e=>e.textContent.replace(/\s+/g,' ').trim()),selects:[...e.querySelectorAll('select')].map(e=>e.value),pressed:[...e.querySelectorAll('[aria-pressed]')].map(e=>e.getAttribute('aria-pressed')),cells:[...e.querySelectorAll('[data-matchup-cell]')].map(r=>({id:r.dataset.matchupCell,hidden:r.hidden,text:r.textContent})),expanded:[...e.querySelectorAll('[aria-expanded]')].map(e=>e.getAttribute('aria-expanded'))}));
  await page.evaluate(()=>{window.exportPages=[];});
  let download;
  if(mobile){
   await section.getByRole('button',{name:/をPNG保存$/}).click();const dialog=page.getByRole('dialog',{name:'分析画像の保存'});await dialog.waitFor();
   if(zip){await dialog.getByRole('button',{name:'次へ',exact:true}).click();await dialog.getByText(/^2 \/ /).waitFor();}
   const waiting=page.waitForEvent('download');await dialog.getByRole('button',{name:zip?'ZIPをダウンロード':/^PNGをダウンロード$/}).click();download=await waiting;
   await download.saveAs(out+'/'+label+'-'+download.suggestedFilename());
   await dialog.getByRole('button',{name:'閉じる',exact:true}).click();
  }else{
   const waiting=page.waitForEvent('download');await section.getByRole('button',{name:/をPNG保存$/}).click();download=await waiting;
   await download.saveAs(out+'/'+label+'-'+download.suggestedFilename());
  }
  const bytes=fs.readFileSync(out+'/'+label+'-'+download.suggestedFilename());assert.equal(download.suggestedFilename().endsWith('.zip'),zip);
  const files=zip?Object.values(unzipSync(bytes)):[bytes],pages=await page.evaluate(()=>window.exportPages);
  // Mobile may render page 2 for preview and re-render evicted pages for ZIP.
  const snapshots=[...new Map(pages.map(p=>[p.page,p])).entries()].sort((a,b)=>a[0]-b[0]).map(([,p])=>p);
  assert.equal(snapshots.length,files.length);
  if(name==='デッキ別対面分析'){
   for(const p of snapshots)assert.doesNotMatch(p.text,/少数データ/);
   for(const p of snapshots)if(p.layout){assert.ok(p.layout.width<=961);assert.deepEqual(p.layout.clipped,[],'PNG text remains inside its cells');assert.ok(p.layout.columns.every((w,i)=>Math.abs(w-snapshots[0].layout.columns[i])<1),'PNG column widths remain identical across split pages');}
   const exported=snapshots.flatMap(p=>p.cells);assert.deepEqual(exported,state.cells.map(r=>({id:r.id,text:r.text})));
   for(const p of snapshots)if(p.cells.length)assert.equal(p.headings[0],p.cells[0].id.split('/')[0],'continuation retains deck heading');
  }else assert.deepEqual(snapshots.flatMap(p=>p.items),state.articles,'summary export preserves every card without omission or duplication');
  for(let i=0;i<files.length;i++){
   const bytes=Buffer.from(files[i]),meta=await sharp(bytes).metadata();assert.equal(meta.format,'png');assert.ok(meta.width<=4096&&meta.height<=4096);
   const p=snapshots[i];assert.equal(p.buttons,0);assert.equal(p.images,true);assert.equal(p.overflow,false);await verifyPixels(bytes,p);
   if(zip)fs.writeFileSync(out+'/screenshots/'+label+'-'+i+'.png',bytes);
  }
  assert.deepEqual(await section.evaluate(e=>({articles:[...e.querySelectorAll('article')].map(e=>e.textContent.replace(/\s+/g,' ').trim()),selects:[...e.querySelectorAll('select')].map(e=>e.value),pressed:[...e.querySelectorAll('[aria-pressed]')].map(e=>e.getAttribute('aria-pressed')),cells:[...e.querySelectorAll('[data-matchup-cell]')].map(r=>({id:r.dataset.matchupCell,hidden:r.hidden,text:r.textContent})),expanded:[...e.querySelectorAll('[aria-expanded]')].map(e=>e.getAttribute('aria-expanded'))})),state);
  assert.equal(report.rpc.length,before);assert.equal(await page.locator('[data-report-png]').count(),0);
  report.exports.push({label,files:files.length,filename:download.suggestedFilename()});
 }
 // Observe exact rows and repeated headings at real PNG encoding time.
 await page.addInitScript(()=>{const original=HTMLCanvasElement.prototype.toBlob;HTMLCanvasElement.prototype.toBlob=function(...args){const result=original.apply(this,args),s=document.querySelector('[data-report-png] > section'),p=window.exportPages?.at(-1);if(s&&p){p.page=parseInt(s.querySelector('header > span')?.textContent||'1',10);p.cells=[...s.querySelectorAll('[data-matchup-cell]')].map(r=>({id:r.dataset.matchupCell,text:r.textContent}));p.headings=[...s.querySelectorAll('[data-matchup-heading]')].map(r=>r.dataset.matchupHeading);p.layout=window.matchupGeometry(s);}return result;};});
 await go();await compare();assert.ok(await matchup().locator('button[aria-expanded]').count()>1);
 assert.ok(await matchup().locator('button[aria-expanded]').evaluateAll(es=>es.every(e=>e.getAttribute('aria-expanded')==='false')));
 let before=report.rpc.length;const buttons=matchup().locator('button[aria-expanded]');await buttons.nth(0).focus();await page.keyboard.press('Enter');await buttons.nth(1).click();
 assert.equal(await matchup().locator('button[aria-expanded=true]').count(),2);await buttons.nth(0).focus();await page.keyboard.press('Space');assert.equal(await matchup().locator('button[aria-expanded=true]').count(),1);
 await buttons.nth(1).click();assert.equal(report.rpc.length,before);check('initial collapsed groups, simultaneous expansion, Enter/Space and collapse without requests');
 for(const scope of ['mine','all'])for(const mode of ['direct','combined']){
  await go('?'+new URLSearchParams({scope,winRateMode:mode}));await compare();
  const before=report.rpc.length;
  for(const sort of ['count','win-desc','win-asc'])for(const minimum of ['0','5']){await matchup().getByLabel('並び替え',{exact:true}).selectOption(sort);await matchup().getByLabel('件数フィルター',{exact:true}).selectOption(minimum);await compare();}
  const summary=region(mode==='combined'?'デッキ別サマリー（反転込み）':'使用デッキ別サマリー');
  for(const sort of ['count','win-desc','win-asc','class'])for(const minimum of [0,10]){await summary.getByLabel('並び順',{exact:true}).selectOption(sort);await summary.getByRole('button',{name:minimum===0?'全件表示':mode==='combined'?'10件以上のみ':'10戦以上のみ',exact:true}).click();await compare();}
  assert.equal(report.rpc.length,before);
 }
 check('all scope/mode combinations: exact matrix cells, counts, wins, win rates, ordering and per-pair minimum');
 await go('?myDeck='+decks[0].id);await compare();assert.equal(await matchup().locator('button[aria-expanded]').count(),0);assert.ok(await matchup().locator('[data-matchup-cell]').evaluateAll(es=>es.every(e=>!e.hidden)));await exportBlock('デッキ別対面分析','single');
 await go('?myDeckIds='+decks.slice(0,2).map(d=>d.id).join(','));await compare();assert.equal(await matchup().locator('button[aria-expanded]').count(),2);await exportBlock('デッキ別対面分析','multiple-closed');
 await go('?scope=all&winRateMode=combined');await matchup().getByLabel('件数フィルター',{exact:true}).selectOption('5');await matchup().getByLabel('並び替え',{exact:true}).selectOption('win-asc');await compare();await exportBlock('デッキ別対面分析','filtered-combined');
 await go('?'+new URLSearchParams({scope:'all',winRateMode:'combined',myDeck:decks[0].id,opponentDeck:decks[1].id,turnOrder:'second',result:'win',ranks:'master:ruby',playedFrom:'2026-10-10T00:00',playedTo:'2026-10-22T00:00'}));await compare();check('single/multiple selection, rank/date/result/turn/opponent filters and closed PNG preserve exact data');
 await go('?environment='+id(4));await compare();assert.match(await matchup().innerText(),/表示できるデータがありません/);await exportBlock('デッキ別対面分析','empty');
 await go('?myDeck='+decks[3].id);await matchup().getByLabel('件数フィルター',{exact:true}).selectOption('5');await compare();assert.match(await matchup().innerText(),/5戦以上の対面はありません/);
 // Same names must remain independent IDs, including names too long for one line.
 decks[1].name=decks[0].name;await go('?scope=all&winRateMode=direct');await compare();
 for(const width of [320,390,768,1440,1920]){
  await page.setViewportSize({width,height:1000});for(const b of await matchup().locator('button[aria-expanded]').all())if(await b.getAttribute('aria-expanded')==='false')await b.click();
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  const geometry=await matchup().evaluate(matchupGeometry),sectionBox=await matchup().boundingBox();
  assert.ok(Math.abs(geometry.width-Math.min(960,sectionBox.width-2))<1,'table uses available mobile width and caps at 960px');
  assert.ok(Math.abs(geometry.center-(sectionBox.x+sectionBox.width/2))<1,'table stays centered in its section');
  assert.deepEqual(geometry.clipped,[],'long names and numbers stay within their own cells');
  assert.equal(geometry.headingWeight,'700');assert.equal(geometry.nameWeight,'400');assert.notEqual(geometry.headingBackground,geometry.rowBackgrounds[0]);assert.notEqual(geometry.rowBackgrounds[0],geometry.rowBackgrounds[1]);
  assert.deepEqual(geometry.numeric,[{align:'right',weight:'600'},{align:'right',weight:'400'},{align:'right',weight:'400'}]);
  (report.layout??=[]).push({viewport:width,...geometry});
  assert.ok(await matchup().locator('img').evaluateAll(es=>es.filter(e=>e.getBoundingClientRect().height>0).every(e=>e.getBoundingClientRect().width>=23)),'class icons retain their size beside long names');
  await matchup().screenshot({path:out+'/screenshots/matchups-'+width+'.png'});
  await page.screenshot({path:out+'/screenshots/analysis-'+width+'.png',fullPage:true});
  if(width===320||width===390)await exportBlock('デッキ別対面分析','mobile-'+width,{mobile:true});
 }
 check('same-name IDs independent, zero-data/filter-empty states and five responsive widths');
 await page.setViewportSize({width:1440,height:1000});await exportBlock('使用デッキ別サマリー','summary-regression');
 await go('?scope=all');await require('./analysis-filter-ux.browser.cjs').openFilters(page);
 await page.locator('select[name=result]').selectOption('win');await page.locator('select[name=turnOrder]').selectOption('second');
 before=report.rpc.length;const applied=page.waitForResponse(r=>new URL(r.url()).pathname==='/api/analysis');await page.getByRole('button',{name:'表示',exact:true}).click();assert.equal((await applied).status(),200);
 await page.waitForFunction(()=>document.querySelector('form[action="/analysis"]')?.getAttribute('aria-busy')!=='true');assert.equal(report.rpc.length,before+1);await compare();
 check('redundant winrate section/button removed in both modes; summary values and all summary orders/filters retained; analysis filters apply normally');
 fixtures(true);
 await go('?scope=all&winRateMode=combined');await compare();await exportBlock('デッキ別サマリー（反転込み）','summary-zip',{zip:true});
 await page.setViewportSize({width:390,height:844});await exportBlock('デッキ別サマリー（反転込み）','summary-mobile-zip',{zip:true,mobile:true});await page.setViewportSize({width:1440,height:1000});
 // One deck spans several pages; other groups exercise boundaries and heading repetition.
 records.push(...decks.flatMap((d,i)=>Array.from({length:5},(_,j)=>({id:id(90000+i*5+j),user_id:owner,environment_id:envId,my_deck_id:decks[0].id,opponent_deck_id:d.id,my_archetype_id:decks[0].id,opponent_archetype_id:d.id,result:j%2?'win':'lose',turn_order:'first',played_at:'2026-10-20T00:00:00Z',rank_tier:'master',master_group:'ruby'}))));
 await go('?scope=all');await compare();await exportBlock('デッキ別対面分析','large-closed',{zip:true});
 await go('?scope=all&myDeck='+decks[0].id);await matchup().getByLabel('件数フィルター',{exact:true}).selectOption('5');await compare();await exportBlock('デッキ別対面分析','large-single',{zip:true});
 await page.setViewportSize({width:390,height:844});await exportBlock('デッキ別対面分析','mobile-zip',{zip:true,mobile:true});
 // File sharing boundary is simulated; the generated PNG itself is real.
 await page.evaluate(()=>{Object.defineProperty(navigator,'canShare',{configurable:true,value:()=>true});Object.defineProperty(navigator,'share',{configurable:true,value:async({files})=>{window.sharedFiles=files.map(f=>({type:f.type,size:f.size}));}});});
 await matchup().getByRole('button',{name:/をPNG保存$/}).click();const dialog=page.getByRole('dialog',{name:'分析画像の保存'});await dialog.getByRole('button',{name:'この画像を共有・保存',exact:true}).click();assert.ok(await page.evaluate(()=>window.sharedFiles?.every(f=>f.type==='image/png'&&f.size>1000)));await dialog.getByRole('button',{name:'閉じる',exact:true}).click();
 check('real PNG/ZIP: all closed rows, repeated deck headings, no missing/duplicate cells, icons, filter/sort, unchanged UI and zero extra RPC; mobile download and sharing');
 assert.deepEqual(report.errors,[]);assert.deepEqual(report.unexpected,[]);report.passed=true;
 }finally{if(page&&!report.passed)await page.screenshot({path:out+'/screenshots/failure.png',fullPage:true}).catch(()=>{});await browser?.close();app.kill();api.close();fs.closeSync(fd);}
})().catch(e=>{report.passed=false;report.failure=e.stack;process.exitCode=1;}).finally(()=>{fs.writeFileSync(out+'/report.json',JSON.stringify(report,null,2));console.log(JSON.stringify({passed:report.passed,checks:report.checks.length,exports:report.exports.length,failure:report.failure}));});
