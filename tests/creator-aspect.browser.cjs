/* eslint-disable @typescript-eslint/no-require-imports */
const assert=require('node:assert/strict'),sharp=require('sharp'),path=require('node:path');
module.exports=async({page,context,db,objects,origin,report,out,observe})=>{
 const {newTierDocument,imageUrl}=require('../src/lib/creator/model');
 const post=async data=>{const r=await context.request.post(origin+'/admin/creator/api',{headers:{Origin:origin},data});assert.equal(r.status(),200,await r.text());return r.json();};
 const sizes=[[600,315],[240,240],[120,300],[80,160],[300,150]],files=[];
 for(let i=0;i<sizes.length;i++){
  let buffer=await sharp({create:{width:sizes[i][0],height:sizes[i][1],channels:4,background:['#ff5533','#4488ff','#ffaa00','#00cc88','#aa55ee'][i]}}).png().toBuffer();
  if(i===3)buffer=await sharp({create:{width:400,height:400,channels:4,background:'#0000'}}).composite([{input:buffer,left:160,top:120}]).png().toBuffer();
  if(i===4)buffer=await sharp(buffer).ensureAlpha(.7).webp({lossless:true}).toBuffer();
  files.push({name:'aspect-'+i+(i===4?'.webp':'.png'),mimeType:i===4?'image/webp':'image/png',buffer});
 }
 await page.goto(origin+'/admin/creator/tier',{waitUntil:'networkidle'});await page.getByLabel('画像アップロード').setInputFiles(files);await page.getByRole('status').filter({hasText:'5枚の画像を保存しました'}).waitFor();
 const images=(await db.query("select * from public.creator_images where name like 'aspect-%' order by name")).rows;assert.equal(images.length,5);
 for(let i=0;i<5;i++){assert.deepEqual(objects.get(images[i].object_path).bytes,files[i].buffer);assert.deepEqual(await(await context.request.get(origin+imageUrl(images[i],'original'))).body(),files[i].buffer);}
 const document=newTierDocument();document.title='縦横比の比較：横長・正方形・縦長・透過余白あり・なし';document.rows[0].imageIds=images.map(i=>i.id);document.rows[1].imageIds=Array.from({length:10},(_,i)=>images[i%5].id);
 let {work}=await post({action:'save',document});await post({action:'create-correlation',tierId:work.id,tierRevision:work.revision});
 await page.goto(origin+'/admin/creator/tier?work='+work.id,{waitUntil:'networkidle'});
 const ready=async p=>p.locator('[data-tier-artwork][data-layout-ready="true"]').waitFor();await ready(page);
 const metrics=p=>p.locator('[data-tier-artwork]').evaluate(root=>[...root.querySelectorAll('img')].map(img=>({src:img.getAttribute('src'),left:img.style.left,top:img.style.top,width:parseFloat(img.style.width),height:parseFloat(img.style.height),ratio:img.naturalWidth/img.naturalHeight})));
 const check=async()=>{
  await ready(page);const art=await metrics(page);for(const item of art){assert.ok(Math.abs(item.width/item.height-item.ratio)<.001);assert.equal(item.height,art[0].height);}
  const boxes=await page.evaluate(()=>{const art=[...document.querySelectorAll('[data-tier-artwork] img')],hits=[...document.querySelectorAll('[data-tier-edit-overlay] button')];return art.map((img,i)=>{const a=img.getBoundingClientRect(),b=hits[i].getBoundingClientRect();return ['x','y','width','height'].map(k=>Math.abs(a[k]-b[k]));});});assert.ok(boxes.flat().every(d=>d<.02),'visible image and hitbox coincide');return art;
 };
 for(const [width,height] of [[1920,1080],[1440,900],[1366,768],[390,844]]){await page.setViewportSize({width,height});await check();assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);}
 await page.setViewportSize({width:1920,height:1080});const before=await check();assert.ok(before[0].width>before[0].height*1.9);assert.ok(before[0].height>128);assert.ok(Number.parseFloat(before.at(-1).top)>Number.parseFloat(before[5].top),'variable widths wrap');
 report.aspectFrames=before.slice(0,5);report.landscapeHeightGain=600/315;
 const row=name=>page.getByRole('region',{name:'Tier '+name,exact:true}).locator('[class*="canvasItems"]');
 await page.evaluate(()=>{window.dragPreviews=[];const original=DataTransfer.prototype.setDragImage;DataTransfer.prototype.setDragImage=function(element,x,y){const rect=element.getBoundingClientRect();window.dragPreviews.push({width:rect.width,height:rect.height,source:element.querySelector('img')?.getAttribute('src')});return original.call(this,element,x,y);};});
 // Real native drags, including a hit near the wide image's edge (outside an old square hitbox).
 await row('S').locator('button').nth(2).dragTo(row('S').locator('button').first(),{targetPosition:{x:2,y:2}});await check();
 let names=await row('S').locator('button').evaluateAll(es=>es.map(e=>e.getAttribute('aria-label')));assert.ok(names[0].startsWith(images[2].name));
 await row('S').locator('button').first().dragTo(row('B'));await check();assert.equal(await row('B').locator('button').count(),1);
 const previews=await page.evaluate(()=>window.dragPreviews);assert.equal(previews.length,2);const portraitBox=await row('B').locator('button').boundingBox();for(const preview of previews){assert.ok(Math.abs(preview.width-portraitBox.width)<.02);assert.ok(Math.abs(preview.height-portraitBox.height)<.02);assert.ok(preview.source.includes(images[2].id));}
 const wide=row('S').locator('button').first(),bounds=await wide.boundingBox();await page.getByRole('region',{name:'画像ライブラリ'}).getByRole('button',{name:images[1].name+'を選択',exact:true}).dragTo(wide,{targetPosition:{x:bounds.width-2,y:bounds.height/2}});await check();names=await row('S').locator('button').evaluateAll(es=>es.map(e=>e.getAttribute('aria-label')));assert.ok(names[0].startsWith(images[1].name));
 await page.getByRole('button',{name:'Tier表を保存',exact:true}).click();await page.getByRole('status').filter({hasText:'Tier表を保存しました'}).waitFor();work=(await db.query('select * from public.creator_tier_works where id=$1',[work.id])).rows[0];
 await page.reload({waitUntil:'networkidle'});const expected=await check();
 const obs=await context.newPage();observe(obs);await obs.setViewportSize({width:1920,height:1080});await obs.goto(origin+'/admin/obs/tier/'+work.id,{waitUntil:'networkidle'});await ready(obs);assert.deepEqual(await metrics(obs),expected);
 await obs.screenshot({path:path.join(out,'aspect-tier-obs.png')});
 const download=page.waitForEvent('download');await page.getByRole('button',{name:'PNG出力',exact:true}).click();await(await download).saveAs(path.join(out,'aspect-tier.png'));
 const a=await sharp(path.join(out,'aspect-tier.png')).removeAlpha().raw().toBuffer(),b=await sharp(path.join(out,'aspect-tier-obs.png')).removeAlpha().raw().toBuffer();let diff=0;for(let i=0;i<a.length;i++)diff+=Math.abs(a[i]-b[i]);report.aspectPngObsPixelMean=diff/a.length;assert.ok(diff/a.length<3);
 await obs.goto(origin+'/admin/obs/set/'+work.id,{waitUntil:'networkidle'});await ready(obs);assert.deepEqual(await metrics(obs),expected);await obs.screenshot({path:path.join(out,'aspect-set-obs.png'),fullPage:true});
 assert.deepEqual((await db.query('select document from public.creator_tier_works where id=$1',[work.id])).rows[0].document,work.document);for(let i=0;i<5;i++)assert.deepEqual(objects.get(images[i].object_path).bytes,files[i].buffer);
 const thumbs=await page.locator('[data-library-strip] img').evaluateAll(es=>es.filter(e=>e.alt.startsWith('aspect-')).map(e=>({width:e.getBoundingClientRect().width,height:e.getBoundingClientRect().height,ratio:e.naturalWidth/e.naturalHeight})));assert.equal(thumbs.length,5);assert.ok(thumbs.every(e=>Math.abs(e.width/e.height-e.ratio)<.001));
 // An export started during image loading must wait for final aspect geometry.
 await page.route('**/admin/creator/images/*',async route=>{await new Promise(resolve=>setTimeout(resolve,2500));await route.continue();});
 await page.reload({waitUntil:'domcontentloaded'});await page.locator('[data-tier-artwork]').waitFor();assert.equal(await page.locator('[data-tier-artwork]').getAttribute('data-layout-ready'),'false');
 const early=page.waitForEvent('download');await page.getByRole('button',{name:'PNG出力',exact:true}).click();await(await early).saveAs(path.join(out,'aspect-early.png'));await ready(page);assert.deepEqual(await metrics(page),expected);assert.deepEqual(await sharp(path.join(out,'aspect-early.png')).raw().toBuffer(),await sharp(path.join(out,'aspect-tier.png')).raw().toBuffer());await page.unroute('**/admin/creator/images/*');
 await page.screenshot({path:path.join(out,'aspect-editor.png'),fullPage:true});await obs.close();
 report.checks.push('5 aspect fixtures: landscape600x315, square, portrait, transparent padding and full-frame; equal height/natural width, wrapped rows, exact hitboxes at desktop/mobile sizes, native reorder/cross-row/edge drop, save/reload, PNG/Tier OBS/set OBS consistent, thumbnails intrinsic, originals unchanged');
};
