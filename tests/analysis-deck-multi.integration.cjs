/* eslint-disable @typescript-eslint/no-require-imports */
// Actual additive SQL, isolated PostgreSQL; expected aggregates calculated from synthetic rows in JS.
const {test,before,after}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const h=require('./matrix-multi-rank-db.cjs'),{analysisFixture}=require('./analysis-browser-fixture.cjs');
const {parseAnalysisAggregates,buildAnalysisFromAggregates}=require('../src/lib/analysis-aggregates');
const {RANK_ATOMS}=require('../src/lib/rank-selection');
const out='build/analysis-deck-multi-select',migration='supabase/migrations/20261022050000_analysis_deck_sets.sql';
const ids=h.decks.map(d=>d.id),evidence={cases:[],security:[],performance:[]};let db,records;
const defaults={p_environment_id:h.NEW,p_include_all_users:true,p_include_reversed:true,p_use_archetype:true,p_rank_filters:RANK_ATOMS};
async function rpc(args={},v=4){const a={...defaults,...args};const types={p_environment_id:'uuid',p_include_all_users:'boolean',p_include_reversed:'boolean',p_use_archetype:'boolean',p_rank_filters:'text[]',p_my_deck_ids:'uuid[]',p_opponent_deck_ids:'uuid[]',p_my_deck_id:'uuid',p_opponent_deck_id:'uuid',p_result:'public.match_result',p_turn_order:'public.turn_order',p_played_from:'timestamptz',p_played_to:'timestamptz',p_recent_deck_ids:'uuid[]'};const entries=Object.entries(a);return(await db.query(`select public.get_analysis_aggregates_v${v}(${entries.map(([k],i)=>`${k}=>$${i+1}::${types[k]}`).join(',')}) data`,entries.map(([,v])=>v))).rows[0].data;}
const canonical=a=>({...a,recent:a.recent.map(r=>({...r,views:r.views.map(v=>({...v,playedAt:new Date(v.playedAt).toISOString()}))})).sort((a,b)=>String(a.deckId).localeCompare(String(b.deckId)))});
async function catalog(){return (await db.query("select proname,pg_get_functiondef(oid) def,proacl::text acl from pg_proc where pronamespace='public'::regnamespace order by proname,oid")).rows;}
before(async()=>{db=await h.createDb();const before=await catalog();await db.exec(h.read(migration));assert.deepEqual((await catalog()).filter(r=>r.proname!=='get_analysis_aggregates_v4'),before);records=[...h.fixture(),h.row({my_archetype_id:ids[0],opponent_archetype_id:ids[0]}),h.row({my_archetype_id:ids[1],opponent_archetype_id:ids[0],result:'lose'}),h.row({my_archetype_id:ids[0],opponent_archetype_id:ids[1]})];await h.seed(db,records);});
after(async()=>{if(db)await db.close();fs.mkdirSync(out,{recursive:true});fs.writeFileSync(out+'/db-evidence.json',JSON.stringify(evidence,null,2));fs.writeFileSync(out+'/performance-results.json',JSON.stringify({engine:'PGlite local synthetic PostgreSQL; timings are not Production latency',samples:evidence.performance},null,2));});
test('v4 independent row oracle: AND/OR, mirror/reversed, ranks/dates/legacy, all fields and v3 parity',async()=>{
 const sets=[[null,null],[[ids[0]],null],[null,[ids[1]]],[[ids[0]],[ids[1]]],[ids.slice(0,2),null],[null,ids.slice(1,3)],[ids.slice(0,2),ids.slice(1,3)],[ids.slice(0,3),ids.slice(3,5)],[ids.slice(0,2),ids.slice(0,2)],[[ids[4]],ids.slice(0,2)]];
 for(const who of [h.MEMBER,h.ADMIN])for(const all of [false,true])for(const combined of [false,true])for(const [my,opponent]of sets)for(const extra of [{},{p_rank_filters:['unranked','master:ruby'],p_played_from:'2026-09-29T01:00:00.000Z',p_played_to:'2026-09-29T01:00:00.000Z'},{p_result:'lose',p_turn_order:'second'},{p_use_archetype:false,p_my_deck_ids:[h.uuid(300),h.uuid(301)],p_opponent_deck_ids:null}]){
  await h.identity(db,who);const args={...defaults,p_include_all_users:all,p_include_reversed:combined,p_my_deck_ids:my,p_opponent_deck_ids:opponent,...extra};
  const rows=records.filter(r=>(all&&who===h.ADMIN||r.user_id===who)&&args.p_rank_filters.includes(h.atom(r)));
  const expected=analysisFixture(rows,args),actual=parseAnalysisAggregates(await rpc(args));
  assert.deepEqual(canonical(actual),canonical(expected));assert.deepEqual(buildAnalysisFromAggregates(actual,h.decks,h.decks),buildAnalysisFromAggregates(expected,h.decks,h.decks));
  assert.ok(actual.perspectives<=actual.registeredMatches*2);if(!combined)assert.equal(actual.perspectives,actual.registeredMatches);
  if((args.p_my_deck_ids?.length??0)<=1&&(args.p_opponent_deck_ids?.length??0)<=1){const {p_my_deck_ids,p_opponent_deck_ids,...rest}=args;assert.deepEqual(await rpc({...rest,p_my_deck_id:p_my_deck_ids?.[0]??null,p_opponent_deck_id:p_opponent_deck_ids?.[0]??null},3),actual);}
  evidence.cases.push({who:who===h.ADMIN?'admin':'member',all,combined,my:args.p_my_deck_ids,opponent:args.p_opponent_deck_ids,registered:actual.registeredMatches,views:actual.perspectives,oracleEqual:true});
 }
 await h.identity(db);const a=await rpc({p_my_deck_ids:ids.slice(0,2)});assert.deepEqual(await rpc({p_my_deck_ids:[ids[1],ids[0],ids[1]]}),a);
 assert.equal((await rpc({p_my_deck_ids:[h.uuid(999)]})).perspectives,0);
});
test('v4 security: ACL, own/admin scope, revocation, invoker RLS, no identity, invalid bounded arrays',async()=>{
 await db.exec('reset role');const meta=(await db.query("select prosecdef,provolatile,proconfig,has_function_privilege('anon',oid,'execute') anon,has_function_privilege('authenticated',oid,'execute') member,has_function_privilege('service_role',oid,'execute') service from pg_proc where proname='get_analysis_aggregates_v4'")).rows[0];assert.equal(meta.prosecdef,false);assert.equal(meta.provolatile,'s');assert.deepEqual(meta.proconfig,['search_path=""']);assert.equal(meta.anon,false);assert.equal(meta.member,true);assert.equal(meta.service,true);
 await h.identity(db,null,'anon');await assert.rejects(rpc(),e=>e.code==='42501');
 await h.identity(db,null);assert.equal((await rpc()).perspectives,0);
 await h.identity(db,null,'service_role');assert.equal((await rpc()).perspectives,0);
 await h.identity(db,h.MEMBER);assert.deepEqual(await rpc({p_include_all_users:true}),await rpc({p_include_all_users:false}));
 await h.identity(db,h.ADMIN);const all=await rpc(),own=await rpc({p_include_all_users:false});assert.ok(all.perspectives>own.perspectives);
 await db.exec('reset role');await db.query('delete from public.admin_users where user_id=$1',[h.ADMIN]);await h.identity(db);assert.deepEqual(await rpc(),own);
 await db.exec('reset role');await db.query('insert into public.admin_users values($1)',[h.ADMIN]);await db.exec('alter policy matches_select_own_or_admin on public.matches using(auth.uid()=user_id)');await h.identity(db);assert.deepEqual(await rpc(),own);
 await db.exec('reset role;alter policy matches_select_own_or_admin on public.matches using(auth.uid()=user_id or public.is_admin())');await h.identity(db);
 for(const name of ['p_my_deck_ids','p_opponent_deck_ids'])for(const bad of [[],[null],[ids[0],null],[[ids[0]]],Array(61).fill(ids[0]),'not-array',['not-uuid']])await assert.rejects(rpc({[name]:bad}),e=>['22023','22P02'].includes(e.code));
 await assert.rejects(db.query("select public.get_analysis_aggregates_v4(p_my_deck_ids=>$1::uuid[])",[`[0:0]={${ids[0]}}`]),e=>e.code==='22023');
 evidence.security.push({metadata:meta,anonymousDenied:true,noIdentityEmpty:true,memberCannotEscalate:true,adminRevocation:true,stricterRls:true,invalidArraysRejected:15,existingFunctionsUnchanged:true});
});
test('v4 performance: zero and 100000 rows, all/1/3/10/30 sets, comparable v3 all/single',async()=>{
 await h.seed(db,[]);assert.equal((await rpc()).perspectives,0);
 const catalog=Array.from({length:30},(_,i)=>h.uuid(400+i));
 await db.exec('reset role');await db.query(`insert into public.matches(id,user_id,environment_id,my_deck_id,opponent_deck_id,my_archetype_id,opponent_archetype_id,result,turn_order,played_at,rank_tier)
 select ('00000000-0000-4000-8000-'||lpad((1000000+i)::text,12,'0'))::uuid,$1,$2,($3::uuid[])[1+i%30],($3::uuid[])[1+(i*7+1)%30],($3::uuid[])[1+i%30],($3::uuid[])[1+(i*7+1)%30],case when i%3=0 then 'lose'::public.match_result else 'win'::public.match_result end,case when i%2=0 then 'first'::public.turn_order else 'second'::public.turn_order end,'2026-09-29'::timestamptz+i*interval '1 second','a' from generate_series(1,100000) i`,[h.MEMBER,h.NEW,catalog]);await db.exec('analyze public.matches');await h.identity(db,h.MEMBER);
 for(const count of [0,1,3,10,30])for(const combined of [false,true]){
  const args={p_my_deck_ids:count?catalog.slice(0,count):null,p_opponent_deck_ids:null,p_include_reversed:combined};const times=[];let result;
  for(let i=0;i<3;i++){const start=performance.now();result=parseAnalysisAggregates(await rpc(args));times.push(performance.now()-start);}
  const oldTimes=[];if(count<=1)for(let i=0;i<3;i++){const start=performance.now();const old=await rpc({p_my_deck_id:count?catalog[0]:null,p_opponent_deck_id:null,p_include_reversed:combined},3);oldTimes.push(performance.now()-start);assert.deepEqual(old,result);}
  evidence.performance.push({records:100000,count:count||'all',combined,v4Ms:times,v3Ms:oldTimes,registered:result.registeredMatches,views:result.perspectives,bytes:Buffer.byteLength(JSON.stringify(result))});
 }
});
