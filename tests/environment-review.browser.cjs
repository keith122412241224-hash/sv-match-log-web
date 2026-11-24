/* eslint-disable @typescript-eslint/no-require-imports */
// Full Next server + browser + disposable PostgreSQL. Auth and HTTP transport
// are fixture adapters; SQL, RLS, app validation, pages and mutations are real.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const { spawn } = require('node:child_process');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || path.resolve('build/environment-trends-tools/node_modules/playwright'));
const { setup, ids } = require('./match-mutations-db.cjs');
const apiPort = Number(process.env.REVIEW_FIXTURE_PORT || 54339);
const port = 3297, origin = 'http://localhost:' + port;
const output = path.resolve(process.env.REVIEW_SCREENSHOTS || 'build/environment-review-browser');
const work = path.resolve('build/environment-review-browser');
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
const endpoint = '/admin/environment-review/api';
const browserFetch = globalThis.fetch;
require('./register.cjs');
globalThis.fetch = browserFetch;
const { buildReviewSnapshot } = require('../src/lib/environment-review/metrics');
const reports = new Set();
const users = new Map([ids.a, ids.b].map(id => [id, {
  id, aud: 'authenticated', role: 'authenticated', is_anonymous: false,
  email: id + '@example.test', app_metadata: {}, user_metadata: {},
}]));
const tokenFor = id => ['eyJhbGciOiJIUzI1NiJ9', Buffer.from(JSON.stringify({ sub:id, exp:Math.floor(Date.now()/1000)+3600 })).toString('base64url'), 'fixture'].join('.');
const sqlName = name => {
  assert.match(name, /^[a-z_][a-z_0-9]*$/);
  return '"' + name + '"';
};
function json(res, status, data) {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(data));
}

async function seed(db) {
  await db.query("update public.environments set name='検証環境・能力変更後',start_date=current_date-6,created_at=now()-interval '7 days' where id=$1", [ids.env]);
  await db.query("update public.environments set start_date=current_date-10,created_at=now()-interval '12 days' where id=$1", [ids.env2]);
  await db.query("update public.deck_archetypes set name='コンボエルフ' where id=$1", [ids.arch]);
  await db.query("update public.deck_archetypes set name='ミッドレンジロイヤル' where id=$1", [ids.arch2]);
  for (const [index, name] of ['疾走ドラゴン','スペルウィッチ','守護ビショップ','AFネメシス','進化ナイトメア','妖精エルフ','コントロールロイヤル（長いデッキ名の表示検証）'].entries()) {
    const id = '10000000-0000-4000-8000-' + String(index+1).padStart(12,'0');
    await db.query('insert into public.deck_archetypes(id,name,class_name) values($1,$2,$3)', [id,name, ['ドラゴン','ウィッチ','ビショップ','ネメシス','ナイトメア','エルフ','ロイヤル'][index]]);
  }
  await db.query(`insert into public.matches(user_id,environment_id,my_deck_id,opponent_deck_id,my_archetype_id,opponent_archetype_id,result,turn_order,played_at)
    select $1,$2,$3,$4,$5,$6,case when n%10 < 5 then 'win'::public.match_result else 'lose' end,
      case when n%2=0 then 'first'::public.turn_order else 'second' end,
      now() - interval '1 hour' - (n%5)*interval '1 day' from generate_series(1,60) n`,
    [ids.a,ids.env,ids.deck,ids.deck2,ids.arch,ids.arch2]);
}

