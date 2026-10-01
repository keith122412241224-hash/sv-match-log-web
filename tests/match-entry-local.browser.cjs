/* eslint-disable @typescript-eslint/no-require-imports */
// Explicit local E1.2 Supabase only. Creates disposable Auth fixtures and cleans
// their data in finally. Never accepts a remote URL or changes DB schema.
const fs = require('node:fs'), path = require('node:path'), http = require('node:http'), crypto = require('node:crypto');
const assert = require('node:assert/strict'), { spawn } = require('node:child_process');
const { Client } = require(process.env.PG_MODULE || 'pg');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const raw = fs.readFileSync(process.env.LOCAL_SUPABASE_KEYS);
const keys = JSON.parse(raw.toString(raw[0] === 255 ? 'utf16le' : 'utf8').replace(/^\uFEFF/, ''));
assert.equal(keys.API_URL, 'http://127.0.0.1:57321');
assert.equal(keys.DB_URL, 'postgresql://postgres:postgres@127.0.0.1:57322/postgres');
const db = new Client({ host: '127.0.0.1', port: 57322, user: 'postgres', password: 'postgres', database: 'postgres' });
const origin = 'http://localhost:3262', output = path.resolve('build/match-entry-local');
const env = crypto.randomUUID(), archetype = crypto.randomUUID(), ids = [], sessions = [], calls = [];
const nil = { rank_tier: null, master_group: null, grandmaster_rating: null };
const ranks = [nil, ...['beginner','d','c','b','a','aa'].map(rank_tier => ({...nil,rank_tier})), ...['emerald','topaz','ruby','sapphire','diamond'].map(master_group => ({...nil,rank_tier:'master',master_group})), ...['none','epic','ultimate','legend','beyond'].map(grandmaster_rating => ({...nil,rank_tier:'grandmaster',grandmaster_rating}))];
async function auth(route, body, admin = false, method = 'POST') {
  const response = await fetch(keys.API_URL + route, { method, headers: { apikey: admin ? keys.SERVICE_ROLE_KEY : keys.ANON_KEY, Authorization: 'Bearer ' + (admin ? keys.SERVICE_ROLE_KEY : keys.ANON_KEY), 'Content-Type': 'application/json' }, ...(body ? {body:JSON.stringify(body)} : {}) });
  assert.ok(response.ok, 'local Auth status ' + response.status); return response.status === 204 ? null : response.json();
}
// Compiled test build targets this loopback port with a dummy public key. Relay
// exclusively to the pinned local stack, replacing only that dummy key.
const relay = http.createServer((req, res) => {
  const headers = { ...req.headers, host: '127.0.0.1:57321', apikey: keys.ANON_KEY };
  if (headers.authorization === 'Bearer test-public-key') headers.authorization = 'Bearer ' + keys.ANON_KEY;
  const forward = http.request(keys.API_URL + req.url, { method: req.method, headers }, upstream => { res.writeHead(upstream.statusCode, upstream.headers); upstream.pipe(res); });
  calls.push(req.method + ' ' + new URL(req.url, keys.API_URL).pathname);
  forward.on('error', () => { res.writeHead(502); res.end(); }); req.pipe(forward);
});
async function until(check) { for(let i=0;i<200;i++){if(await check())return;await new Promise(r=>setTimeout(r,50));}throw Error('Timed out'); }
(async () => {
  fs.mkdirSync(output,{recursive:true}); await db.connect(); let app,browser,log,page;
  try {
    assert.equal((await db.query('select count(*)::int n from supabase_migrations.schema_migrations')).rows[0].n,6);
    for(let i=0;i<2;i++){
      const email='rank-ux-'+crypto.randomUUID()+'@example.test',password=crypto.randomBytes(24).toString('hex');
      const created=await auth('/auth/v1/admin/users',{email,password,email_confirm:true},true); ids.push(created.id);
      sessions.push(await auth('/auth/v1/token?grant_type=password',{email,password}));
    }
    await db.query('insert into public.environments(id,user_id,name) values($1,$2,$3)',[env,ids[0],'Match entry UX local fixture']);
    await db.query('insert into public.deck_archetypes(id,name,class_name,sort_order) values($1,$2,$3,-10000)',[archetype,'Rank UX '+archetype,'エルフ']);
    await new Promise(r=>relay.listen(54329,'127.0.0.1',r));log=fs.openSync(path.join(output,'server.log'),'w');
    app=spawn(process.execPath,[require.resolve('next/dist/bin/next'),'start','-p','3262'],{windowsHide:true,stdio:['ignore',log,log],env:{...process.env,NEXT_PUBLIC_SUPABASE_URL:'http://127.0.0.1:54329',NEXT_PUBLIC_SUPABASE_ANON_KEY:'test-public-key',OPENAI_API_KEY:''}});
    await until(async()=>{try{return(await fetch(origin+'/privacy')).ok;}catch{return false;}});
    browser=await chromium.launch({headless:true,...(process.env.CHROME_EXECUTABLE?{executablePath:process.env.CHROME_EXECUTABLE}:{})});
    const context=await browser.newContext({viewport:{width:390,height:844}});
    await context.route('**/*',route=>['localhost','127.0.0.1'].includes(new URL(route.request().url()).hostname)?route.continue():route.abort());
    const cookie=async index=>{await context.addCookies([{name:'sb-127-auth-token',value:'base64-'+Buffer.from(JSON.stringify(sessions[index])).toString('base64url'),url:origin}]);};
    await cookie(0);page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
    const choose=async rank=>{const value=rank.rank_tier==='master'?'master:'+rank.master_group:rank.rank_tier==='grandmaster'?'grandmaster:'+rank.grandmaster_rating:rank.rank_tier||'unranked';await page.locator('button[aria-haspopup=dialog]').click();await page.locator('dialog input[value="'+value+'"]').click();};
    const open=async()=>{await page.goto(origin+'/matches',{waitUntil:'networkidle'});await page.locator('[name=environment_id]').selectOption(env);};
    await open();const apiPerSave=[];
    for(const rank of ranks){
      await choose(rank);const start=calls.length;await page.locator('button[value=continue]').click();await page.getByRole('status').filter({hasText:'戦績を保存しました'}).waitFor();
      await until(async()=>await page.locator('button[value=continue]').getAttribute('aria-disabled')==='false');
      const stored=(await db.query('select rank_tier,master_group,grandmaster_rating from public.matches where user_id=$1 and environment_id=$2 order by created_at desc limit 1',[ids[0],env])).rows[0];assert.deepEqual(stored,rank);
      apiPerSave.push(calls.slice(start));
    }
    assert.equal((await db.query('select count(*)::int n from public.matches where user_id=$1 and environment_id=$2',[ids[0],env])).rows[0].n,17);
    // Server rejects forged combinations and unknown values before any insert.
    for(const bad of [{rank_tier:'master',master_group:'ruby',grandmaster_rating:'epic'},{rank_tier:'grandmaster',master_group:'ruby',grandmaster_rating:'epic'},{rank_tier:'unknown',master_group:'',grandmaster_rating:''}]){
      await page.evaluate(values=>{for(const [k,v]of Object.entries(values))document.querySelector('[name="'+k+'"]').value=v;},bad);
      await page.locator('button[value=continue]').click();await page.getByRole('alert').filter({hasText:'戦績の保存に失敗しました'}).waitFor();
      assert.equal((await db.query('select count(*)::int n from public.matches where user_id=$1',[ids[0]])).rows[0].n,17);
    }
    await choose({rank_tier:'grandmaster',grandmaster_rating:'epic'});await page.locator('button[value=continue]').click();await page.getByRole('status').filter({hasText:'戦績を保存しました'}).waitFor();
    await cookie(1);await open();assert.equal(await page.locator('[name=rank_tier]').inputValue(),'');
    await choose({rank_tier:'master',master_group:'sapphire'});await page.locator('button[value=home]').click();await page.waitForURL(origin+'/');
    await cookie(0);await open();assert.equal(await page.locator('[name=grandmaster_rating]').inputValue(),'epic');
    // Existing guest import action: legacy NULL, regular, Master and GM.
    const guestRanks=[{},ranks[6],ranks[10],ranks[12]];
    const guest=guestRanks.map((r,i)=>({...r,local_id:'local-import-'+i,environment_id:env,my_deck_id:archetype,opponent_deck_id:archetype,my_archetype_id:archetype,opponent_archetype_id:archetype,turn_order:'first',result:'win',played_at:'2026-09-20T00:00:00.000Z'}));
    await page.evaluate(rows=>localStorage.setItem('svml:guest-matches:v1',JSON.stringify(rows)),guest);await page.goto(origin+'/',{waitUntil:'networkidle'});
    await page.getByRole('button',{name:'正式データに取り込む',exact:true}).click();await page.getByRole('status').filter({hasText:'4件を保存しました'}).waitFor();
    const imported=(await db.query("select rank_tier,master_group,grandmaster_rating from public.matches where user_id=$1 and played_at='2026-09-20T00:00:00Z'",[ids[0]])).rows;
    assert.equal(imported.length,4);for(const expected of [nil,...guestRanks.slice(1)])assert.ok(imported.some(row=>JSON.stringify(row)===JSON.stringify(expected)));
    // Saving revalidates an environment closed after the form loaded.
    await open();await db.query('update public.environments set match_input_end_at=now()-interval \'1 second\' where id=$1',[env]);
    await page.locator('button[value=continue]').click();await page.getByRole('alert').filter({hasText:'戦績の保存に失敗しました'}).waitFor();
    const existing=(await db.query('select my_deck_id,opponent_deck_id from public.matches where user_id=$1 limit 1',[ids[0]])).rows[0];
    await assert.rejects(db.query("insert into public.matches(user_id,environment_id,my_deck_id,opponent_deck_id,turn_order,result) values($1,$2,$3,$4,'first','win')",[ids[0],env,existing.my_deck_id,existing.opponent_deck_id]));
    assert.deepEqual(errors,[]);
    fs.writeFileSync(path.join(output,'result.json'),JSON.stringify({passed:true,localOnly:true,dbVersion:(await db.query('show server_version')).rows[0].server_version,validCombinations:17,userIsolation:true,forgedRanksRejected:true,guestImport:4,environmentRevalidation:true,dbTrigger:true,apiPerSave,errors},null,2));
    console.log('Local Supabase passed: 17 DB triples, real Auth A/B, forged ranks, guest import, schedule revalidation/trigger.');
  }catch(error){if(page)await page.screenshot({path:path.join(output,'failure.png'),fullPage:true});throw error;}
  finally{
    if(browser)await browser.close();app?.kill();relay.close();if(log!==undefined)fs.closeSync(log);
    // Delete only this run's generated fixtures, never existing local data.
    if(ids.length){await db.query('delete from public.matches where user_id=any($1::uuid[])',[ids]);await db.query('delete from public.environments where id=$1',[env]);await db.query('delete from public.deck_archetypes where id=$1',[archetype]);for(const id of ids)await auth('/auth/v1/admin/users/'+id,null,true,'DELETE');}
    await db.end();
  }
})().catch(error=>{console.error(error.message);process.exitCode=1;});
