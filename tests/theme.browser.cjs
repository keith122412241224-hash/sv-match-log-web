/* eslint-disable @typescript-eslint/no-require-imports */
// Local synthetic HTTP boundary only. No database, real credentials or remote writes.
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict'),cp=require('node:child_process');
const nativeFetch=fetch;require('./register.cjs');globalThis.fetch=nativeFetch;
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright'),sharp=require('sharp');
const f=require('./environment-dashboard-v4-fixture.cjs'),{analysisFixture}=require('./analysis-browser-fixture.cjs'),{aggregates}=require('./obs-matchups-fixture.cjs');
const {periodFixture}=require('./period-report-fixture.cjs');
const origin='http://localhost:3397',out=path.resolve(process.env.THEME_OUTPUT||'build/theme'),environments=f.environments,decks=f.decks;
const user={id:f.id(90),aud:'authenticated',role:'authenticated',is_anonymous:false,email:'synthetic@example.test',app_metadata:{},user_metadata:{}};
const records=Array.from({length:60},(_,i)=>({id:f.id(100+i),user_id:user.id,environment_id:environments[0].id,my_deck_id:decks[i%6].id,opponent_deck_id:decks[(i+1)%6].id,my_archetype_id:decks[i%6].id,opponent_archetype_id:decks[(i+1)%6].id,result:i%3?'win':'lose',turn_order:i%2?'first':'second',played_at:'2026-10-02T01:00:00Z',rank_tier:null}));
if(process.env.THEME_ZIP_ONLY){
  for(let i=0;i<35;i++){
    const deck={...decks[i%6],id:f.id(1000+i),name:`ZIP検証デッキ${i+1}`};decks.push(deck);
    records.push({...records[i],id:f.id(2000+i),my_deck_id:deck.id,my_archetype_id:deck.id});
  }
}
const {newTierDocument}=require('../src/lib/creator/model'),{newCorrelationDocument}=require('../src/lib/creator/correlation');
const images=decks.slice(0,2).map((d,i)=>({id:f.id(200+i),name:d.name,object_path:`fixture-${i}.png`,archetype_id:d.id,revision:1,created_at:'2026-10-02T00:00:00Z',updated_at:'2026-10-02T00:00:00Z'}));
const tier={id:f.id(300),document:newTierDocument(),revision:1,updated_at:'2026-10-02T00:00:00Z'};tier.document.title='テーマ検証Tier';tier.document.rows[0].imageIds=[images[0].id];tier.document.rows[1].imageIds=[images[1].id];
const graph={id:f.id(301),tier_work_id:null,document:newCorrelationDocument(),revision:1,created_at:tier.updated_at,updated_at:tier.updated_at};graph.document.title='テーマ検証相関図';graph.document.nodes=images.map((image,i)=>({id:f.id(400+i),imageId:image.id,x:200+i*650,y:300,width:240,height:276}));graph.document.edges=[{id:f.id(500),sourceNodeId:f.id(400),targetNodeId:f.id(401),origin:'manual',label:'有利',visible:true,type:'forward',winRate:65,matchCount:40,dataSource:'manual'}];
const report={checks:[],screenshots:[],errors:[],apiErrors:[],png:[],passed:false};let sprite;
function trends(a){return {version:1,environmentId:a.p_environment_id,period:a.p_period,rankFilters:a.p_rank_filters,aggregatedAt:'2026-10-03T03:12:00Z',dataThrough:'2026-10-03T03:00:00Z',decks:decks.filter(d=>a.p_deck_ids.includes(d.id)).map((d,i)=>({id:d.id,name:d.name,className:d.class_name,points:[1,2,3].map(day=>({date:`2026-10-0${day}`,total:100,encounters:20+i*5+day,registrations:30,evaluations:35,wins:15+day}))}))};}
const api=http.createServer(async(req,res)=>{try{
  const u=new URL(req.url,'http://127.0.0.1:54339'),table=u.pathname.split('/').at(-1);let body='';for await(const x of req)body+=x;const a=body?JSON.parse(body):{};let data;
  if(u.pathname.startsWith('/storage/v1/object/')){res.writeHead(200,{'Content-Type':'image/png'});res.end(sprite);return;}
  if(u.pathname==='/auth/v1/user')data=user;
  else if(u.pathname.includes('/rpc/')){
    if(table==='get_home_dashboard')data={summary:{total:60,wins:40,winRate:66.7,firstWinRate:60,secondWinRate:70},recent:[]};
    else if(table.startsWith('get_period_report_aggregates'))data=periodFixture(records,a);
    else if(table==='get_environment_dashboard_aggregates_v4')data=f.dashboard(a);
    else if(table==='get_environment_trend_aggregates_v1')data=trends(a);
    else if(table==='get_analysis_aggregates_v3_exclusive')data=aggregates();
    else if(table.startsWith('get_analysis_aggregates'))data=analysisFixture(records,a);
    else if(table.startsWith('get_member_matchup_aggregates')||table.startsWith('get_matchup_aggregates')){data={version:1,totalMatches:360,groups:decks.flatMap((d,i)=>decks.map((o,j)=>({myDeckId:d.id,opponentDeckId:o.id,total:10,wins:(i+j)%10})))};}
    else throw Error('Unexpected RPC '+table);
  }else if(req.method==='PATCH'&&['creator_tier_works','creator_correlations'].includes(table)){
    // Save only to these in-memory fixtures; no database exists in this test.
    const item=table==='creator_tier_works'?tier:graph;assert.equal(u.searchParams.get('id'),'eq.'+item.id);item.document=a.document;item.revision++;data=item;
  }else if(!['GET','HEAD'].includes(req.method))throw Error('Unexpected mutation '+table);
  else if(table==='admin_users')data={id:f.id(91),user_id:user.id};
  else if(table==='environments')data=environments;
  else if(['decks','deck_archetypes'].includes(table))data=u.searchParams.has('id')&&u.searchParams.get('id').startsWith('gt.')?[]:decks;
  else if(table==='matches')data=[];
  else if(['deck_suggestions','my_decks','creator_obs_sets'].includes(table))data=[];
  else if(table==='creator_images')data=u.searchParams.has('or')?[]:u.searchParams.get('id')?.startsWith('eq.')?images.find(i=>i.id===u.searchParams.get('id').slice(3)):images;
  else if(table==='creator_tier_works')data=u.searchParams.has('or')?[]:u.searchParams.has('id')?tier:[{...tier,title:tier.document.title}];
  else if(table==='creator_correlations')data=u.searchParams.has('or')?[]:u.searchParams.has('tier_work_id')?null:u.searchParams.has('id')?graph:[{...graph,title:graph.document.title}];
  else throw Error('Unexpected table '+table);
  res.writeHead(200,{'Content-Type':'application/json'});res.end(JSON.stringify(data));
}catch(e){report.apiErrors.push(e.message);res.writeHead(500);res.end('{}');}});

