/* eslint-disable @typescript-eslint/no-require-imports */
// Real PostgreSQL WASM; synthetic local DB only. Production modules are the oracle.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), cp = require('node:child_process');
const Module = require('node:module'), ts = require('typescript');
const { performance } = require('node:perf_hooks');
const { PGlite } = require(process.env.PGLITE_MODULE || '@electric-sql/pglite');
const old = require('../src/lib/analytics');
const { analysisPerspectives, filterAnalysisPerspectives } = require('../src/lib/match-perspectives');
const { buildAnalysisFromAggregates, emptyAnalysisAggregates } = require('../src/lib/analysis-aggregates');
const root = path.resolve(__dirname, '..'), base = '46da48df303ca38df85120a813ba746d3ac71bb0';
const migration = fs.readFileSync(path.join(root, 'tests/fixtures/analysis-aggregates-v1.sql'), 'utf8');
const signature = 'public.get_analysis_aggregates_v1(uuid,boolean,boolean,boolean,uuid,uuid,public.match_result,public.turn_order,timestamptz,timestamptz,uuid[])';
const argNames = ['p_environment_id','p_include_all_users','p_include_reversed','p_use_archetype','p_my_deck_id','p_opponent_deck_id','p_result','p_turn_order','p_played_from','p_played_to','p_recent_deck_ids'];
const argTypes = ['uuid','boolean','boolean','boolean','uuid','uuid','public.match_result','public.turn_order','timestamptz','timestamptz','uuid[]'];
const callSql = `select public.get_analysis_aggregates_v1(${argTypes.map((t,i)=>`$${i+1}::${t}`).join(',')}) as data`;
const uuid = n => `00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const OWNER=uuid(1),OTHER=uuid(2),ADMIN=uuid(3),ENV=uuid(10),ENV2=uuid(11);
const A=uuid(100),B=uuid(101),C=uuid(102),INACTIVE=uuid(103),REMOVED=uuid(104),LA=uuid(200),LB=uuid(201),UNKNOWN=uuid(202);
let db, user=OWNER, sequence=0, counters={matches:0,rpc:0}, baselinePage, newPage;
const evidence={baseline:base,engine:'PGlite real PostgreSQL WASM; local synthetic data only',cases:[],pages:[],performance:[]};
const fixture = (extra={}) => ({id:uuid(1000000+ ++sequence),user_id:OWNER,environment_id:ENV,my_deck_id:LA,opponent_deck_id:LB,
  my_archetype_id:A,opponent_archetype_id:B,turn_order:'first',result:'win',played_at:'2026-09-20T00:00:00.123456Z',...extra});
async function identity(id=OWNER, role='authenticated') {
  assert.ok(['authenticated','anon'].includes(role)); await db.exec('reset role');
  await db.query("select set_config('request.jwt.claim.sub',$1,false)",[id||'']); await db.exec(`set role ${role}`); user=id;
}
async function seed(records) {
  await db.exec('reset role; truncate public.matches');
  await db.query(`insert into public.matches (id,user_id,environment_id,my_deck_id,opponent_deck_id,my_archetype_id,opponent_archetype_id,turn_order,result,played_at)
    select id,user_id,environment_id,my_deck_id,opponent_deck_id,my_archetype_id,opponent_archetype_id,turn_order,result,played_at
    from jsonb_to_recordset($1::jsonb) as r(id uuid,user_id uuid,environment_id uuid,my_deck_id uuid,opponent_deck_id uuid,
    my_archetype_id uuid,opponent_archetype_id uuid,turn_order public.turn_order,result public.match_result,played_at timestamptz)`,[JSON.stringify(records)]);
  await identity();
}
const supabase={
  auth:{getUser:async()=>({data:{user:user?{id:user}:null}})},
  rpc:async(name,args)=>{
    assert.equal(name,'get_analysis_aggregates_v1'); counters.rpc++;
    try{return {data:(await db.query(callSql,argNames.map(n=>args[n]))).rows[0].data,error:null};}
    catch(error){return {data:null,error:{code:error.code,message:error.message}};}
  },
  from(table){
    assert.ok(['matches','admin_users','decks','deck_archetypes','environments'].includes(table)); if(table==='matches')counters.matches++;
    const params=[],predicates=[],orders=[];let columns='*',range,single=false;
    const identifier=v=>{assert.match(v,/^[a-z_]+$/);return v;};
    const predicate=(column,op,value)=>{params.push(value);predicates.push(`${identifier(column)} ${op} $${params.length}`);return query;};
    const query={select(v){columns=v==='*'?'*':v.split(',').map(identifier).join(',');return query;},
      eq:(c,v)=>predicate(c,'=',v),gte:(c,v)=>predicate(c,'>=',v),lte:(c,v)=>predicate(c,'<=',v),
      order(c,o){orders.push(`${identifier(c)} ${o.ascending?'asc':'desc'}`);return query;},range(a,b){range=[a,b];return query;},
      maybeSingle(){single=true;return query;},
      then(resolve,reject){const sql=`select ${columns} from public.${table}${predicates.length?' where '+predicates.join(' and '):''}${orders.length?' order by '+orders.join(','):''}${range?` limit ${range[1]-range[0]+1} offset ${range[0]}`:''}`;
        return db.query(sql,params).then(r=>({data:single?r.rows[0]??null:r.rows,error:null})).then(resolve,reject);}
    };return query;
  }
};
const server=require.resolve('../src/lib/supabase/server');require.cache[server]={id:server,filename:server,loaded:true,exports:{createSupabaseServerClient:async()=>supabase}};
const {getMatches,getDecks,getActiveArchetypes}=require('../src/lib/data');
const {getAnalysisAggregates}=require('../src/lib/analysis-data');
async function catalog(){return {
  indexes:(await db.query("select indexname,indexdef from pg_indexes where schemaname='public' order by indexname")).rows,
  policies:(await db.query("select tablename,policyname,roles,cmd,qual,with_check from pg_policies where schemaname='public' order by tablename,policyname")).rows,
  columns:(await db.query("select table_name,column_name,data_type,is_nullable from information_schema.columns where table_schema='public' order by table_name,ordinal_position")).rows,
  matchup:(await db.query("select pg_get_functiondef('public.get_matchup_aggregates_v1(uuid,boolean)'::regprocedure) as definition")).rows
};}
before(async()=>{
  for(const file of ['src/lib/analytics.ts','src/lib/data.ts','src/lib/match-perspectives.ts','src/app/matrix/page.tsx','src/lib/matchup-data.ts','src/lib/matchup-aggregates.ts','src/app/actions.ts']){
    const original=cp.execFileSync('git',['show',`${base}:${file}`],{cwd:root,encoding:'utf8'});
    assert.equal(fs.readFileSync(path.join(root,file),'utf8').replaceAll('\r\n','\n'),original.replaceAll('\r\n','\n'),file+' must remain baseline');
  }
  db=await PGlite.create();
  await db.exec(`create role anon nologin;create role authenticated nologin;create role service_role nologin;create schema auth;
    create table auth.users(id uuid primary key,email text,raw_user_meta_data jsonb);
    create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
    grant usage on schema auth to anon,authenticated;`);
  await db.exec(fs.readFileSync(path.join(root,'supabase/schema_production.sql'),'utf8').replace('create extension if not exists "pgcrypto";',''));
  await db.exec(fs.readFileSync(path.join(root,'supabase/migrations/009_admin_all_matches_analysis.sql'),'utf8'));
  await db.exec(fs.readFileSync(path.join(root,'supabase/migrations/012_matchup_aggregates_v1.sql'),'utf8'));
  // Reproduce the real production preflight differences observed in Phase 2-A.
  await db.exec(`alter table public.matches alter column environment_id drop not null;
    drop index public.matches_environment_id_idx;alter function public.is_admin() volatile;
    alter policy admin_users_select_own_or_admin on public.admin_users to public;`);
  const before=await catalog();await db.exec(migration);await db.exec(migration);assert.deepEqual(await catalog(),before);
  evidence.indexes=before.indexes.filter(i=>i.indexname.startsWith('matches'));evidence.serverVersion=(await db.query('select version()')).rows[0].version;
  for(const id of [OWNER,OTHER,ADMIN])await db.query('insert into auth.users(id,email) values($1,$2)',[id,id+'@example.test']);
  await db.query('insert into public.admin_users(user_id) values($1)',[ADMIN]);
  for(const [i,id]of [ENV,ENV2].entries())await db.query('insert into public.environments(id,user_id,name,created_at) values($1,$2,$3,$4)',[id,ADMIN,id,`2026-09-${20-i}T00:00:00Z`]);
  for(const [i,id]of [A,B,C,INACTIVE,REMOVED].entries())await db.query('insert into public.deck_archetypes(id,name,class_name,is_active,sort_order) values($1,$2,$3,$4,$5)',[id,i<2?'同名':id===REMOVED?'その他エルフ':id,i===1?'ロイヤル':'エルフ',id!==INACTIVE,5-i]);
  for(const [i,id]of [LA,LB,UNKNOWN].entries())await db.query('insert into public.decks(id,user_id,name,class_name,sort_order) values($1,$2,$3,$4,$5)',[id,OWNER,id,'エルフ',3-i]);
  const filename=path.join(root,'build/baseline-analysis-page.cjs');const baselineModule=new Module(filename,module);baselineModule.filename=filename;baselineModule.paths=Module._nodeModulePaths(root);
  const source=cp.execFileSync('git',['show',`${base}:src/app/analysis/page.tsx`],{cwd:root,encoding:'utf8'});
  baselineModule._compile(ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText,filename);
  baselinePage=baselineModule.exports.default;newPage=require('../src/app/analysis/page').default;
  await identity();
});
after(async()=>{if(db)await db.close();fs.mkdirSync(path.join(root,'build'),{recursive:true});fs.writeFileSync(path.join(root,'build/analysis-rpc-evidence.json'),JSON.stringify(evidence,null,2));});
function oracle(views,decks,archetypes){
  const visible=archetypes.length?archetypes:decks,names=new Map([...decks,...archetypes].map(d=>[d.id,d.name]));const wins=views.filter(v=>v.result==='win').length;
  return {registeredMatches:new Set(views.map(v=>v.id)).size,perspectives:views.length,totalWins:wins,winRate:old.calculateWinRate(wins,views.length),
    byMyDeck:old.groupWinRates(views,v=>v.my_archetype_id??v.my_deck_id,id=>names.get(id)??'不明'),
    byOpponentDeck:old.groupWinRates(views,v=>v.opponent_archetype_id??v.opponent_deck_id,id=>names.get(id)??'不明'),byTurn:old.turnOrderWinRates(views),
    matrix:old.buildWinRateMatrix(views,visible,visible),summaries:old.buildDeckAnalysisSummaries(views,visible,archetypes.length?'archetype':'deck')};
}
async function compare(name,{who=OWNER,all=false,environment=ENV,mode='direct',filters={},legacy=false}={}){
  await identity(who);const [decks,active]=await Promise.all([getDecks(),getActiveArchetypes()]);const archetypes=legacy?[]:active;
  const options={deckIdField:archetypes.length?'archetype':'deck',includeAllUsers:all,...filters};
  const sourceOptions=mode==='direct'?options:{deckIdField:options.deckIdField,includeAllUsers:all,playedAtFrom:options.playedAtFrom,playedAtTo:options.playedAtTo};
  counters={matches:0,rpc:0};const records=await getMatches(environment,sourceOptions),oldCalls=counters.matches;
  const views=filterAnalysisPerspectives(analysisPerspectives(records,mode),options);
  const aggregates=await getAnalysisAggregates(environment,mode,options,(archetypes.length?archetypes:decks).map(d=>d.id)),final=buildAnalysisFromAggregates(aggregates,decks,archetypes);
  assert.deepEqual(final,oracle(views,decks,archetypes),name+': all final props, stable ordering, rates, index, cards and recent results');
  assert.equal(counters.matches,oldCalls);assert.equal(counters.rpc,who?1:0);
  for(const recent of aggregates.recent){
    const expected=views.filter(v=>(options.deckIdField==='archetype'?v.my_archetype_id??v.my_deck_id:v.my_deck_id)===recent.deckId).slice(0,10);
    assert.deepEqual(recent.views.map(v=>[v.id,v.source,v.result,v.turnOrder]),expected.map(v=>[v.id,v.source,v.result,v.turn_order]),name+': recent identity/order');
  }
  const result={name,sourceRecords:records.length,oldViews:records.length*(mode==='combined'?2:1),filteredViews:views.length,registered:final.registeredMatches,
    oldApiCalls:oldCalls,newApiCalls:counters.rpc,groups:aggregates.groups.length,recentViews:aggregates.recent.reduce((n,r)=>n+r.views.length,0),
    oldJsonBytes:Buffer.byteLength(JSON.stringify(records)),rpcJsonBytes:Buffer.byteLength(JSON.stringify(aggregates)),equal:true};
  evidence.cases.push(result);return {result,aggregates,final};
}
function normalizeElement(value){
  if(Array.isArray(value))return value.map(normalizeElement);
  if(value&&typeof value==='object'){
    if(value.$$typeof)return {type:typeof value.type==='function'?value.type.name:String(value.type),key:value.key,props:normalizeElement(value.props)};
    return Object.fromEntries(Object.entries(value).map(([k,v])=>[k,normalizeElement(v)]));
  }return value;
}
async function comparePage(name,params,who=OWNER){await identity(who);
  const before=normalizeElement(await baselinePage({searchParams:Promise.resolve(params)}));
  const after=normalizeElement(await newPage({searchParams:Promise.resolve(params)}));assert.deepEqual(after,before,name+': actual full page element tree and all props');evidence.pages.push({name,equal:true});}

test('boundaries, both modes, final UI data and real execution plans at 10k/100k',async()=>{
  for(const size of [0,1,999,1000,1001,10000,100000]){
    await seed(Array.from({length:size},(_,i)=>fixture({result:i%3?'win':'lose',turn_order:i%2?'first':'second'})));
    for(const mode of ['direct','combined']){
      const {result}=await compare(`boundary-${size}-${mode}`,{mode});
      if(size>=10000){await db.exec('reset role;analyze public.matches');await identity();const args=[ENV,false,mode==='combined',true,null,null,null,null,null,null,[A,B,C]],times=[];
        for(let i=0;i<3;i++){const start=performance.now();await db.query(callSql,args);times.push(performance.now()-start);}
        let body=migration.split('as $$')[1].split('$$;')[0];argNames.forEach((n,i)=>{body=body.replaceAll(n,`$${i+1}::${argTypes[i]}`);});
        const plan=(await db.query('explain (analyze,buffers,format json) '+body,args)).rows[0]['QUERY PLAN'];evidence.performance.push({...result,rpcWallTimeMs:times,plan});
      }
    }
  }
});
test('win/lose and turn extremes, mirrors and double registrations',async()=>{
  for(const result of ['win','lose'])for(const turn_order of ['first','second']){
    await seed(Array.from({length:21},()=>fixture({result,turn_order})));
    for(const mode of ['direct','combined'])await compare(`${result}-${turn_order}-${mode}`,{mode});
  }
  await seed([fixture(),fixture({my_archetype_id:B,opponent_archetype_id:A,result:'lose',turn_order:'second',user_id:OTHER}),fixture({opponent_archetype_id:A})]);
  const {final}=await compare('double-registration-mirror',{mode:'combined',who:ADMIN,all:true});assert.equal(final.registeredMatches,3);assert.equal(final.perspectives,6);
});
test('directional predicates after reversal including reverse-only wins/turns and raw-ID filters',async()=>{
  await seed([fixture(),fixture({my_archetype_id:B,opponent_archetype_id:A,result:'lose',turn_order:'second'}),fixture({my_archetype_id:null}),fixture({opponent_archetype_id:null})]);
  for(const mode of ['direct','combined'])for(const myDeckId of [undefined,A,B])for(const result of [undefined,'win','lose'])for(const turnOrder of [undefined,'first','second']){
    await compare(`directions-${mode}-${myDeckId}-${result}-${turnOrder}`,{mode,filters:{myDeckId,result,turnOrder}});
  }
  for(const mode of ['direct','combined'])for(const opponentDeckId of [A,B])await compare(`opponent-${mode}-${opponentDeckId}`,{mode,filters:{opponentDeckId}});
  await seed([fixture()]);
  const direct=await compare('direct-no-match',{filters:{myDeckId:B,opponentDeckId:A,result:'lose',turnOrder:'second'}});
  const reversed=await compare('reverse-only-match',{mode:'combined',filters:{myDeckId:B,opponentDeckId:A,result:'lose',turnOrder:'second'}});
  assert.equal(direct.final.registeredMatches,0);assert.equal(reversed.final.registeredMatches,1);assert.equal(reversed.final.perspectives,1);
  await seed([fixture({my_archetype_id:null,opponent_archetype_id:null})]);
  assert.equal((await compare('archetype-filter-does-not-fallback',{filters:{myDeckId:LA}})).final.perspectives,0);
  assert.equal((await compare('legacy-filter',{legacy:true,filters:{myDeckId:LA}})).final.perspectives,1);
});
test('IDs, hidden masters, same names, legacy card contract, unknown and fault NULL IDs',async()=>{
  await seed([fixture(),fixture({my_archetype_id:B}),fixture({my_archetype_id:INACTIVE}),fixture({my_archetype_id:REMOVED}),
    fixture({my_archetype_id:null,my_deck_id:UNKNOWN}),fixture({my_archetype_id:null,opponent_archetype_id:null})]);
  for(const mode of ['direct','combined'])for(const legacy of [false,true])await compare(`ids-${mode}-${legacy}`,{mode,legacy});
  await db.exec('reset role;begin;alter table public.matches alter column my_deck_id drop not null;alter table public.matches alter column opponent_deck_id drop not null');
  try{await seed([fixture({my_archetype_id:null,my_deck_id:null,opponent_archetype_id:null,opponent_deck_id:null})]);await compare('all-null-fault',{mode:'combined'});}
  finally{await db.exec('reset role;rollback');}
});
test('stable ties, microseconds, newest IDs, mirror direct-before-reversed and recent 10 boundary',async()=>{
  const records=Array.from({length:24},(_,i)=>fixture({my_archetype_id:i%2?A:B,opponent_archetype_id:i%3?C:A,result:i%2?'win':'lose',played_at:`2026-09-20T00:00:00.${i%2?'123456':'123457'}Z`}));
  records.push(fixture({my_archetype_id:A,opponent_archetype_id:A,played_at:'2026-09-21T00:00:00Z'}));await seed(records);
  for(const mode of ['direct','combined'])await compare('recent-order-'+mode,{mode});
  await seed(Array.from({length:30},(_,i)=>fixture({opponent_archetype_id:[B,C,A][i%3],result:i%2?'win':'lose'})));
  for(const mode of ['direct','combined'])await compare('good-bad-ties-'+mode,{mode});
});
test('inclusive JST bounds, reversed-only date conditions and different/null environments',async()=>{
  const from='2026-09-19T15:00:00.000Z',to='2026-09-20T14:59:59.999Z';
  await seed(['2026-09-19T14:59:59.999999Z',from,to,'2026-09-20T14:59:59.999001Z'].map(played_at=>fixture({played_at})).concat([fixture({environment_id:ENV2}),fixture({environment_id:null})]));
  for(const mode of ['direct','combined']){
    const r=await compare('inclusive-jst-'+mode,{mode,filters:{playedAtFrom:from,playedAtTo:to}});assert.equal(r.final.registeredMatches,2);
    await compare('from-only-'+mode,{mode,filters:{playedAtFrom:from}});await compare('to-only-'+mode,{mode,filters:{playedAtTo:to}});
    await compare('inverted-dates-'+mode,{mode,filters:{playedAtFrom:to,playedAtTo:from}});
    await compare('null-environment-included-'+mode,{mode,environment:''});await compare('other-environment-'+mode,{mode,environment:ENV2});
  }
});
test('actual full page props/markup match baseline including parameter normalization and default scope/mode',async()=>{
  await seed(Array.from({length:30},(_,i)=>fixture({user_id:i%3?OWNER:ADMIN,my_archetype_id:i%2?A:B,opponent_archetype_id:i%3?B:A,result:i%2?'win':'lose'})));
  for(const [name,params,who] of [
    ['default',{},OWNER],['admin-default',{},ADMIN],['admin-all-default',{scope:'all'},ADMIN],['admin-all-direct',{scope:'all',winRateMode:'direct'},ADMIN],
    ['member-forged-all',{scope:'all'},OWNER],['member-combined',{winRateMode:'combined'},OWNER],['invalid-params',{environment:'invalid',myDeck:'unknown',opponentDeck:'unknown',result:'invalid',turnOrder:'invalid',playedFrom:'invalid',playedTo:'invalid',winRateMode:'invalid'},OWNER],
    ['dates',{playedFrom:'2026-09-20T00:00',playedTo:'2026-09-20T23:59'},OWNER],['direction',{winRateMode:'combined',myDeck:B,opponentDeck:A,result:'lose',turnOrder:'second'},OWNER],['zero',{environment:ENV2},OWNER],['anonymous',{},null]
  ])await comparePage(name,params,who);
  await db.exec('reset role;begin;update public.deck_archetypes set is_active=false');
  try{await comparePage('no-active-archetypes-legacy-fallback',{myDeck:LA},OWNER);}
  finally{await db.exec('reset role;rollback');}
  await db.exec('reset role;begin;truncate public.matches;delete from public.environments');
  try{await comparePage('no-environments',{},OWNER);}finally{await db.exec('reset role;rollback');}
});
test('real RLS, grants, no identity, forged all scope, admin revocation and stricter policy',async()=>{
  await seed([fixture(),fixture({user_id:OTHER}),fixture({user_id:ADMIN})]);
  for(const mode of ['direct','combined'])for(const [name,who,all,n]of [['mine',OWNER,false,1],['member-all',OWNER,true,1],['other',OTHER,false,1],['admin-mine',ADMIN,false,1],['admin-all',ADMIN,true,3]])assert.equal((await compare(`${name}-${mode}`,{mode,who,all})).final.registeredMatches,n);
  await identity(null,'anon');await assert.rejects(()=>db.query('select public.get_analysis_aggregates_v1()'),e=>e.code==='42501');
  await identity(null);assert.deepEqual((await db.query('select public.get_analysis_aggregates_v1(null,true,true) as data')).rows[0].data,emptyAnalysisAggregates());
  await identity();await assert.rejects(()=>db.query('select public.get_analysis_aggregates_v1(p_user_id => $1::uuid)',[OTHER]),e=>e.code==='42883');
  await db.exec('reset role;begin;delete from public.admin_users');try{assert.equal((await compare('revoked-admin',{who:ADMIN,all:true,mode:'combined'})).final.registeredMatches,1);}finally{await db.exec('reset role;rollback');}
  await db.exec('reset role;begin;drop policy matches_select_own_or_admin on public.matches;create policy fixture_own on public.matches for select to authenticated using(auth.uid()=user_id)');
  try{assert.equal((await compare('stricter-rls',{who:ADMIN,all:true,mode:'combined'})).final.registeredMatches,1);}finally{await db.exec('reset role;rollback');}
  const fn=(await db.query('select prosecdef,provolatile,proconfig,proargnames from pg_proc where oid=$1::regprocedure',[signature])).rows[0];
  assert.equal(fn.prosecdef,false);assert.equal(fn.provolatile,'s');assert.ok(fn.proconfig.includes('search_path=""'));assert.deepEqual(fn.proargnames,argNames);
  const grants=(await db.query("select has_function_privilege('anon',$1,'execute') as anon,has_function_privilege('authenticated',$1,'execute') as authenticated",[signature])).rows[0];assert.deepEqual(grants,{anon:false,authenticated:true});evidence.permissions={...fn,...grants};
});
test('more than 1000 groups survive the single JSON RPC result; Phase 2-A SQL unchanged',async()=>{
  await db.exec('reset role');const ids=Array.from({length:40},(_,i)=>uuid(300+i));for(const id of ids)await db.query('insert into public.deck_archetypes(id,name,class_name) values($1,$2,$3)',[id,id,'エルフ']);
  await seed(ids.flatMap(my=>ids.map(opponent=>fixture({my_archetype_id:my,opponent_archetype_id:opponent}))));
  assert.equal((await compare('1600-groups')).aggregates.groups.length,1600);await compare('3200-direction-turn-groups',{mode:'combined'});
  const matrix=(await db.query('select public.get_matchup_aggregates_v1($1,false) as data',[ENV])).rows[0].data;assert.equal(matrix.totalMatches,1600);assert.equal(matrix.groups.length,1600);
});
test('actual missing function and permission failures never become a normal zero',async()=>{
  await seed([fixture()]);
  for(const [sql,kind]of [
    [`revoke execute on function ${signature} from authenticated`,'permission'],
    ['revoke select on public.matches from authenticated','permission'],
    [`alter function ${signature} rename to fixture_temporarily_missing_analysis`,'missing_rpc']
  ]){
    await db.exec('reset role;begin;'+sql);
    try{await identity();await assert.rejects(()=>getAnalysisAggregates(ENV,'direct',{},[A,B]),e=>e.kind===kind);}
    finally{await db.exec('rollback;reset role');}
  }
});
