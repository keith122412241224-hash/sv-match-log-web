/* eslint-disable @typescript-eslint/no-require-imports */
const { test } = require('node:test'), assert = require('node:assert/strict'), fs = require('node:fs');
const h = require('./member-matrix-db.cjs');
const { RANK_ATOMS, RANK_PRESETS, expandLegacyRankFilter } = require('../src/lib/rank-selection');
const { ANALYSIS_RANK_FILTERS } = require('../src/lib/analysis-rank-filter');
const { buildWinRateMatrix } = require('../src/lib/analytics');
const { buildWinRateMatrixFromAggregates, parseMatchupAggregates } = require('../src/lib/matchup-aggregates');
const out = 'build/member-matrix';
const save = (name, data) => { fs.mkdirSync(out, { recursive: true }); fs.writeFileSync(out + '/' + name + '.json', JSON.stringify(data, null, 2)); };
const canonical = p => ({ totalMatches: p.totalMatches, groups: p.groups.toSorted((a,b) => JSON.stringify([a.myDeckId,a.opponentDeckId]).localeCompare(JSON.stringify([b.myDeckId,b.opponentDeckId]))) });
const call = (db,ranks=RANK_ATOMS,env=h.NEW) => h.rpc(db,'get_member_matchup_aggregates_v1',{p_environment_id:env,p_rank_filters:ranks});
let db, who = { id:h.MEMBER, is_anonymous:false }, calls = [];
const mock = (p,exports) => { const id=require.resolve(p);require.cache[id]={id,filename:id,loaded:true,exports}; };
mock('../src/lib/data',{getCurrentUser:async()=>who});
mock('../src/lib/supabase/server',{createSupabaseServerClient:async()=>({rpc:async(name,args)=>{
  calls.push({name,args});try{return {data:await h.rpc(db,name,args),error:null};}catch(error){return {data:null,error};}
}})});
const { getMemberMatchupAggregates, getMatchupAggregates } = require('../src/lib/matchup-data');

test('member matrix: exact legacy/admin parity and actual member loader for every atom, presets, mixed ranks, empty and legacy IDs', {timeout:180000}, async t=>{
  db=await h.createDb();t.after(()=>db.close());const rows=h.fixture();await h.seed(db,rows);
  const visible=[...h.decks,...[300,301].map(n=>({id:h.uuid(n),name:'同名の旧デッキ',class_name:'エルフ'}))];
  const selections=[RANK_ATOMS,...RANK_ATOMS.map(a=>[a]),...RANK_PRESETS.map(p=>p.ranks),['a','aa'],['master:ruby','master:sapphire'],['grandmaster:none','grandmaster:beyond'],['master:ruby','grandmaster:epic'],['unranked','a']];
  let comparisons=0,legacy=0;
  for(const env of [h.NEW,h.OLD,h.EMPTY]) for(const selection of selections){
    who={id:h.ADMIN,is_anonymous:false};await h.identity(db,who.id);
    const old=await getMatchupAggregates(env,true,selection);
    for(const id of [h.MEMBER,h.ADMIN]){
      who={id,is_anonymous:false};await h.identity(db,id);calls=[];
      const actual=await getMemberMatchupAggregates(env,selection);
      assert.equal(calls.length,1);assert.equal(calls[0].name,'get_member_matchup_aggregates_v1');
      assert.deepEqual(canonical(actual),canonical(old));
      const source=rows.filter(r=>r.environment_id===env&&selection.includes(h.atom(r)));
      assert.equal(actual.totalMatches,source.length);
      assert.deepEqual(buildWinRateMatrixFromAggregates(actual,visible,visible),buildWinRateMatrix(source,visible,visible));
      comparisons++;
    }
  }
  await h.identity(db,h.ADMIN);
  for(const {value} of ANALYSIS_RANK_FILTERS){
    const old=await h.rpc(db,value==='all'?'get_matchup_aggregates_v1':'get_matchup_aggregates_v2',{p_environment_id:h.NEW,p_include_all_users:true,...(value==='all'?{}:{p_rank_filter:value})});
    assert.deepEqual(canonical(await call(db,expandLegacyRankFilter(value))),canonical(old));legacy++;
  }
  assert.deepEqual(await call(db,['a','a','aa']),await call(db,['aa','a']));
  // Exact sparse data is intentionally allowed; no threshold or reversal.
  await h.seed(db,[h.row({user_id:h.OTHER})]);await h.identity(db,h.MEMBER);
  const single=await call(db,['unranked']);assert.equal(single.totalMatches,1);assert.equal(single.groups.length,1);assert.equal(single.groups[0].wins,1);
  save('parity',{passed:true,comparisons,legacy,exactSparse:true});
});