async function fixture(testDb) {
  let queue = Promise.resolve();
  const { db, claim } = testDb;
  const tables = ['admin_users','environments','deck_archetypes','matches','environment_review_runs','environment_review_publications','environment_review_events'];
  const rpc = ['get_environment_review_source_v1','get_environment_review_source_v2','environment_review_create','environment_review_transition','environment_review_publish_v2','environment_review_failure','get_environment_dashboard_aggregates_v4'];
  const server = http.createServer((req,res) => {
    queue = queue.then(async () => {
      const url = new URL(req.url, 'http://127.0.0.1');
      try {
        const auth = (req.headers.authorization || '').slice(7);
        const payload = auth.split('.')[1];
        const user = payload ? users.get(JSON.parse(Buffer.from(payload,'base64url')).sub) : undefined;
        await claim(user?.id || null);
        if (url.pathname === '/auth/v1/user') { json(res,user ? 200 : 401,user || {message:'no session'}); return; }
        let input = '';
        for await (const chunk of req) input += chunk;
        const name = url.pathname.split('/').pop();
        if (url.pathname.includes('/rpc/')) {
          assert.ok(rpc.includes(name), 'Unexpected RPC ' + name);
          const args = JSON.parse(input || '{}');
          const fields = Object.keys(args);
          const params = fields.map(key => typeof args[key] === 'object' && args[key] !== null && !Array.isArray(args[key]) ? JSON.stringify(args[key]) : args[key]);
          const expr = fields.map((key,i) => sqlName(key) + ' => $' + (i+1)).join(',');
          const result = await db.query('select public.' + sqlName(name) + '(' + expr + ') as result', params);
          json(res,200,result.rows[0].result); return;
        }
        assert.ok(req.method === 'GET' || req.method === 'HEAD');
        assert.ok(tables.includes(name), 'Unexpected fixture read ' + url.pathname);
        const columns = (url.searchParams.get('select') || '*').split(',');
        const cols = columns[0] === '*' ? '*' : columns.map(sqlName).join(',');
        const where = [], params = [];
        for (const [key,value] of url.searchParams) {
          if (['select','order','offset','limit'].includes(key)) continue;
          if (value.startsWith('eq.')) {
            params.push(key==='is_active' ? value==='eq.true' : value.slice(3));
            const column = key==='snapshot->>schemaVersion' ? "snapshot->>'schemaVersion'" : sqlName(key);
            where.push(column + '=$' + params.length);
          } else if (value.startsWith('in.(') && value.endsWith(')')) {
            const terms = value.slice(4,-1).split(',');
            const list = terms.map(term => { params.push(term.replace(/^"|"$/g,'')); return '$' + params.length; });
            where.push(sqlName(key) + ' in (' + list.join(',') + ')');
          } else throw Error('Unsupported filter ' + key);
        }
        let query = 'select ' + cols + ' from public.' + sqlName(name) + (where.length ? ' where ' + where.join(' and ') : '');
        if (url.searchParams.get('order')) {
          query += ' order by ' + url.searchParams.get('order').split(',').map(term => {
            const [key,dir,nulls] = term.split('.');
            return sqlName(key) + (dir === 'desc' ? ' desc' : ' asc') + (nulls === 'nullslast' ? ' nulls last' : '');
          }).join(',');
        }
        for (const key of ['limit','offset']) if (url.searchParams.has(key)) {
          const val = Number(url.searchParams.get(key)); assert.ok(Number.isSafeInteger(val) && val >= 0); query += ' ' + key + ' ' + val;
        }
        const result = await db.query(query, params);
        json(res,200,req.headers.accept?.includes('vnd.pgrst.object') ? result.rows[0] || null : result.rows);
      } catch (error) {
        console.error('fixture',url.pathname,error.message);
        json(res,400,{code:error.code || 'FIXTURE',message:error.message});
      }
    });
  });
  await new Promise((resolve,reject) => server.once('error',reject).listen(apiPort,'127.0.0.1',resolve));
  return server;
}

