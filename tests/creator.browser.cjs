/* eslint-disable @typescript-eslint/no-require-imports */
// Real Next routes + real migrated local Postgres. Only Auth/Storage HTTP transport
// is emulated in memory; never reads environment credentials or connects remotely.
const http = require('node:http'), fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || path.resolve('build/r1b-rank-compatibility/tools/node_modules/playwright'));
const sharp = require('sharp');
const { createDb, identity, ADMIN, MEMBER } = require('./creator-db.cjs');
const out = path.resolve(process.env.CREATOR_EVIDENCE_DIR || 'build/creator-evidence'), origin = 'http://localhost:3296';
fs.mkdirSync(out, { recursive: true });
const report = { checks: [], events: [], unexpected: [] };
let mode = 'admin', failUpload = false, failDelete = false;
const objects = new Map();
let chain = Promise.resolve();
const user = () => ({ id: mode === 'member' ? MEMBER : ADMIN, aud: 'authenticated', role: 'authenticated', is_anonymous: mode === 'guest', email: 'creator@example.test', app_metadata: {}, user_metadata: {} });
function json(res, status, body) { res.writeHead(status, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(body)); }
async function main() {
  const db = await createDb();
  const fixture=require('./obs-environment-fixture.cjs');
  if(process.env.CREATOR_BOARD==='1'){
    await db.exec('reset role');for(const deck of fixture.decks)await db.query('insert into public.deck_archetypes(id,name) values($1,$2)',[deck.id,deck.name]);await identity(db);
  }
  const api = http.createServer((req, res) => {
    chain = chain.then(async () => {
      let url;
      try {
        url = new URL(req.url, 'http://127.0.0.1:54339');
        const buffers = []; for await (const b of req) buffers.push(b);
        const bytes = Buffer.concat(buffers);
        if (url.pathname === '/auth/v1/user') return json(res, 200, user());
        await identity(db, mode === 'member' ? MEMBER : ADMIN, 'authenticated', mode === 'guest');
        if(url.pathname==='/rest/v1/environments')return json(res,200,[...fixture.environments,{...fixture.environments[0],id:fixture.id(2),name:'以前の環境',created_at:'2026-09-01T00:00:00Z'}]);
        if(url.pathname.startsWith('/rest/v1/rpc/')){
          const args=JSON.parse(bytes);report.rpcCalls??=[];report.rpcCalls.push({name:url.pathname.split('/').at(-1),args});
          if(url.pathname.endsWith('/get_environment_dashboard_aggregates_v3'))return json(res,200,fixture.dashboard(args));
          if(url.pathname.endsWith('/get_analysis_aggregates_v3_exclusive'))return json(res,200,args.p_environment_id===fixture.id(2)||Date.parse(args.p_played_to)-Date.parse(args.p_played_from)<2*86400000?{version:1,registeredMatches:0,perspectives:0,totalWins:0,groups:[],recent:[]}:require('./obs-matchups-fixture.cjs').aggregates());
          throw Error('Unexpected RPC');
        }
        if (url.pathname.startsWith('/storage/v1/object')) {
          const objectPath = decodeURIComponent(url.pathname.split('/creator-images/')[1] || '');
          if (req.method === 'POST') {
            if (failUpload) return json(res, 500, { message: 'Injected upload failure' });
            await db.query('insert into storage.objects(bucket_id,name) values($1,$2)', ['creator-images', objectPath]);
            objects.set(objectPath, { bytes, type: req.headers['content-type'] }); return json(res, 200, { Key: 'creator-images/' + objectPath });
          }
          if (req.method === 'DELETE') {
            if (failDelete) return json(res, 500, { message: 'Injected delete failure' });
            for (const key of JSON.parse(bytes).prefixes) {
              const result = await db.query('delete from storage.objects where name=$1 returning *', [key]);
              if (result.rows.length) objects.delete(key);
            }
            return json(res, 200, []);
          }
          const allowed = await db.query('select * from storage.objects where name=$1', [objectPath]);
          const object = allowed.rows.length ? objects.get(objectPath) : null;
          if (!object) return json(res, 404, { message: 'not found' });
          res.writeHead(200, { 'Content-Type': object.type }); res.end(object.bytes); return;
        }
        const table = url.pathname.split('/').at(-1);
        if (!['admin_users', 'deck_archetypes', 'creator_images', 'creator_tier_works', 'creator_tier_image_refs', 'creator_storage_cleanup', 'creator_correlations', 'creator_correlation_image_refs'].includes(table)) throw Error('Unexpected table: ' + table);
        const values = [], where = [];
        for (const [column, filter] of url.searchParams) {
          if (['select', 'order', 'limit', 'offset'].includes(column)) continue;
          assert.match(column, /^[a-z_]+$/);
          if (filter.startsWith('eq.')) { values.push(filter.slice(3)); where.push(`${column}=$${values.length}`); }
          else if (filter.startsWith('lt.')) { values.push(filter.slice(3)); where.push(`${column}<$${values.length}`); }
          else if (filter.startsWith('in.(')) { values.push(filter.slice(4, -1).split(',')); where.push(`${column}=any($${values.length}::uuid[])`); }
          else throw Error('Unexpected filter ' + filter);
        }
        const condition = where.length ? ' where ' + where.join(' and ') : '';
        let sql;
        if (req.method === 'GET' || req.method === 'HEAD') {
          sql = `select * from public.${table}${condition}`;
          if (url.searchParams.has('order')) { const [column, direction] = url.searchParams.get('order').split('.'); assert.match(column, /^[a-z_]+$/); sql += ` order by ${column} ${direction === 'desc' ? 'desc' : 'asc'}`; }
          if (url.searchParams.has('limit')) sql += ' limit ' + Number(url.searchParams.get('limit'));
        } else if (req.method === 'DELETE') sql = `delete from public.${table}${condition} returning *`;
        else {
          const body = JSON.parse(bytes); const columns = Object.keys(body); columns.forEach(c => assert.match(c, /^[a-z_]+$/));
          const slots = columns.map(c => { values.push(body[c]); return `$${values.length}`; });
          sql = req.method === 'POST' ? `insert into public.${table}(${columns.join(',')}) values(${slots.join(',')}) returning *` : `update public.${table} set ${columns.map((c,i) => c + '=' + slots[i]).join(',')}${condition} returning *`;
        }
        const { rows } = await db.query(sql, values);
        // getIsAdmin queries own row; mirror that behavior even on this small fixture.
        const result = table === 'admin_users' && mode !== 'admin' ? [] : rows;
        if (req.headers.accept?.includes('vnd.pgrst.object')) return result.length ? json(res, 200, result[0]) : json(res, 406, { code: 'PGRST116', details: 'The result contains 0 rows', message: '0 rows' });
        return json(res, 200, result);
      } catch (error) {
        if (!['23503', '23505', '23514', '42501'].includes(error.code)) report.unexpected.push(`${req.method} ${url?.pathname}: ${error.message}`);
        json(res, 400, { code: error.code, message: error.message });
      }
    }).catch(error => { report.unexpected.push(error.message); res.end(); });
  });
  await new Promise(resolve => api.listen(54339, '127.0.0.1', resolve));
  const log = fs.openSync(path.join(out, 'server.log'), 'w');
  const app = spawn(process.execPath, [require.resolve('next/dist/bin/next'), 'start', '-p', '3296'], { windowsHide: true, stdio: ['ignore', log, log], env: { ...process.env, NEXT_PUBLIC_SUPABASE_URL: 'http://127.0.0.1:54339', NEXT_PUBLIC_SUPABASE_ANON_KEY: 'test-public-key', NEXT_TELEMETRY_DISABLED: '1' } });
  let browser;
  try {
    for (let i = 0; i < 100; i++) { try { if ((await fetch(origin + '/privacy')).ok) break; } catch {} await new Promise(r => setTimeout(r, 200)); }
    browser = await chromium.launch({ headless: true, executablePath: process.env.CHROME_EXECUTABLE || 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', args: ['--remote-debugging-port=9356'] });
    const context = await browser.newContext({ viewport: { width: 1440, height: 1080 }, timezoneId: 'Asia/Tokyo' });
    await context.route('**/*', route => { const u = new URL(route.request().url()); if (['localhost', '127.0.0.1'].includes(u.hostname) || ['data:', 'blob:'].includes(u.protocol)) return route.continue(); report.unexpected.push('External request: ' + u.origin); return route.abort(); });
    const exp = Math.floor(Date.now() / 1000) + 3600;
    const token = ['eyJhbGciOiJIUzI1NiJ9', Buffer.from(JSON.stringify({ sub: ADMIN, exp })).toString('base64url'), 'fixture'].join('.');
    await context.addCookies([{ name: 'sb-127-auth-token', value: 'base64-' + Buffer.from(JSON.stringify({ access_token: token, refresh_token: 'fixture', expires_at: exp, expires_in: 3600, token_type: 'bearer', user: user() })).toString('base64url'), url: origin }]);
    const page = await context.newPage();
    const observe = p => { p.on('pageerror', e => report.events.push({ type: 'pageerror', message: e.message })); p.on('console', m => { if (['warning','error'].includes(m.type())) report.events.push({ type: m.type(), message: m.text() }); }); };
    observe(page); page.on('dialog', dialog => dialog.accept());
    await page.goto(origin + '/admin/creator/tier', { waitUntil: 'networkidle' });
    await page.getByRole('heading', { name: 'Tier表メーカー', exact: true }).waitFor();
    const png = await sharp({ create: { width: 128, height: 128, channels: 4, background: '#00cc88' } }).png().toBuffer();
    const transparent = await sharp({ create: { width: 128, height: 128, channels: 4, background: { r: 255, g: 0, b: 0, alpha: 0.5 } } }).png().toBuffer();
    const jpeg = await sharp(png).jpeg().toBuffer(), webp = await sharp(png).webp().toBuffer();
    const files = [{ name: 'デッキ.png', mimeType: 'image/png', buffer: png }, { name: '透明.png', mimeType: 'image/png', buffer: transparent }, { name: 'デッキ.jpg', mimeType: 'image/jpeg', buffer: jpeg }, { name: 'デッキ.webp', mimeType: 'image/webp', buffer: webp }];
    if(process.env.CREATOR_CORRELATION_DISPLAY==='1'){
      await require('./correlation-display.browser.cjs')({page,context,db,origin,report,out,observe});
      assert.deepEqual(report.events,[]);assert.deepEqual(report.unexpected,[]);return;
    }
    if(process.env.CREATOR_TRIM==='1'){
      await require('./creator-trim.browser.cjs')({page,context,browser,db,objects,origin,report,out,observe,setMode:v=>{mode=v;}});
      assert.deepEqual(report.events,[]);assert.deepEqual(report.unexpected,[]);return;
    }
    if(process.env.CREATOR_BOARD==='1'){
      await require('./creator-board.browser.cjs')({page,context,browser,db,origin,report,out,observe,setMode:v=>{mode=v;},files});
      assert.deepEqual(report.events,[]);assert.deepEqual(report.unexpected,[]);return;
    }
    if (process.env.CREATOR_PERF === '1') {
      await require('./creator-performance.browser.cjs')({page,files,report,out});
      return;
    }
    if (process.env.CREATOR_UX_EXTRA === '1') {
      await require('./creator-upload.browser.cjs')({page,db,objects,report});
      await require('./creator-ux-extra.browser.cjs')({page,files,report,out});
      assert.deepEqual(report.events,[]);assert.deepEqual(report.unexpected,[]);
      return;
    }
    await page.getByLabel('画像アップロード').setInputFiles(files);
    await page.getByRole('status').filter({ hasText: '4枚の画像を保存' }).waitFor();
    const library = page.getByRole('region', { name: '画像ライブラリ' });
    assert.equal(await library.locator('article').count(), 4);
    // OS file drop, same original filename: UUID object keys never collide.
    const dropped = await page.evaluateHandle(({ bytes }) => { const transfer = new DataTransfer(); for(let i=0;i<2;i++)transfer.items.add(new File([new Uint8Array(bytes)],'デッキ.png',{type:'image/png'})); return transfer; }, {bytes:[...png]});
    await library.locator('[class*="drop"]').dispatchEvent('drop',{dataTransfer:dropped}); await dropped.dispose();
    await page.getByRole('status').filter({hasText:'2枚の画像を保存'}).waitFor();
    assert.equal(await library.locator('article').count(),6);
    await library.locator('article button').first().click(); const asset=page.getByRole('region',{name:'選択画像の管理'});
    await asset.getByLabel('画像名',{exact:true}).fill('ドロップ画像');
    await asset.getByRole('combobox').selectOption({label:'標準デッキA'});
    await asset.getByRole('button',{name:'画像情報を保存',exact:true}).click(); await page.getByRole('status').filter({hasText:'変更を保存しました'}).waitFor();
    report.checks.push('JPG, PNG, WEBP, transparent PNG, file selection/drop, duplicate filenames, image rename/deck link through actual API and SQL');
    const row = name => page.getByRole('region', { name: `Tier ${name}`, exact: true });
    const items = name => row(name).locator('[class*="canvasItems"]');
    const buttons = name => items(name).locator('button');
    const dragAcrossScroll = async (from,to) => {
      await from.scrollIntoViewIfNeeded();const a=await from.boundingBox();
      await page.mouse.move(a.x+a.width/2,a.y+a.height/2);await page.mouse.down();
      await page.mouse.move(a.x+a.width/2+10,a.y+a.height/2,{steps:3});
      await to.scrollIntoViewIfNeeded();const b=await to.boundingBox();
      await page.mouse.move(b.x+b.width/2,b.y+b.height/2,{steps:8});await page.mouse.up();
    };
    await dragAcrossScroll(library.locator('article button').first(),items('S'));
    assert.equal(await buttons('S').count(),1);
    await library.locator('article button').nth(1).click();
    await page.getByRole('button',{name:'ここに配置：S',exact:true}).click();
    assert.equal(await buttons('S').count(),2);
    const originalOrder=await buttons('S').evaluateAll(es=>es.map(e=>e.getAttribute('aria-label').split(' (')[0]));
    await buttons('S').nth(1).dragTo(buttons('S').first());
    assert.deepEqual(await buttons('S').evaluateAll(es=>es.map(e=>e.getAttribute('aria-label').split(' (')[0])),[...originalOrder].reverse());
    await buttons('S').first().click();await page.getByRole('button',{name:'右へ',exact:true}).click();
    await buttons('S').first().click();await page.getByRole('button',{name:'右へ',exact:true}).click();
    await buttons('S').first().dragTo(items('A'));assert.equal(await buttons('A').count(),1);
    await buttons('S').first().click();await page.getByRole('button',{name:'ここに配置：B',exact:true}).click();
    await library.getByRole('button',{name:'透明.pngを選択',exact:true}).click();
    await page.getByRole('button',{name:'ここに配置：C',exact:true}).click();
    await page.getByLabel('作品タイトル', { exact: true }).fill('第3弾環境 Tier表');
    await page.getByLabel('1行目のTier名', { exact: true }).fill('環境トップ');
    await page.getByLabel('1行目の背景色', { exact: true }).fill('#123456');
    await page.getByRole('button', { name: 'Tier行を追加', exact: true }).click();
    await page.getByRole('button', { name: '6行目を上へ', exact: true }).click();
    await page.getByLabel('編集するTier',{exact:true}).selectOption({label:'D'}); await page.getByRole('button', { name: '行を削除', exact: true }).click();
    await page.getByRole('button', { name: 'Tier表を保存', exact: true }).click();
    await page.getByRole('status').filter({ hasText: 'Tier表を保存しました' }).waitFor();
    const obsHref = await page.getByRole('link', { name: 'OBS表示を開く' }).getAttribute('href');
    const saved = (await db.query('select * from public.creator_tier_works')).rows[0];
    assert.equal(saved.document.title, '第3弾環境 Tier表'); assert.equal(saved.document.rows[0].color, '#123456');
    assert.deepEqual(saved.document.rows.map(r => r.name), ['環境トップ','A','B','C','Tier 6']);
    report.checks.push('DnD library placement, cross-tier move, same-tier order, click/keyboard alternative, row/title/color edits, SQL save');
    await page.reload({ waitUntil: 'networkidle' });
    await page.getByRole('button', { name: '再編集', exact: true }).click();
    assert.equal(await page.getByLabel('作品タイトル', { exact: true }).inputValue(), saved.document.title);
    for (const width of [1920,1440,768,390,320]) {
      await page.setViewportSize({ width, height: 1080 });
      await page.screenshot({ path: path.join(out, `editor-${width}.png`), fullPage: true });
      const escaped = await page.locator('main').evaluate(el => [...el.querySelectorAll('button,input,select,a')].filter(n => { const b = n.getBoundingClientRect(); return !n.closest('[data-library-strip]') && b.width && (b.right > innerWidth + 1 || b.left < -1); }).map(n => n.outerHTML.slice(0,100)));
      assert.deepEqual(escaped, [], `${width}px controls fit`);
    }
    await page.setViewportSize({ width: 1920, height: 1080 });
    const obs = await context.newPage(); observe(obs); await obs.setViewportSize({width:1920,height:1080});
    const artwork = p => p.locator('[data-tier-artwork]').evaluate(el => ({ text:el.textContent, elements:[...el.querySelectorAll('*')].map(n => { const s=getComputedStyle(n); return [n.tagName,n.getAttribute('src'),s.width,s.height,s.backgroundColor,s.fontSize]; }) }));
    await obs.goto(origin + obsHref, { waitUntil: 'networkidle' });
    assert.equal(await obs.locator('button,nav,input,select').count(), 0);
    assert.deepEqual(await artwork(obs), await artwork(page));
    await obs.screenshot({ path: path.join(out, 'obs.png') });
    const download = page.waitForEvent('download'); await page.getByRole('button', { name: 'PNG出力', exact: true }).click();
    const pngPath = path.join(out, 'tier.png'); await (await download).saveAs(pngPath);
    const info = await sharp(pngPath).metadata(); assert.equal(info.width,1920); assert.equal(info.height,1080);
    // Screenshot and exported PNG use identical artwork, allow small font rasterization differences.
    const actual = await sharp(pngPath).removeAlpha().raw().toBuffer();
    const expected = await sharp(path.join(out,'obs.png')).removeAlpha().raw().toBuffer();
    let diff = 0; for(let i=0;i<actual.length;i++) diff += Math.abs(actual[i]-expected[i]);
    assert.ok(diff / actual.length < 3, 'PNG and OBS visually match'); report.pixelMeanDifference = diff / actual.length;
    // Transparent source pixels must blend into the row background (no opaque box).
    const alphaImage = obs.locator('[data-tier-artwork] img[alt="透明.png"]');
    const alphaBox = await alphaImage.boundingBox();
    const alphaPixel = await sharp(pngPath).extract({left:Math.floor(alphaBox.x+32),top:Math.floor(alphaBox.y+32),width:1,height:1}).removeAlpha().raw().toBuffer();
    assert.ok(alphaPixel[0] > 130 && alphaPixel[0] < 155 && alphaPixel[1] > 10 && alphaPixel[1] < 30);
    await page.getByLabel('タイトルを表示', { exact: true }).uncheck();
    await page.getByLabel('PNG・OBSの背景を透明にする', { exact: true }).check();
    const transparentDownload = page.waitForEvent('download'); await page.getByRole('button', { name: 'PNG出力', exact: true }).click();
    const transparentPath = path.join(out, 'tier-transparent.png'); await (await transparentDownload).saveAs(transparentPath);
    const rgba = await sharp(transparentPath).ensureAlpha().raw().toBuffer(); assert.equal(rgba[3],0);
    await page.getByRole('button', { name: 'Tier表を保存', exact: true }).click(); await page.getByRole('status').filter({ hasText: 'Tier表を保存しました' }).waitFor();
    await obs.goto(origin + obsHref + '?transparent=1', { waitUntil:'networkidle' });
    assert.deepEqual(await artwork(obs), await artwork(page));
    assert.equal(await obs.locator('body').evaluate(el => getComputedStyle(el).backgroundColor), 'rgba(0, 0, 0, 0)');
    report.checks.push('reload/re-edit, all five widths, PNG 1920x1080 and OBS same DOM/pixels, transparency, title off, saved OBS refresh');
    // Validate malformed upload at the actual server boundary (UI deliberately bypassed).
    const apiPost = body => context.request.post(origin + '/admin/creator/api', { headers:{ Origin:origin }, data:body });
    for (const bad of [{ name:'bad.svg',mimeType:'image/svg+xml',buffer:Buffer.from('<svg/>') }, { name:'fake.png',mimeType:'image/png',buffer:Buffer.from('not an image') }, { name:'big.png',mimeType:'image/png',buffer:Buffer.alloc(4194305) }]) {
      const result = await context.request.post(origin + '/admin/creator/api', { headers:{Origin:origin},multipart:{file:bad} }); assert.ok(result.status()>=400);
    }
    const image = (await db.query('select * from public.creator_images order by created_at')).rows[0];
    const editResult = await apiPost({ action:'edit-image',id:image.id,revision:image.revision,name:'変更した画像',archetypeId:null }); assert.equal(editResult.status(),200);
    const updated = (await db.query('select * from public.creator_images where id=$1',[image.id])).rows[0];
    failUpload=true;
    const failedReplacement = await context.request.post(origin+'/admin/creator/api',{headers:{Origin:origin},multipart:{file:files[0],id:updated.id,revision:String(updated.revision)}});
    assert.ok(failedReplacement.status()>=400); failUpload=false;
    assert.equal((await db.query('select object_path from public.creator_images where id=$1',[image.id])).rows[0].object_path,updated.object_path);
    failDelete=true;
    const replacement = await context.request.post(origin+'/admin/creator/api',{headers:{Origin:origin},multipart:{file:files[0],id:updated.id,revision:String(updated.revision)}}); assert.equal(replacement.status(),200);
    assert.ok((await replacement.json()).warning); failDelete=false;
    assert.equal((await apiPost({action:'cleanup'})).status(),200);
    const referenced = (await db.query('select i.* from public.creator_images i join public.creator_tier_image_refs r on r.image_id=i.id limit 1')).rows[0];
    assert.equal((await apiPost({action:'delete-image',id:referenced.id,revision:referenced.revision})).status(),409);
    assert.equal((await apiPost({action:'save',id:saved.id,revision:1,document:saved.document})).status(),409);
    assert.equal((await context.request.post(origin+'/admin/creator/api',{headers:{Origin:'https://invalid.test'},data:{action:'cleanup'}})).status(),403);
    report.checks.push('MIME/content/size rejection, rename, replacement failure preserves old file, cleanup retry, used-image rejection, stale-save conflict, cross-origin rejection');
    for(const role of ['member','guest']) {
      mode=role;
      assert.equal((await context.request.get(origin+'/admin/creator/api')).status(),role==='member'?403:401);
      assert.equal((await apiPost({action:'cleanup'})).status(),role==='member'?403:401);
      assert.equal((await context.request.get(origin+`/admin/creator/images/${image.id}`)).status(),role==='member'?403:401);
      for(const route of ['/admin/creator','/admin/creator/tier',obsHref]) { const r=await context.request.get(origin+route,{maxRedirects:0}); assert.equal(r.status(),307); }
    }
    mode='admin';
    const anon = await browser.newContext();
    assert.equal((await anon.request.get(origin+'/admin/creator/api')).status(),401);
    assert.equal((await anon.request.get(origin+obsHref,{maxRedirects:0})).status(),307); await anon.close();
    if (process.env.CREATOR_PHASE2 === '1') await require('./correlation.browser.cjs')({page,context,browser,db,origin,report,out,observe,setMode:value=>{mode=value;},files});
    await page.goto(origin+'/admin/creator/tier',{waitUntil:'networkidle'});
    await page.getByRole('button',{name:'作品を削除',exact:true}).click();
    await page.getByRole('status').filter({hasText:'変更を保存しました'}).waitFor();
    assert.equal((await db.query('select * from public.creator_tier_works')).rows.length,0);
    const remaining=(await db.query('select * from public.creator_images where id=$1',[referenced.id])).rows[0];
    assert.equal((await apiPost({action:'delete-image',id:remaining.id,revision:remaining.revision})).status(),200);
    report.checks.push('admin/member/guest/anon direct routes and API permissions, work deletion and now-unused image deletion');
    await require('./creator-upload.browser.cjs')({page,db,objects,report});
    assert.deepEqual(report.unexpected,[]); assert.deepEqual(report.events,[]);
    if(process.env.CREATOR_BROWSER_HOLD==='1') { console.log('READY_FOR_AGENT_BROWSER'); await new Promise(r=>setTimeout(r,45000)); }
    console.log(JSON.stringify(report,null,2));
  } finally {
    fs.writeFileSync(path.join(out,'report.json'),JSON.stringify(report,null,2));
    await browser?.close(); app.kill(); await new Promise(resolve=>api.close(resolve)); await db.close(); fs.closeSync(log);
  }
}
main().catch(error=>{console.error(error);process.exitCode=1;});
