/* eslint-disable @typescript-eslint/no-require-imports */
const {test}=require('node:test'),assert=require('node:assert/strict');
const {createDb,identity,ADMIN,MEMBER,uuid}=require('./creator-db.cjs');
const tier=ids=>({version:1,title:'環境解説',showTitle:true,rows:[{id:uuid(90),name:'S',color:'#ff0000',imageIds:ids}]});
const node=(n,image)=>({id:uuid(n),imageId:uuid(image),x:n*10,y:200,width:160,height:184});
const document=()=>({version:1,showTitle:true,showNames:true,nodes:[node(20,3),node(21,4)],edges:[{id:uuid(30),sourceNodeId:uuid(20),targetNodeId:uuid(21),origin:'manual',label:'微有利',visible:true}]});
test('correlation SQL: 0..1 child, restrictive parent/image FKs, atomic refs, revisions, RLS and account deletion',async()=>{
 const db=await createDb();
 try{
  for(const n of [2,3,4,5])await db.query('insert into public.creator_images(id,name,object_path) values($1,$2,$3)',[uuid(n),'画像'+n,uuid(n)+'.png']);
  await db.query('insert into public.creator_tier_works(id,document) values($1,$2)',[uuid(10),tier([uuid(2),uuid(4)])]);
  await db.query('insert into public.creator_correlations(id,tier_work_id,document) values($1,$2,$3)',[uuid(11),uuid(10),document()]);
  await assert.rejects(db.query('insert into public.creator_correlations(tier_work_id,document) values($1,$2)',[uuid(10),document()]),/unique/);
  // Tier-only, graph-only, both; unused is deletable.
  for(const n of [2,3,4])await assert.rejects(db.query('delete from public.creator_images where id=$1',[uuid(n)]),/foreign key/);
  assert.equal((await db.query('delete from public.creator_images where id=$1 returning *',[uuid(5)])).rows.length,1);
  await assert.rejects(db.query('delete from public.creator_tier_works where id=$1',[uuid(10)]),/foreign key/);
  const d=document();
  for(const bad of [{...d,showNames:null},{...d,nodes:[{...d.nodes[0],x:1920}]},{...d,nodes:[d.nodes[0],d.nodes[0]]},{...d,edges:[{...d.edges[0],targetNodeId:uuid(99)}]},{...d,edges:[{...d.edges[0],targetNodeId:uuid(20)}]},{...d,edges:[d.edges[0],{...d.edges[0],id:uuid(31),sourceNodeId:uuid(21),targetNodeId:uuid(20)}]},{...d,edges:[{...d.edges[0],origin:'generated'}]}])await assert.rejects(db.query('update public.creator_correlations set document=$1 where id=$2',[bad,uuid(11)]));
  await assert.rejects(db.query('update public.creator_correlations set document=$1 where id=$2',[{...d,nodes:[node(20,999)],edges:[]},uuid(11)]),/foreign key/);
  assert.equal((await db.query('select * from public.creator_correlation_image_refs')).rows.length,2);
  await db.query('update public.creator_images set object_path=$1 where id=$2',[uuid(70)+'.webp',uuid(4)]);
  assert.equal((await db.query('select image_id from public.creator_correlation_image_refs where image_id=$1',[uuid(4)])).rows.length,1);
  await db.query('update public.creator_correlations set document=$1 where id=$2 and revision=1',[{...d,showNames:false},uuid(11)]);
  assert.equal((await db.query('select revision from public.creator_correlations')).rows[0].revision,2);
  assert.equal((await db.query('update public.creator_correlations set document=$1 where id=$2 and revision=1 returning *',[d,uuid(11)])).rows.length,0);
  for(const [user,role,guest] of [[MEMBER,'authenticated',false],[ADMIN,'authenticated',true],[null,'anon',false]]){
   await identity(db,user,role,guest);
   for(const table of ['creator_correlations','creator_correlation_image_refs']){
    if(role==='anon')await assert.rejects(db.query(`select * from public.${table}`),/permission denied/);
    else {assert.equal((await db.query(`select * from public.${table}`)).rows.length,0);assert.equal((await db.query(`delete from public.${table} returning *`)).rows.length,0);}
   }
   await assert.rejects(db.query('insert into public.creator_correlations(tier_work_id,document) values($1,$2)',[uuid(10),d]));
  }
  await identity(db);
  await db.query('insert into public.creator_tier_works(id,document) values($1,$2)',[uuid(15),tier([])]);
  await assert.rejects(db.query('update public.creator_correlations set tier_work_id=$1 where id=$2',[uuid(15),uuid(11)]),/reparented/);
  await db.exec('reset role');await db.query('delete from auth.users where id=$1',[ADMIN]);
  assert.equal((await db.query('select created_by from public.creator_correlations')).rows[0].created_by,null);
  await db.query('delete from public.creator_correlations where id=$1',[uuid(11)]);
  assert.equal((await db.query('select * from public.creator_tier_works where id=$1',[uuid(10)])).rows.length,1);
  assert.equal((await db.query('select * from public.creator_correlation_image_refs')).rows.length,0);
  await db.query('delete from public.creator_images where id=$1',[uuid(3)]);
  await db.query('delete from public.creator_tier_works where id=$1',[uuid(10)]);
 }finally{await db.close();}
});
