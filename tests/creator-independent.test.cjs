/* eslint-disable @typescript-eslint/no-require-imports */
const {test}=require('node:test'),assert=require('node:assert/strict'),cp=require('node:child_process');
const {parseObsSet}=require('../src/lib/creator/obs-set'),{newCorrelationDocument,parseCorrelation}=require('../src/lib/creator/correlation');
const id=n=>'00000000-0000-4000-8000-'+String(n).padStart(12,'0');
test('independent draft is valid, empty, titled and creates fresh mutable arrays',()=>{const a=newCorrelationDocument(),b=newCorrelationDocument();assert.deepEqual(parseCorrelation(a),a);assert.equal(a.title,'新しい相関図');assert.deepEqual(a.nodes,[]);assert.deepEqual(a.edges,[]);assert.notEqual(a.nodes,b.nodes);});
test('OBS set parser accepts three reference modes and arbitrary UUID pair without a parent constraint',()=>{for(const[t,c]of [[id(1),null],[null,id(2)],[id(1),id(2)]])assert.deepEqual(parseObsSet({name:'  配信セット  ',tier_work_id:t,correlation_id:c}),{name:'配信セット',tier_work_id:t,correlation_id:c});});
test('OBS set parser rejects empty, excessive, missing, malformed and injected input',()=>{for(const v of [null,undefined,{},[],{name:'',tier_work_id:id(1),correlation_id:null},{name:' '.repeat(3),tier_work_id:id(1),correlation_id:null},{name:'x'.repeat(121),tier_work_id:id(1),correlation_id:null},{name:'a',tier_work_id:null,correlation_id:null},{name:'a',tier_work_id:id(1)},{name:'a',tier_work_id:'id.eq.bad',correlation_id:id(2)},{name:'a',tier_work_id:[],correlation_id:id(2)}])assert.throws(()=>parseObsSet(v));});
test('new Creator reads distinguish list cursor from correlation/set IDs and never cache',async()=>{const old=global.fetch,calls=[];try{global.fetch=async(url,options)=>{calls.push([new URL(url,'http://local'),options]);return Response.json({ok:true});};const {creatorRead}=require('../src/lib/creator/pagination');for(const k of ['correlations','obs-sets','correlation','obs-set'])await creatorRead(k,id(1));assert.deepEqual(calls.map(([u])=>[u.searchParams.get('kind'),u.searchParams.has('id')]),[['correlations',false],['obs-sets',false],['correlation',true],['obs-set',true]]);assert(calls.every(([,o])=>o.cache==='no-store'));}finally{global.fetch=old;}});
test('new list loaders traverse 1500 equal-time rows in bounded pages with light correlation metadata',async()=>{
 const {getCorrelationPage,getObsSetPage}=require('../src/lib/creator/independent-server');
 for(const load of [getCorrelationPage,getObsSetPage]){
  const rows=Array.from({length:1500},(_,i)=>({id:id(i+1),updated_at:'2026-10-22T00:00:00.123456Z',revision:1,tier_work_id:null,title:'相関図',name:'セット'}));let requests=0;
  const client={from(table){assert(['creator_correlations','creator_obs_sets'].includes(table));let limit,ceiling=Infinity;const orders=[];const q={select(s){if(table==='creator_correlations'&&s!=='id')assert.equal(s,'id,revision,tier_work_id,updated_at,title:document->>title');return q;},order(k,o){orders.push([k,o]);return q;},limit(n){assert(n<=31);limit=n;return q;},or(s){const m=/^updated_at\.lt\.([^,]+),and\(updated_at\.eq\.\1,id\.lt\.([a-f0-9-]+)\)$/.exec(s);assert(m);ceiling=Number(m[2].slice(-12));return q;},then(resolve,reject){requests++;if(limit!==1)assert.deepEqual(orders.map(o=>o[0]),['updated_at','id']);return Promise.resolve({data:rows.filter(r=>Number(r.id.slice(-12))<ceiling).reverse().slice(0,limit),error:null}).then(resolve,reject);}};return q;}};
  let cursor=null,items=[];do{const p=await load(client,cursor);assert(p.items.length<=30);items.push(...p.items);cursor=p.nextCursor;}while(cursor);assert.equal(items.length,1500);assert.equal(new Set(items.map(i=>i.id)).size,1500);assert.equal(requests,51);
 }
});
test('independent Creator scope pins reviewed product/migration bytes and preserves all other product, RPC, old OBS, dependencies and inventory',()=>{
 const s=require('./creator-independent-scope.cjs'),git=(...args)=>cp.execFileSync('git',args,{encoding:'utf8',maxBuffer:64e6}).replaceAll('\r\n','\n');
 assert.equal(Object.keys(s.hashes).length,20);Object.keys(s.hashes).forEach(s.assertReviewed);
 const files=git('ls-tree','-r','--name-only',s.base).trim().split('\n').filter(f=>/^(src|supabase)\//.test(f)||/^package(-lock)?\.json$/.test(f));
 for(const f of files)assert.equal(s.readBeforeIndependent(f),git('show',s.base+':'+f),f);
 assert.deepEqual(git('ls-files','--cached','--others','--exclude-standard','--','src','supabase').trim().split('\n').sort(),[...files.filter(f=>/^(src|supabase)\//.test(f)),...s.added].sort());
});
