/* eslint-disable @typescript-eslint/no-require-imports */
// Real Auth + PostgREST, exclusively the dedicated 59321/59322 loopback stack.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),cp=require('node:child_process'),crypto=require('node:crypto');
const network=global.fetch;require('./register.cjs');global.fetch=network;
const {Client}=require('../build/migration-step3-local/tools/node_modules/pg');
process.env.PGLITE_MODULE=path.resolve('build/migration-step2-baseline/tools/node_modules/@electric-sql/pglite');
const f=require('./period-report-environment-db.cjs'),old=require('./fixtures/weekly-report-e430a56'),current=require('../src/lib/weekly-report');
const {ANALYSIS_RANK_FILTERS}=require('../src/lib/analysis-rank-filter'),{RANK_ATOMS}=require('../src/lib/rank-selection');
const root=path.resolve(__dirname,'..'),out=path.join(root,'build/period-real'),stack=path.join(out,'stack');
const cli=path.join(root,'build/migration-step3-local/tools/cli/supabase.exe');
const cliEnv={...process.env,SUPABASE_HOME:path.join(root,'build/period-environment/cli-home'),SUPABASE_TELEMETRY_DISABLED:'1'};
const runCli=args=>cp.execFileSync(cli,[...args,'--workdir',stack],{env:cliEnv,encoding:'utf8',stdio:['ignore','pipe','pipe'],windowsHide:true});
const save=(name,data)=>fs.writeFileSync(path.join(out,name+'.json'),JSON.stringify(data,null,2));
const period=old.buildWeeklyPeriod('2026-09-29','2026-10-02'),previous=old.getPreviousWeeklyReportPeriod(period);
const bounds=[period.startIso,period.endIso,previous.startIso,previous.endIso];
const report={realAuth:true,realPostgREST:true,api:[],comparisons:0,performance:[],errors:[]};
const migration='20261002111149_period_report_environment_filter.sql';
async function main(){
 assert.match(fs.readFileSync(path.join(stack,'supabase/config.toml'),'utf8'),/project_id = "sv-match-log-period-real-20261002"/);
 assert.ok(!fs.existsSync(path.join(stack,'supabase/.temp/project-ref')));
 const keys=JSON.parse(runCli(['status','-o','json']));
 assert.equal(keys.API_URL,'http://127.0.0.1:59321');assert.equal(new URL(keys.DB_URL).hostname,'127.0.0.1');assert.equal(new URL(keys.DB_URL).port,'59322');
 const db=new Client({connectionString:keys.DB_URL});await db.connect();
 async function http(route,body,token,admin=false,method='POST'){
  const began=performance.now(),res=await fetch(keys.API_URL+route,{method,headers:{apikey:admin?keys.SERVICE_ROLE_KEY:keys.ANON_KEY,'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{})},...(body===undefined?{}:{body:JSON.stringify(body)})});
  const text=await res.text();return {status:res.status,body:text?JSON.parse(text):null,ms:performance.now()-began,bytes:Buffer.byteLength(text)};
 }
 const args=(env,rank='all',v=3,b=bounds)=>Object.fromEntries([['p_current_start',b[0]],['p_current_end',b[1]],['p_previous_start',b[2]],['p_previous_end',b[3]],...(v>=2?[['p_rank_filter',rank]]:[]),...(v>=3?[['p_environment_id',env]]:[])]);
 const accounts=[];
 const catalog=async()=>({functions:(await db.query("select n.nspname,p.proname,pg_get_function_identity_arguments(p.oid) arguments,md5(pg_get_functiondef(p.oid)) hash,p.proacl::text acl from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname in ('public','private') and p.proname<>'get_period_report_aggregates_v3' order by 1,2,3")).rows,policies:(await db.query("select * from pg_policies where schemaname in ('public','private') order by schemaname,tablename,policyname")).rows,rls:(await db.query("select c.relname,c.relrowsecurity,c.relforcerowsecurity,c.relacl::text acl from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname in ('public','private') and c.relkind in ('r','v','p') order by c.relname")).rows});
 try{
  report.versions={postgres:(await db.query('select version() v')).rows[0].v,cli:runCli(['--version']).trim()};
  for(const kind of ['admin','member']){
   const email=`period-${kind}-${Date.now()}@example.test`,password=crypto.randomBytes(24).toString('hex');
   const made=await http('/auth/v1/admin/users',{email,password,email_confirm:true},keys.SERVICE_ROLE_KEY,true);assert.equal(made.status,200);
   const login=await http('/auth/v1/token?grant_type=password',{email,password});assert.equal(login.status,200);
   accounts.push({kind,email,password,id:made.body.id,session:login.body});
  }
  const [admin,member]=accounts;await db.query('insert into public.admin_users(user_id) values($1)',[admin.id]);
  for(const d of f.decks){await db.query('insert into public.deck_archetypes(id,name,class_name,is_active) values($1,$2,$3,true) on conflict do nothing',[d.id,d.name,d.class_name]);await db.query('insert into public.decks(id,user_id,name,class_name) values($1,$2,$3,$4) on conflict do nothing',[d.id,member.id,d.name,d.class_name]);}
  const solo=f.uuid(103),environments=[...f.environments,{...f.environments[0],id:solo,name:'前期間なしの環境'}];
  for(const e of environments)await db.query('insert into public.environments(id,user_id,name,start_date,created_at,allow_match_input,match_input_start_at,match_input_end_at) values($1,$2,$3,$4,$5,$6,$7,$8) on conflict do nothing',[e.id,admin.id,e.name,e.start_date,e.created_at,e.allow_match_input,e.match_input_start_at,e.match_input_end_at]);
  let rows=[];for(const environment_id of [f.NEW,f.OLD,null])for(const rank of f.ranks)for(const played_at of ['2026-09-29T01:00:00.000Z','2026-09-26T01:00:00.000Z'])for(let i=0;i<4;i++)rows.push(f.row({...rank,environment_id,played_at,user_id:i%2?member.id:admin.id,result:i%3?'win':'lose',opponent_archetype_id:i%2?f.decks[1].id:f.decks[0].id}));
  rows.push(f.row({environment_id:solo,user_id:member.id}));
  for(const t of bounds)for(const offset of [-1,0,1])rows.push(f.row({played_at:new Date(Date.parse(t)+offset).toISOString(),user_id:member.id}));
  // Prepare historical fixtures as an open environment, then close it. No trigger, RLS or GRANT is disabled.
  // NULL historical IDs are set by the preparation connection after INSERT; current input disallows them.
  const seed=async(data)=>{await db.query('begin');try{await db.query('delete from public.matches');await db.query('update public.environments set allow_match_input=true,match_input_start_at=null,match_input_end_at=null');if(data.length)await db.query("insert into public.matches(id,user_id,environment_id,my_deck_id,opponent_deck_id,my_archetype_id,opponent_archetype_id,result,turn_order,played_at,rank_tier,master_group,grandmaster_rating) select id,user_id,coalesce(environment_id,$2::uuid),my_deck_id,opponent_deck_id,my_archetype_id,opponent_archetype_id,result::public.match_result,'first'::public.turn_order,played_at,rank_tier,master_group,grandmaster_rating from jsonb_to_recordset($1::jsonb) as x(id uuid,user_id uuid,environment_id uuid,my_deck_id uuid,opponent_deck_id uuid,my_archetype_id uuid,opponent_archetype_id uuid,result text,played_at timestamptz,rank_tier text,master_group text,grandmaster_rating text)",[JSON.stringify(data),f.NEW]);await db.query('update public.matches set environment_id=null where id=any($1::uuid[])',[data.filter(r=>r.environment_id===null).map(r=>r.id)]);for(const e of environments)await db.query('update public.environments set allow_match_input=$2,match_input_start_at=$3,match_input_end_at=$4 where id=$1',[e.id,e.allow_match_input,e.match_input_start_at,e.match_input_end_at]);await db.query('commit');}catch(e){await db.query('rollback');throw e;}};
  await seed(rows);
  const rpc=async(env,rank='all',v=3,b=bounds,token=admin.session.access_token)=>http('/rest/v1/rpc/get_period_report_aggregates_v'+v,args(env,rank,v,b),token);
  const before=await catalog(),baseline={};
  for(const {value:rank} of ANALYSIS_RANK_FILTERS){const r=await rpc(null,rank,rank==='all'?1:2);assert.equal(r.status,200);baseline[rank]=r.body;}
  save('catalog-before',before);save('legacy-before',baseline);
  fs.copyFileSync(path.join(root,'supabase/migrations',migration),path.join(stack,'supabase/migrations',migration));
  fs.writeFileSync(path.join(out,'migration.log'),runCli(['migration','up','--local']));
  assert.deepEqual(await catalog(),before);report.existingCatalogUnchanged=true;
  report.history=(await db.query('select version,name from supabase_migrations.schema_migrations order by version')).rows;
  assert.equal(report.history.at(-1).version,'20261002111149');
  // Wait for the normal PostgREST schema reload, without treating a missing RPC as an authorization result.
  for(let i=0;i<30;i++){const r=await rpc(f.NEW);if(r.status===200)break;if(r.body?.code!=='PGRST202')throw Error('Unexpected RPC recognition: '+r.status+'/'+r.body?.code);await new Promise(r=>setTimeout(r,500));}
  for(const env of [null,f.NEW,f.OLD,f.EMPTY,solo])for(const {value:rank}of ANALYSIS_RANK_FILTERS){
   const r=await rpc(env,rank);assert.equal(r.status,200);
   const select=(start,end)=>rows.filter(m=>Date.parse(m.played_at)>=Date.parse(start)&&Date.parse(m.played_at)<=Date.parse(end)&&(env===null||m.environment_id===env)&&f.accepts(m,rank)).sort((a,b)=>b.played_at.localeCompare(a.played_at)||b.id.localeCompare(a.id));
   const expected=old.buildWeeklyReport(select(...bounds.slice(0,2)),select(...bounds.slice(2)),f.decks,period);
   assert.deepEqual(current.buildWeeklyReportFromAggregates(r.body,f.decks,period),expected,`${env}/${rank}`);
   if(env===null){assert.deepEqual(r.body,baseline[rank]);assert.deepEqual((await rpc(null,rank,rank==='all'?1:2)).body,baseline[rank]);}
   report.comparisons++;
  }
  const omitted=await http('/rest/v1/rpc/get_period_report_aggregates_v3',args(null,'all',1),admin.session.access_token);assert.equal(omitted.status,200);assert.deepEqual(omitted.body,baseline.all);report.omittedDefaults=true;
  for(const [kind,token,status,code]of [['admin',admin.session.access_token,200,undefined],['member',member.session.access_token,403,'42501'],['no-authorization',undefined,401,'42501'],['invalid-token','not-a-valid-token',401,'PGRST301']]){
   const r=await http('/rest/v1/rpc/get_period_report_aggregates_v3',args(f.NEW),token);assert.equal(r.status,status,kind);assert.equal(r.body?.code,code,kind);
   report.api.push({identity:kind,status:r.status,code:r.body?.code??null,returnsAggregate:r.body?.current!==undefined,message:r.body?.message??null});
  }
  for(const [env,code]of [['bad','22P02'],[f.uuid(999),'22023']]){const r=await rpc(env);assert.equal(r.status,400);assert.equal(r.body.code,code);report.api.push({identity:'admin',invalidEnvironment:env==='bad'?'malformed':'unknown',status:r.status,code:r.body.code,message:r.body.message});}
  const own=await http('/rest/v1/matches?select=id,user_id',undefined,member.session.access_token,false,'GET');assert.equal(own.status,200);assert.equal(own.body.length,rows.filter(r=>r.user_id===member.id).length);assert.ok(own.body.every(r=>r.user_id===member.id));
  const home=await http('/rest/v1/rpc/get_home_dashboard',{},member.session.access_token);assert.equal(home.status,200);report.memberHomeAndOwnRls=true;
  report.newFunction=(await db.query("select p.prosecdef,p.provolatile,p.proconfig,p.proacl::text acl,pg_get_function_arguments(p.oid) arguments,has_function_privilege('anon',p.oid,'EXECUTE') anon,has_function_privilege('authenticated',p.oid,'EXECUTE') authenticated,has_function_privilege('service_role',p.oid,'EXECUTE') service_role,exists(select 1 from aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) where grantee=0 and privilege_type='EXECUTE') public_execute from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='get_period_report_aggregates_v3'")).rows;
  assert.equal(report.newFunction.length,1);assert.equal(report.newFunction[0].prosecdef,false);assert.equal(report.newFunction[0].anon,false);assert.equal(report.newFunction[0].public_execute,false);assert.equal(report.newFunction[0].service_role,false);
  save('api-result',report);console.log('Real Auth/API: '+report.comparisons+' full-model comparisons passed; authorization and old RPC parity passed.');
  await require('./period-report-real-browser.cjs')({root,out,keys,accounts,rows,environments,f,period,previous,baseline,report});
  // Independent source-ID extraction from each installed migration, never a precomputed common set.
  const callEnv=()=>http('/rest/v1/rpc/get_environment_dashboard_aggregates_v3',{p_environment_id:f.NEW,p_period:'7d',p_rank_filters:RANK_ATOMS},admin.session.access_token);
  const initial=await callEnv();assert.equal(initial.status,200);const end=initial.body.current.end,start=initial.body.current.start;
  const exactEnd=(await db.query("select to_char($1::timestamptz-interval '1 microsecond','YYYY-MM-DD\"T\"HH24:MI:SS.USOF') x",[end])).rows[0].x;
  const previousEnd=(await db.query("select to_char($1::timestamptz-interval '1 microsecond','YYYY-MM-DD\"T\"HH24:MI:SS.USOF') x",[start])).rows[0].x;
  const comparative=[f.row({played_at:start}),f.row({played_at:exactEnd}),f.row({played_at:end}),f.row({played_at:exactEnd,environment_id:f.OLD}),f.row({played_at:start,rank_tier:'master',master_group:'sapphire'})].map(r=>({...r,user_id:member.id}));await seed(comparative);
  const b=await callEnv(),aligned=[start,exactEnd,b.body.previous.start,previousEnd],a=await rpc(f.NEW,'all',3,aligned);assert.equal(b.body.current.end,end);
  let aSql=f.sql.slice(f.sql.indexOf('with periods'),f.sql.indexOf('), grouped as'))+") select id from ordered where label='current' order by id";aSql=aSql.replace('select p.label,','select m.id, p.label,');
  for(const [i,name] of ['p_current_start','p_current_end','p_previous_start','p_previous_end','p_rank_filter','p_environment_id'].entries())aSql=aSql.replaceAll(name,'$'+(i+1)+'::'+(i<4?'timestamptz':i===4?'text':'uuid'));
  let bSql=f.environmentSql.slice(f.environmentSql.indexOf('with periods'),f.environmentSql.indexOf('), totals as'))+") select id from source where label='current' order by id";bSql=bSql.replace('select p.label,','select m.id, p.label,').replaceAll('data_through','$1::timestamptz').replaceAll('duration',"interval '168 hours'").replaceAll('p_environment_id','$2::uuid').replaceAll('p_rank_filters','$3::text[]');
  const claims=JSON.parse(Buffer.from(admin.session.access_token.split('.')[1],'base64url'));
  const asAdmin=async(fn)=>{await db.query('begin read only');try{await db.query("select set_config('request.jwt.claims',$1,true)",[JSON.stringify(claims)]);await db.query('set local role authenticated');return await fn();}finally{await db.query('rollback');}};
  const ids=await asAdmin(async()=>({a:(await db.query(aSql,[...aligned,'all',f.NEW])).rows.map(r=>r.id),b:(await db.query(bSql,[end,f.NEW,RANK_ATOMS])).rows.map(r=>r.id)}));
  assert.deepEqual(ids.a,ids.b);assert.equal(a.body.current.totalMatches,3);assert.equal(b.body.current.total.totalMatches,3);assert.equal((await rpc(f.NEW,'all',3,[start,end,...aligned.slice(2)])).body.current.totalMatches,4);
  report.independent={a:3,b:3,aOnly:0,bOnly:0,unalignedPeriod:4,apiIdentity:'real authenticated admin',dataUnchangedDuringCalls:true,sqlA:aSql,sqlB:bSql,bounds:aligned,environmentEndExclusive:end};
  // 6,000 synthetic registrations, close to the production catalog estimate (5,554), no production load test.
  const large=Array.from({length:6000},(_,i)=>f.row({user_id:i%2?member.id:admin.id,environment_id:i%3===0?null:i%3===1?f.NEW:f.OLD,played_at:i<3000?'2026-09-29T01:00:00Z':'2026-09-26T01:00:00Z',rank_tier:i%2?'master':null,master_group:i%2?'sapphire':null}));await seed(large);await db.query('analyze public.matches');
  for(const [v,env,rank]of [[1,null,'all'],[2,null,'master'],[3,null,'all'],[3,f.NEW,'all'],[3,f.OLD,'master']]){
   const expected=large.filter(r=>r.played_at.startsWith('2026-09-29')&&(env===null||r.environment_id===env)&&f.accepts(r,rank)).length,times=[];let bytes;
   for(let i=0;i<5;i++){const result=await rpc(env,rank,v);assert.equal(result.status,200);assert.equal(result.body.current.totalMatches,expected);times.push(result.ms);bytes=result.bytes;}
   const plan=await asAdmin(async()=>db.query(`explain (analyze,buffers,format json) select public.get_period_report_aggregates_v${v}(${Object.keys(args(env,rank,v)).map((_,i)=>'$'+(i+1)).join(',')})`,Object.values(args(env,rank,v))));
   report.performance.push({version:v,environment:env===null?'all':env===f.NEW?'new':'old',rank,totalRows:6000,expectedCurrent:expected,apiMs:times,bytes,dbMs:plan.rows[0]['QUERY PLAN'][0]['Execution Time'],timeout:false,missingRows:false});
  }
  report.rollback={oldAppAndV1V2WithV3Installed:true,dropPerformed:false,note:'Additive RPC retained; rollback switches source back to d40c02e. Function deletion and history repair are separate, not necessary for immediate application rollback.'};
  assert.deepEqual(await catalog(),before);report.passed=true;save('api-result',report);console.log('Independent API/source comparison and 6000-row performance passed.');
 }finally{await db.end();}
}
main().catch(e=>{report.errors.push({name:e.name,message:e.message});save('api-result',report);console.error(e.stack);process.exitCode=1;});
