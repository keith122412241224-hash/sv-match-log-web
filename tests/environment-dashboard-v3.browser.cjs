/* eslint-disable @typescript-eslint/no-require-imports */
// Built app -> actual local Auth/PostgREST -> v3 -> strict parser -> responsive UI.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {assertEnvironmentCache}=require('./environment-cache-contract.cjs');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const out=path.resolve('build/ux-evidence'),origin='http://localhost:3286';
const saved=JSON.parse(fs.readFileSync(out+'/sessions.json','utf8'));
const state={cookies:[{name:'sb-127-auth-token',value:'base64-'+Buffer.from(JSON.stringify(saved.sessions[0])).toString('base64url'),domain:'localhost',path:'/',expires:-1,httpOnly:false,secure:false,sameSite:'Lax'}],origins:[]};
fs.writeFileSync(out+'/browser-state.json',JSON.stringify(state));
if(process.argv.includes('--state-only'))process.exit(0);
const report={checks:[],errors:[],requests:[]};
(async()=>{const browser=await chromium.launch({headless:true,...(process.env.CHROME_EXECUTABLE?{executablePath:process.env.CHROME_EXECUTABLE}:{})});try{
 const context=await browser.newContext({storageState:state});
 // Make accidental remote data access fail immediately.
 await context.route('**/*',async route=>{const u=new URL(route.request().url());if(!['localhost','127.0.0.1'].includes(u.hostname)&&!['data:','blob:'].includes(u.protocol))throw Error('Non-local request: '+u.origin);await route.continue();});
 const page=await context.newPage();page.on('pageerror',e=>report.errors.push(e.message));page.on('console',m=>{if(m.type()==='error')report.errors.push(m.text());});page.on('request',r=>{if(r.url().includes('/api/environment'))report.requests.push(new URL(r.url()).pathname+new URL(r.url()).search);});
 const section=name=>page.locator('section').filter({has:page.getByRole('heading',{name,exact:true})});
 const go=async(env,period='24h')=>{await page.goto(origin+'/environment?'+new URLSearchParams({environment:env,period,rank:'all'}),{waitUntil:'networkidle'});await page.getByRole('heading',{name:'環境データ',exact:true}).waitFor();assert.equal(await page.getByRole('alert').filter({hasText:'取得できませんでした'}).count(),0);};
 for(const width of [320,390,768,1365]){
  await page.setViewportSize({width,height:1000});await go(saved.env.single);
  assert.ok((await page.innerText('body')).includes('登録戦績：1件'));
  const deck=section('デッキ別データ');assert.equal(await deck.locator(width>=1024?'tbody tr':'article').count(),1);
  assert.ok((await deck.innerText()).includes('50.0%'));assert.ok((await deck.innerText()).includes(width>=1024?'2件':'勝率集計2件・対象戦績1件'));
  assert.equal(await section('遭遇率TOP5').locator('li').count(),1);assert.equal(await section('勝率TOP5').locator('li').count(),0);
  assert.equal(await deck.locator('details').getAttribute('open'),null);
  assert.ok(!/参考|サンプル不足|非表示|評価件数|対象登録件数|PRIVATE/.test(await page.innerText('body')));
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'horizontal overflow');
  await page.screenshot({path:out+`/single-${width}.png`,fullPage:true});
  await deck.getByText('集計について',{exact:true}).click();assert.notEqual(await deck.locator('details').getAttribute('open'),null);assert.ok((await deck.innerText()).includes('ミラーマッチも1戦'));await deck.getByText('集計について',{exact:true}).click();
  report.checks.push(`single registration / 50% mirror / no labels / collapsed help / no overflow: ${width}px`);
 }
 await go(saved.env.one);const deck=section('デッキ別データ');assert.equal(await deck.locator('tbody tr').count(),2);const own=deck.locator('tbody tr').filter({hasText:'Shared A'});assert.ok((await own.innerText()).includes('0.0%'));assert.ok((await own.innerText()).includes('0件 / 登録4件'));assert.equal(await deck.getByText('Shared empty',{exact:true}).count(),0);report.checks.push('own-only remains 0 encounters / 4 targets; unobserved, inactive, unclassified hidden');
 await page.screenshot({path:out+'/own-only-1365.png',fullPage:true});
 await go(saved.env.three);assert.equal(await section('勝率TOP5').locator('li').count(),2);assert.ok((await section('勝率TOP5').innerText()).includes('勝率集計12件・対象戦績12件'));report.checks.push('10+ ranking counts without reference badge');
 await go(saved.env.empty);assert.ok((await page.innerText('body')).includes('この期間に対象戦績のあるデッキがありません。'));assert.equal(await section('デッキ別データ').locator('tbody tr').count(),0);report.checks.push('zero-data empty state');
 await go(saved.env.single);const before=report.requests.length;await page.getByText('3日',{exact:true}).click();await page.getByText('環境データを読み込み中…').waitFor({state:'hidden'});await page.waitForLoadState('networkidle');assert.equal(report.requests.length-before,1);assert.ok(page.url().includes('period=3d'));assert.ok((await page.innerText('body')).includes('登録戦績：1件'));report.checks.push('period change loads v3 API once and renders one-registration payload');
 const api=await context.request.get(origin+'/api/environment?'+new URLSearchParams({environment:saved.env.single,period:'24h',ranks:'a'}));assert.equal(api.status(),200);const json=await api.json();assert.equal(json.version,3);assert.equal(json.current.total.totalMatches,1);assertEnvironmentCache(api.headers());report.checks.push('authenticated app API -> real RPC v3, rank selection and private no-store');
 const unsigned=await browser.newContext();const guestPage=await unsigned.newPage();await guestPage.goto(origin+'/environment');assert.ok(guestPage.url().includes('/login'));assert.equal((await unsigned.request.get(origin+'/api/environment?'+new URLSearchParams({environment:saved.env.single,period:'24h',rank:'all'}))).status(),401);await unsigned.close();report.checks.push('unsigned page redirects and API returns 401');
 assert.deepEqual(report.errors,[]);await context.close();fs.writeFileSync(out+'/browser.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
}finally{await browser.close();}})().catch(e=>{console.error(e.stack);process.exitCode=1;});
