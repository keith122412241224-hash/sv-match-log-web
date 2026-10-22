/* eslint-disable @typescript-eslint/no-require-imports */
const {test}=require('node:test'),assert=require('node:assert/strict'),cp=require('node:child_process'),{createHash}=require('node:crypto');
const {parseCreatorCursor,mergeCreatorImages,creatorRead}=require('../src/lib/creator/pagination');
const id='00000000-0000-4000-8000-000000000001';
test('Creator cursor preserves microseconds, UUID tie-break and timezone offsets',()=>{
 assert.equal(parseCreatorCursor(null),null);
 for(const time of ['2026-01-01T00:00:00.123456Z','2026-01-01T09:00:00.123456+09:00','2025-12-31T19:00:00-05:00'])assert.deepEqual(parseCreatorCursor(time+'|'+id),{time,id});
});
test('Creator cursor rejects injection, invalid dates, IDs and oversized input',()=>{
 for(const input of ['',id,'2026-02-30T00:00:00Z|'+id,'2026-01-01T24:00:00Z|'+id,'2026-01-01T00:00:00Z|bad','2026-01-01T00:00:00Z|'+id+',id.gt.0','x'.repeat(151)])assert.throws(()=>parseCreatorCursor(input));
});
test('Creator image merge cannot replace a fresh referenced image with an older list version',()=>{
 const old={id,revision:1,name:'old'},fresh={id,revision:2,name:'replacement'};
 assert.deepEqual(mergeCreatorImages([fresh],[old]),[fresh]);assert.deepEqual(mergeCreatorImages([old],[fresh]),[fresh]);
});
test('Creator read sends bounded GET cursor/ID queries and preserves server errors',async()=>{
 const original=global.fetch,calls=[];
 try{global.fetch=async(url,options)=>{calls.push({url,options});return new Response(JSON.stringify({error:'retry'}),{status:503});};
 await assert.rejects(creatorRead('images','2026-01-01T00:00:00Z|'+id),/retry/);assert.equal(calls[0].options.cache,'no-store');assert.equal(new URL(calls[0].url,'http://local').searchParams.get('cursor'),'2026-01-01T00:00:00Z|'+id);
 await assert.rejects(creatorRead('work',id),/retry/);assert.equal(new URL(calls[1].url,'http://local').searchParams.get('id'),id);
 }finally{global.fetch=original;}
});
function databaseFixture(count=1500) {
 const uuid=n=>'00000000-0000-4000-8000-'+String(n).padStart(12,'0');
 const stamp='2025-01-01T00:00:00.123456Z';
 const tables={creator_images:Array.from({length:count},(_,i)=>({id:uuid(i+1),name:'image '+i,revision:1,created_at:stamp,updated_at:stamp,archetype_id:null})),creator_tier_works:Array.from({length:count},(_,i)=>({id:uuid(10000+i),revision:1,updated_at:stamp,document:{version:1,title:'work '+i,showTitle:true,rows:[{id:uuid(30000),name:'S',color:'#ffffff',imageIds:[uuid(i+1)]}]}})),creator_correlations:Array.from({length:Math.min(count,1001)},(_,i)=>({id:uuid(20000+i),tier_work_id:uuid(10000+i)})),deck_archetypes:[]};
 const requests=[];
 const client={from(table){let select='*',filters=[],orders=[],limit=1000,single=false;
  const q={select(s){select=s;return q;},order(k,o={}){orders.push([k,o.ascending===false?-1:1]);return q;},limit(n){assert(n<=100);limit=n;return q;},eq(k,v){filters.push(r=>r[k]===v);return q;},in(k,ids){assert(ids.length<=30);filters.push(r=>ids.includes(r[k]));return q;},or(expression){
   const m=/^(created_at|updated_at)\.lt\.([^,]+),and\(\1\.eq\.\2,id\.lt\.([a-f0-9-]+)\)$/.exec(expression);assert(m,'strict keyset filter');const [,key,time,id]=m;filters.push(r=>r[key]<time||r[key]===time&&r.id<id);return q;
  },maybeSingle(){single=true;return q;},then(resolve,reject){try{
   let rows=tables[table].filter(r=>filters.every(f=>f(r)));rows.sort((a,b)=>{for(const[k,d]of orders){const cmp=String(a[k]).localeCompare(String(b[k]));if(cmp)return cmp*d;}return 0;});rows=rows.slice(0,Math.min(limit,1000));
   if(select==='id,revision,updated_at,title:document->>title')rows=rows.map(({id,revision,updated_at,document})=>({id,revision,updated_at,title:document.title}));
   requests.push({table,select,limit,rows:rows.length});return Promise.resolve({data:single?rows[0]??null:rows,error:null}).then(resolve,reject);
  }catch(e){return Promise.reject(e).then(resolve,reject);}}};return q;
 }};return {client,tables,requests,uuid};
}
test('actual Creator loaders traverse 1500 equal-time rows without truncation, duplicate or missing correlation links',async()=>{
 const {getCreatorImagePage,getCreatorWorkPage}=require('../src/lib/creator/server'),{client,uuid}=databaseFixture();
 for(const[load,kind]of [[getCreatorImagePage,'images'],[getCreatorWorkPage,'works']]){
  let cursor=null,rows=[],pages=0;do{const page=await load(client,cursor);assert(page.items.length<=30);rows.push(...page.items);cursor=page.nextCursor;assert(++pages<=50);}while(cursor);
  assert.equal(rows.length,1500);assert.equal(new Set(rows.map(r=>r.id)).size,1500);assert.equal(pages,50);
  if(kind==='images'){assert.equal(rows[0].id,uuid(1500));assert.equal(rows.at(-1).id,uuid(1));}
  else{assert(rows.every(r=>!r.document));assert.equal(rows.filter(r=>r.correlationId).length,1001);}
 }
});
test('direct Creator work and bounded reference lookup ignore current list page and reject absent images',async()=>{
 const {getCreatorWork,getCreatorImages}=require('../src/lib/creator/server'),{client,uuid,requests}=databaseFixture();
 const result=await getCreatorWork(client,uuid(10000));assert.equal(result.work.document.title,'work 0');assert.equal(result.images[0].id,uuid(1));assert.equal(result.correlationId,uuid(20000));
 const before=requests.length;assert.equal((await getCreatorImages(client,Array.from({length:300},(_,i)=>uuid(i+1)))).length,300);assert.equal(requests.length-before,10);
 await assert.rejects(getCreatorImages(client,[uuid(9999)]),/参照する画像/);await assert.rejects(getCreatorWork(client,uuid(9999)),/見つかりません/);await assert.rejects(getCreatorWork(client,'bad'),/不正/);
});
test('Creator cursor pagination preserves neighbours when a new image is inserted before the boundary',async()=>{
 const {getCreatorImagePage}=require('../src/lib/creator/server'),{client,tables,uuid}=databaseFixture(100);
 const first=await getCreatorImagePage(client);tables.creator_images.push({...tables.creator_images[0],id:uuid(200),created_at:'2026-01-01T00:00:00Z'});
 const next=await getCreatorImagePage(client,first.nextCursor);assert.equal(next.items[0].id,uuid(70));assert(next.items.every(r=>!first.items.some(i=>i.id===r.id)));
});
test('QA2-007 scope pins Creator retrieval/UI only; all other product, SQL and dependencies remain identical',()=>{
 const {base,hashes,added,readBeforeCreatorPagination}=require('./creator-pagination-scope.cjs');
 const expected=['src/app/admin/creator/api/route.ts','src/app/admin/creator/tier/page.tsx','src/app/admin/creator/tier/[id]/correlation/page.tsx','src/app/admin/obs/tier/[id]/page.tsx','src/components/creator/TierEditor.tsx','src/components/creator/ImageLibrary.tsx','src/components/creator/CorrelationEditor.tsx','src/lib/creator/server.ts','src/lib/creator/correlation-server.ts',...added];
 assert.deepEqual(Object.keys(hashes).sort(),expected.filter(f=>!require('./admin-batch-scope.cjs').added.has(f)).sort());
 for(const[file,hash]of Object.entries(hashes))assert.equal(createHash('sha256').update(require('./creator-independent-scope.cjs').readBeforeIndependent(file)).digest('hex'),hash,file);
 const git=args=>cp.execFileSync('git',args,{encoding:'utf8',maxBuffer:64e6}).replaceAll('\r\n','\n');
 const files=git(['ls-tree','-r','--name-only',base]).trim().split('\n').filter(f=>/^(src|supabase)\//.test(f)||/^package(-lock)?\.json$/.test(f));
 for(const file of files)assert.equal(readBeforeCreatorPagination(file),git(['show',base+':'+file]),file);
 assert.deepEqual(git(['ls-files','--cached','--others','--exclude-standard','--','src','supabase']).trim().split('\n').sort(),[...files.filter(f=>/^(src|supabase)\//.test(f)),...added].sort());
});
