/* eslint-disable @typescript-eslint/no-require-imports */
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {AnalysisDataError,emptyAnalysisAggregates,parseAnalysisAggregates,buildAnalysisFromAggregates}=require('../src/lib/analysis-aggregates');
const valid=()=>({version:1,registeredMatches:1,perspectives:1,totalWins:1,
  groups:[{myDeckId:'A',opponentDeckId:'B',cardMyDeckId:'A',cardOpponentDeckId:'B',turnOrder:'first',total:1,wins:1,firstOrder:1}],
  recent:[{deckId:'A',views:[{id:'match',playedAt:'2026-09-20T00:00:00.123456Z',source:'direct',result:'win',turnOrder:'first',order:1}]}]});
test('zero is explicit and valid, names and old matrix presentation remain TypeScript',()=>{
  assert.deepEqual(parseAnalysisAggregates(emptyAnalysisAggregates()),emptyAnalysisAggregates());
  const decks=[{id:'A',name:'A',class_name:'elf'},{id:'B',name:'B',class_name:'royal'}];
  const zero=buildAnalysisFromAggregates(emptyAnalysisAggregates(),decks,[]);
  assert.equal(zero.winRate,null);assert.deepEqual(zero.byTurn,[]);assert.equal(zero.summaries[0].isLowSample,false);
  const one=buildAnalysisFromAggregates(parseAnalysisAggregates(valid()),decks,[]);
  assert.equal(one.winRate,100);assert.equal(one.matrix[0].cells[1].environmentIndex,2.5);
  assert.equal(one.summaries[0].firstWinRate,100);assert.equal(one.summaries[0].secondWinRate,null);
});
test('malformed, truncated, duplicate, unordered, inconsistent and unsafe responses fail closed',()=>{
  const faults=[v=>{v.version=2;},v=>{v.perspectives=Number.MAX_SAFE_INTEGER+1;},v=>{v.registeredMatches=0;},v=>{v.totalWins=0;},
    v=>{v.groups=[];},v=>{v.groups[0].total=-1;},v=>{v.groups[0].wins=2;},v=>{v.groups[0].myDeckId=5;},v=>{v.groups[0].turnOrder='invalid';},
    v=>{v.groups[0].firstOrder=0;},v=>{v.groups.push({...v.groups[0]});},v=>{v.recent=[];},v=>{v.recent.push(v.recent[0]);},
    v=>{v.recent[0].deckId='other';},v=>{v.recent[0].views=[];},v=>{v.recent[0].views[0].order=2;},v=>{v.recent[0].views[0].source='bad';},
    v=>{v.recent[0].views[0].playedAt='bad';},v=>{v.recent[0].views[0].result='lose';},v=>{v.groups[0].wins=0.5;},
    v=>{v.groups[0].cardMyDeckId='';},v=>{v.recent[0].views[0].id='';}];
  for(const mutate of faults){const v=valid();mutate(v);assert.throws(()=>parseAnalysisAggregates(v),e=>e instanceof AnalysisDataError&&e.kind==='invalid_response');}
  for(const value of [null,undefined,[],{},'zero',{...valid(),groups:null},{...valid(),recent:null}])assert.throws(()=>parseAnalysisAggregates(value),AnalysisDataError);
});
test('only requested visible decks need recent views; hidden counts remain intact',()=>{
  const hidden={...valid(),recent:[]};
  assert.deepEqual(parseAnalysisAggregates(hidden,[]),hidden);
  assert.throws(()=>parseAnalysisAggregates(hidden,['A']),AnalysisDataError);
  assert.throws(()=>parseAnalysisAggregates(valid(),[]),AnalysisDataError);
  assert.deepEqual(parseAnalysisAggregates(valid(),['A','B']),valid());
});
let user={id:'owner'},response={data:valid(),error:null},throws=false,calls=[];
const mock=(file,exports)=>{const filename=require.resolve(file);require.cache[filename]={id:filename,filename,loaded:true,exports};};
mock('../src/lib/data',{getCurrentUser:async()=>user});
mock('../src/lib/supabase/server',{createSupabaseServerClient:async()=>({rpc:async(name,args)=>{calls.push({name,args});if(throws)throw new Error('offline');return response;},from:()=>{throw new Error('Raw table fallback forbidden');}})});
const {getAnalysisAggregates}=require('../src/lib/analysis-data');
test('one RPC forwards scope/mode/raw filters/JST bounds; anonymous performs no RPC',async()=>{
  calls=[];response={data:valid(),error:null};
  await getAnalysisAggregates('environment','combined',{deckIdField:'archetype',includeAllUsers:true,myDeckId:'A',opponentDeckId:'B',result:'win',turnOrder:'first',playedAtFrom:'2026-09-19T15:00:00.000Z',playedAtTo:'2026-09-20T14:59:59.999Z'});
  assert.deepEqual(calls,[{name:'get_analysis_aggregates_v1',args:{p_environment_id:'environment',p_include_all_users:true,p_include_reversed:true,p_use_archetype:true,p_my_deck_id:'A',p_opponent_deck_id:'B',p_result:'win',p_turn_order:'first',p_played_from:'2026-09-19T15:00:00.000Z',p_played_to:'2026-09-20T14:59:59.999Z',p_recent_deck_ids:null}}]);
  user=null;assert.deepEqual(await getAnalysisAggregates('','direct',{}),emptyAnalysisAggregates());assert.equal(calls.length,1);user={id:'owner'};
});
test('missing RPC, DB, permission, transport and invalid responses differ from normal zero',async()=>{
  for(const [code,kind]of [['PGRST202','missing_rpc'],['42883','missing_rpc'],['42501','permission'],['PGRST301','permission'],['XX000','database']]){
    response={data:null,error:{code}};await assert.rejects(()=>getAnalysisAggregates('','direct',{}),e=>e.kind===kind&&e.code===code);
  }
  throws=true;await assert.rejects(()=>getAnalysisAggregates('','direct',{}),e=>e.kind==='transport');throws=false;
  response={data:null,error:null};await assert.rejects(()=>getAnalysisAggregates('','direct',{}),e=>e.kind==='invalid_response');
  response={data:valid(),error:null};response.data.recent[0].views[0].source='reversed';await assert.rejects(()=>getAnalysisAggregates('','direct',{}),e=>e.kind==='invalid_response');
  response={data:emptyAnalysisAggregates(),error:null};assert.deepEqual(await getAnalysisAggregates('','direct',{}),emptyAnalysisAggregates());
});
