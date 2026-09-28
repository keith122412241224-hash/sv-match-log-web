/* eslint-disable @typescript-eslint/no-require-imports */
// Synthetic local PostgreSQL only. Independent row filter + old matrix oracle.
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const {performance}=require('node:perf_hooks');const {PGlite}=require(process.env.PGLITE_MODULE||'@electric-sql/pglite');
const {buildWinRateMatrix}=require('../src/lib/analytics');
const {parseMatchupAggregates,buildWinRateMatrixFromAggregates}=require('../src/lib/matchup-aggregates');
const {ANALYSIS_RANK_FILTERS}=require('../src/lib/analysis-rank-filter');
const uuid=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const OWNER=uuid(1),OTHER=uuid(2),ADMIN=uuid(3),ENV=uuid(10),ENV2=uuid(11),A=uuid(100),B=uuid(101),C=uuid(102),INACTIVE=uuid(103),UNKNOWN=uuid(104),LA=uuid(200),LB=uuid(201);
const deck=id=>({id,name:[A,B].includes(id)?'同名':id,class_name:'エルフ'}),active=[B,A,C].map(deck),legacy=[LB,LA].map(deck);
const ranks=[{},...['beginner','d','c','b','a','aa'].map(rank_tier=>({rank_tier})),...['emerald','topaz','ruby','sapphire','diamond'].map(master_group=>({rank_tier:'master',master_group})),...['none','epic','ultimate','legend','beyond'].map(grandmaster_rating=>({rank_tier:'grandmaster',grandmaster_rating}))];
const accepts=(r,f)=>{if(f==null||f==='all')return true;if(f==='master-plus')return r.rank_tier==='master'||r.rank_tier==='grandmaster';const [tier,child]=f.split(':');return r.rank_tier===tier&&(!child||(tier==='master'?r.master_group:r.grandmaster_rating)===child);};
const evidence={engine:'PGlite local synthetic PostgreSQL; not Production/HTTP',comparisons:0,allExact:0,performance:[],cases:[]};
test('R3-B SQL: full JSON/matrix parity, rank source population, identities/IDs, privileges and scale',{timeout:600000},async()=>{
 const db=await PGlite.create();let rows=[],serial=1000,who=OWNER;
 const row=(extra={})=>({id:uuid(++serial),user_id:OWNER,environment_id:ENV,my_deck_id:LA,opponent_deck_id:LB,my_archetype_id:A,opponent_archetype_id:B,result:'win',turn_order:'first',played_at:'2026-09-20T00:00:00Z',rank_tier:null,master_group:null,grandmaster_rating:null,...extra});
 async function identity(id=OWNER,role='authenticated'){await db.exec('reset role');await db.query("select set_config('request.jwt.claim.sub',$1,false)",[id||'']);assert.ok(['authenticated','anon','service_role'].includes(role));await db.exec('set role '+role);who=id;}
 async function seed(data){rows=data;await db.exec('reset role;truncate public.matches');await db.query('insert into public.matches select * from jsonb_populate_recordset(null::public.matches,$1::jsonb)',[JSON.stringify(rows)]);await db.exec('analyze public.matches');await identity();}
 const rpc=async(rank='all',all=false,env=ENV,v=2)=>(await db.query(`select public.get_matchup_aggregates_v${v}($1::uuid,$2::boolean${v===2?',$3::text':''}) as data`,v===2?[env,all,rank]:[env,all])).rows[0].data;
 async function catalog(){return(await db.query(`select 'function' kind,proname name,concat(pg_get_functiondef(p.oid),proacl::text,proconfig::text) value from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and proname<>'get_matchup_aggregates_v2'
 union all select 'column',column_name,concat(data_type,is_nullable,column_default) from information_schema.columns where table_schema='public' and table_name='matches'
 union all select 'index',indexname,indexdef from pg_indexes where schemaname='public'
 union all select 'policy',policyname,concat(roles,cmd,qual,with_check) from pg_policies where schemaname='public'
 union all select 'constraint',conname,pg_get_constraintdef(oid) from pg_constraint where conrelid='public.matches'::regclass order by kind,name`)).rows;}
 async function compare(rank='all',all=false,env=ENV){
  const source=rows.filter(r=>who&&(r.user_id===who||(all&&who===ADMIN))&&(!env||r.environment_id===env)&&accepts(r,rank));
  const value=parseMatchupAggregates(await rpc(rank,all,env));assert.equal(value.totalMatches,source.length);assert.equal(value.totalMatches,value.groups.reduce((n,g)=>n+g.total,0));
  const expected=new Map();for(const r of source){const myDeckId=r.my_archetype_id??r.my_deck_id,opponentDeckId=r.opponent_archetype_id??r.opponent_deck_id,key=JSON.stringify([myDeckId,opponentDeckId]);const g=expected.get(key)||{myDeckId,opponentDeckId,total:0,wins:0};g.total++;g.wins+=r.result==='win'?1:0;expected.set(key,g);}
  const sort=gs=>[...gs].sort((a,b)=>JSON.stringify([a.myDeckId,a.opponentDeckId]).localeCompare(JSON.stringify([b.myDeckId,b.opponentDeckId])));assert.deepEqual(sort(value.groups),sort(expected.values()));
  for(const visible of [active,legacy,[...active,deck(INACTIVE),deck(UNKNOWN),...legacy],[]])assert.deepEqual(buildWinRateMatrixFromAggregates(value,visible,visible),buildWinRateMatrix(source,visible,visible),'full cells, order, win rates, bands and index');
  if(rank==null||rank==='all'){const v1=await rpc(rank,all,env,1);assert.deepEqual(value,v1,'entire JSON including group array order');for(const visible of [active,legacy,[]])assert.deepEqual(buildWinRateMatrixFromAggregates(value,visible,visible),buildWinRateMatrixFromAggregates(v1,visible,visible));evidence.allExact++;}
  evidence.comparisons++;return value;
 }
 try{
 await db.exec(`create role anon nologin;create role authenticated nologin;create role service_role nologin bypassrls;create schema auth;
 create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
 grant usage on schema auth,public to anon,authenticated,service_role;
 create table public.admin_users(user_id uuid primary key);
 create function public.is_admin() returns boolean language sql security definer set search_path='' as $$select exists(select 1 from public.admin_users where user_id=auth.uid())$$;
 create type public.match_result as enum('win','lose');create type public.turn_order as enum('first','second');
 create table public.matches(id uuid primary key,user_id uuid,environment_id uuid,my_deck_id uuid,opponent_deck_id uuid,my_archetype_id uuid,opponent_archetype_id uuid,result public.match_result not null,turn_order public.turn_order not null,played_at timestamptz not null);
 alter table public.matches enable row level security;create policy matches_select_own_or_admin on public.matches for select to authenticated using(auth.uid()=user_id or public.is_admin());grant select on public.matches to authenticated,service_role;
 create index matches_user_id_played_at_idx on public.matches(user_id,played_at desc);
 create index matches_archetype_idx on public.matches(user_id,my_archetype_id,opponent_archetype_id);
 create index matches_my_deck_id_idx on public.matches(my_deck_id);create index matches_opponent_deck_id_idx on public.matches(opponent_deck_id);
 alter default privileges in schema public grant execute on functions to anon,authenticated,service_role;`);
 await db.query('insert into public.admin_users values($1)',[ADMIN]);
 for(const file of ['015_match_rank_metadata.sql','012_matchup_aggregates_v1.sql','014_period_report_aggregates_v1.sql','016_analysis_rank_aggregates_v2.sql'])await db.exec(fs.readFileSync('supabase/legacy-migrations/pre-baseline/'+file,'utf8'));
 // Match the audited Production ACL (012 alone predates its service_role grant).
 await db.exec(fs.readFileSync('tests/fixtures/analysis-aggregates-v1.sql','utf8'));
 await db.exec('grant execute on function public.get_matchup_aggregates_v1(uuid,boolean) to service_role');
 const before=await catalog(),migration=fs.readFileSync('supabase/legacy-migrations/pre-baseline/017_matchup_rank_aggregates_v2.sql','utf8');await db.exec(migration);await db.exec(migration);assert.deepEqual(await catalog(),before);evidence.existingCatalogUnchanged=true;evidence.serverVersion=(await db.query('select version()')).rows[0].version;
 for(const [name,records]of [['empty',[]],['old-null',[row(),row({user_id:OTHER}),row({user_id:ADMIN})]]]){await seed(records);for(const user of [OWNER,ADMIN])for(const all of [false,true])for(const {value}of ANALYSIS_RANK_FILTERS){await identity(user);await compare(value,all);}evidence.cases.push(name);}
 const variants=[{}, {my_archetype_id:B,opponent_archetype_id:A,result:'lose'},{opponent_archetype_id:A},{my_archetype_id:null},{my_archetype_id:null,opponent_archetype_id:null},{my_archetype_id:INACTIVE},{my_archetype_id:UNKNOWN},{my_archetype_id:C},{opponent_archetype_id:UNKNOWN},{my_archetype_id:null,opponent_archetype_id:null,my_deck_id:null,opponent_deck_id:null}];
 await seed(ranks.flatMap(rank=>variants.flatMap(variant=>[OWNER,OTHER,ADMIN].map(user_id=>row({...rank,...variant,user_id}))).concat(row({...rank,environment_id:ENV2}))));
 for(const user of [OWNER,OTHER,ADMIN])for(const all of [false,true])for(const env of [ENV,ENV2,null,uuid(999)])for(const {value}of ANALYSIS_RANK_FILTERS){await identity(user);await compare(value,all,env);}
 for(const user of [OWNER,ADMIN])for(const all of [false,true]){await identity(user);await compare(null,all);assert.deepEqual((await db.query('select public.get_matchup_aggregates_v2($1,$2) as data',[ENV,all])).rows[0].data,await rpc('all',all));evidence.allExact++;}
 evidence.cases.push('17 rank combinations x directions/mirror/standard/legacy/inactive/unknown/null defensive x scopes/environments');
 await identity(ADMIN);assert.equal((await rpc('grandmaster:none',true)).totalMatches,30);assert.equal((await rpc('master:sapphire',true)).totalMatches,30);assert.equal((await rpc('master-plus',true)).totalMatches,300);
 for(const bad of ['', 'none','unknown','master:none','grandmaster:sapphire','ALL'])await assert.rejects(()=>rpc(bad),e=>e.code==='22023');
 await identity(null,'anon');await assert.rejects(()=>rpc('all',true),e=>e.code==='42501');
 for(const role of ['authenticated','service_role'])for(const user of [null,OWNER,ADMIN]){await identity(user,role);await compare('all',true);await compare('master-plus',true);}
 await db.exec('reset role');evidence.permissions=(await db.query(`select prosecdef,provolatile,proconfig,proargnames,has_function_privilege('anon',oid,'execute') anon_execute,has_function_privilege('authenticated',oid,'execute') authenticated_execute,has_function_privilege('service_role',oid,'execute') service_role_execute,exists(select 1 from aclexplode(proacl) where grantee=0 and privilege_type='EXECUTE') public_execute from pg_proc where oid='public.get_matchup_aggregates_v2(uuid,boolean,text)'::regprocedure`)).rows[0];assert.deepEqual(evidence.permissions,{prosecdef:false,provolatile:'s',proconfig:['search_path=""'],proargnames:['p_environment_id','p_include_all_users','p_rank_filter'],anon_execute:false,authenticated_execute:true,service_role_execute:true,public_execute:false});
 await db.exec('begin;drop policy matches_select_own_or_admin on public.matches;create policy test_own on public.matches for select to authenticated using(auth.uid()=user_id)');await identity(ADMIN);assert.equal((await rpc('master-plus',true)).totalMatches,100);await db.exec('reset role;rollback');
 await db.exec('begin');await db.query('delete from public.admin_users where user_id=$1',[ADMIN]);await identity(ADMIN);assert.equal((await rpc('master-plus',true)).totalMatches,100);await db.exec('reset role;rollback');
 await seed(Array.from({length:1600},(_,i)=>row({rank_tier:'master',master_group:'sapphire',my_archetype_id:uuid(300+Math.floor(i/40)),opponent_archetype_id:uuid(300+i%40)})));assert.equal((await compare('master')).groups.length,1600);await compare('all');
 for(const size of [10000,100000]){await seed(Array.from({length:size},(_,i)=>row({...ranks[i%17],user_id:i%3?OWNER:OTHER,my_archetype_id:i%2?A:B,opponent_archetype_id:i%3?B:A,result:i%3?'win':'lose'})));
  for(const user of [OWNER,ADMIN])for(const rank of ['all','master-plus','grandmaster:none']){await identity(user);const value=await compare(rank,user===ADMIN);const times=[];for(let i=0;i<3;i++){const t=performance.now();await rpc(rank,user===ADMIN);times.push(performance.now()-t);}const source=rows.filter(r=>(user===ADMIN||r.user_id===user)&&accepts(r,rank));
  let sql=rank==='all'?fs.readFileSync('supabase/legacy-migrations/pre-baseline/012_matchup_aggregates_v1.sql','utf8').split('as $$')[1].split('$$;')[0]:migration.slice(migration.indexOf('with grouped'),migration.indexOf('\n  );'));sql=sql.replaceAll('p_environment_id','$1::uuid').replaceAll('p_include_all_users','$2::boolean').replaceAll('p_rank_filter','$3::text');const plan=(await db.query('explain(analyze,buffers,format json) '+sql,rank==='all'?[ENV,user===ADMIN]:[ENV,user===ADMIN,rank])).rows[0]['QUERY PLAN'];evidence.performance.push({size,scope:user===ADMIN?'all':'mine',rank,rows:value.totalMatches,groups:value.groups.length,rpcWallMs:times,rawBytes:Buffer.byteLength(JSON.stringify(source)),rpcBytes:Buffer.byteLength(JSON.stringify(value)),plan});}
 }
 assert.deepEqual(await catalog(),before);evidence.passed=true;
 }finally{await db.close();fs.mkdirSync('build',{recursive:true});fs.writeFileSync('build/matchup-rank-sql.json',JSON.stringify(evidence,null,2));}
 console.log(JSON.stringify({comparisons:evidence.comparisons,allExact:evidence.allExact,passed:evidence.passed}));
});
