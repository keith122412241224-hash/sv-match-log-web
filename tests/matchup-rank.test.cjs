/* eslint-disable @typescript-eslint/no-require-imports */
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const {ANALYSIS_RANK_FILTERS}=require('../src/lib/analysis-rank-filter');
const mock=(p,exports)=>{const id=require.resolve(p);require.cache[id]={id,filename:id,loaded:true,exports};};
let user={id:'owner'},calls=[],error=null,data={version:1,totalMatches:0,groups:[]};
mock('../src/lib/data',{getCurrentUser:async()=>user});
mock('../src/lib/supabase/server',{createSupabaseServerClient:async()=>({rpc:async(name,args)=>{calls.push({name,args});return{data,error};}})});
const {getMatchupAggregates}=require('../src/lib/matchup-data');
test('matrix all retains v1; each R3-A rank option makes exactly one v2 request with the same scope/environment',async()=>{
 for(const all of [false,true])for(const {value}of ANALYSIS_RANK_FILTERS){calls=[];await getMatchupAggregates('env',all,value);assert.deepEqual(calls,[{name:value==='all'?'get_matchup_aggregates_v1':'get_matchup_aggregates_v2',args:{...(value==='all'?{}:{p_rank_filter:value}),p_environment_id:'env',p_include_all_users:all}}]);}
 calls=[];await getMatchupAggregates();assert.equal(calls[0].name,'get_matchup_aggregates_v1');assert.equal(calls[0].args.p_environment_id,null);
});
test('matrix invalid filter, missing/denied RPC and corrupt totals never silently fall back or become zero',async()=>{
 calls=[];await assert.rejects(()=>getMatchupAggregates('',true,'none'));assert.equal(calls.length,0);
 for(const code of ['PGRST202','42501','22023']){error={code};calls=[];await assert.rejects(()=>getMatchupAggregates('',true,'grandmaster:none'));assert.equal(calls.length,1);assert.equal(calls[0].name,'get_matchup_aggregates_v2');}error=null;
 data={version:1,totalMatches:1,groups:[]};await assert.rejects(()=>getMatchupAggregates('',false,'master'));data={version:1,totalMatches:0,groups:[]};
});

test('anonymous Matrix requests never issue an aggregate RPC for any scope or rank',async()=>{
 user=null;
 try{for(const all of [false,true])for(const {value}of ANALYSIS_RANK_FILTERS){
  calls=[];assert.deepEqual(await getMatchupAggregates('env',all,value),{version:1,totalMatches:0,groups:[]});assert.deepEqual(calls,[]);
 }}finally{user={id:'owner'};}
 const sql=fs.readFileSync('supabase/legacy-migrations/pre-baseline/017_matchup_rank_aggregates_v2.sql','utf8').replace(/--[^\n]*/g,'');assert.equal((sql.match(/create or replace function/g)||[]).length,1);assert.doesNotMatch(sql,/\b(alter|drop|insert|update|delete|truncate|trigger|index|policy)\b/i);
});
