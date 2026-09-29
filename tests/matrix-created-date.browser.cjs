/* eslint-disable @typescript-eslint/no-require-imports */
const http = require('node:http'), fs = require('node:fs'), path = require('node:path');
const assert = require('node:assert/strict');
const {spawn} = require('node:child_process');
const {chromium} = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const origin = 'http://localhost:3288';
const output = path.resolve('build/matrix-created-date-proof');
const appDir = process.env.MATRIX_APP_DIR || process.cwd();
const reproduction = process.env.MATRIX_EXPECT_MISMATCH === '1';
const user = {id:'fixture-owner',aud:'authenticated',role:'authenticated',email:'fixture@example.test',app_metadata:{},user_metadata:{}};
const decks = [{id:'A',name:'Deck A',class_name:'エルフ'},{id:'B',name:'Deck B',class_name:'ロイヤル'}];
let rawReads = 0;
const calls = [], writes = [];
const api = http.createServer(async(req,res) => {
  res.setHeader('Content-Type','application/json');
  const url = new URL(req.url,'http://127.0.0.1:54329');
  let data;
  if (req.method === 'POST' && url.pathname.includes('/rpc/get_matchup_aggregates_v')) {
    let body = ''; for await (const chunk of req) body += chunk;
    const args = JSON.parse(body); calls.push(args);
    data = {version:1,totalMatches:args.p_include_all_users?4:2,groups:[{myDeckId:'A',opponentDeckId:'B',total:args.p_include_all_users?4:2,wins:1}]};
  } else if (req.method === 'POST' && url.pathname.endsWith('/rpc/get_home_dashboard')) {
    data = {summary:{total:0,wins:0,winRate:null,firstWinRate:null,secondWinRate:null},recent:[]};
  } else if (!['GET','HEAD'].includes(req.method)) {
    writes.push(url.pathname);res.writeHead(405);data = {};
  } else if (url.pathname === '/auth/v1/user') data = user;
  else if (url.pathname.endsWith('/admin_users')) data = {id:'fixture-admin'};
  else if (url.pathname.endsWith('/environments')) data = [{id:'environment',name:'Fixture',created_at:'2026-09-20',allow_match_input:true}];
  else if (url.pathname.endsWith('/matches')) {rawReads++;data=[];}
  else data = decks;
  res.end(JSON.stringify(data));
});
const delay = ms => new Promise(r=>setTimeout(r,ms));
(async()=>{
  fs.mkdirSync(output,{recursive:true});
  const clockFile = path.join(output,'clock.txt');
  await new Promise(r=>api.listen(54329,'127.0.0.1',r));
  const browser = await chromium.launch({headless:true,...(process.env.CHROME_EXECUTABLE?{executablePath:process.env.CHROME_EXECUTABLE}:{})});
  const cases = reproduction ? [['2026-09-26T15:30:00.000Z','2026-09-26T15:30:00.000Z']] : [
    ['2026-09-26T14:59:59.999Z','2026-09-26T14:59:59.999Z'],
    ['2026-09-26T15:00:00.000Z','2026-09-26T15:00:00.000Z'],
    ['2026-09-26T23:59:59.999Z','2026-09-26T23:59:59.999Z'],
    ['2026-09-27T00:00:00.000Z','2026-09-27T00:00:00.000Z'],
    // Network/hydration crosses JST midnight; client must retain the server label.
    ['2026-09-26T14:59:59.999Z','2026-09-26T15:00:00.001Z']
  ];
  const results = [];
  try {
    for (const tz of reproduction?['UTC']:['UTC','Asia/Tokyo']) {
      fs.writeFileSync(clockFile,cases[0][0]);
      const fd = fs.openSync(path.join(output,'server-'+tz.replace('/','-')+'.log'),'w');
      const app = spawn(process.execPath,['--require',path.resolve('tests/fixtures/matrix-clock.cjs'),require.resolve('next/dist/bin/next'),'start','-p','3288'],{
        cwd:appDir,windowsHide:true,stdio:['ignore',fd,fd],env:{...process.env,TZ:tz,MATRIX_CLOCK_FILE:clockFile,NEXT_PUBLIC_SUPABASE_URL:'http://127.0.0.1:54329',NEXT_PUBLIC_SUPABASE_ANON_KEY:'test-public-key',OPENAI_API_KEY:''}
      });
      try {
        let ready=false;
        for(let i=0;i<60;i++){try{if((await fetch(origin+'/privacy')).ok){ready=true;break;}}catch{}await delay(250);}
        assert.ok(ready,'Next server ready');
        for(const [serverTime,clientTime] of cases) for(const route of reproduction?['/matrix']:['/matrix','/matrix?scope=all']) {
          fs.writeFileSync(clockFile,serverTime);
          const expected = new Date(serverTime).toLocaleDateString('ja-JP',{timeZone:'Asia/Tokyo'});
          const context = await browser.newContext({timezoneId:'Asia/Tokyo',viewport:{width:1440,height:1000}});
          await context.addInitScript(iso=>{
            const NativeDate=Date;
            window.Date=class extends NativeDate {constructor(...args){super(...(args.length?args:[iso]));}};
            window.__matrixDocumentId=crypto.randomUUID();
          },clientTime);
          const expires=Math.floor(Date.now()/1000)+86400;
          const token=['eyJhbGciOiJIUzI1NiJ9',Buffer.from(JSON.stringify({sub:user.id,exp:expires})).toString('base64url'),'fixture'].join('.');
          const session={access_token:token,refresh_token:'fixture',expires_at:expires,expires_in:86400,token_type:'bearer',user};
          await context.addCookies([{name:'sb-127-auth-token',value:'base64-'+Buffer.from(JSON.stringify(session)).toString('base64url'),url:origin}]);
          const page=await context.newPage(),errors=[];
          page.on('pageerror',e=>errors.push(e.message));
          page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
          const response=await page.goto(origin+route,{waitUntil:'networkidle'});
          const html=await response.text();
          const label=()=>page.locator('body').innerText().then(t=>t.match(/作成日\s+(\d+\/\d+\/\d+)/)?.[1]);
          if(reproduction){
            assert.ok(html.includes('2026/9/26'),'old UTC SSR date');
            assert.equal(await label(),'2026/9/27');
            assert.ok(errors.some(e=>/#418|hydration/i.test(e)),'original mismatch must reproduce');
            results.push({tz,route,serverTime,clientTime,errors});
          } else {
            assert.ok(html.includes(expected),'JST label in server HTML');
            const body = await page.locator('main').innerText();
            assert.ok(body.includes(route.includes('scope=all') ? '全ユーザー / ランク:' : '自分のみ / ランク:'));
            assert.ok(body.includes('対象登録戦績: '+(route.includes('scope=all') ? 4 : 2)+'件'));
            if (results.length === 0) {
              const waiting = page.waitForEvent('download');
              await page.getByRole('button', {name: /PNG/}).click();
              const download = await waiting;
              await download.saveAs(path.join(output, 'matrix-context.png'));
            }
            assert.equal(await label(),expected);
            await page.reload({waitUntil:'networkidle'});assert.equal(await label(),expected);
            const marker=await page.evaluate(()=>window.__matrixDocumentId);
            await page.locator('nav a[href="/"]').click();await page.waitForURL(origin+'/');await page.waitForLoadState('networkidle');
            assert.equal(await page.evaluate(()=>window.__matrixDocumentId),marker,'Next Link navigation retains document');
            await page.goBack();await page.waitForURL(origin+route);await page.waitForLoadState('networkidle');
            assert.equal(await page.evaluate(()=>window.__matrixDocumentId),marker,'client history navigation retains document');
            assert.equal(await label(),expected);
            assert.deepEqual(errors,[]);
            results.push({tz,route,serverTime,clientTime,expected,hardReload:true,clientNavigation:true,errors});
          }
          await context.close();
        }
      } finally {
        const stopped=new Promise(r=>app.once('exit',r));app.kill();await stopped;fs.closeSync(fd);
      }
    }
    assert.equal(rawReads,0);assert.deepEqual(writes,[]);
    fs.writeFileSync(path.join(output,reproduction?'reproduction.json':'result.json'),JSON.stringify({passed:true,reproduction,conditions:results.length,results,rawReads,writes},null,2));
    console.log(JSON.stringify({passed:true,reproduction,conditions:results.length,rawReads}));
  } finally {await browser.close();await new Promise(r=>api.close(r));}
})().catch(e=>{console.error(e);process.exitCode=1;});