function documentFor(s) {
  const deck = s.decks.find(d => d.deckId === ids.arch);
  const pair = s.pairs.find(p => p.a === ids.arch && p.b === ids.arch2);
  assert.ok(deck?.dataTier && pair?.count >= 20, 'sufficient fixture measurements');
  const docs = s.decks.map(d => ({
    deckId: d.deckId, tier: d.deckId === deck.deckId ? 2 : d.dataTier,
    reason: d.count ? '同一環境の実戦データと構築別の記録を参照しました。' : '実戦データが不足しています。',
    confidence: d.dataTier === null ? '判断保留' : '低', divergence: null,
  }));
  const gap = (facts, hypothesis) => ({ status:'確認済み',direction:'過小評価の可能性',importance:5,facts,hypothesis });
  const picked = docs.find(d => d.deckId === deck.deckId);
  picked.divergence = gap('全ランクの実測勝率は' + deck.winRate + '%。検証用の構築別資料では上位の評価でした。','特定の構築や操作の習熟度が成績差に影響した可能性があります。');
  const pairs = [{a:pair.a,b:pair.b,rating:1,reason:'双方の先攻・後攻成績を確認し、構築差の情報を補助材料にしました。',confidence:'中',
    divergence:gap('実測対面勝率は' + pair.winRate + '%。検証用の構築記録はコンボ側の優位を示します。','対面を意識した採用カードの違いが勝ち筋に影響した可能性があります。')}];
  const evidence = [...docs.map(d => d.deckId),pair.a+'/'+pair.b].map(target => {
    const compared = target === deck.deckId || target.includes('/');
    return {target,sourceIds:compared ? ['fixture'] : [],externalTrend:compared ? '上振れ評価' : '比較不能',rationale:'ローカル試験用の独自要約',facts:'対象環境での比較結果です。',hypothesis:''};
  });
  return {schemaVersion:1,environmentId:s.environmentId,snapshotId:s.snapshotId,public:{
    overview:{facts:'検証用の対戦' + s.matchCount + '件では、コンボエルフとミッドレンジロイヤルの対面が最多でした。',hypothesis:'構築の違いが対面評価に影響した可能性があります。'},
    comparison:'partial',changes:'この検証環境での初回評価です。',decks:docs,pairs},
    internal:{evidence,limitations:'検証用データ。その他のデッキは比較資料が不足しています。',
      sources:[{id:'fixture',url:'https://example.invalid/local-fixture',publisher:'検証用の架空の出典',group:'検証資料',publishedAt:s.asOf,retrievedAt:s.asOf,environmentId:s.environmentId,summary:'外部情報を模したローカル検証用資料',trend:'構築別評価が実測より高い',reliability:'中'}]}};
}

async function contextFor(browser, id, theme='light', width=1440) {
  const ctx = await browser.newContext({viewport:{width,height:900},timezoneId:'Asia/Tokyo',colorScheme:theme});
  await ctx.addInitScript(theme => {localStorage.setItem('svml.theme.v1',theme);},theme);
  await ctx.route('**/*', route => {
    const u = new URL(route.request().url());
    return ['localhost','127.0.0.1'].includes(u.hostname) || ['data:','blob:'].includes(u.protocol) ? route.continue() : route.abort();
  });
  if (id) {
    const session = {access_token:tokenFor(id),refresh_token:'fixture',expires_in:3600,expires_at:Math.floor(Date.now()/1000)+3600,token_type:'bearer',user:users.get(id)};
    await ctx.addCookies([{name:'sb-127-auth-token',value:'base64-'+Buffer.from(JSON.stringify(session)).toString('base64url'),url:origin}]);
  }
  return ctx;
}

async function openReport(page, env = ids.env) {
  await page.goto(origin+'/admin/environment-review?environment='+env+'&view=report');
  return page.getByRole('region',{name:'管理者限定の公開版'});
}

async function run() {
  fs.mkdirSync(work,{recursive:true});
  fs.mkdirSync(output,{recursive:true});
  const testDb = await setup();
  let api, app, browser;
  const log = fs.openSync(path.join(work,'server.log'),'w');
  try {
    await seed(testDb.db);
    await testDb.db.exec("update public.matches set created_at=played_at");
    await testDb.db.exec("update public.deck_archetypes set created_at=now()-interval '10 days'");
    await testDb.claim(ids.a);
    const raw = (await testDb.db.query('select public.get_environment_review_source_v1($1) as value',[ids.env])).rows[0].value;
    const legacy = buildReviewSnapshot(raw, require('node:crypto').randomUUID());
    await testDb.db.query('select public.environment_review_create($1,$2,$3,$4)',[legacy.snapshotId,ids.env,legacy.asOf,JSON.stringify(legacy)]);
    api = await fixture(testDb);
    const env = {};
    for (const [k,v] of Object.entries(process.env)) if (/^(PATH|PATHEXT|SystemRoot|WINDIR|COMSPEC|TEMP|TMP|APPDATA|LOCALAPPDATA|USERPROFILE|HOMEDRIVE|HOMEPATH|ProgramFiles.*|NUMBER_OF_PROCESSORS|PROCESSOR_ARCHITECTURE)$/i.test(k)) env[k]=v;
    Object.assign(env,{NEXT_PUBLIC_SUPABASE_URL:'http://127.0.0.1:'+apiPort,NEXT_PUBLIC_SUPABASE_ANON_KEY:'fixture',NEXT_TELEMETRY_DISABLED:'1'});
    app = spawn(process.execPath,[require.resolve('next/dist/bin/next'), 'start','-p',String(port),'-H','127.0.0.1'],{windowsHide:true,stdio:['ignore',log,log],env});
    let ready=false;
    for(let i=0;i<120;i++){try{ready=(await fetch('http://127.0.0.1:'+port+'/privacy')).ok;}catch{}if(ready)break;await wait(250);}
    assert.ok(ready,'local fixture build must serve /privacy');
    browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_EXECUTABLE || 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'});
    await verify(browser);
  } finally {
    await browser?.close();app?.kill();if(api)await new Promise(resolve=>api.close(resolve));
    fs.closeSync(log);await testDb.db.close();
  }
}

