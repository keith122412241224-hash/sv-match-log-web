/* eslint-disable @typescript-eslint/no-require-imports */
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const {createDb,identity,ADMIN,MEMBER,uuid}=require('./creator-db.cjs');
const migration=fs.readdirSync('supabase/migrations').find(f=>f.endsWith('_creator_independent_correlation.sql'));
const tier={version:1,title:'既存Tier',showTitle:true,rows:[{id:uuid(90),name:'S',color:'#ff0000',imageIds:[uuid(3)]}]};
const graph={version:1,title:'独立相関図',showTitle:true,showNames:true,nodes:[{id:uuid(20),imageId:uuid(3),x:50,y:50,width:160,height:184}],edges:[]};
async function seed(db){await db.query('insert into creator_images(id,name,object_path) values($1,$2,$3)',[uuid(3),'画像',uuid(3)+'.png']);await db.query('insert into creator_tier_works(id,document) values($1,$2),($3,$2)',[uuid(10),tier,uuid(12)]);await db.query('insert into creator_correlations(id,tier_work_id,document) values($1,$2,$3)',[uuid(11),uuid(10),graph]);}
async function snapshot(db){const s={};for(const t of ['creator_tier_works','creator_correlations','creator_images','creator_tier_image_refs','creator_correlation_image_refs'])s[t]=(await db.query(`select to_jsonb(t) as row from ${t} t order by to_jsonb(t)::text`)).rows;return s;}
test('independent migration preserves every existing row, document, ID, revision, timestamps, references and existing function/policy definitions',async()=>{
 const db=await createDb({independent:false});try{await seed(db);await db.query('update creator_correlations set document=$1 where id=$2',[graph,uuid(11)]);const before=await snapshot(db);await db.exec('reset role');
 const definitions=async()=>({functions:(await db.query("select proname,pg_get_functiondef(oid) as definition,proacl::text from pg_proc where pronamespace='public'::regnamespace and proname like 'creator_%' order by proname")).rows,policies:(await db.query("select * from pg_policies where tablename like 'creator_%' and tablename <> 'creator_obs_sets' order by tablename,policyname")).rows});const defs=await definitions();
 await db.exec(fs.readFileSync('supabase/migrations/'+migration,'utf8'));assert.deepEqual(await definitions(),defs);await identity(db);assert.deepEqual(await snapshot(db),before);
 assert.equal((await db.query('select revision from creator_correlations where id=$1',[uuid(11)])).rows[0].revision,2);
 // Old writers and Tier-based lookups still operate on the upgraded database.
 await db.query('update creator_tier_works set document=$1 where id=$2 and revision=1',[{...tier,title:'旧Webで更新'},uuid(10)]);
 assert.deepEqual((await db.query('select document from creator_correlations where tier_work_id=$1',[uuid(10)])).rows[0].document,graph);
 await db.query('update creator_correlations set document=$1 where id=$2 and revision=2',[{...graph,title:'旧Webで相関図更新'},uuid(11)]);
 assert.equal((await db.query('select revision from creator_correlations where id=$1',[uuid(11)])).rows[0].revision,3);
 }finally{await db.close();}
});
test('standalone correlations allow multiple NULL parents while retaining UNIQUE, validation, immutable parent and atomic protected image references',async()=>{
 const db=await createDb();try{await seed(db);for(const n of [30,31])await db.query('insert into creator_correlations(id,tier_work_id,document) values($1,null,$2)',[uuid(n),graph]);
 await assert.rejects(db.query('insert into creator_correlations(tier_work_id,document) values($1,$2)',[uuid(10),graph]),/unique/);
 await assert.rejects(db.query('insert into creator_correlations(tier_work_id,document) values($1,$2)',[uuid(999),graph]),/foreign key/);
 await assert.rejects(db.query('update creator_correlations set tier_work_id=$1 where id=$2',[uuid(12),uuid(30)]),/reparented/);
 const before=await snapshot(db);for(const bad of [{...graph,nodes:[{...graph.nodes[0],x:2000}]},{...graph,nodes:[...graph.nodes,...graph.nodes]},{...graph,nodes:[{...graph.nodes[0],imageId:uuid(999)}]},{...graph,edges:[{id:uuid(9),sourceNodeId:uuid(20),targetNodeId:uuid(20),origin:'manual',label:'x',visible:true}]}])await assert.rejects(db.query('update creator_correlations set document=$1 where id=$2',[bad,uuid(30)]));assert.deepEqual(await snapshot(db),before);
 await db.query('delete from creator_correlations where id=$1',[uuid(11)]);await db.query('delete from creator_tier_works');await assert.rejects(db.query('delete from creator_images where id=$1',[uuid(3)]),/foreign key/);
 assert.equal((await db.query('select * from creator_correlation_image_refs')).rows.length,2);
 }finally{await db.close();}
});
test('OBS sets support all three modes, arbitrary pairs, restrictive FKs and optimistic revision conflicts without cascading work deletion',async()=>{
 const db=await createDb();try{await seed(db);for(const [n,t,c]of [[40,uuid(12),null],[41,null,uuid(11)],[42,uuid(12),uuid(11)]])await db.query('insert into creator_obs_sets(id,name,tier_work_id,correlation_id) values($1,$2,$3,$4)',[uuid(n),'セット',t,c]);
 for(const [t,c]of [[null,null],[uuid(999),null],[null,uuid(999)]])await assert.rejects(db.query('insert into creator_obs_sets(name,tier_work_id,correlation_id) values($1,$2,$3)',['不正',t,c]));
 for(const name of ['', ' '.repeat(3),'x'.repeat(121)])await assert.rejects(db.query('insert into creator_obs_sets(name,tier_work_id) values($1,$2)',[name,uuid(12)]));
 await assert.rejects(db.query('delete from creator_tier_works where id=$1',[uuid(12)]),/foreign key/);await assert.rejects(db.query('delete from creator_correlations where id=$1',[uuid(11)]),/foreign key/);
 const original=(await db.query('select * from creator_obs_sets where id=$1',[uuid(42)])).rows[0];const update=()=>db.query('update creator_obs_sets set name=$1 where id=$2 and revision=1 returning *',['更新',uuid(42)]);const a=await update(),b=await update();assert.equal(a.rows[0].revision,2);assert.equal(b.rows.length,0);assert.equal(a.rows[0].created_at.getTime(),original.created_at.getTime());
 await db.query('delete from creator_obs_sets');assert.equal((await db.query('select * from creator_tier_works')).rows.length,2);assert.equal((await db.query('select * from creator_correlations')).rows.length,1);
 await db.query('delete from creator_correlations');await db.query('delete from creator_tier_works');await db.query('delete from creator_images');
 }finally{await db.close();}
});
test('OBS set RLS and grants deny non-admin, anonymous Guest and unauthenticated access; only admin CRUD and safe invoker revision trigger',async()=>{
 const db=await createDb();try{await seed(db);await db.query('insert into creator_obs_sets(id,name,tier_work_id) values($1,$2,$3)',[uuid(40),'非公開',uuid(12)]);
 for(const [u,r,g]of [[MEMBER,'authenticated',false],[ADMIN,'authenticated',true],[null,'authenticated',false],[null,'anon',false]]){await identity(db,u,r,g);if(r==='anon'){await assert.rejects(db.query('select * from creator_obs_sets'),/permission denied/);}else{assert.equal((await db.query('select * from creator_obs_sets')).rows.length,0);assert.equal((await db.query("update creator_obs_sets set name='侵入' returning *")).rows.length,0);assert.equal((await db.query('delete from creator_obs_sets returning *')).rows.length,0);}await assert.rejects(db.query('insert into creator_obs_sets(name,tier_work_id) values($1,$2)',['不正',uuid(12)]));}
 await identity(db);assert.equal((await db.query('select * from creator_obs_sets')).rows.length,1);await db.exec('reset role');assert.equal((await db.query("select prosecdef from pg_proc where proname='creator_touch_revision'")).rows[0].prosecdef,false);
 const grants=(await db.query("select grantee,privilege_type from information_schema.role_table_grants where table_name='creator_obs_sets' and grantee in ('PUBLIC','anon','authenticated') order by grantee,privilege_type")).rows;assert.deepEqual(grants.map(r=>r.grantee+':'+r.privilege_type),['authenticated:DELETE','authenticated:INSERT','authenticated:SELECT','authenticated:UPDATE']);
 await db.query('delete from auth.users where id=$1',[ADMIN]);assert.equal((await db.query('select created_by from creator_obs_sets')).rows[0].created_by,null);
 }finally{await db.close();}
});
