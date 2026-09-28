/* eslint-disable @typescript-eslint/no-require-imports */
// Local synthetic PostgreSQL only. Frozen pre-RPC TypeScript is the independent oracle.
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),{performance}=require('node:perf_hooks');
const {PGlite}=require(process.env.PGLITE_MODULE||'@electric-sql/pglite');
const old=require('./fixtures/weekly-report-e430a56'),current=require('../src/lib/weekly-report');
const {parsePeriodReportAggregates}=require('../src/lib/period-report-aggregates');
const {withPeriodReportRank}=require('../src/lib/period-report-rank');
const {ANALYSIS_RANK_FILTERS}=require('../src/lib/analysis-rank-filter');
const sql1=fs.readFileSync('supabase/migrations/014_period_report_aggregates_v1.sql','utf8').replaceAll('\r\n','\n'),sql2=fs.readFileSync('supabase/migrations/018_period_report_rank_aggregates_v2.sql','utf8').replaceAll('\r\n','\n');
const uuid=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const ADMIN=uuid(1),MEMBER=uuid(2),OTHER=uuid(3),A=uuid(101),B=uuid(102),C=uuid(103),INACTIVE=uuid(900),UNKNOWN=uuid(901);
const decks=Array.from({length:32},(_,i)=>({id:uuid(101+i),name:i<2?'同名':`Deck${i}`,class_name:'エルフ',is_active:true}));
const ranks=[{},...['beginner','d','c','b','a','aa'].map(rank_tier=>({rank_tier})),...['emerald','topaz','ruby','sapphire','diamond'].map(master_group=>({rank_tier:'master',master_group})),...['none','epic','ultimate','legend','beyond'].map(grandmaster_rating=>({rank_tier:'grandmaster',grandmaster_rating}))];
const filters=[undefined,null,...ANALYSIS_RANK_FILTERS.map(x=>x.value)];
const accepts=(m,f)=>{if(f==null||f==='all')return true;if(f==='master-plus')return ['master','grandmaster'].includes(m.rank_tier);const [tier,child]=f.split(':');return m.rank_tier===tier&&(!child||(tier==='master'?m.master_group:m.grandmaster_rating)===child);};
let serial=1000;
const row=(extra={})=>({id:uuid(++serial),user_id:MEMBER,environment_id:null,my_deck_id:A,opponent_deck_id:B,my_archetype_id:null,opponent_archetype_id:null,result:'win',turn_order:'first',played_at:'2026-09-05T00:00:00Z',rank_tier:null,master_group:null,grandmaster_rating:null,...extra});
const evidence={engine:'PGlite synthetic local PostgreSQL, not Production or HTTP',comparisons:0,allExact:0,cases:[],performance:[],permissions:[]};
test('R4 SQL: full old report parity, rank populations, dates, rights and scale',{timeout:600000},async()=>{
 const db=await PGlite.create();const p=old.buildWeeklyPeriod('2026-09-05','2026-09-05');
 const signature='public.get_period_report_aggregates_v2(timestamptz,timestamptz,timestamptz,timestamptz,text)';
 async function identity(id=ADMIN,role='authenticated'){await db.exec('reset role');await db.query("select set_config('request.jwt.claim.sub',$1,false)",[id||'']);assert.ok(['authenticated','service_role','anon'].includes(role));await db.exec('set role '+role);}
 async function seed(rows){await db.exec('reset role;truncate public.matches');await db.query('insert into public.matches select * from jsonb_populate_recordset(null::public.matches,$1::jsonb)',[JSON.stringify(rows)]);await db.exec('analyze public.matches');await identity();}
 const argsFor=period=>{const previous=old.getPreviousWeeklyReportPeriod(period);return[period.startIso,period.endIso,previous.startIso,previous.endIso];};
 const rpc=async(period,rank,version=2)=>{const args=argsFor(period);const add=version===2&&rank!==undefined;return(await db.query(`select public.get_period_report_aggregates_v${version}($1::timestamptz,$2::timestamptz,$3::timestamptz,$4::timestamptz${add?',$5::text':''}) as data`,add?[...args,rank]:args)).rows[0].data;};
 async function catalog(){return(await db.query(`select 'function' kind,proname name,concat(pg_get_functiondef(p.oid),proacl,proconfig) value from pg_proc p join pg_namespace n on p.pronamespace=n.oid where n.nspname='public' and proname<>'get_period_report_aggregates_v2'
 union all select 'column',column_name,concat(data_type,is_nullable,column_default) from information_schema.columns where table_schema='public' and table_name='matches'
 union all select 'index',indexname,indexdef from pg_indexes where schemaname='public'
 union all select 'policy',policyname,concat(roles,cmd,qual,with_check) from pg_policies where schemaname='public'
 union all select 'constraint',conname,pg_get_constraintdef(oid) from pg_constraint where conrelid='public.matches'::regclass order by kind,name`)).rows;}
 async function compare(name,rank,period=p,measure=false){
  const args=argsFor(period),select='select * from public.matches where played_at >= $1::timestamptz and played_at <= $2::timestamptz order by played_at desc,id desc';
  // Date membership and microsecond order come from PostgreSQL, rank selection is independent JavaScript.
  const rows=(await db.query(select,args.slice(0,2))).rows.filter(m=>accepts(m,rank)),prev=(await db.query(select,args.slice(2))).rows.filter(m=>accepts(m,rank));
  const expected=old.buildWeeklyReport(rows,prev,decks,period),times=[];let payload;
  for(let i=0;i<(measure?3:1);i++){const start=performance.now();payload=parsePeriodReportAggregates(await rpc(period,rank));times.push(performance.now()-start);}
  const actual=current.buildWeeklyReportFromAggregates(payload,decks,period);assert.deepEqual(actual,expected,name+' '+rank+' full model / Tier / Strength / warnings / ordering / AI / PNG data');
  assert.equal(payload.current.totalMatches,rows.length);assert.equal(payload.previous.totalMatches,prev.length);
  const labeled=withPeriodReportRank(actual,rank);if(rank==null||rank==='all'){assert.deepEqual(await rpc(period,rank),await rpc(period,undefined,1),'full v1/v2 JSON including order');assert.equal(labeled,actual);evidence.allExact++;}
  else{const option=ANALYSIS_RANK_FILTERS.find(x=>x.value===rank);assert.equal(labeled.aiJson.rankFilter.value,rank);assert.equal(labeled.aiJson.rankFilter.label,option.label);const {rankFilter,...json}=labeled.aiJson;assert.deepEqual(json,expected.aiJson);assert.equal(labeled.aiPrompt,old.buildWeeklyReportPrompt(labeled.aiJson));assert.ok(rankFilter.description.includes('原本戦績'));assert.deepEqual({...labeled,aiJson:expected.aiJson,aiPrompt:expected.aiPrompt},expected);}
  evidence.comparisons++;evidence.cases.push({name,rank:rank===undefined?'omitted':rank,current:rows.length,previous:prev.length,fullModelEqual:true});
  if(measure){const sql=rank==null||rank==='all'?sql1:sql2;let inner=sql.slice(sql.indexOf('with periods'),sql.indexOf('\n  into report_payload;'));const names=['p_current_start','p_current_end','p_previous_start','p_previous_end','p_rank_filter'];names.forEach((n,i)=>{inner=inner.replaceAll(n,'$'+(i+1)+'::'+(i===4?'text':'timestamptz'));});
   const plan=(await db.query('explain (analyze,buffers,format json) '+inner,rank==null||rank==='all'?args:[...args,rank])).rows[0]['QUERY PLAN'];evidence.performance.push({name,rank,rpcMs:times,jsonBytes:Buffer.byteLength(JSON.stringify(payload)),current:rows.length,previous:prev.length,plan});
  }
 }
 async function all(name,period=p){for(const rank of filters)await compare(name,rank,period);}
 try{
  await db.exec(`create role anon nologin;create role authenticated nologin;create role service_role nologin bypassrls;create schema auth;
   create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
   grant usage on schema auth,public to anon,authenticated,service_role;create table public.admin_users(user_id uuid primary key);
   create function public.is_admin() returns boolean language sql volatile security definer set search_path='' as $$select exists(select 1 from public.admin_users where user_id=auth.uid())$$;
   create type public.match_result as enum('win','lose');create type public.turn_order as enum('first','second');
   create table public.matches(id uuid primary key,user_id uuid,environment_id uuid,my_deck_id uuid,opponent_deck_id uuid,my_archetype_id uuid,opponent_archetype_id uuid,result public.match_result not null,turn_order public.turn_order,played_at timestamptz not null);
   alter table public.matches enable row level security;create policy matches_select_own_or_admin on public.matches for select to authenticated using(auth.uid()=user_id or public.is_admin());grant select on public.matches to authenticated,service_role;
   create index matches_user_id_played_at_idx on public.matches(user_id,played_at desc);create index matches_archetype_idx on public.matches(user_id,my_archetype_id,opponent_archetype_id);create index matches_my_deck_id_idx on public.matches(my_deck_id);create index matches_opponent_deck_id_idx on public.matches(opponent_deck_id);
   alter default privileges in schema public grant execute on functions to anon,authenticated,service_role;`);
  await db.query('insert into public.admin_users values($1)',[ADMIN]);
  for(const f of ['supabase/migrations/012_matchup_aggregates_v1.sql','tests/fixtures/analysis-aggregates-v1.sql','supabase/migrations/014_period_report_aggregates_v1.sql','supabase/migrations/015_match_rank_metadata.sql','supabase/migrations/016_analysis_rank_aggregates_v2.sql','supabase/migrations/017_matchup_rank_aggregates_v2.sql'])await db.exec(fs.readFileSync(f,'utf8'));
  const before=await catalog();await db.exec(sql2);assert.deepEqual(await catalog(),before);evidence.existingCatalogUnchanged=true;evidence.postgres=(await db.query('select version()')).rows[0].version;
  const meta=(await db.query(`select prosecdef,provolatile,proconfig,has_function_privilege('anon',oid,'execute') anon,has_function_privilege('authenticated',oid,'execute') authenticated,has_function_privilege('service_role',oid,'execute') service_role,exists(select 1 from aclexplode(coalesce(proacl,acldefault('f',proowner))) a where a.grantee=0 and a.privilege_type='EXECUTE') public_execute from pg_proc where oid=$1::regprocedure`,[signature])).rows[0];
  assert.deepEqual(meta,{prosecdef:false,provolatile:'s',proconfig:['search_path=""'],anon:false,authenticated:true,service_role:true,public_execute:false});evidence.metadata=meta;
  await seed(ranks.flatMap(r=>[row(r),row({...r,user_id:OTHER,played_at:'2026-09-04T00:00:00Z'})]));
  for(const [id,role,allowed]of [[ADMIN,'authenticated',true],[MEMBER,'authenticated',false],[null,'authenticated',false],[ADMIN,'anon',false],[null,'service_role',false],[MEMBER,'service_role',false],[ADMIN,'service_role',true]]){
   await identity(id,role);for(const rank of ['all','master-plus','grandmaster:none'])if(allowed)await compare('identity-'+role,rank);else await assert.rejects(()=>rpc(p,rank),e=>e.code==='42501');evidence.permissions.push({identity:id===ADMIN?'admin':id?'member':'none',role,allowed});
  }
  await identity();for(const rank of ['','aa','none','master:bad','__invalid__'])await assert.rejects(()=>rpc(p,rank),e=>e.code==='22023');
  for(const args of [[null,...argsFor(p).slice(1)],[argsFor(p)[1],argsFor(p)[0],...argsFor(p).slice(2)]])await assert.rejects(()=>db.query('select public.get_period_report_aggregates_v2($1,$2,$3,$4,$5)',[...args,'master']),e=>e.code==='22023');
  await db.exec('reset role');await db.query('delete from public.admin_users where user_id=$1',[ADMIN]);await identity();await assert.rejects(()=>rpc(p,'master'),e=>e.code==='42501');await db.exec('reset role');await db.query('insert into public.admin_users values($1)',[ADMIN]);
  await seed([]);await all('zero');
  const scenarios={null_only:[{}],all_ranks:[{}],direct_win:[{result:'win'}],direct_loss:[{result:'lose'}],reversed_only:[{my_deck_id:B,opponent_deck_id:A,result:'lose'}],mirror_only:[{my_deck_id:A,opponent_deck_id:A}],mirror_normal:[{my_deck_id:A,opponent_deck_id:A},{}],standard:[{my_deck_id:UNKNOWN,my_archetype_id:A,opponent_archetype_id:B}],legacy:[{}],inactive:[{opponent_deck_id:INACTIVE}],unknown:[{my_deck_id:UNKNOWN}],same_name:[{my_deck_id:A,opponent_deck_id:B}],both_directions:[{}, {my_deck_id:B,opponent_deck_id:A}],ties:[{played_at:'2026-09-05T00:00:00.123456Z'},{played_at:'2026-09-05T00:00:00.123456Z',result:'lose'}]};
  for(const [name,variants]of Object.entries(scenarios)){
   const ranked=name==='null_only'?[{}]:ranks;
   for(const periodMode of ['both','current_only','previous_only']){
    const rows=[];for(const rank of ranked)for(const extra of variants)for(const previous of periodMode==='both'?[false,true]:[periodMode==='previous_only'])rows.push(row({...extra,...rank,played_at:previous?'2026-09-04T00:00:00.123456Z':extra.played_at||'2026-09-05T00:00:00.123456Z',user_id:previous?OTHER:MEMBER}));
    await seed(rows);await all(name+'-'+periodMode);
   }
  }
  for(const [start,end]of [['2026-09-05','2026-09-05'],['2026-08-31','2026-09-01'],['2026-09-01','2026-09-07'],['2026-08-28','2026-09-12']]){
   const period=old.buildWeeklyPeriod(start,end),args=argsFor(period),dates=[];
   for(let i=0;i<4;i++){const t=new Date(args[i]).getTime();dates.push(new Date(t-1).toISOString(),args[i],new Date(t+1).toISOString());if(i%2===1)dates.push(args[i].replace('.999Z','.999001Z'));}
   await seed(ranks.flatMap(r=>dates.map(played_at=>row({...r,played_at}))));await all('JST-boundaries-'+start+'-'+end,period);
  }
  // Different ranks in current/previous ensure one filter is applied to both, never only current.
  await seed(ranks.flatMap((r,i)=>[row({...r,result:i%2?'win':'lose'}),row({...ranks[(i+5)%ranks.length],played_at:'2026-09-04T00:00:00Z',result:i%3?'win':'lose',my_deck_id:B,opponent_deck_id:A})]));await all('different-period-rank-populations');
  // Keep actual PostgreSQL RLS effective even for an application admin.
  await db.exec('reset role;create policy stricter on public.matches as restrictive for select to authenticated using(result=\'win\')');await identity();await all('restrictive-RLS');await db.exec('reset role;drop policy stricter on public.matches');
  for(const n of [10000,100000]){
   const rows=[];for(let i=0;i<n;i++)for(const previous of [false,true])rows.push(row({...ranks[i%17],user_id:i%2?MEMBER:OTHER,my_deck_id:uuid(101+i%32),opponent_deck_id:uuid(101+(i*7+Math.floor(i/32))%32),my_archetype_id:i%11===0?C:null,result:i%3?'win':'lose',played_at:previous?'2026-09-04T00:00:00.123456Z':'2026-09-05T00:00:00.123456Z'}));
   await seed(rows);for(const rank of ['all','master-plus','master','grandmaster','master:sapphire','grandmaster:none'])await compare('scale-'+n+'+'+n,rank,p,true);
  }
  await db.exec('reset role');assert.deepEqual(await catalog(),before);fs.mkdirSync('build/period-rank-sql-proof',{recursive:true});fs.writeFileSync('build/period-rank-sql-proof/result.json',JSON.stringify(evidence,null,2));console.log(JSON.stringify({comparisons:evidence.comparisons,allExact:evidence.allExact,performanceCases:evidence.performance.length,passed:true}));
 }finally{await db.close();}
});
