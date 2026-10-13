/* eslint-disable @typescript-eslint/no-require-imports */
// Actual R2 actions against synthetic in-memory PostgreSQL; never connects to Supabase.
const fs=require('fs'),path=require('path'),assert=require('assert/strict'),Module=require('module');
const cwd=path.resolve(__dirname,'..');require(path.join(cwd,'tests/register.cjs'));
const {setup}=require('./match-mutations-db.cjs');
const {randomUUID}=require('node:crypto');
const evidence={localOnly:true,schema:'all current migrations',actions:[],rpcParity:[]};
const uuid=n=>'00000000-0000-4000-8000-'+String(n).padStart(12,'0');
const user={id:uuid(1),is_anonymous:false},env=uuid(10),my=uuid(20),opponent=uuid(21);
let db,Query;const writes=[];
const client={auth:{getUser:async()=>({data:{user}})},from:t=>new Query(t)};
const load=Module._load;Module._load=function(name,...args){
 if(name==='@/lib/supabase/server')return {createSupabaseServerClient:async()=>client};
 if(name==='next/navigation')return {redirect:p=>{throw new Error('REDIRECT:'+p);}};
 if(name==='next/cache')return {revalidatePath:()=>{}};
 return load.call(this,name,...args);
};
const actions=require(path.join(cwd,'src/app/actions.ts'));
const form=next=>{const f=new FormData();for(const [k,v]of Object.entries({request_id:randomUUID(),environment_id:env,my_deck_id:my,opponent_deck_id:opponent,result:'win',turn_order:'first',next_action:next||'home'}))f.set(k,v);return f;};
const {test}=require('node:test');
test('R2 actual authenticated actions, CHECK and rank-independent Phase 2-A/B/C totals',{timeout:120000},async t=>{
 t.mock.timers.enable({apis:['Date'],now:new Date('2026-09-20T00:00:00Z')});
 const fixture=await setup({seed:false});db=fixture.db;
 Query=class extends fixture.Query { upsert(rows,options){if(this.table==='matches')writes.push(...(Array.isArray(rows)?rows:[rows]));return super.upsert(rows,options);} };
 try{
 await db.query('insert into auth.users(id,email) values($1,$2)',[user.id,'synthetic@example.test']);
 await db.query('insert into public.admin_users(user_id) values($1)',[user.id]);
 await db.query('insert into public.environments(id,user_id,name) values($1,$2,$3)',[env,user.id,'synthetic']);
 for(const id of [my,opponent])await db.query('insert into public.decks(id,user_id,name,class_name) values($1,$2,$3,$4)',[id,user.id,id,'local']);
 await db.query("insert into public.matches(user_id,environment_id,my_deck_id,opponent_deck_id,result,turn_order,played_at) values($1,$2,$3,$4,'win','first','2026-09-20T00:00:00Z'),($1,$2,$4,$3,'lose','second','2026-09-13T00:00:00Z')",[user.id,env,my,opponent]);
 const ranks=[{rank_tier:null,master_group:null,grandmaster_rating:null},...['beginner','d','c','b','a','aa'].map(rank_tier=>({rank_tier,master_group:null,grandmaster_rating:null})),...['emerald','topaz','ruby','sapphire','diamond'].map(master_group=>({rank_tier:'master',master_group,grandmaster_rating:null})),...['none','epic','ultimate','legend','beyond'].map(grandmaster_rating=>({rank_tier:'grandmaster',master_group:null,grandmaster_rating}))];
 await fixture.claim(user.id);
 for(const rank of ranks){const f=form();for(const [k,v]of Object.entries(rank))if(v!==null)f.set(k,v);
 assert.equal((await actions.createMatchInline(f)).ok,true);f.set('request_id',randomUUID());await assert.rejects(actions.createMatch(f),/REDIRECT:\/$/);
 const g=new FormData();g.set('guest_matches_json',JSON.stringify([{local_id:'guest-'+ranks.indexOf(rank),environment_id:env,my_deck_id:my,opponent_deck_id:opponent,result:'win',turn_order:'first',played_at:'2026-09-20T00:00:00Z',...rank}]));assert.deepEqual((await actions.importGuestMatches(g)).importedIds,['guest-'+ranks.indexOf(rank)]);
 }
 const oldForm=form();oldForm.delete('request_id');assert.equal((await actions.createMatchInline(oldForm)).ok,false);
 const rows=(await db.query('select rank_tier,master_group,grandmaster_rating from public.matches')).rows;
 assert.equal(rows.length,53);assert.equal(rows.filter(r=>r.rank_tier===null).length,5);assert.equal(rows.filter(r=>r.grandmaster_rating==='none').length,3);
 for(const rank of ranks)assert.equal(rows.filter(r=>Object.keys(rank).every(k=>r[k]===rank[k])).length,rank.rank_tier===null?5:3);
 const saved=(await db.query('select request_id from public.matches where request_id is not null and rank_tier is null limit 1')).rows[0];
 const replay=form();replay.set('request_id',saved.request_id);assert.equal((await actions.createMatchInline(replay)).status,'replayed');
 assert.equal((await db.query('select count(*)::int n from public.matches')).rows[0].n,53);
 const bad=form();bad.set('rank_tier','master');assert.equal((await actions.createMatchInline(bad)).ok,false);assert.equal(writes.length,51);
 const calls=[['matchup-mine','select public.get_matchup_aggregates_v1($1,false) as data',[env]],['matchup-all','select public.get_matchup_aggregates_v1($1,true) as data',[env]],
 ...[false,true].flatMap(all=>[false,true].map(reversed=>['analysis-'+all+'-'+reversed,'select public.get_analysis_aggregates_v1($1,$2,$3) as data',[env,all,reversed]])),
 ['period','select public.get_period_report_aggregates_v1($1,$2,$3,$4) as data',['2026-01-01','2026-12-31T23:59:59Z','2025-01-01','2025-12-31T23:59:59Z']]];
 const before=[];for(const [name,sql,args]of calls){const result=(await db.query(sql,args)).rows[0].data;const total=result.registeredMatches??result.totalMatches??result.current?.totalMatches;assert.equal(total,53,name);before.push(result);}
 // Only synthetic local rows: changing just rank metadata cannot change any v1 aggregate.
 await db.exec('update public.matches set rank_tier=null,master_group=null,grandmaster_rating=null');
 for(const [i,[name,sql,args]]of calls.entries()){assert.deepEqual((await db.query(sql,args)).rows[0].data,before[i],name);evidence.rpcParity.push({name,total:53,equal:true});}
 evidence.savedByActualActions=51;evidence.validCombinations=17;evidence.existingNullRowsPreserved=true;evidence.authenticatedRls=true;evidence.passed=true;
 }finally{await db.close();const out=path.join(cwd,'build/rank-save-integration');fs.mkdirSync(out,{recursive:true});fs.writeFileSync(path.join(out,'result.json'),JSON.stringify(evidence,null,2));}
});