test('member matrix: full migrations preserve existing policies, table grants, functions and source rows; direct RPC role boundaries', {timeout:180000}, async t=>{
  const {setup,ids}=require('./match-mutations-db.cjs');let before;
  const catalog=async database=>({
    policies:(await database.query("select * from pg_policies order by schemaname,tablename,policyname")).rows,
    tables:(await database.query("select n.nspname,c.relname,c.relacl::text,c.relrowsecurity,c.relforcerowsecurity from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname in ('public','private') and c.relkind='r' order by 1,2")).rows,
    functions:(await database.query("select n.nspname,p.proname,pg_get_functiondef(p.oid) def,p.proacl::text acl from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname in ('public','private') and p.proname<>'get_member_matchup_aggregates_v1' order by 1,2,p.oid")).rows
  });
  const setupResult=await setup({beforeMigration:async(database,file)=>{if(file===h.migration.split('/').at(-1))before=await catalog(database);},afterMigration:async(database,file)=>{
    if(file===h.migration.split('/').at(-1))assert.deepEqual(await catalog(database),before);
    if(file==='20261022050000_analysis_deck_sets.sql'){
      require('./analysis-deck-multi-scope.cjs').assertReviewed('supabase/migrations/'+file);
      const current=await catalog(database),added=current.functions.filter(f=>f.proname==='get_analysis_aggregates_v4');
      assert.equal(added.length,1);
      assert.deepEqual({...current,functions:current.functions.filter(f=>f.proname!=='get_analysis_aggregates_v4')},before,'later additive analysis RPC preserves every existing policy/grant/function');
      before=current;
    }
    if(file==='20261022101117_creator_independent_correlation.sql'){
      require('./creator-independent-scope.cjs').assertReviewed('supabase/migrations/'+file);
      const current=await catalog(database),newTables=current.tables.filter(t=>t.relname==='creator_obs_sets'),newPolicies=current.policies.filter(p=>p.tablename==='creator_obs_sets');
      assert.equal(newTables.length,1);assert.equal(newTables[0].relrowsecurity,true);assert.equal(newPolicies.length,1);
      assert.deepEqual({...current,tables:current.tables.filter(t=>t.relname!=='creator_obs_sets'),policies:current.policies.filter(p=>p.tablename!=='creator_obs_sets')},before,'Creator extension preserves every pre-existing policy/grant/function');
      before=current;
    }
  }});
  const database=setupResult.db;t.after(()=>database.close());assert.deepEqual(await catalog(database),before);
  const direct=(schema='public',ranks=RANK_ATOMS,env=ids.env)=>database.query(`select ${schema}.get_member_matchup_aggregates_v1($1::uuid,$2::text[]) as data`,[env,ranks]);
  const sourceBefore=(await database.query('select * from public.matches order by id')).rows;
  for(const id of [ids.a,ids.b]){
    await setupResult.claim(id);const p=(await direct()).rows[0].data;parseMatchupAggregates(p);assert.equal(p.totalMatches,2);
    assert.deepEqual(Object.keys(p).sort(),['groups','totalMatches','version']);
    for(const g of p.groups)assert.deepEqual(Object.keys(g).sort(),['myDeckId','opponentDeckId','total','wins']);
    for(const secret of [ids.a,ids.b,ids.match,ids.other,'@example.test','非公開B'])assert.ok(!JSON.stringify(p).includes(secret));
    assert.deepEqual((await direct('private')).rows[0].data,p);
    const raw=(await database.query('select user_id from public.matches')).rows;assert.equal(raw.length,id===ids.a?2:1);
    if(id===ids.b)assert.ok(raw.every(r=>r.user_id===id));
    for(const name of ['get_matchup_aggregates_v1','get_matchup_aggregates_v2','get_analysis_aggregates_v1','get_analysis_aggregates_v2','get_analysis_aggregates_v3']){
      const a=(await database.query(`select public.${name}(p_environment_id=>$1,p_include_all_users=>true) as data`,[ids.env])).rows[0].data;
      assert.equal(a.totalMatches??a.registeredMatches,id===ids.a?2:1,name);
    }
  }
  for(const claims of [{is_anonymous:true},{},{is_anonymous:null},{is_anonymous:'false'},{is_anonymous:0},{is_anonymous:true,user_metadata:{is_anonymous:false,admin:true}}]){
    await setupResult.claim(ids.b);await database.query("select set_config('request.jwt.claims',$1,false)",[JSON.stringify({sub:ids.b,...claims})]);
    for(const schema of ['public','private'])await assert.rejects(()=>direct(schema),e=>e.code==='42501');
    const own=(await database.query('select public.get_analysis_aggregates_v3(p_include_all_users=>true) as data')).rows[0].data;
    assert.equal(own.registeredMatches,1,'Guest/claim changes cannot open analysis');
  }
  await setupResult.claim(null);
  for(const schema of ['public','private'])await assert.rejects(()=>direct(schema),e=>e.code==='42501');
  await assert.rejects(()=>database.query('select public.get_analysis_aggregates_v3(p_include_all_users=>true)'),e=>e.code==='42501');
  // Missing subject fails even with an authenticated DB role and boolean false.
  await database.exec('reset role');await database.query("select set_config('request.jwt.claims',$1,false)",['{"is_anonymous":false}']);await database.exec('set role authenticated');
  await assert.rejects(()=>direct(),e=>e.code==='42501');
  await database.exec('reset role');
  const acl=(await database.query("select n.nspname,p.prosecdef,p.provolatile,p.proconfig,p.proowner::regrole::text owner,p.proacl::text acl,has_function_privilege('anon',p.oid,'execute') anon,has_function_privilege('authenticated',p.oid,'execute') member,has_function_privilege('service_role',p.oid,'execute') service from pg_proc p join pg_namespace n on n.oid=p.pronamespace where p.proname='get_member_matchup_aggregates_v1' order by 1")).rows;
  for(const entry of acl){assert.equal(entry.prosecdef,entry.nspname==='private');assert.equal(entry.provolatile,'s');assert.equal(entry.owner,'postgres');assert.deepEqual(entry.proconfig,['search_path=""']);assert.equal(entry.anon,false);assert.equal(entry.member,true);assert.equal(entry.service,false);assert.ok(!entry.acl.includes('{=')&&!entry.acl.includes(',='));}
  assert.deepEqual((await database.query('select * from public.matches order by id')).rows,sourceBefore);
  assert.deepEqual(await catalog(database),before);
  // Roll back only the additive endpoint, then verify an upgrade over existing rows.
  await database.exec('drop function public.get_member_matchup_aggregates_v1(uuid,text[]);drop function private.get_member_matchup_aggregates_v1(uuid,text[])');
  assert.equal((await database.query("select to_regprocedure('public.get_member_matchup_aggregates_v1(uuid,text[])') as endpoint")).rows[0].endpoint,null);
  assert.deepEqual(await catalog(database),before);
  await database.exec(h.read(h.migration));
  assert.deepEqual((await database.query('select * from public.matches order by id')).rows,sourceBefore);
  assert.deepEqual(await catalog(database),before);await setupResult.claim(ids.b);assert.equal((await direct()).rows[0].data.totalMatches,2);
  save('security',{passed:true,fullMigrationChain:true,acl,existingCatalogUnchanged:true,sourceRowsUnchanged:true,rollbackAndUpgradeVerified:true});
});

