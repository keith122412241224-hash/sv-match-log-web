/* eslint-disable @typescript-eslint/no-require-imports */
const assert=require('node:assert/strict'),sharp=require('sharp'),path=require('node:path'),{randomUUID}=require('node:crypto');
module.exports=async({page,context,browser,db,objects,origin,report,out,observe,setMode})=>{
 const {newTierDocument,imageUrl}=require('../src/lib/creator/model');
 const {ADMIN,identity}=require('./creator-db.cjs');
 const post=async data=>{const r=await context.request.post(origin+'/admin/creator/api',{headers:{Origin:origin},data});assert.equal(r.status(),200,await r.text());return r.json();};
 const pixels=Buffer.alloc(240*160*4);for(let y=40;y<120;y++)for(let x=90;x<150;x++){const i=(y*240+x)*4;pixels[i]=240;pixels[i+1]=60;pixels[i+2]=40;pixels[i+3]=x===90?1:200;}
 const png=await sharp(pixels,{raw:{width:240,height:160,channels:4}}).png().toBuffer(),webp=await sharp(png).webp({lossless:true}).toBuffer(),jpg=await sharp(png).flatten({background:'#fff'}).jpeg().toBuffer();
 // A saved image/work from the existing schema, before any upload or display derivation.
 const legacyId=randomUUID(),legacyPath=randomUUID()+'.png';objects.set(legacyPath,{bytes:png,type:'image/png'});
 await db.query('insert into storage.objects(bucket_id,name) values($1,$2)',['creator-images',legacyPath]);
 await db.query('insert into public.creator_images(id,name,object_path,created_by) values($1,$2,$3,$4)',[legacyId,'既存の透過画像',legacyPath,ADMIN]);
 const document=newTierDocument();document.title='既存作品・透明余白';document.rows[0].imageIds=[legacyId];
 const {work}=await post({action:'save',document});const {correlation}=await post({action:'create-correlation',tierId:work.id,tierRevision:work.revision});
 const before=(await db.query('select * from public.creator_images where id=$1',[legacyId])).rows[0];
 await page.goto(origin+'/admin/creator/tier?work='+work.id,{waitUntil:'networkidle'});
 if(process.env.CREATOR_BROWSER_HOLD==='1'){console.log('READY_FOR_TRIM_CHECK');await new Promise(r=>setTimeout(r,45000));}
 const artwork=page.locator('[data-tier-artwork] img');await artwork.evaluate(e=>e.decode());assert.deepEqual(await artwork.evaluate(e=>[e.naturalWidth,e.naturalHeight]),[60,80]);
 const originalResponse=await context.request.get(origin+imageUrl(before,'original'));assert.deepEqual(await originalResponse.body(),png);assert.deepEqual(objects.get(legacyPath).bytes,png);
 assert.deepEqual((await db.query('select * from public.creator_images where id=$1',[legacyId])).rows[0],before);assert.deepEqual((await db.query('select document from public.creator_tier_works where id=$1',[work.id])).rows[0].document,document);
 const obs=await context.newPage();observe(obs);await obs.setViewportSize({width:1920,height:1080});await obs.goto(origin+'/admin/obs/tier/'+work.id,{waitUntil:'networkidle'});
 const compare=async(button,file)=>{await obs.screenshot({path:path.join(out,file+'-obs.png')});const event=page.waitForEvent('download');await page.getByRole('button',{name:button,exact:true}).click();await(await event).saveAs(path.join(out,file+'.png'));const info=await sharp(path.join(out,file+'.png')).metadata();assert.equal(info.width,1920);assert.equal(info.height,1080);const a=await sharp(path.join(out,file+'.png')).removeAlpha().raw().toBuffer(),b=await sharp(path.join(out,file+'-obs.png')).removeAlpha().raw().toBuffer();let difference=0;for(let i=0;i<a.length;i++)difference+=Math.abs(a[i]-b[i]);assert.ok(difference/a.length<3);report[file+'PixelMean']=difference/a.length;};
 await compare('PNG出力','trim-tier');
 // Same image frame: compare visible artwork coverage with the retained original.
 const measure=async()=>{const p=await sharp(await obs.screenshot()).removeAlpha().raw().toBuffer({resolveWithObject:true});let count=0;for(let i=0;i<p.data.length;i+=3)if(p.data[i]>150&&p.data[i+1]<100&&p.data[i+2]<80)count++;return count;};
 const trimmedArea=await measure();await obs.locator('[data-tier-artwork] img').evaluate((e,src)=>{e.src=src;},imageUrl(before,'original'));await obs.locator('[data-tier-artwork] img').evaluate(e=>e.decode());const oldArea=await measure();assert.ok(trimmedArea>oldArea*4);report.visibleAreaRatio=trimmedArea/oldArea;
 await page.getByRole('region',{name:'画像ライブラリ'}).getByRole('button',{name:'既存の透過画像を選択',exact:true}).click();assert.equal(await page.getByRole('link',{name:'元画像を開く'}).getAttribute('href'),imageUrl(before,'original'));
 await page.getByLabel('画像アップロード').setInputFiles([{name:'padded.png',mimeType:'image/png',buffer:png},{name:'padded.webp',mimeType:'image/webp',buffer:webp},{name:'opaque.jpg',mimeType:'image/jpeg',buffer:jpg}]);await page.getByRole('status').filter({hasText:'3枚の画像を保存しました'}).waitFor();
 const uploaded=(await db.query('select * from public.creator_images where id<>$1 order by name',[legacyId])).rows;
 for(const i of uploaded){const bytes=i.name.endsWith('.png')?png:i.name.endsWith('.webp')?webp:jpg;assert.deepEqual(objects.get(i.object_path).bytes,bytes);assert.deepEqual(await(await context.request.get(origin+imageUrl(i,'original'))).body(),bytes);const img=page.getByRole('region',{name:'画像ライブラリ'}).getByRole('img',{name:i.name,exact:true});await img.evaluate(e=>e.decode());assert.deepEqual(await img.evaluate(e=>[e.naturalWidth,e.naturalHeight]),i.name.endsWith('.jpg')?[240,160]:[60,80]);}
 await page.goto(origin+'/admin/creator/tier/'+work.id+'/correlation',{waitUntil:'networkidle'});assert.deepEqual(await page.locator('[data-correlation-artwork] img').evaluate(e=>[e.naturalWidth,e.naturalHeight]),[60,80]);
 await obs.goto(origin+'/admin/obs/correlation/'+work.id,{waitUntil:'networkidle'});await compare('相関図PNG','trim-correlation');assert.deepEqual((await db.query('select document from public.creator_correlations where id=$1',[correlation.id])).rows[0].document,correlation.document);
 // Replacement keeps the ID and regenerates the derivative using the new object UUID.
 const replacement=await sharp({create:{width:100,height:100,channels:4,background:'#0000'}}).composite([{input:await sharp({create:{width:20,height:40,channels:4,background:'#00ff00'}}).png().toBuffer(),left:40,top:30}]).png().toBuffer();
 await page.goto(origin+'/admin/creator/tier?work='+work.id,{waitUntil:'networkidle'});await page.getByRole('region',{name:'画像ライブラリ'}).getByRole('button',{name:'既存の透過画像を選択',exact:true}).click();await page.getByLabel('画像を差し替え').setInputFiles({name:'replacement.png',mimeType:'image/png',buffer:replacement});await page.getByRole('status').filter({hasText:'1枚の画像を保存しました'}).waitFor();await page.reload({waitUntil:'networkidle'});assert.deepEqual(await page.locator('[data-tier-artwork] img').evaluate(e=>[e.naturalWidth,e.naturalHeight]),[20,40]);
 const replaced=(await db.query('select * from public.creator_images where id=$1',[legacyId])).rows[0];assert.notEqual(replaced.object_path,legacyPath);assert.deepEqual(await(await context.request.get(origin+imageUrl(replaced,'original'))).body(),replacement);
 await obs.goto(origin+'/admin/obs/correlation/'+work.id,{waitUntil:'networkidle'});assert.deepEqual(await obs.locator('[data-correlation-artwork] img').evaluate(e=>[e.naturalWidth,e.naturalHeight]),[20,40]);
 for(const role of ['member','guest']){setMode(role);for(const variant of ['trimmed','original'])assert.equal((await context.request.get(origin+imageUrl(replaced,variant))).status(),role==='member'?403:401);}setMode('admin');const anon=await browser.newContext();assert.equal((await anon.request.get(origin+imageUrl(replaced))).status(),401);await anon.close();
 await page.screenshot({path:path.join(out,'trim-editor.png'),fullPage:true});await obs.close();
 if(process.env.CREATOR_REPRO_DIR){
  await identity(db);
  const existing=new Set((await db.query('select id from public.creator_images')).rows.map(i=>i.id));
  await require('./creator-upload.browser.cjs')({page,db,objects,report});
  const actual=(await db.query('select * from public.creator_images')).rows.filter(i=>!existing.has(i.id));report.realMaterials=[];
  for(const i of actual){const source=objects.get(i.object_path).bytes;assert.deepEqual(await(await context.request.get(origin+imageUrl(i,'original'))).body(),source);const r=await context.request.get(origin+imageUrl(i));assert.equal(r.status(),200);const before=await sharp(source).metadata(),after=await sharp(await r.body()).metadata();report.realMaterials.push({name:i.name,original:[before.width,before.height],display:[after.width,after.height],trimmed:r.headers()['x-creator-image-variant']==='trimmed'});}
  const realDoc=newTierDocument();realDoc.title='実素材：縦横比を維持して高さを統一';realDoc.rows[0].imageIds=actual.slice(0,5).map(i=>i.id);
  const {work:realWork}=await post({action:'save',document:realDoc});await page.goto(origin+'/admin/creator/tier?work='+realWork.id,{waitUntil:'networkidle'});await page.locator('[data-tier-artwork][data-layout-ready="true"]').waitFor();
  const realObs=await context.newPage();observe(realObs);await realObs.setViewportSize({width:1920,height:1080});await realObs.goto(origin+'/admin/obs/tier/'+realWork.id,{waitUntil:'networkidle'});await realObs.locator('[data-tier-artwork][data-layout-ready="true"]').waitFor();
  report.realFrames=await realObs.locator('[data-tier-artwork] img').evaluateAll(es=>es.map(e=>({name:e.alt,width:parseFloat(e.style.width),height:parseFloat(e.style.height),natural:[e.naturalWidth,e.naturalHeight]})));assert.ok(report.realFrames.every(f=>Math.abs(f.width/f.height-f.natural[0]/f.natural[1])<.001&&f.height===144));
  await realObs.screenshot({path:path.join(out,'real-aspect-after.png')});await page.screenshot({path:path.join(out,'real-aspect-editor.png'),fullPage:true});
  const output=page.waitForEvent('download');await page.getByRole('button',{name:'PNG出力',exact:true}).click();await(await output).saveAs(path.join(out,'real-aspect.png'));
  // Reproduce only the old square presentation in this disposable local OBS DOM.
  await realObs.locator('[data-tier-artwork] img').evaluateAll(es=>es.forEach((e,i)=>{Object.assign(e.style,{width:'144px',height:'144px',left:(16+i*156)+'px'});}));await realObs.screenshot({path:path.join(out,'real-aspect-before.png')});await realObs.close();
  assert.deepEqual((await db.query('select document from public.creator_tier_works where id=$1',[realWork.id])).rows[0].document,realDoc);
  report.checks.push('real materials: original stored bytes preserved and display derivatives decode for every supplied image');
 }
 await identity(db);
 await require('./creator-aspect.browser.cjs')({page,context,db,objects,origin,report,out,observe});
 report.checks.push('legacy image/work untouched; PNG/WEBP upload originals byte-identical; library/Tier/correlation use alpha bounds; visible artwork larger at identical frame size; PNG/OBS1920 agree; original link; opaque JPG unchanged; replacement refreshes both; cached derivatives enforce admin authorization');
};
