/* eslint-disable @typescript-eslint/no-require-imports */
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const {createDb,identity,uuid}=require('./creator-db.cjs');
test('UX migration: legacy backfill once, title independence, SQL numeric/type validation, old writer compatibility',async()=>{
 const db=await createDb({ux:false});
 try {
  const tier={version:1,title:'Original',showTitle:true,rows:[{id:uuid(90),name:'S',color:'#ff0000',imageIds:[]}]};
  await db.query('insert into public.creator_images(id,name,object_path) values($1,$2,$3)',[uuid(10),'Image',uuid(10)+'.png']);
  await db.query('insert into public.creator_tier_works(id,document) values($1,$2)',[uuid(20),tier]);
  const legacy={version:1,showTitle:true,showNames:true,nodes:[1,2].map(n=>({id:uuid(n+30),imageId:uuid(10),x:n*200,y:200,width:160,height:184})),edges:[{id:uuid(40),sourceNodeId:uuid(31),targetNodeId:uuid(32),label:'manual',visible:true,origin:'manual'}]};
  await db.query('insert into public.creator_correlations(id,tier_work_id,document) values($1,$2,$3)',[uuid(21),uuid(20),legacy]);
  await db.exec('reset role');
  await db.exec(fs.readFileSync('supabase/migrations/'+fs.readdirSync('supabase/migrations').find(f=>f.endsWith('_creator_ux.sql')),'utf8'));await identity(db);
  const read=async()=>(await db.query('select * from public.creator_correlations')).rows[0];
  assert.equal((await read()).document.title,'Original');assert.equal((await read()).revision,2);assert.deepEqual((await read()).document.edges,legacy.edges);
  await db.query('update public.creator_tier_works set document=$1',[{...tier,title:'Changed'}]);assert.equal((await read()).document.title,'Original');
  await db.query('update public.creator_correlations set document=$1',[legacy]);assert.equal((await read()).document.title,'Original');
  for(const values of [{winRate:0,matchCount:0},{winRate:57.1,matchCount:42},{winRate:null,matchCount:null},{winRate:100,matchCount:9007199254740991}]){
   const doc={...legacy,title:'Independent',showStats:false,showLabels:false,edges:[{...legacy.edges[0],...values,type:'bidirectional'}]};
   await db.query('update public.creator_correlations set document=$1',[doc]);assert.deepEqual((await read()).document,doc);
  }
  for(const patch of [{winRate:-1},{winRate:101},{winRate:'57'},{matchCount:-1},{matchCount:1.5},{matchCount:9007199254740992},{type:null},{type:'reverse'}])await assert.rejects(db.query('update public.creator_correlations set document=$1',[{...legacy,edges:[{...legacy.edges[0],...patch}]}]));
  for(const patch of [{title:null},{title:'x'.repeat(121)},{showLabels:null},{showStats:'yes'}])await assert.rejects(db.query('update public.creator_correlations set document=$1',[{...legacy,...patch}]));
  assert.equal((await db.query('select * from public.creator_correlation_image_refs')).rows.length,1);
 } finally {await db.close();}
});
