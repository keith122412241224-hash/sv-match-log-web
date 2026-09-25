/* eslint-disable @typescript-eslint/no-require-imports */
// Independent in-memory PostgreSQL only. Never connects to Supabase.
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {performance}=require('node:perf_hooks');
const {PGlite}=require(process.env.PGLITE_MODULE||'@electric-sql/pglite');
const old=require('./fixtures/weekly-report-e430a56'),next=require('../src/lib/weekly-report');
const {parsePeriodReportAggregates}=require('../src/lib/period-report-aggregates');
const migration=fs.readFileSync(path.resolve('supabase/migrations/014_period_report_aggregates_v1.sql'),'utf8');
const signature='public.get_period_report_aggregates_v1(timestamptz,timestamptz,timestamptz,timestamptz)';
const call=`select ${signature.slice(0,signature.indexOf('('))}($1::timestamptz,$2::timestamptz,$3::timestamptz,$4::timestamptz) as data`;
const uuid=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const ADMIN=uuid(1),MEMBER=uuid(2),OTHER=uuid(3),A=uuid(101),B=uuid(102),C=uuid(103),UNKNOWN=uuid(900),INACTIVE=uuid(901);
const decks=Array.from({length:32},(_,i)=>uuid(101+i)).map(id=>({id,name:id===A||id===B?'同名':id,class_name:'エルフ',is_active:true}));
const evidence={baseline:'e430a56',engine:'PGlite PostgreSQL WASM; synthetic local data; not Production timings',cases:[],performance:[],permissions:[]};
let serial=1000;
const row=(extra={})=>({id:uuid(++serial),user_id:MEMBER,my_deck_id:A,opponent_deck_id:B,my_archetype_id:null,opponent_archetype_id:null,result:'win',turn_order:'first',played_at:'2026-09-05T00:00:00.000000Z',...extra});
test('real PostgreSQL contract, full Production parity, boundaries, RLS and scale',{timeout:600000},async()=>{
  const db=await PGlite.create();
  async function identity(id=ADMIN,role='authenticated'){
    assert.ok(['authenticated','anon','service_role'].includes(role));await db.exec('reset role');
    await db.query("select set_config('request.jwt.claim.sub',$1,false)",[id||'']);await db.exec(`set role ${role}`);
  }
  async function seed(rows){
    await db.exec('reset role; truncate public.matches');
    await db.query(`insert into public.matches(id,user_id,my_deck_id,opponent_deck_id,my_archetype_id,opponent_archetype_id,result,turn_order,played_at)
      select id,user_id,my_deck_id,opponent_deck_id,my_archetype_id,opponent_archetype_id,result,turn_order,played_at from jsonb_to_recordset($1::jsonb)
      as r(id uuid,user_id uuid,my_deck_id uuid,opponent_deck_id uuid,my_archetype_id uuid,opponent_archetype_id uuid,result public.match_result,turn_order public.turn_order,played_at timestamptz)`,[JSON.stringify(rows)]);
    await db.exec('analyze public.matches');await identity();
  }
  async function catalog(){return (await db.query(`select 'index' as kind,indexname as name,indexdef as value from pg_indexes where schemaname='public'
    union all select 'policy',policyname,concat(qual,' / ',with_check) from pg_policies where schemaname='public'
    union all select 'function',p.proname,pg_get_functiondef(p.oid) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname in ('get_analysis_aggregates_v1','get_matchup_aggregates_v1','is_admin')
    union all select 'rls',relname,relrowsecurity::text from pg_class where relname='matches'
    order by kind,name`)).rows;}
  async function compare(name,period=old.buildWeeklyPeriod('2026-09-05','2026-09-05'),measure=false){
    const prev=old.getPreviousWeeklyReportPeriod(period),args=[period.startIso,period.endIso,prev.startIso,prev.endIso];
    const select='select id,my_deck_id,opponent_deck_id,my_archetype_id,opponent_archetype_id,result,played_at from public.matches where played_at >= $1::timestamptz and played_at <= $2::timestamptz order by played_at desc,id desc';
    const currentRows=(await db.query(select,args.slice(0,2))).rows,previousRows=(await db.query(select,args.slice(2))).rows;
    const oldStart=performance.now(),expected=old.buildWeeklyReport(currentRows,previousRows,decks,period),oldJsMs=performance.now()-oldStart;
    const times=[];let payload;
    for(let i=0;i<(measure?3:1);i++){const start=performance.now();payload=parsePeriodReportAggregates((await db.query(call,args)).rows[0].data);times.push(performance.now()-start);}
    const newStart=performance.now(),actual=next.buildWeeklyReportFromAggregates(payload,decks,period),newJsMs=performance.now()-newStart;
    assert.deepEqual(actual,expected,name+' entire report + AI JSON/prompt');
    evidence.cases.push({name,current:currentRows.length,previous:previousRows.length,fullModelEqual:true});
    if(measure){
      const sql=migration.slice(migration.indexOf('with periods'),migration.indexOf('\n  into report_payload;')).replaceAll('p_current_start','$1::timestamptz').replaceAll('p_current_end','$2::timestamptz').replaceAll('p_previous_start','$3::timestamptz').replaceAll('p_previous_end','$4::timestamptz');
      const plan=(await db.query('explain (analyze,buffers,format json) '+sql,args)).rows[0]['QUERY PLAN'];
      const n=currentRows.length+previousRows.length,g=payload.current.groups.length+payload.previous.groups.length;
      const item={name,current:currentRows.length,previous:previousRows.length,rpcMs:times,oldJsMs,newJsMs,
        old:{apiCalls:Math.floor(currentRows.length/1000)+Math.floor(previousRows.length/1000)+2,transferredRows:n,jsonBytes:Buffer.byteLength(JSON.stringify([currentRows,previousRows])),retainedRows:n,
          rawRowVisits:4*n+currentRows.length+[...currentRows,...previousRows].filter(m=>{const a=m.my_archetype_id??m.my_deck_id,b=m.opponent_archetype_id??m.opponent_deck_id;return a&&b&&a!==b;}).length},
        rpc:{apiCalls:1,returnedGroups:g,jsonBytes:Buffer.byteLength(JSON.stringify(payload)),retainedGroups:g,groupTraversalUpperBound:10*g},
        callCounts:'Modeled from exact legacy paging (including final empty pages); excludes auth/catalog and HTTP overhead',memory:'JSON bytes and retained row/group counts are payload proxies, not isolated Next.js RSS',plan};
      evidence.performance.push(item);console.log(JSON.stringify({...item,plan:'saved to evidence'}));
    }
    console.log('SQL parity: '+name);return {payload,actual,args};
  }
  try {
    await db.exec(`create role anon nologin;create role authenticated nologin;create role service_role nologin bypassrls;create schema auth;
      create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
      grant usage on schema auth,public to anon,authenticated,service_role;
      create table public.admin_users(user_id uuid primary key);
      create function public.is_admin() returns boolean language sql volatile security definer set search_path='' as $$select exists(select 1 from public.admin_users where user_id=auth.uid())$$;
      create type public.match_result as enum('win','lose');create type public.turn_order as enum('first','second');
      create table public.matches(id uuid primary key,user_id uuid,environment_id uuid,my_deck_id uuid,opponent_deck_id uuid,my_archetype_id uuid,opponent_archetype_id uuid,result public.match_result not null,turn_order public.turn_order,played_at timestamptz not null);
      alter table public.matches enable row level security;
      create policy matches_select_own_or_admin on public.matches for select to authenticated using (auth.uid()=user_id or public.is_admin());
      grant select on public.matches to authenticated,service_role;
      -- Reproduce existing Phase 2-B audit fixture indexes, not proposed new indexes.
      create index matches_user_id_played_at_idx on public.matches(user_id,played_at desc);
      create index matches_archetype_idx on public.matches(user_id,my_archetype_id,opponent_archetype_id);
      create index matches_my_deck_id_idx on public.matches(my_deck_id);
      create index matches_opponent_deck_id_idx on public.matches(opponent_deck_id);
      alter default privileges in schema public grant execute on functions to anon,authenticated,service_role;`);
    await db.query('insert into public.admin_users values($1)',[ADMIN]);
    await db.exec(fs.readFileSync('supabase/migrations/012_matchup_aggregates_v1.sql','utf8'));
    await db.exec(fs.readFileSync('tests/fixtures/analysis-aggregates-v1.sql','utf8'));
    const before=await catalog();await db.exec(migration);await db.exec(migration);assert.deepEqual(await catalog(),before);
    evidence.catalogUnchanged=true;evidence.existingIndexes=before.filter(r=>r.kind==='index');
    evidence.postgres=(await db.query('select version(),current_setting(\'work_mem\') as work_mem')).rows[0];
    const meta=(await db.query(`select p.prosecdef,p.proconfig,has_function_privilege('anon',p.oid,'execute') as anon,has_function_privilege('authenticated',p.oid,'execute') as authenticated,has_function_privilege('service_role',p.oid,'execute') as service_role,
      exists(select 1 from aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a where a.grantee=0 and a.privilege_type='EXECUTE') as public_execute
      from pg_proc p where p.oid=$1::regprocedure`,[signature])).rows[0];
    assert.equal(meta.prosecdef,false);assert.equal(meta.anon,false);assert.equal(meta.public_execute,false);assert.equal(meta.authenticated,true);assert.equal(meta.service_role,true);assert.ok(meta.proconfig.includes('search_path=""'));evidence.function=meta;
    const p=old.buildWeeklyPeriod('2026-09-05','2026-09-05'),prev=old.getPreviousWeeklyReportPeriod(p),args=[p.startIso,p.endIso,prev.startIso,prev.endIso];
    await seed([row(),row({user_id:OTHER})]);
    for(const [id,role,allow]of [[ADMIN,'authenticated',true],[MEMBER,'authenticated',false],[null,'authenticated',false],[ADMIN,'anon',false],[null,'service_role',false],[ADMIN,'service_role',true]]){
      await identity(id,role);if(allow)assert.equal((await db.query(call,args)).rows[0].data.current.totalMatches,2);else await assert.rejects(()=>db.query(call,args),e=>e.code==='42501');evidence.permissions.push({role,identity:id===ADMIN?'admin':id?'member':'none',allowed:allow});
    }
    await identity(MEMBER);assert.equal((await db.query('select count(*)::int as n from public.matches')).rows[0].n,1);await identity();
    for(const bad of [[null,...args.slice(1)],[args[1],args[0],...args.slice(2)]])await assert.rejects(()=>db.query(call,bad),e=>e.code==='22023');
    await seed([
      row({played_at:'2026-09-04T14:59:59.999999Z'}),row({played_at:'2026-09-04T15:00:00.000000Z'}),row({played_at:'2026-09-04T15:00:00.000001Z'}),
      row({played_at:'2026-09-05T14:59:59.998999Z'}),row({played_at:'2026-09-05T14:59:59.999000Z'}),row({played_at:'2026-09-05T14:59:59.999001Z'}),row({played_at:'2026-09-05T15:00:00.000000Z'}),
      row({played_at:prev.startIso}),row({played_at:prev.endIso})]);
    const boundary=await compare('microsecond-inclusive-JST-boundaries');assert.equal(boundary.actual.totalMatches,4);assert.equal(boundary.actual.previousTotalMatches,2);
    for(const count of [0,1,999,1000,1001,10000,100000]){
      const rows=[];for(let i=0;i<count;i++)for(const previous of [false,true])rows.push(row({my_deck_id:count>=10000?uuid(101+i%32):[A,B,C,UNKNOWN,INACTIVE,null][i%6],opponent_deck_id:count>=10000?uuid(101+(i*7+Math.floor(i/32))%32):[B,A,C,INACTIVE,A,null][i%6],my_archetype_id:i%11===0?C:null,result:i%3?'win':'lose',user_id:i%2?MEMBER:OTHER,played_at:previous?'2026-09-04T00:00:00.123456Z':'2026-09-05T00:00:00.123456Z'}));
      await seed(rows);await compare('size-'+count,p,count>=10000);
    }
    for(const [start,end]of [['2026-09-01','2026-09-07'],['2026-08-28','2026-09-12'],['2026-08-31','2026-09-01']]){
      const period=old.buildWeeklyPeriod(start,end),previous=old.getPreviousWeeklyReportPeriod(period);
      await seed([row({played_at:period.startIso}),row({played_at:period.endIso}),row({played_at:previous.startIso}),row({played_at:previous.endIso})]);await compare('date-'+start+'-'+end,period);
    }
    for(const previous of [false,true]){await seed(Array.from({length:25},(_,i)=>row({opponent_deck_id:i%2?A:B,played_at:previous?prev.startIso:p.startIso})));await compare(previous?'previous-only':'current-only');}
    for(const result of ['win','lose']){await seed(Array.from({length:20},()=>row({result})));await compare('direct-only-'+result);await seed(Array.from({length:20},()=>row({my_deck_id:B,opponent_deck_id:A,result})));await compare('reversed-only-'+result);}
    await seed(Array.from({length:20},()=>row({opponent_deck_id:A})));await compare('mirror-only');
    await seed([...Array.from({length:10},(_,i)=>row({result:i<5?'win':'lose'})),...Array.from({length:10},(_,i)=>row({my_deck_id:B,opponent_deck_id:A,result:i<7?'lose':'win'}))]);
    const combined=await compare('direct50-reversed70');assert.equal(combined.actual.myDeckWinRates.find(r=>r.deckId===A).wins,12);
    await db.exec('reset role');assert.deepEqual(await catalog(),before);
  }finally{await db.close();fs.mkdirSync('build',{recursive:true});fs.writeFileSync('build/period-report-sql-evidence.json',JSON.stringify(evidence,null,2));}
});
