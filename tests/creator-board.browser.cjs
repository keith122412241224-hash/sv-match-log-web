/* eslint-disable @typescript-eslint/no-require-imports */
const assert=require('node:assert/strict'),path=require('node:path'),sharp=require('sharp');
module.exports=async({page,context,browser,db,origin,report,out,observe,setMode,files})=>{
 const fixture=require('./obs-environment-fixture.cjs');
 const post=async data=>{const r=await context.request.post(origin+'/admin/creator/api',{headers:{Origin:origin},data});assert.equal(r.status(),200,await r.text());return r.json();};
 const row=n=>page.getByRole('region',{name:'Tier '+n,exact:true}).locator('[class*="canvasItems"]');
 const library=page.getByRole('region',{name:'画像ライブラリ'});
 const wide={name:'wide.png',mimeType:'image/png',buffer:await sharp({create:{width:800,height:80,channels:4,background:'#8044cc'}}).png().toBuffer()};
 const tall={name:'tall.png',mimeType:'image/png',buffer:await sharp({create:{width:80,height:200,channels:4,background:'#ee9900'}}).png().toBuffer()};
 const uploads=[...files,wide,tall];await page.getByLabel('画像アップロード').setInputFiles(uploads);await page.getByRole('status').filter({hasText:'6枚の画像を保存しました'}).waitFor();
 const images=(await db.query('select * from public.creator_images order by name')).rows;
 for(let i=0;i<5;i++)await post({action:'edit-image',id:images[i].id,revision:images[i].revision,name:images[i].name,archetypeId:fixture.decks[i].id});
 await page.reload({waitUntil:'networkidle'});
 if(process.env.CREATOR_BROWSER_HOLD==='1'){console.log('READY_FOR_INITIAL_BOARD_CHECK');await new Promise(r=>setTimeout(r,45000));}
 for(const [width,height]of [[1920,1080],[1440,900],[1366,768]]){
  await page.setViewportSize({width,height});await page.getByRole('button',{name:'新しいTier表',exact:true}).click();await page.evaluate(()=>scrollTo(0,0));
  const preview=await page.locator('[data-tier-preview]').boundingBox(),strip=await library.locator('[aria-label="画像一覧（横スクロール）"]').boundingBox();
  await page.screenshot({path:path.join(out,'board-fit-'+width+'.png'),fullPage:true});
  assert.ok(preview.y>=0&&preview.y+preview.height<=height,JSON.stringify({width,height,preview}));assert.ok(strip.y>=preview.y+preview.height&&strip.y+strip.height<=height,JSON.stringify({width,height,strip}));
  const source=library.getByRole('button',{name:images[0].name+'を選択',exact:true});
  for(const name of ['S','A','B','C','D']){const scroll=await page.evaluate(()=>scrollY);await source.dragTo(row(name));assert.equal(await row(name).locator('button').count(),1);assert.equal(await page.evaluate(()=>scrollY),scroll,'one drag without page scrolling');}
  await row('D').locator('button').first().dragTo(row('S'));assert.equal(await row('S').locator('button').count(),2);
  await library.getByRole('button',{name:images[1].name+'を選択',exact:true}).dragTo(row('S'));const old=await row('S').locator('button').evaluateAll(es=>es.map(e=>e.getAttribute('aria-label').split(' (')[0]));await row('S').locator('button').last().dragTo(row('S').locator('button').first());assert.deepEqual(await row('S').locator('button').evaluateAll(es=>es.map(e=>e.getAttribute('aria-label').split(' (')[0])),[old[2],old[0],old[1]]);
  await page.screenshot({path:path.join(out,'board-'+width+'.png'),fullPage:true});
 }
 report.checks.push('1920/1440/1366 desktop: full S-D and horizontal library visible together, each row reached in one drag without scroll; cross-tier and same-tier reorder');
 await page.setViewportSize({width:1920,height:1080});await page.getByRole('button',{name:'新しいTier表',exact:true}).click();
 for(let i=0;i<images.length;i++){await library.getByRole('button',{name:images[i].name+'を選択',exact:true}).dragTo(row(['S','A','B','C','D','S'][i]));}
 await page.getByLabel('作品タイトル',{exact:true}).fill('制作ボード検証');await page.getByRole('button',{name:'Tier表を保存',exact:true}).click();await page.getByRole('status').filter({hasText:'Tier表を保存しました'}).waitFor();let tier=(await db.query('select * from public.creator_tier_works')).rows[0];
 await page.reload({waitUntil:'networkidle'});await page.getByRole('button',{name:'再編集',exact:true}).click();assert.equal(await page.locator('[data-tier-artwork] img').count(),6);
 const {tierLayout,tierImagePosition}=require('../src/lib/creator/model');const layout=tierLayout(tier.document);for(const n of [0,1,2,3,4]){assert.ok(layout.imageSize/layout.heights[n]>=.75);}
 const artwork=async p=>p.locator('[data-tier-artwork]').evaluate(el=>[...el.querySelectorAll('img')].map(img=>({src:img.getAttribute('src'),width:getComputedStyle(img).width,height:getComputedStyle(img).height,fit:getComputedStyle(img).objectFit,natural:[img.naturalWidth,img.naturalHeight]})));
 const obs=await context.newPage();observe(obs);await obs.setViewportSize({width:1920,height:1080});await obs.goto(origin+'/admin/obs/tier/'+tier.id,{waitUntil:'networkidle'});assert.deepEqual(await artwork(page),await artwork(obs));assert.ok((await artwork(obs)).every(v=>v.fit==='contain'));
 const compare=async(button,file,obsFile)=>{await obs.screenshot({path:path.join(out,obsFile)});const d=page.waitForEvent('download');await page.getByRole('button',{name:button,exact:true}).click();await(await d).saveAs(path.join(out,file));const meta=await sharp(path.join(out,file)).metadata();assert.equal(meta.width,1920);assert.equal(meta.height,1080);const a=await sharp(path.join(out,file)).removeAlpha().raw().toBuffer(),b=await sharp(path.join(out,obsFile)).removeAlpha().raw().toBuffer();let diff=0;for(let i=0;i<a.length;i++)diff+=Math.abs(a[i]-b[i]);assert.ok(diff/a.length<3);report[file+'PixelMean']=diff/a.length;};
 await compare('PNG出力','board-tier.png','board-tier-obs.png');
 const pixels=await sharp(path.join(out,'board-tier.png')).raw().toBuffer({resolveWithObject:true});assert.ok(pixels.info.width===1920);
 assert.ok(tierImagePosition(layout,0).height>128);
 for(const width of [768,390,320]){await page.setViewportSize({width,height:1080});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);await page.screenshot({path:path.join(out,'board-'+width+'.png'),fullPage:true});}
 report.checks.push('row-derived larger frames, portrait/very-wide aspect containment, logical1920 PNG/editor/OBS match, save/reload, narrow widths');
 await page.setViewportSize({width:1920,height:1080});await page.getByRole('button',{name:'相関図を追加',exact:true}).first().click();await page.getByRole('heading',{name:'相関図を編集',exact:true}).waitFor();const read=async()=>(await db.query('select * from public.creator_correlations')).rows[0];let graph=await read();
 const source=graph.document.nodes.find(n=>n.imageId===images[0].id),target=graph.document.nodes.find(n=>n.imageId===images[1].id),missing=graph.document.nodes.find(n=>n.imageId===images[5].id);
 assert.equal(await page.getByLabel('集計期間',{exact:true}).inputValue(),'7d');assert.equal(await page.getByLabel('集計する環境',{exact:true}).inputValue(),fixture.environments[0].id);
 await page.getByLabel('接続元',{exact:true}).selectOption(source.id);await page.getByLabel('接続先',{exact:true}).selectOption(target.id);await page.getByRole('button',{name:'矢印を追加',exact:true}).click();
 const waitIdle=()=>page.getByRole('button',{name:'相関図を保存',exact:true}).waitFor();await waitIdle();assert.equal(await page.getByLabel('矢印1のデータソース',{exact:true}).inputValue(),'auto');
 const payload=await post({action:'load-matchups',selection:{environment:fixture.environments[0].id,period:'7d',ranks:require('../src/lib/rank-selection').RANK_ATOMS},imageIds:images.map(i=>i.id)});
 const cell=payload.cells.find(c=>c.sourceDeckId===fixture.decks[0].id&&c.targetDeckId===fixture.decks[1].id);assert.equal(Number(await page.getByLabel('矢印1の勝率',{exact:true}).inputValue()),Math.round(cell.winRate*10)/10);assert.equal(Number(await page.getByLabel('矢印1の対戦数',{exact:true}).inputValue()),cell.matchCount);
 await page.getByRole('button',{name:'方向を反転',exact:true}).first().click();await waitIdle();const reverse=payload.cells.find(c=>c.sourceDeckId===fixture.decks[1].id&&c.targetDeckId===fixture.decks[0].id);assert.equal(Number(await page.getByLabel('矢印1の勝率',{exact:true}).inputValue()),Math.round(reverse.winRate*10)/10);
 await page.getByLabel('集計期間',{exact:true}).selectOption('24h');assert.ok((await page.locator('[data-edge-data-status]').first().textContent()).includes('条件が変更'));await page.getByRole('button',{name:'データを更新',exact:true}).click();await page.getByRole('status').filter({hasText:'自動の矢印データを更新'}).waitFor();assert.equal(await page.getByLabel('矢印1の勝率',{exact:true}).inputValue(),'');assert.equal(await page.getByLabel('矢印1の対戦数',{exact:true}).inputValue(),'0');assert.ok((await page.locator('[data-edge-data-status]').first().textContent()).includes('データなし'));assert.ok(!(await page.locator('[data-edge-id]').textContent()).includes('0%'));
 await page.getByLabel('矢印1のデータソース',{exact:true}).selectOption('manual');await page.getByLabel('矢印1の勝率',{exact:true}).fill('63.2');await page.getByLabel('矢印1の対戦数',{exact:true}).fill('7');
 await page.getByLabel('集計する環境',{exact:true}).selectOption(fixture.id(2));await page.getByRole('button',{name:'データを更新',exact:true}).click();await page.getByRole('status').filter({hasText:'自動の矢印データを更新'}).waitFor();assert.equal(await page.getByLabel('矢印1の勝率',{exact:true}).inputValue(),'63.2');
 await page.getByLabel('接続先',{exact:true}).selectOption(missing.id);await page.getByRole('button',{name:'矢印を追加',exact:true}).click();assert.equal(await page.getByLabel('矢印2のデータソース',{exact:true}).inputValue(),'manual');assert.ok((await page.locator('[data-edge-data-status]').nth(1).textContent()).includes('デッキ未設定'));
 await page.getByLabel('矢印2のデータソース',{exact:true}).selectOption('auto');await waitIdle();assert.equal(await page.getByLabel('矢印2の勝率',{exact:true}).inputValue(),'');
 await page.getByLabel('集計期間',{exact:true}).selectOption('7d');await page.getByLabel('集計する環境',{exact:true}).selectOption(fixture.environments[0].id);await page.getByRole('button',{name:'候補を生成',exact:true}).click();
 const candidates=page.getByRole('region',{name:'相性候補'}),choices=candidates.getByRole('checkbox');await choices.first().waitFor();const total=await choices.count();assert.ok(total>1);for(let i=1;i<total;i++)await choices.nth(i).uncheck();await page.getByRole('button',{name:'選択した矢印を追加',exact:true}).click();assert.equal(await page.locator('[data-edge-editor]').count(),3);assert.equal(await page.getByLabel('矢印1の勝率',{exact:true}).inputValue(),'63.2');assert.equal(await page.getByLabel('矢印3のデータソース',{exact:true}).inputValue(),'auto');
 await page.getByRole('button',{name:'相関図を保存',exact:true}).click();await page.getByRole('status').filter({hasText:'相関図を保存しました'}).waitFor();graph=await read();await page.reload({waitUntil:'networkidle'});assert.equal(await page.getByLabel('矢印1のデータソース',{exact:true}).inputValue(),'manual');assert.equal(await page.getByLabel('矢印1の勝率',{exact:true}).inputValue(),'63.2');assert.equal(await page.getByLabel('矢印3のデータソース',{exact:true}).inputValue(),'auto');assert.deepEqual((await read()).document,graph.document);
 await obs.goto(origin+'/admin/obs/correlation/'+tier.id,{waitUntil:'networkidle'});await compare('相関図PNG','board-graph.png','board-graph-obs.png');
 for(const role of ['member','guest']){setMode(role);const r=await context.request.post(origin+'/admin/creator/api',{headers:{Origin:origin},data:{action:'load-matchups',selection:payload.selection,imageIds:images.map(i=>i.id)}});assert.equal(r.status(),role==='member'?403:401);}setMode('admin');const anon=await browser.newContext();assert.equal((await anon.request.post(origin+'/admin/creator/api',{headers:{Origin:origin},data:{action:'load-matchups'}})).status(),401);await anon.close();
 report.checks.push('auto on connect, RPC-direction reverse, period/environment explicit refresh, zero data not0%, unlinked image/manual fallback, manual preservation, candidates selectable without deleting manual edges, sources/snapshots save/reload, PNG/OBS, admin/member/guest/anon');
 await page.screenshot({path:path.join(out,'board-correlation-editor.png'),fullPage:true});
 console.log('READY_FOR_BOARD_BROWSER');if(process.env.CREATOR_BROWSER_HOLD==='1')await new Promise(r=>setTimeout(r,45000));await obs.close();
};
