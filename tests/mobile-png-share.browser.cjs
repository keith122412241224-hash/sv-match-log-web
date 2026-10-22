/* eslint-disable @typescript-eslint/no-require-imports */
const fs=require('node:fs'),assert=require('node:assert/strict'),{unzipSync}=require('fflate'),sharp=require('sharp');

function install() {
 const state=window.mobilePng={mode:'success',calls:[],checks:[],created:[],revoked:[],renders:0,failNext:false,delay:0,clickTurn:false};
 // Wrap the actual delegated listener: a capture-listener microtask would run before
 // React's bubble listener even for a synchronous handler, giving a false failure.
 const add=EventTarget.prototype.addEventListener,remove=EventTarget.prototype.removeEventListener,wrappers=new WeakMap();
 EventTarget.prototype.addEventListener=function(type,listener,options){
  if(type==='click'&&listener){let wrapped=wrappers.get(listener);if(!wrapped){wrapped=function(event){state.clickTurn=true;try{return typeof listener==='function'?listener.call(this,event):listener.handleEvent(event);}finally{state.clickTurn=false;}};wrappers.set(listener,wrapped);}return add.call(this,type,wrapped,options);}
  return add.call(this,type,listener,options);
 };
 EventTarget.prototype.removeEventListener=function(type,listener,options){return remove.call(this,type,type==='click'&&listener?(wrappers.get(listener)||listener):listener,options);};
 const create=URL.createObjectURL.bind(URL),revoke=URL.revokeObjectURL.bind(URL);
 URL.createObjectURL=file=>{const url=create(file);if(file instanceof File)state.created.push({url,type:file.type,bytes:file.size});return url;};
 URL.revokeObjectURL=url=>{state.revoked.push(url);return revoke(url);};
 const original=HTMLCanvasElement.prototype.toBlob;
 HTMLCanvasElement.prototype.toBlob=function(callback,...args){state.renders++;const fail=state.failNext;state.failNext=false;const invoke=()=>fail?callback(null):original.call(this,callback,...args);if(state.delay)setTimeout(invoke,state.delay);else invoke();};
 window.configureShare=mode=>{
  state.mode=mode;
  Object.defineProperty(navigator,'canShare',{configurable:true,value:mode==='no-canShare'?undefined:data=>{state.checks.push({count:data.files?.length,name:data.files?.[0]?.name,type:data.files?.[0]?.type});if(state.mode==='can-throw')throw new TypeError('unsupported');return state.mode!=='unsupported';}});
  Object.defineProperty(navigator,'share',{configurable:true,value:mode==='no-share'?undefined:data=>{
   const file=data.files[0];state.calls.push({direct:state.clickTurn,active:navigator.userActivation.isActive,name:file.name,type:file.type,count:data.files.length,isFile:file instanceof File});state.shared=file;
   if(state.mode==='cancel')return Promise.reject(new DOMException('cancel','AbortError'));
   if(state.mode==='error')return Promise.reject(new DOMException('blocked','NotAllowedError'));
   return Promise.resolve();
  }});
 };
 window.configureShare('success');
}

