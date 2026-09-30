/* eslint-disable @typescript-eslint/no-require-imports */
const {test}=require('node:test'),assert=require('node:assert/strict');
const r=require('../src/lib/rank-selection'),{emptyAnalysisAggregates}=require('../src/lib/analysis-aggregates');
let calls=[],user={id:'owner',is_anonymous:false},fail=false;
const mock=(p,value)=>{const id=require.resolve(p);require.cache[id]={id,filename:id,loaded:true,exports:value};};
mock('../src/lib/data',{getCurrentUser:async()=>user});
mock('../src/lib/supabase/server',{createSupabaseServerClient:async()=>({rpc:async(name,args)=>{calls.push({name,args});if(fail)return {error:{code:'42501'}};return {data:emptyAnalysisAggregates()};}})});
const {getAnalysisAggregates}=require('../src/lib/analysis-data');
mock('../src/lib/environment-dashboard-data',{getEnvironmentDashboard:async selection=>{calls.push(selection);if(fail)throw Error('PRIVATE');return {ranks:selection.ranks};}});
const {GET}=require('../src/app/api/environment/route');
const env='e1000000-0000-4000-8000-000000000200';
test('analysis v3 canonical atomic input, one RPC, other arguments preserved and no fallback',async()=>{
 calls=[];await getAnalysisAggregates(env,'combined',{deckIdField:'archetype',includeAllUsers:true,myDeckId:'my',opponentDeckId:'op',result:'lose',turnOrder:'second',playedAtFrom:'from',playedAtTo:'to'},['deck'],['grandmaster:none','master:diamond','master:diamond']);
 assert.deepEqual(calls,[{name:'get_analysis_aggregates_v3',args:{p_environment_id:env,p_include_all_users:true,p_include_reversed:true,p_use_archetype:true,p_my_deck_id:'my',p_opponent_deck_id:'op',p_result:'lose',p_turn_order:'second',p_played_from:'from',p_played_to:'to',p_recent_deck_ids:['deck'],p_rank_filters:['master:diamond','grandmaster:none']}}]);
 for(const bad of [[],['master-plus'],[null],Array(18).fill('a')]){calls=[];await assert.rejects(()=>getAnalysisAggregates(env,'direct',{},[],bad));assert.equal(calls.length,0);}
 fail=true;calls=[];await assert.rejects(()=>getAnalysisAggregates(env,'direct',{},[],['unranked']));assert.equal(calls.length,1);fail=false;
});
test('environment API normalizes once; invalid requests never reach RPC',async()=>{
 const query=value=>'http://localhost/api/environment?'+new URLSearchParams({environment:env,period:'7d',ranks:value});
 calls=[];const ok=await GET(new Request(query('grandmaster:epic,master:diamond,master:diamond')));assert.equal(ok.status,200);assert.deepEqual(calls,[{environment:env,period:'7d',ranks:['master:diamond','grandmaster:epic']}]);assert.equal(ok.headers.get('cache-control'),'private, no-store');assert.equal(ok.headers.get('vary'),'Cookie');
 for(const bad of ['', 'all','master-plus','master','Master:sapphire','unknown','null',Array(18).fill('a').join(',')]){calls=[];assert.equal((await GET(new Request(query(bad)))).status,400);assert.equal(calls.length,0);}
 for(const extra of ['&rank=all','&ranks=a','&user_id=secret']){calls=[];assert.equal((await GET(new Request(query('a')+extra))).status,400);assert.equal(calls.length,0);}
 for(const who of [null,{is_anonymous:true},{}]){user=who;calls=[];assert.equal((await GET(new Request(query('a')))).status,401);assert.equal(calls.length,0);}user={is_anonymous:false};
 fail=true;calls=[];const response=await GET(new Request(query(r.serializeRankSelection(r.RANK_ATOMS))));assert.equal(response.status,503);assert.equal(calls.length,1);assert.ok(!(await response.text()).includes('PRIVATE'));fail=false;
});