test('member matrix: strict inputs, duplicate rank deduplication and search_path cannot redirect definer reads',async t=>{
  const database=await h.createDb();t.after(()=>database.close());await h.seed(database,h.fixture());await h.identity(database,h.MEMBER);
  for(const ranks of [null,[],[null],['all'],['master'],['bad'],['a;select 1'],Array(18).fill('a'),[['a'],['aa']]])await assert.rejects(()=>call(database,ranks),e=>e.code==='22023');
  for(const env of [null,h.uuid(999999)])await assert.rejects(()=>call(database,['a'],env),e=>e.code==='22023');
  for(const env of ['', 'invalid', h.NEW+"';select 1"] )await assert.rejects(()=>call(database,['a'],env),e=>e.code==='22P02');
  const original=await call(database);
  await database.exec("create temp table matches(user_id uuid);set search_path=pg_temp,public");
  assert.deepEqual(await call(database),original);
  await assert.rejects(()=>database.exec('create or replace function auth.uid() returns uuid language sql as $$select null::uuid$$'),e=>e.code==='42501');
  await assert.rejects(()=>database.exec('create or replace function private.get_member_matchup_aggregates_v1(uuid,text[]) returns jsonb language sql as $$select null::jsonb$$'),e=>e.code==='42501');
});

test('member matrix: measured exact aggregation at scale and repeated requests without writes', {timeout:180000},async t=>{
  const database=await h.createDb();t.after(()=>database.close());const performanceRows=[];
  for(const size of [300,5000,50000]){
    const rows=Array.from({length:size},(_,i)=>h.row({...h.ranks[i%17],user_id:[h.MEMBER,h.OTHER,h.ADMIN][i%3],my_archetype_id:h.decks[i%5].id,opponent_archetype_id:h.decks[Math.floor(i/5)%5].id,result:i%3?'win':'lose'}));
    await h.seed(database,rows);
    for(const ranks of [RANK_ATOMS,['a'],['master:ruby','master:sapphire','grandmaster:epic']]){
      const times=[];let payload;await h.identity(database,h.MEMBER);
      for(let i=0;i<6;i++){const start=performance.now();payload=await call(database,ranks);if(i)times.push(performance.now()-start);}
      assert.equal(payload.totalMatches,rows.filter(r=>ranks.includes(h.atom(r))).length);
      const newPairs=canonical(payload);await h.identity(database,h.ADMIN);
      const start=performance.now(),old=await h.rpc(database,'get_analysis_aggregates_v3',{p_environment_id:h.NEW,p_include_all_users:true,p_include_reversed:false,p_recent_deck_ids:[],p_rank_filters:ranks});
      const oldMs=performance.now()-start;const pairs=new Map();for(const g of old.groups){const key=JSON.stringify([g.myDeckId,g.opponentDeckId]);const p=pairs.get(key)??{myDeckId:g.myDeckId,opponentDeckId:g.opponentDeckId,total:0,wins:0};p.total+=g.total;p.wins+=g.wins;pairs.set(key,p);}
      assert.deepEqual(newPairs,canonical({totalMatches:old.registeredMatches,groups:[...pairs.values()]}));
      performanceRows.push({size,ranks,newRpcMs:times,oldAnalysisRpcMs:oldMs,bytes:Buffer.byteLength(JSON.stringify(payload)),matches:payload.totalMatches});
    }
  }
  await h.identity(database,h.MEMBER);const start=performance.now();for(let i=0;i<20;i++)assert.equal((await call(database)).totalMatches,50000);
  const burstMs=performance.now()-start;
  await database.exec('reset role;analyze public.matches');
  const query=h.read(h.migration).split('    with grouped as (')[1].split('\n  );')[0];
  const plan=(await database.query('explain(analyze,buffers,format json) with grouped as ('+query.replaceAll('p_environment_id','$1::uuid').replaceAll('p_rank_filters','$2::text[]'),[h.NEW,RANK_ATOMS])).rows[0]['QUERY PLAN'];
  save('performance',{localOnly:true,engine:'PGlite WASM; not a hosted/concurrent load benchmark',performanceRows,burst:{requests:20,milliseconds:burstMs},plan});
});