async function verifyMobilePng({page,out,report,go,fixtures,region,check,verifyPixels}) {
 await page.addInitScript(install);
 const dir=out+'/mobile-png';fs.mkdirSync(dir+'/screenshots',{recursive:true});
 const result={exports:[],shares:[],widths:[],memory:[],openTimings:[],additionalAnalysisCalls:0};report.mobilePng=result;
 const cdp=await page.context().newCDPSession(page);await cdp.send('Performance.enable');
 async function memory(label){const {metrics}=await cdp.send('Performance.getMetrics');result.memory.push({label,...Object.fromEntries(metrics.filter(m=>['JSHeapUsedSize','JSHeapTotalSize','Nodes','Documents'].includes(m.name)).map(m=>[m.name,m.value]))});}
 const modal=()=>page.getByRole('dialog',{name:'分析画像の保存',exact:true});
 const image=()=>modal().getByRole('img');
 const screenshot=async name=>page.screenshot({path:dir+'/screenshots/'+name+'.png'});
 async function ready(){await image().waitFor();await page.waitForFunction(()=>{const img=document.querySelector('dialog[open] img');return img?.complete&&img.naturalWidth>0;});}
 async function close(){await modal().getByRole('button',{name:'閉じる',exact:true}).click();await modal().waitFor({state:'detached'});await page.waitForFunction(()=>!document.querySelector('[data-report-png]'));}
 async function download(label,zip=false){const waiting=page.waitForEvent('download');await modal().getByRole('button',{name:zip?'ZIPをダウンロード':/^(この)?PNGをダウンロード$/}).click();const d=await waiting,target=dir+'/'+label+(zip?'.zip':'.png');await d.saveAs(target);return {name:d.suggestedFilename(),bytes:fs.readFileSync(target)};}
 async function open(name){const start=performance.now();await region(name).getByRole('button',{name:/をPNG保存$/}).click();await ready();result.openTimings.push({name,ms:Math.round(performance.now()-start)});}
 async function next(label='次へ'){await modal().getByRole('button',{name:label,exact:true}).click();await page.waitForFunction(()=>!document.querySelector('dialog[open] button:disabled')?.textContent?.includes('共有'));await ready();await modal().getByRole('button',{name:/PNGをダウンロード$/}).waitFor();await page.waitForFunction(()=>[...document.querySelectorAll('dialog[open] button')].some(b=>b.textContent?.includes('PNGをダウンロード')&&!b.disabled));}
 const blocks=[['使用デッキ別サマリー','usage-summary'],['使用デッキ別の勝率','deck-winrate'],['相手デッキ別の勝率','opponent-winrate'],['先攻/後攻別の勝率','turn-order-winrate'],['対面別勝率','matchup-winrate']];
 fixtures();await page.setViewportSize({width:390,height:844});await go('?scope=mine&winRateMode=direct',false);
 const initialCalls=report.rpc.length,urlBefore=page.url(),filters=await page.locator('form[action="/analysis"]').evaluate(n=>new URLSearchParams(new FormData(n)).toString());
 await screenshot('mobile-before');
 // A delayed real encoding exposes progress and the initial double-click guard.
 await page.evaluate(()=>{window.mobilePng.delay=700;});
 const turns=region(blocks[3][0]),button=turns.getByRole('button',{name:/をPNG保存$/});await button.click();assert.equal(await button.isDisabled(),true);assert.match(await turns.getByRole('status').innerText(),/画像を作成/);await screenshot('mobile-generating');await ready();await page.evaluate(()=>{window.mobilePng.delay=0;});assert.equal(await page.evaluate(()=>window.mobilePng.renders),1);
 await screenshot('mobile-single-share-supported');
 const singleUrl=await image().getAttribute('src'),single=await download('single');assert.match(single.name,/^analysis-turn-order-winrate-\d{8}-\d{6}\.png$/);
 const previewBytes=await image().evaluate(async img=>Array.from(new Uint8Array(await (await fetch(img.src)).arrayBuffer())));assert.deepEqual(Buffer.from(previewBytes),single.bytes);
 const renderCount=await page.evaluate(()=>window.mobilePng.renders);
 for(const mode of ['success','cancel','error','success']){
  await page.evaluate(mode=>window.configureShare(mode),mode);await modal().getByRole('button',{name:'画像を共有・保存',exact:true}).click();
  await page.waitForFunction(()=>!([...document.querySelectorAll('dialog[open] button')].find(b=>b.textContent==='画像を共有・保存')?.disabled));
  assert.equal(await image().getAttribute('src'),singleUrl);assert.equal(await page.evaluate(()=>window.mobilePng.renders),renderCount);
  if(mode==='cancel'){assert.equal(await modal().getByRole('alert').count(),0);assert.match(await modal().getByRole('status').innerText(),/キャンセル/);}
  if(mode==='error')assert.match(await modal().getByRole('alert').innerText(),/ダウンロード/);
  assert.doesNotMatch(await modal().innerText(),/写真に保存しました|写真アプリに保存済み/);
  await screenshot('share-'+mode+'-mock');
 }
 const shares=await page.evaluate(()=>window.mobilePng.calls);for(const c of shares){assert.equal(c.direct,true);assert.equal(c.active,true);assert.equal(c.isFile,true);assert.equal(c.type,'image/png');assert.equal(c.name,single.name);assert.equal(c.count,1);}result.shares=shares;
 assert.deepEqual(Buffer.from(await page.evaluate(async()=>Array.from(new Uint8Array(await window.mobilePng.shared.arrayBuffer())))),single.bytes);
 assert.ok((await page.evaluate(()=>window.mobilePng.checks)).every(c=>c.type==='image/png'&&c.count===1));
 // The standalone document owns a separate Blob URL and survives closing the preview.
 const popupEvent=page.waitForEvent('popup');await modal().getByRole('link',{name:'画像を単独で開く',exact:true}).last().click();const popup=await popupEvent;await popup.locator('img').evaluate(img=>img.decode());const popupUrl=await popup.locator('img').getAttribute('src');assert.notEqual(popupUrl,singleUrl);assert.equal(await popup.evaluate(()=>opener),null);await close();assert.ok(await page.evaluate(url=>window.mobilePng.revoked.includes(url),singleUrl));assert.equal(await popup.locator('img').evaluate(async img=>(await fetch(img.src)).ok),true);await popup.close();
 for(const mode of ['unsupported','no-share','no-canShare','can-throw']){
  await page.evaluate(mode=>window.configureShare(mode),mode);await open(blocks[3][0]);assert.equal(await modal().getByRole('button',{name:/共有・保存/}).count(),0);assert.match(await modal().innerText(),/対応していません/);const file=await download(mode);assert.equal((await sharp(file.bytes).metadata()).format,'png');await screenshot('share-'+mode);await close();
 }
 await page.evaluate(()=>window.configureShare('success'));
 // Real PNG generation failure is recoverable and leaves no snapshot or preview URL behind.
 await page.evaluate(()=>{window.mobilePng.failNext=true;window.mobilePng.delay=300;});await button.click();await turns.getByRole('alert').waitFor();assert.equal(await button.isEnabled(),true);assert.equal(await modal().count(),0);assert.equal(await page.locator('[data-report-png]').count(),0);await page.evaluate(()=>{window.mobilePng.delay=0;});await open(blocks[3][0]);await download('retry');assert.equal(await turns.getByRole('alert').count(),0);await close();
 check('mobile single: actual PNG, direct activated File share, canShare, cancellation/error/reuse, unsupported fallbacks, standalone lifetime, encoding retry');
 // Every block, including collapsed matchups, retains order, text, icons and pagination.
 for(const [name,slug]of blocks){
  const section=region(name),items=(await section.locator('table').count()?await section.locator('tbody tr').allTextContents():await section.locator('article').allTextContents()).map(s=>s.replace(/\s+/g,' ').trim());
  await page.evaluate(()=>{window.exportPages=[];});const started=performance.now();await open(name);
  const count=Number((await image().getAttribute('alt')).split(' / ').at(-1)),files=[];
  for(let index=0;index<count;index++){
   if(index)await next();assert.ok((await image().getAttribute('alt')).endsWith(`${index+1} / ${count}`));
   const file=await download(slug+'-'+index);assert.match(file.name,new RegExp('^analysis-'+slug+'-\\d{8}-\\d{6}'+(count===1?'':`-part-${String(index+1).padStart(3,'0')}-of-${String(count).padStart(3,'0')}`)+'\\.png$'));files.push(file);
   const snapshots=await page.evaluate(()=>window.exportPages),snapshot=snapshots.at(-1),metadata=await sharp(file.bytes).metadata();assert.equal(metadata.format,'png');assert.ok(metadata.width<=4096&&metadata.height<=4096);assert.equal(snapshot.images,true);assert.equal(snapshot.overflow,false);assert.notEqual(snapshot.hidden,true);await verifyPixels(file.bytes,snapshot);
  }
  assert.deepEqual((await page.evaluate(()=>window.exportPages)).flatMap(p=>p.items),items);
  if(count>1){const zip=await download(slug+'-all',true),entries=Object.entries(unzipSync(zip.bytes));assert.deepEqual(entries.map(([name])=>name),files.map(f=>f.name));for(let i=0;i<count;i++)assert.deepEqual(Buffer.from(entries[i][1]),files[i].bytes);}
  result.exports.push({slug,pages:count,ms:Math.round(performance.now()-started),bytes:files.reduce((n,f)=>n+f.bytes.length,0)});await close();
 }
 assert.equal(await region('対面別勝率').getByRole('button',{name:'展開',exact:true}).getAttribute('aria-expanded'),'false');assert.equal(page.url(),urlBefore);assert.equal(await page.locator('form[action="/analysis"]').evaluate(n=>new URLSearchParams(new FormData(n)).toString()),filters);assert.equal(report.rpc.length,initialCalls);
 check('mobile all five blocks: PNG bytes, exact filenames, full ordered content, icons/fonts/long names, per-page and ZIP equality; no analysis requests or filter mutations');
 // Large, lazy export; current/adjacent pages reuse the bounded cache.
 fixtures(true);await go('?scope=all&winRateMode=combined',false);const beforeLarge=report.rpc.length;await memory('large-before');
 await open('デッキ別サマリー（反転込み）');const firstUrl=await image().getAttribute('src');const total=Number((await image().getAttribute('alt')).split(' / ').at(-1));assert.ok(total>3);assert.equal(await page.evaluate(()=>window.mobilePng.renders),1);await screenshot('mobile-multiple');await next();await screenshot('mobile-next-page');const secondUrl=await image().getAttribute('src');assert.ok(await page.evaluate(url=>window.mobilePng.revoked.includes(url),firstUrl));const rendered=await page.evaluate(()=>window.mobilePng.renders);await next('前へ');await next();assert.equal(await page.evaluate(()=>window.mobilePng.renders),rendered);
 await modal().getByRole('button',{name:'この画像を共有・保存',exact:true}).click();await page.waitForFunction(()=>window.mobilePng.calls.length===1);assert.match((await page.evaluate(()=>window.mobilePng.calls[0])).name,/-part-002-of-/);
 // A page-3 failure must retain page 2; retry and ZIP remain usable.
 await page.evaluate(()=>{window.mobilePng.failNext=true;});await modal().getByRole('button',{name:'次へ',exact:true}).click();await modal().getByRole('alert').waitFor();assert.ok((await image().getAttribute('alt')).includes('2 / '));await download('retained-after-page-error');await next();assert.equal(await modal().getByRole('alert').count(),0);
 const largeZip=await download('large-zip',true);assert.equal(Object.keys(unzipSync(largeZip.bytes)).length,total);assert.ok(await page.evaluate(url=>window.mobilePng.revoked.includes(url),secondUrl));await screenshot('mobile-long-image');
 await memory('large-after-zip');
 await close();
 // Close while rendering; stale completion cannot resurrect the dialog or retain a snapshot.
 await open('デッキ別サマリー（反転込み）');await page.evaluate(()=>{window.mobilePng.delay=600;});await modal().getByRole('button',{name:'次へ',exact:true}).click();await close();assert.equal(await modal().count(),0);await page.evaluate(()=>{window.mobilePng.delay=0;});await open('デッキ別サマリー（反転込み）');await close();assert.equal(report.rpc.length,beforeLarge);
 // Unmount during initial encoding also releases its snapshot.
 await page.evaluate(()=>{window.mobilePng.delay=600;});await region('デッキ別サマリー（反転込み）').getByRole('button',{name:/をPNG保存$/}).click();await page.locator('nav a[href="/"]').first().click();await page.waitForURL('**/');await page.waitForTimeout(800);assert.equal(await page.locator('[data-report-png]').count(),0);assert.equal(await modal().count(),0);
 check('large mobile lazy pages/cache, page error/retry, ZIP, close during generation, consecutive opens and unmount cleanup');
 fixtures();
 for(const width of [320,390,768,1152,1920]){
  await page.setViewportSize({width,height:844});await go('?scope=mine&winRateMode=direct',false);const n=report.rpc.length;
  if(width<768){await open(blocks[0][0]);await screenshot('width-'+width);assert.ok(await image().evaluate(img=>{const r=img.getBoundingClientRect();return r.width<=innerWidth&&r.height<=innerHeight*.49&&Math.abs(r.width/r.height-img.naturalWidth/img.naturalHeight)<.01;}));assert.ok(await modal().evaluate(d=>d.getBoundingClientRect().right<=innerWidth&&d.getBoundingClientRect().left>=0));await close();}
  else{const section=region(blocks[3][0]),save=section.getByRole('button',{name:/をPNG保存$/});if(width===1152){await page.evaluate(()=>{window.mobilePng.failNext=true;window.mobilePng.delay=300;});await save.click();assert.equal(await save.isDisabled(),true);await section.getByRole('alert').waitFor();assert.equal(await save.isEnabled(),true);assert.equal(await page.locator('[data-report-png]').count(),0);await page.evaluate(()=>{window.mobilePng.delay=0;});}const event=page.waitForEvent('download');await save.click();const d=await event;assert.match(d.suggestedFilename(),/\.png$/);assert.equal(await modal().count(),0);assert.equal(await section.getByRole('alert').count(),0);await screenshot('desktop-save-'+width);}
  assert.equal(report.rpc.length,n);assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));result.widths.push(width);
 }
 // Timed download URLs outlive the preview, then release; active preview URLs release on close.
 await page.setViewportSize({width:390,height:844});await open(blocks[3][0]);const preview=await image().getAttribute('src');await download('url-lifetime');const urls=await page.evaluate(()=>window.mobilePng.created.filter(u=>u.type==='image/png').map(u=>u.url));await close();assert.ok(await page.evaluate(url=>window.mobilePng.revoked.includes(url),preview));assert.ok(await page.evaluate(urls=>urls.some(u=>!window.mobilePng.revoked.includes(u)),urls));await page.waitForTimeout(61000);assert.ok(await page.evaluate(urls=>urls.every(u=>window.mobilePng.revoked.includes(u)),urls));
 await memory('after-close-and-url-grace');await cdp.detach();result.passed=true;fs.writeFileSync(dir+'/report.json',JSON.stringify(result,null,2));check('320/390 mobile and 768/1152/1920 automatic desktop; bounded aspect ratio, download grace and eventual URL cleanup');
}
module.exports={verifyMobilePng};
