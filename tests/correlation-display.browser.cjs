/* eslint-disable @typescript-eslint/no-require-imports */
const assert=require('node:assert/strict'),path=require('node:path'),sharp=require('sharp'),{randomUUID}=require('node:crypto');
module.exports=async({page,context,db,origin,report,out,observe})=>{
 const {newTierDocument}=require('../src/lib/creator/model');
 const {identity,uuid}=require('./creator-db.cjs');
 const post=async data=>{const r=await context.request.post(origin+'/admin/creator/api',{headers:{Origin:origin},data});assert.equal(r.status(),200,await r.text());return r.json();};
 const names=['ハイランダーネメシス','ランプドラゴン','コンボエルフ','未設定の画像.png','ハイランダーネメシス・コントロール構築'];
 const filenames=['ハイランダーN.png','ランプD.png','全く異なるファイル名.png',names[3],'長い名称.png'];
 await db.exec('reset role');
 for(const i of [0,1,2,4])await db.query('insert into public.deck_archetypes(id,name) values($1,$2)',[uuid(100+i),names[i]]);
 await identity(db);
 const files=await Promise.all(filenames.map(async(name,i)=>({name,mimeType:'image/png',buffer:await sharp({create:{width:i===3?128:600,height:i===3?128:315,channels:4,background:['#34d399','#60a5fa','#fbbf24',{r:236,g:72,b:153,alpha:.5},'#c084fc'][i]}}).png().toBuffer()})));
 await page.getByLabel('画像アップロード').setInputFiles(files);await page.getByRole('status').filter({hasText:'5枚の画像を保存しました'}).waitFor();
 let images=(await db.query('select * from public.creator_images')).rows;
 images=filenames.map(name=>images.find(image=>image.name===name));
 for(const i of [0,1,2,4])await post({action:'edit-image',id:images[i].id,revision:images[i].revision,name:images[i].name,archetypeId:uuid(100+i)});
 const document=newTierDocument();document.title='Tierの画像名はそのまま';document.showNames=true;document.rows[0].imageIds=images.map(i=>i.id);
 const {work}=await post({action:'save',document});
 const {correlation}=await post({action:'create-correlation',tierId:work.id,tierRevision:work.revision});
 const positions=[[200,220],[840,220],[1480,220],[1480,700],[200,700]];
 const nodes=images.map((image,i)=>({id:randomUUID(),imageId:image.id,x:positions[i][0],y:positions[i][1],width:i===4?240:160,height:i===4?276:184}));
 const specs=[[0,1,'forward','有利',60,10],[1,2,'forward','微有利',55,null],[2,3,'forward','',null,15],[3,4,'bidirectional','構築次第',null,null],[4,0,'forward','有利',null,null],[0,3,'bidirectional','有利',null,null]];
 const edges=specs.map(([a,b,type,label,winRate,matchCount])=>({id:randomUUID(),sourceNodeId:nodes[a].id,targetNodeId:nodes[b].id,type,label,winRate,matchCount,visible:true,origin:'manual',dataSource:'manual'}));
 const graphDoc={...correlation.document,title:'9/29能力調整後 相関図',showTitle:true,showNames:true,nodes,edges};
 await post({action:'save-correlation',id:correlation.id,revision:correlation.revision,document:graphDoc});
 const persisted=async()=>({images:(await db.query('select * from public.creator_images order by id')).rows,tier:(await db.query('select * from public.creator_tier_works')).rows,graphs:(await db.query('select * from public.creator_correlations')).rows});
 const before=await persisted();
 await page.goto(origin+'/admin/creator/tier/'+work.id+'/correlation',{waitUntil:'networkidle'});
 const labels=p=>p.locator('[data-correlation-name]').allTextContents();
 const check=async p=>{
  assert.deepEqual(await labels(p),names);
  assert.equal(await p.locator('[data-correlation-legend]').count(),1);
  assert.equal(await p.locator('[data-correlation-legend]').textContent(),'矢印方向：有利側 → 不利側（片方向のみ）');
  assert.deepEqual(await p.locator('[data-edge-id]').allTextContents(),['60% / 10戦','微有利55%','15戦','構築次第','','']);
  assert.equal(await p.locator('[data-edge-id] polygon').count(),8);
 };
 await check(page);
 assert.equal(await page.getByLabel('矢印1のラベル',{exact:true}).inputValue(),'有利');
 if(process.env.CREATOR_BROWSER_HOLD==='1'){console.log('READY_FOR_DISPLAY_CHECK');await new Promise(r=>setTimeout(r,45000));}
 report.viewports=[];
 for(const width of [1920,1440,768,390,320]){
  await page.setViewportSize({width,height:1080});
  await page.locator('[data-correlation-preview]').scrollIntoViewIfNeeded();
  await check(page);
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  const metrics=await page.locator('[data-correlation-name]').evaluateAll(es=>es.map(e=>{
   const b=e.getBoundingClientRect(),parent=e.parentElement.getBoundingClientRect(),img=e.parentElement.querySelector('img').getBoundingClientRect();
   return {font:parseFloat(getComputedStyle(e).fontSize),textOverflow:getComputedStyle(e).textOverflow,overflow:e.scrollHeight>e.clientHeight+1||e.scrollWidth>e.clientWidth+1,overlapsImage:b.top<img.bottom-.1,inside:b.bottom<=parent.bottom+.1};
  }));
  assert.ok(metrics.every(m=>!m.overflow&&!m.overlapsImage&&m.inside&&m.textOverflow!=='ellipsis'),JSON.stringify(metrics));
  report.viewports.push({width,metrics});
  await page.screenshot({path:path.join(out,'editor-'+width+'.png'),fullPage:true});
  if(width<=768){
   await page.getByRole('button',{name:'原寸で確認',exact:true}).click();
   await page.locator('[data-correlation-canvas]').evaluate(e=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve(e.offsetWidth)))));
   const control=page.locator('[data-node-id="'+nodes[0].id+'"]');
   await control.scrollIntoViewIfNeeded();
   const b=await control.boundingBox();assert.equal(Math.round(b.width),160);
   const x=Number(await page.getByLabel('X座標',{exact:true}).inputValue());
   await page.mouse.move(b.x+b.width/2,b.y+b.height/2);await page.mouse.down();await page.mouse.move(b.x+b.width/2+20,b.y+b.height/2,{steps:5});await page.mouse.up();
   assert.equal(Number(await page.getByLabel('X座標',{exact:true}).inputValue()),x+20);
   await page.getByLabel('X座標',{exact:true}).fill(String(x));
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
   await page.locator('[data-correlation-preview]').scrollIntoViewIfNeeded();
   await page.screenshot({path:path.join(out,'actual-size-'+width+'.png')});
   await page.getByRole('button',{name:'原寸で確認',exact:true}).click();
  }
 }
 await page.setViewportSize({width:1920,height:1080});
 await page.reload({waitUntil:'networkidle'});
 const obs=await context.newPage();observe(obs);await obs.setViewportSize({width:1920,height:1080});
 await obs.goto(origin+'/admin/obs/correlation/'+work.id,{waitUntil:'networkidle'});await check(obs);
 await obs.screenshot({path:path.join(out,'correlation-obs.png')});
 const download=page.waitForEvent('download');await page.getByRole('button',{name:'相関図PNG',exact:true}).click();
 const png=path.join(out,'correlation.png');await(await download).saveAs(png);const meta=await sharp(png).metadata();assert.equal(meta.width,1920);assert.equal(meta.height,1080);
 const a=await sharp(png).removeAlpha().raw().toBuffer(),b=await sharp(path.join(out,'correlation-obs.png')).removeAlpha().raw().toBuffer();
 let diff=0;for(let i=0;i<a.length;i++)diff+=Math.abs(a[i]-b[i]);report.pngObsPixelMean=diff/a.length;assert.ok(report.pngObsPixelMean<3);
 await obs.goto(origin+'/admin/obs/set/'+work.id,{waitUntil:'networkidle'});await check(obs);
 assert.deepEqual(await obs.locator('[data-tier-artwork] img').evaluateAll(es=>es.map(e=>e.alt)),filenames);
 const set=await obs.locator('[data-correlation-artwork]').screenshot({path:path.join(out,'set-correlation.png')});
 const setPixels=await sharp(set).removeAlpha().raw().toBuffer();let setDiff=0;
 for(let i=0;i<b.length;i++)setDiff+=Math.abs(setPixels[i]-b[i]);
 report.setObsPixelMean=setDiff/b.length;assert.ok(report.setObsPixelMean<0.05,'standalone and set differ only by rasterization rounding');
 await page.getByLabel('相関図タイトルを表示',{exact:true}).uncheck();assert.equal(await page.locator('[data-correlation-legend]').evaluate(e=>e.style.top),'32px');
 await page.getByLabel('矢印ラベルを表示',{exact:true}).uncheck();assert.deepEqual(await page.locator('[data-edge-id]').allTextContents(),['60% / 10戦','55%','15戦','','','']);
 await page.getByLabel('勝率・対戦数を表示',{exact:true}).uncheck();assert.deepEqual(await page.locator('[data-edge-id]').allTextContents(),['','','','','','']);
 for(const i of [1,2,3,5])await page.getByLabel('矢印'+i+'を表示',{exact:true}).uncheck();
 assert.equal(await page.locator('[data-correlation-legend]').count(),0);
 await page.reload({waitUntil:'networkidle'});await check(page);
 assert.deepEqual(await persisted(),before,'display, zoom, PNG and OBS never modify saved documents/image records');
 report.checks.push('ID-only official names, unset fallback, long names without ellipsis/overlap, labels/stats combinations, bidirectional semantics, five widths and small-screen original-size drag, PNG1920 and standalone/set OBS parity, original labels/images/documents unchanged, Tier filenames unchanged');
 await obs.close();
};
