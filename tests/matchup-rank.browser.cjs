/* eslint-disable @typescript-eslint/no-require-imports */
// Local HTTP contract/browser test. Actual SQL/RLS parity is tested separately
// in matchup-rpc.integration.cjs; this server never connects to a real service.
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const origin = 'http://localhost:3241';
const output = path.resolve('build/matchup-rank-browser-proof');
const decks = [{ id: 'A', name: 'デッキA', class_name: 'エルフ' }, { id: 'B', name: 'デッキB', class_name: 'ロイヤル' }];
const user = { id: 'fixture-owner', aud: 'authenticated', role: 'authenticated', email: 'fixture@example.test', app_metadata: {}, user_metadata: {} };
let admin = true, fail = false, rawReads = 0;
const calls = [], writes = [], browserErrors = [], names=[];
const rankRows=[{},...['beginner','d','c','b','a','aa'].map(rank_tier=>({rank_tier})),...['emerald','topaz','ruby','sapphire','diamond'].map(master_group=>({rank_tier:'master',master_group})),...['none','epic','ultimate','legend','beyond'].map(grandmaster_rating=>({rank_tier:'grandmaster',grandmaster_rating}))];
const choices=[['all',17],['master-plus',10],['master',5],['grandmaster',5],...rankRows.filter(r=>r.master_group).map(r=>['master:'+r.master_group,1]),...rankRows.filter(r=>r.grandmaster_rating).map(r=>['grandmaster:'+r.grandmaster_rating,1])];
const api = http.createServer(async (req, res) => {
  res.setHeader('Content-Type', 'application/json');
  const url = new URL(req.url, 'http://127.0.0.1:54329');
  if (req.method === 'POST' && ['/rest/v1/rpc/get_matchup_aggregates_v1','/rest/v1/rpc/get_matchup_aggregates_v2'].includes(url.pathname)) {
    let body = ''; for await (const part of req) body += part;
    const args = JSON.parse(body); calls.push(args); names.push(url.pathname.split('/').at(-1));
    if (fail) { res.writeHead(500); res.end(JSON.stringify({ code: 'XX000', message: 'fixture failure' })); return; }
    const n=rankRows.filter(r=>{const f=args.p_rank_filter;if(!f||f==='all')return true;if(f==='master-plus')return ['master','grandmaster'].includes(r.rank_tier);const[t,c]=f.split(':');return r.rank_tier===t&&(!c||(t==='master'?r.master_group:r.grandmaster_rating)===c);}).length;
    const groups=args.p_environment_id==='empty'||!n?[]:[{myDeckId:'A',opponentDeckId:'B',total:n,wins:n},...(args.p_include_all_users&&admin?[{myDeckId:'B',opponentDeckId:'A',total:n,wins:0}]:[])];
    res.end(JSON.stringify({ version: 1, totalMatches: groups.reduce((n, g) => n + g.total, 0), groups })); return;
  }
  if (req.method === 'POST' && url.pathname === '/rest/v1/rpc/get_home_dashboard') {
    res.end(JSON.stringify({ summary: { total: 0, wins: 0, winRate: null, firstWinRate: null, secondWinRate: null }, recent: [] })); return;
  }
  if (req.method !== 'GET' && req.method !== 'HEAD') { writes.push(url.pathname); res.writeHead(405); res.end('{}'); return; }
  let data;
  if (url.pathname === '/auth/v1/user') data = user;
  else if (url.pathname.endsWith('/admin_users')) data = admin ? { id: 'fixture-admin' } : null;
  else if (url.pathname.endsWith('/environments')) data = [
    { id: 'environment', name: '検証環境', created_at: '2026-09-20', allow_match_input: true },
    { id: 'empty', name: '空の環境', created_at: '2026-09-01', allow_match_input: true }
  ];
  else if (url.pathname.endsWith('/matches')) { rawReads++; data = []; }
  else data = decks;
  res.end(JSON.stringify(data));
});
(async () => {
  fs.mkdirSync(output, { recursive: true });
  await new Promise(resolve => api.listen(54329, '127.0.0.1', resolve));
  const log = fs.openSync(path.join(output, 'server.log'), 'w');
  const app = spawn(process.execPath, [require.resolve('next/dist/bin/next'), 'start', '-p', '3241'], {
    windowsHide: true, stdio: ['ignore', log, log],
    env: { ...process.env, NEXT_PUBLIC_SUPABASE_URL: 'http://127.0.0.1:54329', NEXT_PUBLIC_SUPABASE_ANON_KEY: 'test-public-key', OPENAI_API_KEY: '' }
  });
  let browser;
  try {
    for (let i = 0; i < 60; i++) {
      try { if ((await fetch(origin + '/privacy')).ok) break; } catch {}
      await new Promise(resolve => setTimeout(resolve, 500));
    }
    browser = await chromium.launch({ headless: true, ...(process.env.CHROME_EXECUTABLE ? { executablePath: process.env.CHROME_EXECUTABLE } : {}) });
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
    const token = ['eyJhbGciOiJIUzI1NiJ9', Buffer.from(JSON.stringify({ sub: user.id, exp: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url'), 'fixture'].join('.');
    const session = { access_token: token, refresh_token: 'fixture', expires_at: Math.floor(Date.now() / 1000) + 3600, expires_in: 3600, token_type: 'bearer', user };
    await context.addCookies([{ name: 'sb-127-auth-token', value: 'base64-' + Buffer.from(JSON.stringify(session)).toString('base64url'), url: origin }]);
    const page = await context.newPage();
    page.on('pageerror', error => { if (!fail) browserErrors.push(error.message); });
    for(const scope of ['mine','all']){
      await page.goto(origin+'/matrix?scope='+scope);await page.waitForLoadState('networkidle');
      const beforeAll=await page.locator('tbody td').evaluateAll(xs=>xs.map(x=>({text:x.textContent,css:x.className})));
      for(const[rank,n]of choices){const before=calls.length;await page.locator('select[name=rank]').selectOption(rank);await page.getByRole('button',{name:'表示',exact:true}).click();await page.waitForLoadState('networkidle');
        assert.equal(calls.length,before+1);assert.equal(names.at(-1),rank==='all'?'get_matchup_aggregates_v1':'get_matchup_aggregates_v2');assert.equal(calls.at(-1).p_include_all_users,scope==='all');assert.equal(calls.at(-1).p_rank_filter,rank==='all'?undefined:rank);
        assert.equal(await page.locator('select[name=rank]').inputValue(),rank);assert.equal(await page.locator('select[name=rank] option').count(),14);assert.equal(new URL(page.url()).searchParams.get('rank'),rank);
        const text=await page.locator('tbody td').allTextContents();assert.equal(text.length,4);assert.equal(text[0],'未対戦');assert.match(text[1],new RegExp('100%.*'+n+'勝 / '+n+'戦'));if(scope==='all')assert.match(text[2],new RegExp('0%.*0勝 / '+n+'戦'));else assert.equal(text[2],'未対戦');assert.equal(text[3],'未対戦');
        if(rank==='all')assert.deepEqual(await page.locator('tbody td').evaluateAll(xs=>xs.map(x=>({text:x.textContent,css:x.className}))),beforeAll);
      }
    }
    const beforePng=calls.length;const download=page.waitForEvent('download');await page.getByRole('button',{name:'PNG保存',exact:true}).click();const png=await download;const file=path.join(output,'rank-matrix.png');await png.saveAs(file);assert.equal(fs.readFileSync(file).subarray(1,4).toString(),'PNG');assert.equal(calls.length,beforePng);
    await page.locator('button[aria-pressed]').filter({hasText:'デッキB'}).click();assert.equal(await page.locator('tbody td').count(),1);await page.getByRole('button',{name:'全表示',exact:true}).click();assert.equal(calls.length,beforePng);
    await page.goto(origin+'/matrix?rank=master:sapphire&environment=empty');await page.waitForLoadState('networkidle');assert.deepEqual(await page.locator('tbody td').allTextContents(),Array(4).fill('未対戦'));
    admin=false;await page.goto(origin+'/matrix?rank=grandmaster:none&scope=all');await page.waitForLoadState('networkidle');assert.equal(calls.at(-1).p_include_all_users,false);assert.equal(calls.at(-1).p_rank_filter,'grandmaster:none');assert.equal(await page.locator('select[name=scope]').count(),0);
    assert.equal(rawReads,0);assert.deepEqual(writes,[]);const known=browserErrors.filter(x=>x.includes('#418'));assert.deepEqual(browserErrors.filter(x=>!x.includes('#418')),[]);
    fail=true;const beforeFailure=calls.length;await page.goto(origin+'/matrix?rank=master');await page.waitForFunction(()=>document.body.innerText.includes('Application error'));assert.equal(await page.locator('tbody td').count(),0);assert.equal(calls.length,beforeFailure+1);assert.equal(names.at(-1),'get_matchup_aggregates_v2');
    fs.writeFileSync(path.join(output,'result.json'),JSON.stringify({passed:true,rankScopeConditions:28,rawReads,writes,knownHydration:known,checks:['14 choices x two scopes','one RPC/filter change','all cell text/color unchanged','zero','non-admin all guard','filtered PNG/toggle no fetch','error not zero/no fallback']},null,2));console.log('Matrix rank browser: 28 conditions passed, one RPC, zero raw matches, filtered PNG no refetch.');
  } finally {
    if (browser) await browser.close();
    app.kill(); api.close(); fs.closeSync(log);
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