async function main(){
  fs.mkdirSync(out,{recursive:true});sprite=await sharp({create:{width:160,height:120,channels:4,background:'#349b88'}}).composite([{input:Buffer.from('<svg width="160" height="120"><circle cx="80" cy="55" r="38" fill="#fbd76b"/><path d="M20 105L80 30L140 105Z" fill="#193951"/></svg>')}]).png().toBuffer();
  await new Promise(r=>api.listen(54339,'127.0.0.1',r));
  const log=fs.openSync(path.join(out,'server.log'),'w');
  const app=cp.spawn(process.execPath,[require.resolve('next/dist/bin/next'),'start','-p','3397'],{windowsHide:true,stdio:['ignore',log,log],env:{...process.env,NEXT_PUBLIC_SUPABASE_URL:'http://127.0.0.1:54339',NEXT_PUBLIC_SUPABASE_ANON_KEY:'theme-fixture',NEXT_TELEMETRY_DISABLED:'1'}});
  let browser;
  try{
    let ready=false;for(let i=0;i<100;i++){try{if((await fetch(origin+'/privacy')).ok){ready=true;break;}}catch{}await new Promise(r=>setTimeout(r,200));}assert(ready);
    browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_EXECUTABLE||'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'});
    const context=await browser.newContext({viewport:{width:1440,height:1000},timezoneId:'Asia/Tokyo',colorScheme:'dark'});
    await context.route('**/*',route=>{const u=new URL(route.request().url());return ['localhost','127.0.0.1'].includes(u.hostname)||['data:','blob:'].includes(u.protocol)?route.continue():route.abort();});
    const page=await context.newPage();page.on('pageerror',e=>report.errors.push(e.message));page.on('dialog',d=>d.accept());
    const go=p=>page.goto(origin+p,{waitUntil:'networkidle'}),mode=()=>page.locator('html').getAttribute('data-theme');
    const choose=async value=>{await page.getByRole('combobox',{name:'表示テーマ',exact:true}).selectOption(value);assert.equal(await mode(),value==='system'?'dark':value);};
    const shot=async name=>{await page.screenshot({path:path.join(out,name+'.png'),fullPage:true});report.screenshots.push(name);};
    const overflow=async label=>assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),label+' overflow');
    if(!process.env.THEME_SKIP_PUBLIC){await go('/login');assert.equal(await mode(),'light');await choose('dark');await page.evaluate(()=>window.themeDocumentMarker=1);await choose('light');assert.equal(await page.evaluate(()=>window.themeDocumentMarker),1);await choose('system');await page.emulateMedia({colorScheme:'light'});await page.waitForFunction(()=>document.documentElement.dataset.theme==='light');assert.equal(await mode(),'light');await page.emulateMedia({colorScheme:'dark'});await page.waitForFunction(()=>document.documentElement.dataset.theme==='dark');assert.equal(await mode(),'dark');await page.reload({waitUntil:'networkidle'});assert.equal(await mode(),'dark');
    await page.getByRole('link',{name:'プライバシーポリシー',exact:true}).click();await page.waitForURL('**/privacy');assert.equal(await mode(),'dark');
    report.checks.push('OS dark starts light; all 3 choices; no reload; live OS changes; reload and client navigation persistence');
    for(const width of [1440,768,390,320]){await page.setViewportSize({width,height:1000});for(const route of ['/','/login','/guide','/guest']){await go(route);for(const theme of ['light','dark']){await choose(theme);await overflow(route);await shot(`public-${route==='/'?'home':route.slice(1)}-${width}-${theme}`);}}}
    }
    const exp=Math.floor(Date.now()/1000)+3600,session={access_token:['eyJhbGciOiJIUzI1NiJ9',Buffer.from(JSON.stringify({sub:user.id,exp})).toString('base64url'),'fixture'].join('.'),refresh_token:'fixture',expires_at:exp,expires_in:3600,token_type:'bearer',user};
    await context.addCookies([{name:'sb-127-auth-token',value:'base64-'+Buffer.from(JSON.stringify(session)).toString('base64url'),url:origin}]);
    if(process.env.THEME_LIGHT_ONLY){
      const captures=[];
      for(const width of [1440,390]){
        await page.setViewportSize({width,height:1000});
        for(const route of ['/','/matches','/decks','/analysis?scope=all','/environment','/matrix','/admin?section=tools',`/admin/creator/tier?work=${tier.id}`,`/admin/creator/correlation/${graph.id}`]){
          await go(route);if(!process.env.THEME_BASELINE)await choose('light');
          const controls=await page.locator('main').evaluateAll(roots=>roots.flatMap(root=>Array.from(root.querySelectorAll('input,textarea,select,button,table,h1,h2,article')).filter(e=>e.getAttribute('aria-label')!=='表示テーマ').map(e=>{
            const s=getComputedStyle(e),r=e.getBoundingClientRect();
            // Chromium's transformed artwork bounds can differ by ~0.00003px.
            // Compare dimensions at its 1/64 CSS-pixel layout precision.
            return {tag:e.tagName,label:e.getAttribute('aria-label'),type:e.getAttribute('type'),text:e.tagName==='BUTTON'?e.textContent:null,color:s.color,background:s.backgroundColor,border:s.borderColor,font:s.font,fontSize:s.fontSize,width:Math.round(r.width*64)/64,height:Math.round(r.height*64)/64};
          })));
          assert(controls.length>0,route+' main controls');captures.push({width,route,controls});
        }
      }
      const file=path.join(out,'light-controls-current.json');
      if(process.env.THEME_BASELINE)assert.deepEqual(captures,JSON.parse(fs.readFileSync(file,'utf8')),'all main controls retain light colors, fonts, dimensions and labels');
      else fs.writeFileSync(file,JSON.stringify(captures,null,2));
      assert.deepEqual(report.errors,[]);assert.deepEqual(report.apiErrors,[]);report.checks.push(process.env.THEME_BASELINE?'9 pages × 2 widths: light main controls match original colors, typography, dimensions and button labels':'light control style/layout baseline captured for 9 pages × 2 widths');report.passed=true;return;
    }
    if(process.env.THEME_ZIP_ONLY){
      const {unzipSync}=require('fflate'),archives=[];
      for(const theme of (process.env.THEME_BASELINE?['baseline']:['light','dark'])){
        await go('/analysis?scope=all');if(!process.env.THEME_BASELINE)await choose(theme);
        assert(await page.locator('article').count()>32,'fixture must exercise real multi-page pagination');
        const pending=page.waitForEvent('download');await page.getByRole('button',{name:/PNG保存/}).first().click();
        const download=await pending;assert.match(download.suggestedFilename(),/\.zip$/);
        const file=path.join(out,`analysis-multipage-${theme}.zip`);await download.saveAs(file);
        const entries=unzipSync(fs.readFileSync(file)),names=Object.keys(entries).sort();assert(names.length>1);
        const pixels=[];for(const name of names){assert.match(name,/-part-\d+-of-\d+\.png$/);const {data,info}=await sharp(Buffer.from(entries[name])).ensureAlpha().raw().toBuffer({resolveWithObject:true});assert(info.width>0&&info.height>0);pixels.push({width:info.width,height:info.height,data});}
        archives.push(pixels);report.checks.push(`${theme} ZIP: ${names.length} decodable PNG pages, filenames/page numbering preserved`);
        if(!process.env.THEME_BASELINE)assert.equal(await mode(),theme);
      }
      if(process.env.THEME_BASELINE){
        const entries=unzipSync(fs.readFileSync(path.join(out,'analysis-multipage-light.zip'))),pixels=[];
        for(const name of Object.keys(entries).sort()){const {data,info}=await sharp(Buffer.from(entries[name])).ensureAlpha().raw().toBuffer({resolveWithObject:true});pixels.push({width:info.width,height:info.height,data});}archives.push(pixels);
      }
      assert.deepEqual(archives[0],archives[1],'every ZIP page must retain dimensions and exact pixels');
      assert.deepEqual(report.errors,[]);assert.deepEqual(report.apiErrors,[]);report.checks.push(process.env.THEME_BASELINE?'ZIP pages pixel-identical to original build':'ZIP pages pixel-identical across light/dark');report.passed=true;return;
    }
    if(!process.env.THEME_EXTRA_ONLY){
    if(!process.env.THEME_TRENDS_ONLY){
    if(!process.env.THEME_EXPORT_ONLY)for(const width of [1440,390,320]){await page.setViewportSize({width,height:1000});for(const route of ['/','/matches','/decks','/analysis?scope=all','/environment','/matrix','/admin?section=tools',`/admin/creator/tier?work=${tier.id}`,`/admin/creator/correlation/${graph.id}`]){
      await go(route);assert.equal(await page.getByRole('combobox',{name:'表示テーマ',exact:true}).count(),1,route+' theme control');
      for(const theme of ['light','dark']){await choose(theme);await overflow(route);await shot(`member-${route.split('?')[0].replaceAll('/','_')||'home'}-${width}-${theme}`);}
    }}
    if(!process.env.THEME_EXPORT_ONLY)report.checks.push('member/admin/creator pages at desktop/mobile widths, light and dark screenshots, no horizontal page overflow');
    await page.setViewportSize({width:1440,height:1000});
    async function exportPair(route,button,name){await go(route);const buffers=[];for(const theme of (process.env.THEME_BASELINE?['baseline']:['light','dark'])){if(!process.env.THEME_BASELINE)await choose(theme);const pending=page.waitForEvent('download');await button().click();const download=await pending,file=path.join(out,`${name}-${theme}.png`);await download.saveAs(file);const {data,info}=await sharp(file).ensureAlpha().raw().toBuffer({resolveWithObject:true});buffers.push(data);assert(info.width>0&&info.height>0);if(!process.env.THEME_BASELINE)assert.equal(await mode(),theme);report.png.push({name,theme,width:info.width,height:info.height});}if(process.env.THEME_BASELINE){const candidate=await sharp(path.join(out,`${name}-light.png`)).ensureAlpha().raw().toBuffer();assert(buffers[0].equals(candidate),name+' original and candidate PNG pixels');}else assert(buffers[0].equals(buffers[1]),name+' PNG pixels must be identical across themes');}
    await exportPair('/matrix',()=>page.getByRole('button',{name:/PNG保存/}),'matrix');
    await exportPair('/admin/weekly-report?start=2026-10-01&end=2026-10-03',()=>page.getByRole('button',{name:'PNG',exact:true}).first(),'environment-report');
    await exportPair('/analysis?scope=all',()=>page.getByRole('button',{name:/PNG保存/}).first(),'analysis');
    await exportPair(`/admin/creator/tier?work=${tier.id}`,()=>page.getByRole('button',{name:'PNG出力',exact:true}),'tier');
    await exportPair(`/admin/creator/correlation/${graph.id}`,()=>page.getByRole('button',{name:'相関図PNG',exact:true}),'correlation');
    report.checks.push(process.env.THEME_BASELINE?'matrix/analysis/environment report/Tier/correlation: decoded PNG pixels identical to the original build':'matrix/analysis/environment report/Tier/correlation real PNG downloads: identical decoded pixels in light/dark; source theme unchanged');
    if(process.env.THEME_BASELINE){
      for(const route of ['/admin/obs/environment',`/admin/obs/tier/${tier.id}`,`/admin/obs/tier/${tier.id}?transparent=1`,`/admin/obs/correlation-work/${graph.id}`]){
        await go(route);const name='obs-'+route.replaceAll('/','_').replace('?','_'),file=path.join(out,name+'-baseline.png');await page.screenshot({path:file,fullPage:true});
        const before=await sharp(file).ensureAlpha().raw().toBuffer(),after=await sharp(path.join(out,name+'.png')).ensureAlpha().raw().toBuffer();assert(before.equals(after),name+' OBS pixels must be unchanged');
      }report.checks.push('environment/Tier/transparent Tier/correlation OBS screenshots pixel-identical to original build');report.passed=true;return;
    }
    if(process.env.THEME_EXPORT_ONLY){report.passed=true;return;}
    for(const route of ['/admin/obs/environment',`/admin/obs/tier/${tier.id}`,`/admin/obs/tier/${tier.id}?transparent=1`,`/admin/obs/correlation-work/${graph.id}`]){await go('/login');await choose('dark');await go(route);assert.equal(await mode(),'light');assert.equal(await page.getByRole('combobox',{name:'表示テーマ'}).count(),0);await shot('obs-'+route.replaceAll('/','_').replace('?','_'));if(route.includes('transparent'))assert.equal(await page.evaluate(()=>getComputedStyle(document.body).backgroundColor),'rgba(0, 0, 0, 0)');}
    report.checks.push('OBS dark preference excluded; controls absent; transparent background retained');
    }
    await go('/environment');await page.getByRole('tab',{name:'推移分析'}).click();await page.getByRole('button',{name:/^デッキ選択/}).click();await page.getByRole('button',{name:'すべて選択',exact:true}).click();await page.getByRole('button',{name:'決定',exact:true}).click();await page.locator('[data-trend-deck]').first().waitFor();
    for(const theme of ['light','dark']){await choose(theme);await page.getByRole('group',{name:/推移グラフ/}).focus();await page.keyboard.press('Home');await shot('trends-'+theme);const fill=await page.locator('[data-trend-deck]').first().evaluate(e=>getComputedStyle(e).stroke);assert(!fill.includes('var('));assert.equal(await page.getByRole('list',{name:'選択済みデッキ・凡例'}).locator('li span').first().evaluate(e=>getComputedStyle(e).backgroundColor),fill);}
    await page.getByRole('button',{name:'勝率の推移',exact:true}).click();await shot('trends-winrate-dark');report.checks.push('trend lines/axes/legend/details, keyboard date selection and metric switching');
    if(process.env.THEME_TRENDS_ONLY){report.passed=true;return;}
    await go('/login');await choose('dark');const other=await context.newPage();await other.goto(origin+'/login');await other.getByRole('combobox',{name:'表示テーマ'}).selectOption('light');await page.waitForFunction(()=>document.documentElement.dataset.theme==='light');await other.close();report.checks.push('cross-tab preference synchronization');
    const blocked=await browser.newContext();await blocked.addInitScript(()=>{Storage.prototype.getItem=()=>{throw Error('denied')};Storage.prototype.setItem=()=>{throw Error('denied')};});const b=await blocked.newPage();await b.goto(origin+'/login');await b.getByRole('combobox',{name:'表示テーマ'}).selectOption('dark');assert.equal(await b.locator('html').getAttribute('data-theme'),'dark');await blocked.close();report.checks.push('blocked browser storage: switch remains usable');
    }
    if(process.env.THEME_EXTRA_ONLY){
      await go('/guest');await page.getByRole('button',{name:'戦績入力',exact:true}).click();
      await page.getByRole('button',{name:'後攻',exact:true}).click();await page.getByRole('button',{name:'負け',exact:true}).click();
      for(const theme of ['light','dark','system']){await choose(theme);assert.equal(await page.locator('input[name="turn_order"]').inputValue(),'second');assert.equal(await page.locator('input[name="result"]').inputValue(),'lose');}
      await page.getByRole('button',{name:'入力を試す',exact:true}).click();
      await page.waitForFunction(()=>JSON.parse(localStorage.getItem('svml:guest-matches:v1')||'[]').length===1);
      const saved=await page.evaluate(()=>localStorage.getItem('svml:guest-matches:v1'));await page.reload({waitUntil:'networkidle'});
      assert.equal(await mode(),'dark');assert.equal(await page.evaluate(()=>localStorage.getItem('svml:guest-matches:v1')),saved);
      report.checks.push('guest unsaved turn/result preserved across all themes; guest input saves locally and survives reload with system theme');
      const pre=await browser.newContext({colorScheme:'light'});await pre.addInitScript(()=>localStorage.setItem('svml.theme.v1','dark'));await pre.route('**/*.js',r=>r.abort());const first=await pre.newPage();await first.goto(origin+'/login',{waitUntil:'domcontentloaded'});assert.equal(await first.locator('html').getAttribute('data-theme'),'dark');assert.equal(await first.locator('body').evaluate(e=>getComputedStyle(e).backgroundColor),'rgb(23, 26, 33)');await first.screenshot({path:path.join(out,'dark-before-hydration.png')});await pre.close();report.checks.push('saved dark palette applied with all hydration bundles blocked, before React runs');
      await go('/matrix?scope=mine');await choose('dark');await page.screenshot({path:path.join(out,'matrix-bands-dark.png'),fullPage:true});
      await page.evaluate(()=>{window.originalEncoder=HTMLCanvasElement.prototype.toDataURL;HTMLCanvasElement.prototype.toDataURL=()=>{throw Error('fixture encoding failure')};});await page.getByRole('button',{name:/PNG保存/}).click();await page.getByRole('alert').filter({hasText:'PNGを保存できませんでした'}).waitFor();assert.equal(await mode(),'dark');assert.equal(await page.locator('body > div[aria-hidden="true"][data-theme="light"]').count(),0);await page.evaluate(()=>{HTMLCanvasElement.prototype.toDataURL=window.originalEncoder});report.checks.push('PNG failure cleans up isolated snapshot and preserves dark screen');
      await page.setViewportSize({width:390,height:844});await page.getByRole('button',{name:/PNG保存/}).click();const preview=page.getByRole('dialog');await preview.waitFor();await preview.locator('img').evaluate(img=>img.decode());await shot('mobile-png-dialog-dark');assert.equal(await preview.evaluate(e=>getComputedStyle(e).backgroundColor),'rgb(34, 39, 49)');await preview.getByRole('button',{name:'閉じる',exact:true}).click();
      await go('/matches');await choose('dark');await page.getByRole('button',{name:/使用デッキ/}).first().click();await page.getByRole('dialog').waitFor();await shot('mobile-deck-dialog-dark');await page.keyboard.press('Escape');report.checks.push('mobile PNG preview and deck selector dialogs retain readable dark controls and light exported image');
      await page.setViewportSize({width:1440,height:1000});await go(`/admin/creator/tier?work=${tier.id}`);await choose('dark');await page.getByLabel('1行目のTier名',{exact:true}).fill('S+');await page.getByLabel('作品タイトル',{exact:true}).fill('ダーク編集確認');const source=page.getByRole('button',{name:images[1].name+'を選択',exact:true});await source.dragTo(page.getByRole('region',{name:'Tier S+',exact:true}));await page.getByRole('button',{name:'Tier表を保存',exact:true}).click();await page.getByRole('status').filter({hasText:'Tier表を保存しました'}).waitFor();assert.equal(tier.document.rows[0].imageIds.length,2);await page.reload({waitUntil:'networkidle'});assert.equal(await page.getByLabel('作品タイトル',{exact:true}).inputValue(),'ダーク編集確認');assert.equal(await mode(),'dark');
      await go(`/admin/creator/correlation/${graph.id}`);await page.getByLabel('選択ノード',{exact:true}).selectOption(graph.document.nodes[0].id);const previous=graph.document.nodes[0].x;await page.locator(`[data-node-id="${graph.document.nodes[0].id}"]`).focus();await page.keyboard.press('Shift+ArrowRight');await page.getByRole('button',{name:'相関図を保存',exact:true}).click();await page.getByRole('status').filter({hasText:'相関図を保存しました'}).waitFor();assert.equal(graph.document.nodes[0].x,previous+10);await page.reload({waitUntil:'networkidle'});assert.equal(await mode(),'dark');report.checks.push('Tier rename, image drag placement, save/reload and correlation keyboard positioning/save/reload through real local API with in-memory HTTP persistence');
    }
    assert.deepEqual(report.errors,[]);assert.deepEqual(report.apiErrors,[]);report.passed=true;
  }finally{if(browser)await browser.close();app.kill();api.close();fs.closeSync(log);fs.writeFileSync(path.join(out,process.env.THEME_LIGHT_ONLY?(process.env.THEME_BASELINE?'light-baseline-report.json':'light-report.json'):process.env.THEME_ZIP_ONLY?(process.env.THEME_BASELINE?'zip-baseline-report.json':'zip-report.json'):process.env.THEME_BASELINE?'baseline-report.json':process.env.THEME_TRENDS_ONLY?'trends-report.json':process.env.THEME_EXTRA_ONLY?'extra-report.json':process.env.THEME_EXPORT_ONLY?'export-report.json':'report.json'),JSON.stringify(report,null,2));}
}
main().catch(e=>{console.error(e);process.exitCode=1;});