async function verify(browser) {
  const admin = await contextFor(browser,ids.a);
  const member = await contextFor(browser,ids.b);
  const page = await admin.newPage(), reportPage = await admin.newPage();
  const errors = [];
  for (const tab of [page,reportPage]) {
    tab.setDefaultTimeout(10000);
    tab.on('pageerror', err => errors.push(err.message));
  }
  const button = name => page.getByRole('button',{name,exact:true});
  const notice = message => page.getByRole('status').filter({hasText:message}).waitFor();
  const preview = async () => {
    await button('検証してプレビュー').click();
    await notice('検証が完了');
  };
  const envQuery = '?environment='+ids.env;
  const adminUrl = origin+'/admin/environment-review'+envQuery;
  const environmentUrl = origin+'/environment'+envQuery;
  const summaryTab = reportPage.getByRole('tab',{name:'環境サマリー'});
  const reviewPanel = reportPage.getByRole('tabpanel',{name:'総合環境評価'});
  let reviewReads = 0;
  reportPage.on('request', request => {
    if (new URL(request.url()).pathname === '/api/environment/review') reviewReads++;
  });
  await reportPage.goto(environmentUrl);
  await summaryTab.waitFor();
  assert.deepEqual(await reportPage.getByRole('tab').allTextContents(),['環境サマリー','推移分析','総合環境評価']);
  assert.equal(reviewReads,0);
  await summaryTab.press('End');
  await reviewPanel.getByRole('heading',{name:'評価準備中'}).waitFor();
  assert.equal(await reportPage.getByRole('radio').count(),0);
  await reportPage.screenshot({path:path.join(output,'environment-admin-empty-desktop.png')});
  await reportPage.getByRole('tab',{name:'総合環境評価'}).press('ArrowLeft');
  await reportPage.getByRole('tabpanel',{name:'推移分析'}).getByRole('heading',{name:'推移分析'}).waitFor();
  await reportPage.getByRole('tab',{name:'推移分析'}).press('Home');
  await reportPage.getByRole('tabpanel',{name:'環境サマリー'}).getByRole('heading').first().waitFor();
  await page.goto(adminUrl);
  await page.getByRole('heading',{name:'総合環境評価管理'}).waitFor();
  for (const [name, needle] of [['専用プロンプト','実測'],['JSON Schema','schemaVersion'],['サンプルJSON','snapshotId']]) {
    const [file] = await Promise.all([page.waitForEvent('download'),page.getByRole('link',{name,exact:true}).click()]);
    assert.ok(fs.readFileSync(await file.path(),'utf8').includes(needle),name+'をダウンロード');
  }
  await page.getByText('environment-review-v1', {exact:false}).first().waitFor();
  const [download] = await Promise.all([page.waitForEvent('download'),button('分析用JSONを出力').click()]);
  const exported = JSON.parse(fs.readFileSync(await download.path(),'utf8'));
  assert.equal(exported.previousEvaluation,null); assert.equal(exported.snapshot.matchCount,62);
  assert.doesNotMatch(JSON.stringify(exported), /user_id|access_token|example\.test|privateSource/);
  const input = documentFor(exported.snapshot);
  const pasted = page.getByLabel('評価JSON（貼り付け・編集）');
  await pasted.fill('{');
  await button('検証してプレビュー').click(); await page.locator('fieldset [role=alert]').waitFor();
  await page.getByLabel('分析結果ファイル').setInputFiles({name:'fixture.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(input))});
  await preview();
  await page.screenshot({path:path.join(output,'admin-desktop-light.png')});
  await button('下書き保存').click(); await notice('下書きを保存');
  const memberApi = origin+'/api/environment/review'+envQuery;
  assert.equal(await (await admin.request.get(memberApi)).json(),null);
  assert.equal((await member.request.get(origin+endpoint+envQuery)).status(),403);
  assert.equal((await member.request.post(origin+endpoint,{headers:{Origin:origin},data:{action:'create',environment:ids.env}})).status(),403);
  await preview();
  await page.getByLabel('公開内容と前回からの変更を確認しました').check();
  await button('確認した下書きを公開').click();await notice('公開しました');
  reports.add('実スナップショットをファイル出力、壊れたJSONを拒否、ファイル取り込み、プレビュー・下書き・公開');

  assert.equal((await member.request.get(memberApi)).status(),403);
  const deniedPage=await member.newPage();
  let memberReads = 0;
  deniedPage.on('request', request => {
    if (new URL(request.url()).pathname === '/api/environment/review') memberReads++;
  });
  await deniedPage.goto(environmentUrl);
  await deniedPage.getByRole('tab',{name:'環境サマリー'}).waitFor();
  for (const width of [1440,390,320]) {
    await deniedPage.setViewportSize({width,height:844});
    assert.deepEqual(await deniedPage.getByRole('tab').allTextContents(),['環境サマリー','推移分析']);
    await deniedPage.getByRole('tab',{name:'環境サマリー'}).press('End');
    await deniedPage.getByRole('tabpanel',{name:'推移分析'}).waitFor();
    await deniedPage.getByRole('tab',{name:'推移分析'}).press('ArrowRight');
    await deniedPage.getByRole('tabpanel',{name:'環境サマリー'}).waitFor();
    assert.equal(await deniedPage.locator('#environment-panel-review').count(),0);
  }
  assert.equal(memberReads,0);
  await deniedPage.goto(adminUrl+'&view=report');
  assert.ok(!new URL(deniedPage.url()).pathname.startsWith('/admin/environment-review'));
  await deniedPage.close();
  const data = await (await admin.request.get(memberApi)).json();
  assert.equal(data.payload.snapshot.matchCount,62);
  assert.ok(Number.isFinite(Date.parse(data.published_at)) && Date.parse(data.published_at)>=Date.parse(data.as_of));
  assert.doesNotMatch(JSON.stringify(data), /example\.invalid|架空の出典|独自要約|publishedAt|limitations|sourceIds|"internal"/);
  const panel = await openReport(reportPage);
  await panel.getByRole('heading',{name:'総合Tier表'}).waitFor();
  assert.equal(await reportPage.evaluate(()=>document.documentElement.dataset.theme),'light');
  const matrix = panel.getByRole('heading',{name:'総合対面相性表'}).locator('..');
  const deckGap = panel.getByRole('heading',{name:'実測データと評価の乖離分析'}).locator('..');
  const pairGap = panel.getByRole('heading',{name:'対面相性の乖離分析'}).locator('..');
  assert.match(await deckGap.innerText(),/過小評価の可能性/);assert.match(await pairGap.innerText(),/要因の仮説/);
  await reportPage.screenshot({path:path.join(output,'member-desktop-light.png')});
  await panel.getByRole('heading',{name:'総合Tier表'}).locator('..').evaluate(card=>card.scrollIntoView({block:'center'}));
  await reportPage.screenshot({path:path.join(output,'tier-desktop.png')});
  await deckGap.screenshot({path:path.join(output,'deck-divergence.png')});
  await pairGap.screenshot({path:path.join(output,'matchup-divergence.png')});
  await matrix.getByRole('button',{name:'コンボエルフ 対 ミッドレンジロイヤル やや有利',exact:true}).click();
  await matrix.getByRole('button',{name:'ミッドレンジロイヤル 対 コンボエルフ やや不利',exact:true}).click();
  assert.match(await matrix.locator('[aria-live]').innerText(),/やや不利/);
  await matrix.getByLabel('列の範囲').selectOption('1');
  await matrix.getByLabel('行の範囲').selectOption('1');
  assert.match(await matrix.innerText(),/長いデッキ名/);
  reports.add('会員APIとRLSの分離、デッキと対面の乖離、逆視点の評価、多数デッキの相性表');

  const dark = await contextFor(browser,ids.a,'dark',390);
  const mobile = await dark.newPage();
  const mobilePanel = await openReport(mobile);
  await mobilePanel.getByRole('heading',{name:'総合Tier表'}).waitFor();
  await mobile.waitForFunction(()=>document.documentElement.dataset.theme==='dark');
  for(const width of [390,320]){
    await mobile.setViewportSize({width,height:844});
    assert.ok(await mobile.evaluate(()=>document.documentElement.scrollWidth <= innerWidth),'member mobile overflow at '+width);
  }
  await mobile.setViewportSize({width:390,height:844});
  await mobile.screenshot({path:path.join(output,'member-mobile-dark.png')});
  await mobilePanel.getByRole('heading',{name:'総合対面相性表'}).locator('..').screenshot({path:path.join(output,'matchup-mobile-dark.png')});
  const otherPanel = await openReport(mobile,ids.env2);
  await otherPanel.getByRole('heading',{name:'評価準備中'}).waitFor();
  assert.doesNotMatch(await otherPanel.innerText(), /コンボエルフ/);
  const darkAdmin = await contextFor(browser,ids.a,'dark',390);
  const mobileAdmin = await darkAdmin.newPage();
  await mobileAdmin.goto(adminUrl);await mobileAdmin.getByLabel('評価JSON（貼り付け・編集）').waitFor();
  assert.ok(await mobileAdmin.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'admin mobile overflow');
  await mobileAdmin.screenshot({path:path.join(output,'admin-mobile-dark.png')});

  page.on('dialog',dialog=>dialog.accept());
  await button('公開停止').click();await notice('公開を停止');
  assert.equal(await (await admin.request.get(memberApi)).json(),null);
  await page.getByLabel('修正・復元・失敗の理由').fill('表示内容を確認して復元');
  await button('この公開版へ復元').click();await notice('選択した公開版を復元');
  assert.deepEqual(await (await admin.request.get(memberApi)).json(),data);
  const revised = structuredClone(input);
  revised.public.decks.forEach(d=>{ d.divergence=null; });
  revised.public.pairs.forEach(p=>{ p.divergence=null; });
  revised.public.overview.hypothesis='追加検証を経て乖離の判定を保留しました。';
  await pasted.fill(JSON.stringify(revised));
  await page.getByLabel('修正・復元・失敗の理由').fill('比較資料の再確認');
  await preview();
  await page.getByText('項目別に評価を修正',{exact:true}).click();
  await page.locator('label').filter({hasText:/^環境考察・仮説/}).locator('textarea').fill('修正後の仮説です。構築別の対戦記録を追加で確認します。');
  await button('修正をJSONに反映').click();
  assert.match(await pasted.inputValue(),/構築別の対戦記録を追加/);
  await preview();await button('下書き保存').click();await notice('下書きを保存');
  assert.deepEqual(await (await admin.request.get(memberApi)).json(),data);
  await preview();await page.getByLabel('公開内容と前回からの変更を確認しました').check();
  await button('確認した下書きを公開').click();await notice('公開しました');
  const revisedReport = await openReport(reportPage);
  await revisedReport.getByText('大きな評価の乖離は確認されていません。',{exact:true}).first().waitFor();
  await page.getByLabel('修正・復元・失敗の理由').fill('初版を復元');
  await page.getByRole('button',{name:'この公開版へ復元',exact:true}).last().click();
  await notice('選択した公開版を復元');
  assert.deepEqual(await (await admin.request.get(memberApi)).json(),data);
  const unauthenticated = await contextFor(browser,null);
  assert.equal((await unauthenticated.request.get(memberApi)).status(),401);
  reports.add('新旧環境の分離、公開停止と履歴復元、未認証アクセス拒否、PC・スマホ・ライト・ダーク表示');
  await button('スナップショットを作成').click(); await notice('集計を保存');
  const [modernFile] = await Promise.all([page.waitForEvent('download'),button('分析用JSONを出力').click()]);
  const modern = JSON.parse(fs.readFileSync(await modernFile.path(),'utf8'));
  assert.equal(modern.snapshot.schemaVersion,2);
  assert.equal(modern.snapshot.matchCount,62);
  assert.equal(modern.previousEvaluation.run_id,data.run_id);
  assert.ok(modern.candidates.length >= modern.snapshot.decks.length);
  const sameCutoff = await page.request.post(origin+endpoint,{headers:{Origin:origin},data:{action:'create',environment:ids.env}});
  assert.deepEqual(await sameCutoff.json(),{id:modern.snapshot.snapshotId});
  await pasted.fill(JSON.stringify(input)); await button('検証してプレビュー').click();
  await page.locator('fieldset [role=alert]').waitFor();
  await pasted.fill(JSON.stringify(modern.template)); await preview();
  const comparison = page.getByText('新旧ルール・総合評価の比較',{exact:true}).locator('..');
  await comparison.getByRole('columnheader',{name:'改善候補C'}).waitFor();
  await comparison.scrollIntoViewIfNeeded();
  await page.screenshot({path:path.join(output,'v2-admin-desktop-light.png')});
  await button('下書き保存').click(); await notice('下書きを保存');
  await preview(); await page.getByLabel('公開内容と前回からの変更を確認しました').check();
  await button('確認した下書きを公開').click(); await notice('公開しました');
  const v2 = await (await admin.request.get(memberApi)).json();
  assert.equal(v2.payload.snapshot.schemaVersion,2);
  assert.doesNotMatch(JSON.stringify(v2), /previousEvaluation|omissionReason|reasonCodes|candidateTier|topContributorShare|"internal"|"sources"/);
  async function openDeck(tab) {
    await tab.goto(environmentUrl);
    await tab.getByRole('tab',{name:'総合環境評価'}).click();
    const panel = tab.getByRole('tabpanel',{name:'総合環境評価'});
    const deck = panel.getByRole('heading',{name:'デッキ別総合評価'}).locator('..').locator('details > summary').filter({hasText:'コンボエルフ'}).first();
    await deck.click();
    await deck.locator('..').getByText('Tier判定対象の実測勝率',{exact:true}).waitFor();
    await deck.locator('..').getByText('95% Wilson区間',{exact:true}).waitFor();
    await deck.evaluate(el=>el.scrollIntoView({block:'start'}));
  }
  await openDeck(reportPage);
  await reportPage.screenshot({path:path.join(output,'v2-member-desktop-light.png')});
  await openDeck(mobile);
  assert.ok(await mobile.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  await mobile.screenshot({path:path.join(output,'v2-member-mobile-dark.png')});
  await mobile.getByRole('combobox',{name:'環境',exact:true}).selectOption(ids.env2);
  await mobile.getByRole('tabpanel',{name:'総合環境評価'}).getByRole('heading',{name:'評価準備中'}).waitFor();
  for (const width of [390,320]) {
    await mobile.setViewportSize({width,height:844});
    assert.ok(await mobile.evaluate(()=>document.documentElement.scrollWidth <= innerWidth));
    const bounds = await mobile.getByRole('tab',{name:'総合環境評価'}).boundingBox();
    assert.ok(bounds && bounds.x >= 0 && bounds.x + bounds.width <= width);
  }
  await mobile.setViewportSize({width:390,height:844});
  await mobile.screenshot({path:path.join(output,'environment-admin-empty-mobile.png')});
  reports.add('環境画面の権限別タブ、キーボード移動、未選択時の通信、評価準備中、環境切替、v2公開版を確認');
  await mobileAdmin.goto(adminUrl);
  await mobileAdmin.getByRole('button',{name:'検証してプレビュー'}).click();
  await mobileAdmin.getByText('新旧ルール・総合評価の比較',{exact:true}).evaluate(el=>el.scrollIntoView({block:'start'}));
  assert.ok(await mobileAdmin.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  await mobileAdmin.screenshot({path:path.join(output,'v2-admin-mobile-dark.png')});
  reports.add('同一締切のv1とv2、旧JSON拒否、比較表・実測母集団・公開画面を確認');
  assert.deepEqual(errors,[]);
}

run().then(()=>console.log([...reports].join('\n'))).catch(error=>{console.error(error);process.exitCode=1;});
