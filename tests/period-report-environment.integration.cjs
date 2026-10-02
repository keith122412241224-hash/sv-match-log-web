/* eslint-disable @typescript-eslint/no-require-imports */
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const f=require('./period-report-environment-db.cjs');
const old=require('./fixtures/weekly-report-e430a56');
const report=require('../src/lib/weekly-report');
const {ANALYSIS_RANK_FILTERS}=require('../src/lib/analysis-rank-filter');
const {RANK_ATOMS}=require('../src/lib/rank-selection');
const {withPeriodReportEnvironment}=require('../src/lib/period-report-environment');
const period=old.buildWeeklyPeriod('2026-09-29','2026-10-02'),previous=old.getPreviousWeeklyReportPeriod(period);
const bounds=[period.startIso,period.endIso,previous.startIso,previous.endIso];
const evidence={engine:'PGlite isolated in-memory PostgreSQL; JWT claims simulated, no Auth/PostgREST service',comparisons:0,permissions:[],independent:[],performance:[]};
test('period environment RPC: independent full-model parity, source membership, boundaries, RLS, rollback and scale',{timeout:180000},async()=>{
 const db=await f.createDb();
 const rpc=async(env,rank='all',version=3,b=bounds)=>(await db.query(`select public.get_period_report_aggregates_v${version}($1,$2,$3,$4${version>=2?',$5':''}${version===3?',$6':''}) payload`,[...b,...(version>=2?[rank]:[]),...(version===3?[env]:[])])).rows[0].payload;
 const catalog=async()=>(await db.query(`select n.nspname,p.proname,pg_get_functiondef(p.oid) definition,p.proacl::text acl from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname in ('public','private') and p.proname<>'get_period_report_aggregates_v3' order by 1,2`)).rows;
 try{
  const before=await catalog();
  const rows=[];
  for(const environment_id of [f.NEW,f.OLD,null])for(const rank of f.ranks)for(const played_at of ['2026-09-29T01:00:00.000Z','2026-09-26T01:00:00.000Z'])for(let i=0;i<4;i++)rows.push(f.row({...rank,environment_id,played_at,user_id:i%2?f.MEMBER:f.OTHER,result:i%3?'win':'lose',opponent_archetype_id:i===0?f.decks[0].id:f.decks[1].id}));
  // Include exact boundaries and microseconds beyond the legacy .999 millisecond end.
  for(const stamp of bounds)for(const offset of [-1,0,1])rows.push(f.row({played_at:new Date(Date.parse(stamp)+offset).toISOString()}));
  rows.push(f.row({played_at:period.endIso.replace('.999Z','.999001Z')}));
  await f.seed(db,rows);
  async function compare(env,rank){
   // Independent raw source query with RLS; rank predicate is JavaScript, not copied SQL.
   const get=async(b)=>(await db.query('select * from public.matches where played_at >= $1 and played_at <= $2 order by played_at desc,id desc',b)).rows.filter(m=>(env===null||m.environment_id===env)&&f.accepts(m,rank));
   const current=await get(bounds.slice(0,2)),prev=await get(bounds.slice(2));
   const expected=old.buildWeeklyReport(current,prev,f.decks,period),payload=await rpc(env,rank);
   assert.deepEqual(report.buildWeeklyReportFromAggregates(payload,f.decks,period),expected,'all fields: '+env+' '+rank);
   if(env===null)assert.deepEqual(payload,await rpc(null,rank,2),'all environments preserves v2 byte-equivalent JSON');
   assert.equal(payload.current.totalMatches,current.length);assert.equal(payload.previous.totalMatches,prev.length);evidence.comparisons++;
  }
  for(const env of [null,f.NEW,f.OLD,f.EMPTY])for(const {value}of ANALYSIS_RANK_FILTERS)await compare(env,value);
  assert.deepEqual(await rpc(null),await rpc(null,'all',1));
  assert.deepEqual((await db.query('select public.get_period_report_aggregates_v3($1,$2,$3,$4) p',bounds)).rows[0].p,await rpc(null));
  await assert.rejects(()=>rpc(f.uuid(999)),e=>e.code==='22023');
  await assert.rejects(()=>rpc('bad'),e=>e.code==='22P02');
  await assert.rejects(()=>rpc(f.NEW,'invalid'),e=>e.code==='22023');
  // Both environments contain dates outside their input windows, and are intentionally counted.
  assert.ok((await rpc(f.NEW)).previous.totalMatches>0);
  assert.ok((await rpc(f.OLD)).current.totalMatches>0);
  await db.exec('reset role;create policy test_restrictive on public.matches as restrictive for select to authenticated using (result=\'win\')');
  await f.identity(db);await compare(f.NEW,'all');
  await db.exec('reset role;drop policy test_restrictive on public.matches');
  for(const [id,role,allowed]of [[f.ADMIN,'authenticated',true],[f.MEMBER,'authenticated',false],[null,'authenticated',false],[null,'anon',false],[f.ADMIN,'service_role',false]]){
   await f.identity(db,id,role);if(allowed)await rpc(f.NEW);else await assert.rejects(()=>rpc(f.NEW),e=>e.code==='42501');evidence.permissions.push({role,identity:id===f.ADMIN?'admin':id?'member':'none',allowed});
  }
  await f.seed(db,[f.row()]);
  const noPrevious=withPeriodReportEnvironment(report.buildWeeklyReportFromAggregates(await rpc(f.NEW),f.decks,period),f.environments[0]);
  assert.equal(noPrevious.aiJson.summary.matchDelta,null);assert.equal(noPrevious.previousTotalMatches,0);
  await f.seed(db,[]);assert.equal((await rpc(f.NEW)).current.totalMatches,0);

  // Compare actual RPCs separately and extract EACH actual SQL's source IDs independently.
  await f.identity(db);
  const initial=(await db.query('select public.get_environment_dashboard_aggregates_v3($1,\'7d\',$2::text[]) p',[f.NEW,RANK_ATOMS])).rows[0].p;
  const end=initial.current.end,start=initial.current.start;
  const exactEnd=(await db.query("select to_char($1::timestamptz - interval '1 microsecond','YYYY-MM-DD\"T\"HH24:MI:SS.USOF') x",[end])).rows[0].x;
  const previousEnd=(await db.query("select to_char($1::timestamptz - interval '1 microsecond','YYYY-MM-DD\"T\"HH24:MI:SS.USOF') x",[start])).rows[0].x;
  const comparative=[f.row({played_at:start}),f.row({played_at:exactEnd}),f.row({played_at:end}),f.row({played_at:exactEnd,environment_id:f.OLD}),f.row({played_at:start,rank_tier:'master',master_group:'sapphire'})];
  await f.seed(db,comparative);
  await db.exec('begin isolation level repeatable read');
  const environmental=(await db.query('select public.get_environment_dashboard_aggregates_v3($1,\'7d\',$2::text[]) p',[f.NEW,RANK_ATOMS])).rows[0].p;
  assert.equal(environmental.current.end,end,'same anchor during independent comparison');
  const alignedBounds=[start,exactEnd,environmental.previous.start,previousEnd];
  const periodResult=await rpc(f.NEW,'all',3,alignedBounds);
  const periodSource=f.sql.slice(f.sql.indexOf('with periods'),f.sql.indexOf('), grouped as'))+') select id from ordered where label=\'current\' order by id';
  let aSql=periodSource.replace('select p.label,','select m.id, p.label,');
  for(const [i,name] of ['p_current_start','p_current_end','p_previous_start','p_previous_end','p_rank_filter','p_environment_id'].entries())aSql=aSql.replaceAll(name,'$'+(i+1)+'::'+(i<4?'timestamptz':i===4?'text':'uuid'));
  let bSql=f.environmentSql.slice(f.environmentSql.indexOf('with periods'),f.environmentSql.indexOf('), totals as'))+') select id from source where label=\'current\' order by id';
  bSql=bSql.replace('select p.label,','select m.id, p.label,').replaceAll('data_through','$1::timestamptz').replaceAll('duration',"interval '168 hours'").replaceAll('p_environment_id','$2::uuid').replaceAll('p_rank_filters','$3::text[]');
  const idsA=(await db.query(aSql,[...alignedBounds,'all',f.NEW])).rows.map(r=>r.id);
  const idsB=(await db.query(bSql,[end,f.NEW,RANK_ATOMS])).rows.map(r=>r.id);
  assert.deepEqual(idsA,idsB);assert.equal(periodResult.current.totalMatches,idsA.length);assert.equal(environmental.current.total.totalMatches,idsB.length);
  assert.equal(idsA.length,3);
  const inclusive=await rpc(f.NEW,'all',3,[start,end,...alignedBounds.slice(2)]);
  assert.equal(inclusive.current.totalMatches,4,'unmatched inclusive cutoff legitimately includes one extra record');
  evidence.independent.push({sameSnapshot:true,environment:3,periodAligned:3,aOnly:0,bOnly:0,periodIncludingEnd:4,source:'each installed migration source extracted separately, no intersection used',exclusiveEndConversion:'period inclusive end = environment exclusive end minus 1 microsecond'});
  await db.exec('commit');
  await f.seed(db,Array.from({length:1200},(_,i)=>f.row({environment_id:i%2?f.NEW:f.OLD})));
  const began=performance.now(),large=await rpc(f.NEW);assert.equal(large.current.totalMatches,600);
  assert.equal((await rpc(null)).current.totalMatches,1200);evidence.performance.push({rows:1200,selected:600,ms:performance.now()-began,noRowLimit:true});
  await db.exec('reset role');assert.deepEqual(await catalog(),before,'other RPC definitions/ACLs unchanged');
  const acl=(await db.query("select prosecdef,provolatile,has_function_privilege('anon',p.oid,'EXECUTE') anon,has_function_privilege('service_role',p.oid,'EXECUTE') service from pg_proc p where proname='get_period_report_aggregates_v3'")).rows[0];
  assert.deepEqual(acl,{prosecdef:false,provolatile:'s',anon:false,service:false});
  await db.exec('drop function public.get_period_report_aggregates_v3(timestamptz,timestamptz,timestamptz,timestamptz,text,uuid)');
  await f.identity(db);assert.equal((await rpc(null,'all',1)).current.totalMatches,1200);assert.equal((await rpc(null,'all',2)).current.totalMatches,1200);
  evidence.rollback=true;evidence.passed=true;
  fs.mkdirSync('build/period-environment',{recursive:true});fs.writeFileSync('build/period-environment/sql-result.json',JSON.stringify(evidence,null,2));
  console.log(JSON.stringify(evidence));
 }finally{await db.close();}
});
