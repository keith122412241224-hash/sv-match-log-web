/* eslint-disable @typescript-eslint/no-require-imports */
// Synthetic, in-process PostgreSQL only. Never connects to Production.
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const {performance}=require('node:perf_hooks');
const {PGlite}=require(process.env.PGLITE_MODULE||'@electric-sql/pglite');
const old=require('../src/lib/analytics');
const {analysisPerspectives,filterAnalysisPerspectives}=require('../src/lib/match-perspectives');
const {parseAnalysisAggregates,buildAnalysisFromAggregates}=require('../src/lib/analysis-aggregates');
const {ANALYSIS_RANK_FILTERS}=require('../src/lib/analysis-rank-filter');
// Windows Git checkouts may use CRLF; the EXPLAIN-only SQL extraction uses LF delimiters.
const migration=fs.readFileSync('supabase/migrations/016_analysis_rank_aggregates_v2.sql','utf8').replaceAll('\r\n','\n');
const uuid=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const OWNER=uuid(1),OTHER=uuid(2),ADMIN=uuid(3),ENV=uuid(10),ENV2=uuid(11),A=uuid(100),B=uuid(101),C=uuid(102);
const decks=[A,B,C].map(id=>({id,name:id===C?'C':'same name',class_name:'elf'}));
const argTypes=['uuid','boolean','boolean','boolean','uuid','uuid','public.match_result','public.turn_order','timestamptz','timestamptz','uuid[]'];
const argNames=['p_environment_id','p_include_all_users','p_include_reversed','p_use_archetype','p_my_deck_id','p_opponent_deck_id','p_result','p_turn_order','p_played_from','p_played_to','p_recent_deck_ids','p_rank_filter'];
const sql=(v)=>`select public.get_analysis_aggregates_v${v}(${[...argTypes,...(v===2?['text']:[])].map((t,i)=>`$${i+1}::${t}`).join(',')}) as data`;
const signature=`public.get_analysis_aggregates_v2(${[...argTypes,'text'].join(',')})`;
const ranks=[{},...['beginner','d','c','b','a','aa'].map(rank_tier=>({rank_tier})),...['emerald','topaz','ruby','sapphire','diamond'].map(master_group=>({rank_tier:'master',master_group})),...['none','epic','ultimate','legend','beyond'].map(grandmaster_rating=>({rank_tier:'grandmaster',grandmaster_rating}))];
// Independent specification predicate, applied to original rows before old perspective code.
function accepts(row,filter){if(!filter||filter==='all')return true;if(filter==='master-plus')return ['master','grandmaster'].includes(row.rank_tier);const [tier,child]=filter.split(':');return row.rank_tier===tier&&(!child||(tier==='master'?row.master_group:row.grandmaster_rating)===child);}
function oracle(views,decks,archetypes){
 const visible=archetypes.length?archetypes:decks,names=new Map([...decks,...archetypes].map(d=>[d.id,d.name]));const wins=views.filter(v=>v.result==='win').length;
 return {registeredMatches:new Set(views.map(v=>v.id)).size,perspectives:views.length,totalWins:wins,winRate:old.calculateWinRate(wins,views.length),
 byMyDeck:old.groupWinRates(views,v=>v.my_archetype_id??v.my_deck_id,id=>names.get(id)??'不明'),byOpponentDeck:old.groupWinRates(views,v=>v.opponent_archetype_id??v.opponent_deck_id,id=>names.get(id)??'不明'),byTurn:old.turnOrderWinRates(views),matrix:old.buildWinRateMatrix(views,visible,visible),summaries:old.buildDeckAnalysisSummaries(views,visible,archetypes.length?'archetype':'deck')};
}
const evidence={base:'27f3dbb',engine:'PGlite synthetic data; not Production or HTTP timings',comparisons:0,allExact:0,permissions:[],performance:[]};
test('R3-A rank source semantics, old final model parity, v1 equality, RLS, metadata and scale',{timeout:600000},async()=>{
 const db=await PGlite.create();let rows=[],serial=1000,who=OWNER;
 const row=(extra={})=>({id:uuid(++serial),user_id:OWNER,environment_id:ENV,my_deck_id:A,opponent_deck_id:B,my_archetype_id:A,opponent_archetype_id:B,result:'win',turn_order:'first',played_at:'2026-09-20T00:00:00.123456Z',rank_tier:null,master_group:null,grandmaster_rating:null,...extra});
 async function identity(id=OWNER,role='authenticated'){await db.exec('reset role');await db.query("select set_config('request.jwt.claim.sub',$1,false)",[id||'']);assert.ok(['authenticated','anon','service_role'].includes(role));await db.exec('set role '+role);who=id;}
 async function seed(records){rows=records;await db.exec('reset role;truncate public.matches');await db.query(`insert into public.matches select * from jsonb_populate_recordset(null::public.matches,$1::jsonb)`,[JSON.stringify(rows)]);await db.exec('analyze public.matches');await identity();}
 async function catalog(){return (await db.query(`select 'function' as kind,p.proname as name,pg_get_functiondef(p.oid) as value from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname<>'get_analysis_aggregates_v2'
 union all select 'index',indexname,indexdef from pg_indexes where schemaname='public'
 union all select 'policy',policyname,concat(qual,'/',with_check) from pg_policies where schemaname='public'
 union all select 'column',column_name,concat(data_type,is_nullable,column_default) from information_schema.columns where table_schema='public' and table_name='matches'
 union all select 'constraint',conname,pg_get_constraintdef(oid) from pg_constraint where conrelid='public.matches'::regclass order by kind,name`)).rows;}
 async function compare(args,rank='all'){
 const [environment,all,reversed,useArchetype,myDeckId,opponentDeckId,result,turnOrder,from,to,recentIds]=args;
 const source=rows.filter(r=>who&&(r.user_id===who||(all&&who===ADMIN))&&(!environment||r.environment_id===environment)&&(!from||r.played_at>=from)&&(!to||r.played_at<=to)&&accepts(r,rank)).sort((a,b)=>b.played_at.localeCompare(a.played_at)||b.id.localeCompare(a.id));
 const filters={myDeckId,opponentDeckId,result,turnOrder,deckIdField:useArchetype?'archetype':'deck'};
 const views=filterAnalysisPerspectives(analysisPerspectives(source,reversed?'combined':'direct'),filters);
 const payload=(await db.query(sql(2),[...args,rank])).rows[0].data;
 const parsed=parseAnalysisAggregates(payload,recentIds===null?undefined:recentIds);
 assert.deepEqual(buildAnalysisFromAggregates(parsed,decks,useArchetype?decks:[]),oracle(views,decks,useArchetype?decks:[]),'final model '+JSON.stringify({rank,args,who}));
 for(const recent of parsed.recent){const expected=views.filter(v=>(useArchetype?v.my_archetype_id??v.my_deck_id:v.my_deck_id)===recent.deckId).slice(0,10);assert.deepEqual(recent.views.map(v=>[v.id,v.source,v.result,v.turnOrder,v.order]),expected.map(v=>[v.id,v.source,v.result,v.turn_order,views.indexOf(v)+1]));}
 if(!rank||rank==='all'){assert.deepEqual(payload,(await db.query(sql(1),args)).rows[0].data,'entire JSON incl. arrays/order');evidence.allExact++;}
 evidence.comparisons++;return payload;
 }
 const args=(extra=[])=>[ENV,false,false,true,null,null,null,null,null,null,[A,B,C]].map((v,i)=>extra[i]===undefined?v:extra[i]);
 try{
 await db.exec(`create role anon nologin;create role authenticated nologin;create role service_role nologin bypassrls;create schema auth;
 create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
 grant usage on schema auth,public to anon,authenticated,service_role;
 create table public.admin_users(user_id uuid primary key);
 create function public.is_admin() returns boolean language sql volatile security definer set search_path='' as $$select exists(select 1 from public.admin_users where user_id=auth.uid())$$;
 create type public.match_result as enum('win','lose');create type public.turn_order as enum('first','second');
 create table public.matches(id uuid primary key,user_id uuid,environment_id uuid,my_deck_id uuid,opponent_deck_id uuid,my_archetype_id uuid,opponent_archetype_id uuid,result public.match_result not null,turn_order public.turn_order not null,played_at timestamptz not null);
 alter table public.matches enable row level security;create policy matches_select_own_or_admin on public.matches for select to authenticated using(auth.uid()=user_id or public.is_admin());
 grant select on public.matches to authenticated,service_role;
 create index matches_user_id_played_at_idx on public.matches(user_id,played_at desc);
 create index matches_archetype_idx on public.matches(user_id,my_archetype_id,opponent_archetype_id);
 create index matches_my_deck_id_idx on public.matches(my_deck_id);create index matches_opponent_deck_id_idx on public.matches(opponent_deck_id);
 alter default privileges in schema public grant execute on functions to anon,authenticated,service_role;`);
 await db.query('insert into public.admin_users values($1)',[ADMIN]);
 for(const file of ['supabase/migrations/015_match_rank_metadata.sql','supabase/migrations/012_matchup_aggregates_v1.sql','tests/fixtures/analysis-aggregates-v1.sql','supabase/migrations/014_period_report_aggregates_v1.sql'])await db.exec(fs.readFileSync(file,'utf8'));
 const before=await catalog();await db.exec(migration);assert.deepEqual(await catalog(),before);evidence.existingCatalogUnchanged=true;
 evidence.version=(await db.query('select version()')).rows[0].version;
 const meta=(await db.query(`select p.prosecdef,p.provolatile,p.proconfig,has_function_privilege('anon',p.oid,'execute') as anon,has_function_privilege('authenticated',p.oid,'execute') as authenticated,has_function_privilege('service_role',p.oid,'execute') as service_role,exists(select 1 from aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a where a.grantee=0 and a.privilege_type='EXECUTE') as public_execute from pg_proc p where p.oid=$1::regprocedure`,[signature])).rows[0];
 assert.equal(meta.prosecdef,false);assert.equal(meta.provolatile,'s');assert.equal(meta.anon,false);assert.equal(meta.public_execute,false);assert.equal(meta.authenticated,true);assert.equal(meta.service_role,true);assert.ok(meta.proconfig.includes('search_path=""'));evidence.permissions.push(meta);
 await seed(Array.from({length:31},()=>row()));for(const reversed of [false,true]){await compare(args([ENV,false,reversed]));await compare(args([ENV,false,reversed]),null);assert.equal((await compare(args([ENV,false,reversed]),'grandmaster:none')).registeredMatches,0);}
 const rich=ranks.flatMap(rank=>Array.from({length:12},(_,i)=>row({...rank,user_id:[OWNER,OTHER,ADMIN][i%3],my_deck_id:[A,B,C][i%3],opponent_deck_id:i%4?B:A,my_archetype_id:i%5===0?null:[A,B,C][i%3],opponent_archetype_id:i%4?B:A,result:i%2?'win':'lose',turn_order:i%2?'first':'second',environment_id:i%7?ENV:ENV2,played_at:i%2?'2026-09-20T00:00:00.123456Z':'2026-09-20T00:00:00.123457Z'})));
 await seed(rich);
 assert.deepEqual((await db.query("select public.get_analysis_aggregates_v2() as data")).rows[0].data,(await db.query("select public.get_analysis_aggregates_v1() as data")).rows[0].data,"omitted arguments keep SQL defaults");evidence.allExact++;
 const combinations=[[],[,,,false],[,,,,A],[,,,,,B],[,,,,,, 'win'],[,,,,,, 'lose'],[,,,,,,, 'first'],[,,,,,,, 'second'],[,,,,B,A,'lose','second'],[,,,,,,,, '2026-09-20T00:00:00.123456Z','2026-09-20T00:00:00.123456Z'],[null],[ENV2]];
 for(const id of [OWNER,ADMIN])for(const all of [false,true])for(const reversed of [false,true])for(const {value}of ANALYSIS_RANK_FILTERS)for(const extra of combinations){await identity(id);const a=args(extra);a[1]=all;a[2]=reversed;await compare(a,value);}
 // Explicit reverse-only and mirror cases; rank is never swapped to an opponent.
 await seed([row({rank_tier:'grandmaster',grandmaster_rating:'none'}),row({rank_tier:'master',master_group:'emerald',opponent_deck_id:A,opponent_archetype_id:A})]);
 assert.equal((await compare(args([ENV,false,true,true,B,A,'lose','second']),'grandmaster:none')).perspectives,1);
 assert.equal((await compare(args([ENV,false,true]),'master:emerald')).perspectives,2);
 for(const rank of ['unknown','none','master:none','grandmaster:emerald',''])await assert.rejects(()=>db.query(sql(2),[...args(),rank]),e=>e.code==='22023');
 await identity(null,'anon');await assert.rejects(()=>db.query(sql(2),[...args(),'all']),e=>e.code==='42501');
 for(const role of ['authenticated','service_role']){await identity(null,role);assert.equal((await db.query(sql(2),[...args([null,true,true]),'master-plus'])).rows[0].data.registeredMatches,0);}
 await seed([row({user_id:OWNER,rank_tier:'master',master_group:'ruby'}),row({user_id:OTHER,rank_tier:'master',master_group:'ruby'}),row({user_id:ADMIN,rank_tier:'master',master_group:'ruby'})]);
 await identity(OWNER);assert.equal((await compare(args([null,true,true]),'master-plus')).registeredMatches,1);
 await identity(ADMIN);assert.equal((await compare(args([null,true,true]),'master-plus')).registeredMatches,3);
 for(const [id,n]of [[OWNER,1],[ADMIN,3]]){await identity(id,'service_role');assert.equal((await compare(args([null,true,true]),'master-plus')).registeredMatches,n);}
 await db.exec('reset role;begin;delete from public.admin_users');await identity(ADMIN);assert.equal((await db.query(sql(2),[...args([null,true,true]),'master-plus'])).rows[0].data.registeredMatches,1);await db.exec('reset role;rollback');
 await db.exec('reset role;begin;drop policy matches_select_own_or_admin on public.matches;create policy only_own on public.matches for select to authenticated using(auth.uid()=user_id)');await identity(ADMIN);assert.equal((await db.query(sql(2),[...args([null,true,true]),'master-plus'])).rows[0].data.registeredMatches,1);await db.exec('reset role;rollback');
 for(const size of [10000,100000]){
 await seed(Array.from({length:size},(_,i)=>row({...ranks[i%17],my_deck_id:[A,B,C][i%3],my_archetype_id:[A,B,C][i%3],opponent_deck_id:[A,B,C][(i*7)%3],opponent_archetype_id:[A,B,C][(i*7)%3],result:i%3?'win':'lose',turn_order:i%2?'first':'second'})));
 for(const rank of ['all','master-plus','grandmaster:none']){const a=args([null,false,true]);await compare(a,rank);const times=[];let payload;for(let i=0;i<3;i++){const start=performance.now();payload=(await db.query(sql(2),[...a,rank])).rows[0].data;times.push(performance.now()-start);}
 let body=migration.slice(migration.indexOf('with source_matches'),migration.indexOf('\n  );\nend;'));argNames.forEach((name,i)=>{body=body.replaceAll(name,`$${i+1}::${[...argTypes,'text'][i]}`);});
 const plan=(await db.query('explain (analyze,buffers,format json) '+body,[...a,rank])).rows[0]['QUERY PLAN'];evidence.performance.push({size,rank,rpcMs:times,jsonBytes:Buffer.byteLength(JSON.stringify(payload)),plan});}
 }
 await db.exec('reset role');assert.deepEqual(await catalog(),before);
 }finally{await db.close();fs.mkdirSync('build',{recursive:true});fs.writeFileSync('build/analysis-rank-sql-evidence.json',JSON.stringify(evidence,null,2));}
 console.log(JSON.stringify({...evidence,performance:evidence.performance.map(item=>({...item,plan:"saved to evidence"}))}));
});
