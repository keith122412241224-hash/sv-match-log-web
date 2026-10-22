/* eslint-disable @typescript-eslint/no-require-imports */
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript'),cp=require('node:child_process');
const {unzipSync}=require('fflate');

// Boundary fakes exercise the real session/pagination/download code. Actual PNG rendering is
// tested separately in both browsers, against baseline bytes and decoded icon pixels.
function harness({count=80,size=20,failAt=0,source}={}) {
 let items=[],renders=0,removed=0,current=[],pending=null,delay=false;
 const container={replaceChildren(...nodes){current=nodes;},append(...nodes){current.push(...nodes);}};
 items=Array.from({length:count},(_,i)=>({i,parentElement:container,getBoundingClientRect:()=>({top:i*100})}));current=[...items];
 const snapshot={querySelector(selector){if(selector==='header')return{append(){}};return null;},querySelectorAll(selector){return selector==='article'?items:[];},getBoundingClientRect:()=>({height:current.length*100})};
 const downloads=[],urls=[],revoked=[],timers=[];
 const document={fonts:{ready:Promise.resolve()},body:{append(){}},createElement(tag){return tag==='a'?{click(){downloads.push({name:this.download,url:this.href});},remove(){}}:{};}};
 const toBlob=async(node,options)=>{renders++;assert.deepEqual(JSON.parse(JSON.stringify(options)),{backgroundColor:'#ffffff',pixelRatio:2,width:100,height:100,includeQueryParams:true});if(delay)await new Promise(r=>{pending=r;});return renders===failAt?null:new Blob([new Uint8Array(size).fill(current[0]?.i??0)],{type:'image/png'});};
 const compiledModule={exports:{}};
 const context={module:compiledModule,exports:compiledModule.exports,Blob,File,Uint8Array,Map,Promise,Error,RangeError,Date,document,window:{setTimeout(fn,ms){if(ms===60000){timers.push(fn);return timers.length;}return setTimeout(fn,ms);}},URL:{createObjectURL(blob){urls.push(blob);return 'blob:'+urls.length;},revokeObjectURL(url){revoked.push(url);}},require(name){if(name==='html-to-image')return{toBlob};if(name==='@/lib/report-png-snapshot')return{createReportPngSnapshot:()=>({snapshot,remove(){removed++;}}),reportPngSize:()=>({width:100,height:100,pixelRatio:2})};return require(name);}};
 const compiled=ts.transpileModule(source??fs.readFileSync('src/lib/analysis-png.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;vm.runInNewContext(compiled,context);
 return {...compiledModule.exports,stats:()=>({renders,removed}),downloads,urls,revoked,timers,delay(){delay=true;},release(){pending?.();}};
}
test('mobile PNG session: lazy exact pagination/names/MIME, adjacent cache, bounded LRU and disposal',async()=>{
 const h=harness(),s=await h.createAnalysisPng({},'usage-summary');assert.equal(s.count,5);assert.equal(h.stats().renders,0);
 const first=await s.page(0);assert.equal(first.type,'image/png');assert.match(first.name,/^analysis-usage-summary-\d{8}-\d{6}-part-001-of-005.png$/);assert.equal(await s.page(0),first);await s.page(1);await s.page(2);await s.page(0);assert.equal(h.stats().renders,3);await s.page(3);await s.page(1);assert.equal(h.stats().renders,5,'oldest of three pages evicted');
 await assert.rejects(s.page(-1));await assert.rejects(s.page(5));await assert.rejects(s.page(1.5));s.dispose();assert.equal(h.stats().removed,1);await assert.rejects(s.page(0));
});
test('mobile PNG cache has a byte cap, even when the page-count cap is not reached',async()=>{
 const h=harness({size:7*1024*1024}),s=await h.createAnalysisPng({},'large');await s.page(0);await s.page(1);await s.page(0);assert.equal(h.stats().renders,3);s.dispose();
 const bigger=harness({size:13*1024*1024}),b=await bigger.createAnalysisPng({},'large');await b.page(0);await b.page(0);assert.equal(bigger.stats().renders,2,'oversize page is not retained in cache');b.dispose();
});
test('mobile ZIP retains exact ordered PNG bytes and filenames with no missing or duplicate pages',async()=>{
 const h=harness(),s=await h.createAnalysisPng({},'matchup-winrate'),first=await s.page(0),progress=[];
 const zip=await s.zip((p,t)=>progress.push([p,t])),files=Object.entries(unzipSync(new Uint8Array(await zip.arrayBuffer())));assert.equal(zip.type,'application/zip');assert.equal(zip.name,s.filename.replace('.png','.zip'));assert.equal(files.length,5);assert.deepEqual(progress,[[1,5],[2,5],[3,5],[4,5],[5,5]]);
 for(let i=0;i<files.length;i++){assert.ok(files[i][0].endsWith(`part-00${i+1}-of-005.png`));assert.deepEqual([...files[i][1]],[...new Uint8Array(20).fill(i*16)]);}assert.deepEqual([...files[0][1]],[...new Uint8Array(await first.arrayBuffer())]);assert.equal(h.stats().renders,5);s.dispose();
});
test('mobile ZIP memory limit fails without a partial download and keeps per-page access',async()=>{
 const h=harness({size:17*1024*1024}),s=await h.createAnalysisPng({},'large');await assert.rejects(s.zip(),/ZIPが大きすぎます/);assert.equal(h.downloads.length,0);assert.equal((await s.page(0)).type,'image/png');s.dispose();
});
test('PNG errors, concurrent render and disposal while encoding cannot leak snapshots or return stale images',async()=>{
 const h=harness({failAt:1}),s=await h.createAnalysisPng({},'retry');await assert.rejects(s.page(0),/encoding failed/);assert.equal((await s.page(0)).type,'image/png');s.dispose();
 const pending=harness(),p=await pending.createAnalysisPng({},'closing');pending.delay();const request=p.page(0);await new Promise(r=>setTimeout(r,5));await assert.rejects(p.page(1),/unavailable/);p.dispose();pending.release();await assert.rejects(request,/closed/);assert.equal(pending.stats().removed,1);
 const desktop=harness({failAt:2});await assert.rejects(desktop.saveAnalysisPng({},'desktop'));assert.equal(desktop.downloads.length,0);assert.equal(desktop.stats().removed,1);
});
test('desktop preserves automatic PNG/ZIP and download URL grace independently of a preview',async()=>{
 for(const count of [2,80]){const h=harness({count}),progress=[];const n=await h.saveAnalysisPng({},'desktop',(p,t)=>progress.push([p,t]));assert.equal(n,count===2?1:5);assert.equal(h.downloads.length,1);assert.match(h.downloads[0].name,count===2?/\.png$/:/\.zip$/);assert.equal(h.stats().removed,1);assert.equal(h.revoked.length,0);h.timers.forEach(fn=>fn());assert.deepEqual(h.revoked,['blob:1']);assert.equal(progress.length,n);
  const baseline=cp.execFileSync('git',['show','b4e5631435bc36b4da3534ce6f008485fbb49ca0:src/lib/analysis-png.ts'],{encoding:'utf8'}),old=harness({count,source:baseline});await old.saveAnalysisPng({},'desktop');const bytes=new Uint8Array(await h.urls[0].arrayBuffer()),oldBytes=new Uint8Array(await old.urls[0].arrayBuffer());if(count===2)assert.deepEqual([...bytes],[...oldBytes]);else assert.deepEqual(Object.values(unzipSync(bytes)).map(x=>[...x]),Object.values(unzipSync(oldBytes)).map(x=>[...x]));
 }
});
test('mobile PNG scope: exactly three product files, every unrelated source/DB/dependency byte and inventory unchanged',()=>{
 const s=require('./mobile-png-share-scope.cjs'),git=(...args)=>cp.execFileSync('git',args,{encoding:'utf8'}).replaceAll('\r\n','\n');
 assert.deepEqual(Object.keys(s.hashes).sort(),['src/lib/analysis-png.ts','src/components/analysis/ExportableAnalysisBlock.tsx','src/components/analysis/AnalysisPngPreview.tsx'].sort());for(const f of Object.keys(s.hashes))s.assertReviewed(f);
 const files=git('ls-tree','-r','--name-only',s.base).trim().split('\n').filter(f=>/^(src|supabase)\//.test(f)||/^package(-lock)?\.json$/.test(f));
 for(const f of files)assert.equal(s.readBeforeMobilePng(f),git('show',s.base+':'+f),f);
 assert.deepEqual(git('ls-files','--cached','--others','--exclude-standard','--','src','supabase').trim().split('\n').sort(),[...files.filter(f=>/^(src|supabase)\//.test(f)),...s.added].sort());
});
