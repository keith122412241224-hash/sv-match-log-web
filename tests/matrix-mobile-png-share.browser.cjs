/* eslint-disable @typescript-eslint/no-require-imports */
const fs=require('node:fs'),assert=require('node:assert/strict'),sharp=require('sharp'),{createHash}=require('node:crypto');
const digest=b=>createHash('sha256').update(b).digest('hex');
async function verify({page,report,out,h,login,origin,openSelector,setDecks}){
 const baseline=process.env.MATRIX_PNG_BASELINE==='1';fs.mkdirSync(out+'/screenshots',{recursive:true});report.exports=[];
 await page.clock.setFixedTime(new Date('2026-10-22T08:00:00Z'));
 if(!baseline){await page.addInitScript(require('./mobile-png-share.browser.cjs').install);await page.addInitScript(()=>{
  window.matrixRenders=0;window.matrixFail=false;window.matrixDelay=0;
  const original=HTMLCanvasElement.prototype.toDataURL;
  HTMLCanvasElement.prototype.toDataURL=function(...args){window.matrixRenders++;if(window.matrixFail){window.matrixFail=false;throw new Error('injected canvas failure');}return original.apply(this,args);};
  const d=Object.getOwnPropertyDescriptor(HTMLImageElement.prototype,'src');Object.defineProperty(HTMLImageElement.prototype,'src',{...d,set(v){if(window.matrixDelay&&typeof v==='string'&&v.startsWith('data:image/svg+xml')){setTimeout(()=>d.set.call(this,v),window.matrixDelay);return;}return d.set.call(this,v);}});
 });}
 async function go(count=3,guest=false,width=1152){
  const decks=[...h.decks,...Array.from({length:Math.max(0,count-h.decks.length)},(_,i)=>({...h.decks[i%h.decks.length],id:h.uuid(8000+i),name:'表示デッキ'+String(i+4).padStart(2,'0')}))].slice(0,count);setDecks(decks);
  await login(guest?null:h.MEMBER);await page.setViewportSize({width,height:900});
  await page.goto(origin+(guest?'/guest':'/matrix?scope=all'),{waitUntil:'networkidle'});
  if(guest){await page.evaluate(data=>localStorage.setItem('svml:guest-matches:v1',JSON.stringify(data)),Array.from({length:8},(_,i)=>({...h.row(),my_deck_id:h.decks[0].id,opponent_deck_id:h.decks[1].id,my_archetype_id:h.decks[0].id,opponent_archetype_id:h.decks[1].id,result:i<5?'win':'lose'})));await page.reload({waitUntil:'networkidle'});await page.locator('nav').getByRole('button',{name:'相性表',exact:true}).click();}
  await page.locator('.matrix-scrollbar').waitFor();await page.evaluate(()=>document.fonts.ready);return decks;
 }
 async function capture(label){
  console.log('capture '+label);
  const expected=await page.locator('.matrix-scrollbar').innerText(),calls=report.calls.length,start=performance.now();
  const iconBoxes=await page.locator('.matrix-scrollbar > div').evaluate(n=>{const r=n.getBoundingClientRect();return [...n.querySelectorAll('img')].map(i=>{const b=i.getBoundingClientRect();return{x:(b.x-r.x)*2,y:(b.y-r.y)*2,w:b.width*2,h:b.height*2};});});
  await page.evaluate(()=>{window.matrixSvg=null;const d=Object.getOwnPropertyDescriptor(HTMLImageElement.prototype,'src');window.restoreSvg=()=>Object.defineProperty(HTMLImageElement.prototype,'src',d);Object.defineProperty(HTMLImageElement.prototype,'src',{...d,set(v){if(typeof v==='string'&&v.startsWith('data:image/svg+xml'))window.matrixSvg=decodeURIComponent(v.slice(v.indexOf(',')+1));return d.set.call(this,v);}});});
  const waiting=page.waitForEvent('download',{timeout:120000});await page.getByRole('button',{name:'PNG保存',exact:true}).click();
  if(!baseline&&(await page.viewportSize()).width<768){const dialog=page.getByRole('dialog',{name:'相性表画像の保存'});await dialog.getByRole('img').waitFor();await dialog.getByRole('button',{name:'PNGをダウンロード',exact:true}).click();}
  const d=await waiting;await d.saveAs(out+'/'+label+'.png');
  const bytes=fs.readFileSync(out+'/'+label+'.png'),meta=await sharp(bytes).metadata(),raw=await sharp(bytes).ensureAlpha().raw().toBuffer();
  const svg=await page.evaluate(()=>{window.restoreSvg();const doc=new DOMParser().parseFromString(window.matrixSvg,'image/svg+xml');return{text:doc.querySelector('foreignObject').textContent,cells:[...doc.querySelectorAll('td')].map(x=>x.textContent),icons:[...doc.querySelectorAll('img')].map(i=>({alt:i.getAttribute('alt'),src:i.getAttribute('src')}))};});
  assert.deepEqual(svg.cells,await page.locator('tbody td').allTextContents());assert.doesNotMatch(svg.text,/表示するデッキ|全解除|画像を共有/);assert.equal(report.calls.length,calls);assert.match(d.suggestedFilename(),/^sv-matchup-2026-10-22\.png$/);
  const icons=svg.icons.map(i=>({alt:i.alt,hash:digest(i.src)}));
  report.exports.push({label,filename:d.suggestedFilename(),bytes:bytes.length,width:meta.width,height:meta.height,sha256:digest(bytes),pixels:digest(raw),cells:svg.cells,icons,iconBoxes,ms:Math.round(performance.now()-start)});
  assert.equal(await page.locator('.matrix-scrollbar').innerText(),expected);
  await page.screenshot({path:out+'/screenshots/'+label+'.png'});
  if(!baseline&&(await page.viewportSize()).width<768)await page.getByRole('dialog',{name:'相性表画像の保存'}).getByRole('button',{name:'閉じる',exact:true}).click();
 }
 for(const width of [320,390,768,1152,1920]){await go(3,false,width);await capture('member-'+width+'-first');if(width===1152){await capture('member-'+width+'-second');await openSelector(page);await page.getByRole('region',{name:'表示するデッキ',exact:true}).getByRole('button',{name:'全非表示',exact:true}).click();await page.getByRole('region',{name:'表示するデッキ',exact:true}).locator('button[aria-pressed]').first().click();await capture('member-selected-one');}}
 for(const count of [12,30]){await go(count,false,1152);await capture('member-'+count+'-pc');}
 for(const width of [1152,390]){await go(3,true,width);await capture('guest-'+width+'-first');await capture('guest-'+width+'-second');}
 if(!baseline){
  const modal=()=>page.getByRole('dialog',{name:'相性表画像の保存',exact:true}),image=()=>modal().getByRole('img');
  const shot=name=>page.screenshot({path:out+'/screenshots/'+name+'.png',fullPage:true});
  const ready=async()=>{await image().waitFor();await page.waitForFunction(()=>{const i=document.querySelector('dialog[open] img');return i?.complete&&i.naturalWidth>0;});};
  const close=async()=>{await modal().getByRole('button',{name:'閉じる',exact:true}).click();await modal().waitFor({state:'detached'});};
  await go(3,false,390);const calls=report.calls.length,html=await page.locator('.matrix-scrollbar').innerText(),button=page.getByRole('button',{name:'PNG保存',exact:true});
  await shot('mobile-matrix');await page.evaluate(()=>{window.matrixDelay=700;});await button.evaluate(b=>{b.focus();b.click();b.click();});await page.getByRole('status').filter({hasText:'画像を作成しています'}).waitFor();await shot('mobile-generating');await ready();await page.evaluate(()=>{window.matrixDelay=0;});assert.equal(await page.evaluate(()=>window.matrixRenders),1);await shot('mobile-preview-share');
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  const size=await image().evaluate(i=>({natural:i.naturalWidth/i.naturalHeight,w:i.getBoundingClientRect().width,h:i.getBoundingClientRect().height}));assert.ok(Math.abs(size.w/size.h-size.natural)<0.02);assert.ok(size.w<=390);
  const preview=await image().getAttribute('src'),bytes=await image().evaluate(async i=>Array.from(new Uint8Array(await(await fetch(i.src)).arrayBuffer())));
  for(const mode of ['success','cancel','error','success']){
   await page.evaluate(m=>window.configureShare(m),mode);await modal().getByRole('button',{name:'画像を共有・保存',exact:true}).click();await page.waitForFunction(()=>![...document.querySelectorAll('dialog[open] button')].find(b=>b.textContent==='画像を共有・保存')?.disabled);
   assert.equal(await image().getAttribute('src'),preview);assert.equal(await page.evaluate(()=>window.matrixRenders),1);
   if(mode==='cancel'){assert.equal(await modal().getByRole('alert').count(),0);assert.match(await modal().getByRole('status').innerText(),/キャンセル/);}
   if(mode==='error'){assert.match(await modal().getByRole('alert').innerText(),/ダウンロード/);await shot('share-error-keeps-image');}
   const shared=await page.evaluate(async()=>({call:window.mobilePng.calls.at(-1),bytes:Array.from(new Uint8Array(await window.mobilePng.shared.arrayBuffer()))}));assert.ok(shared.call.direct&&shared.call.active&&shared.call.isFile);assert.equal(shared.call.type,'image/png');assert.equal(shared.call.count,1);assert.equal(shared.call.name,'sv-matchup-2026-10-22.png');assert.deepEqual(shared.bytes,bytes);
   assert.doesNotMatch(await modal().innerText(),/写真に保存しました|写真アプリに保存済み/);
  }
  report.shareCalls=await page.evaluate(()=>window.mobilePng.calls);
  const popupPromise=page.waitForEvent('popup');await modal().getByRole('link',{name:'画像を単独で開く',exact:true}).last().click();const popup=await popupPromise;await popup.locator('img').waitFor();await close();assert.ok(await page.evaluate(u=>window.mobilePng.revoked.includes(u),preview));assert.equal(await button.evaluate(b=>b===document.activeElement),true);assert.ok(await popup.locator('img').evaluate(async i=>{await i.decode();return i.naturalWidth>0;}));assert.deepEqual(await popup.locator('img').evaluate(async i=>Array.from(new Uint8Array(await(await fetch(i.src)).arrayBuffer()))),bytes);await popup.close();
  for(const mode of ['unsupported','no-share','no-canShare','can-throw']){await page.evaluate(m=>window.configureShare(m),mode);await button.click();await ready();assert.equal(await modal().getByRole('button',{name:'画像を共有・保存',exact:true}).count(),0);await shot('mobile-'+mode);const wait=page.waitForEvent('download');await modal().getByRole('button',{name:'PNGをダウンロード',exact:true}).click();const d=await wait;await d.saveAs(out+'/fallback-'+mode+'.png');assert.equal(fs.readFileSync(out+'/fallback-'+mode+'.png').subarray(1,4).toString(),'PNG');await close();}
  // Genuine rendering failure is caught without losing selection; the very next capture succeeds.
  await page.evaluate(()=>{window.matrixFail=true;});await button.click();const generationError=page.getByRole('alert').filter({hasText:'PNGを保存できませんでした。'});await generationError.waitFor();assert.match(await generationError.innerText(),/もう一度/);assert.equal(await modal().count(),0);await shot('mobile-generation-error');assert.equal(await page.locator('.matrix-scrollbar').innerText(),html);await capture('retry-after-encoding-error');
  assert.equal(report.calls.length,calls,'all image/share interactions stay in the browser');
  await go(12,false,390);await capture('member-12-mobile');
  // 30 decks exceed the mobile allocation budget; no canvas is ever allocated.
  await go(30,false,390);const before=await page.locator('.matrix-scrollbar').innerText(),start=performance.now();await shot('mobile-large-matrix');await page.getByRole('button',{name:'PNG保存',exact:true}).click();const sizeError=page.getByRole('alert').filter({hasText:'画像サイズが大きすぎる'});await sizeError.waitFor();assert.match(await sizeError.innerText(),/デッキ数を減らして/);assert.equal(await page.evaluate(()=>window.matrixRenders),0);assert.equal(await page.locator('.matrix-scrollbar').innerText(),before);report.oversize={decks:30,rejectedMs:Math.round(performance.now()-start),canvasRenders:0};await shot('mobile-size-error');
  await openSelector(page);const region=page.getByRole('region',{name:'表示するデッキ',exact:true});await region.getByRole('button',{name:'全非表示',exact:true}).click();for(const b of (await region.locator('button[aria-pressed]').all()).slice(0,3))await b.click();assert.equal(await page.locator('tbody td').count(),9);await capture('reduced-after-size-error');
  // Close and recreate repeatedly; active preview URLs always release. Download URLs have a finite grace.
  for(let i=0;i<4;i++){await page.getByRole('button',{name:'PNG保存',exact:true}).click();await ready();const u=await image().getAttribute('src');await page.keyboard.press('Escape');await modal().waitFor({state:'detached'});assert.ok(await page.evaluate(u=>window.mobilePng.revoked.includes(u),u));}
  await page.waitForTimeout(61000);const remaining=await page.evaluate(()=>window.mobilePng.created.filter(u=>!window.mobilePng.revoked.includes(u.url)));assert.deepEqual(remaining,[]);report.remainingObjectUrls=0;report.mobilePassed=true;
 }
 report.passed=true;
}
module.exports={verify};
