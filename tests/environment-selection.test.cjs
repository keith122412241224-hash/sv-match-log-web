/* eslint-disable @typescript-eslint/no-require-imports */
const {test}=require('node:test'),assert=require('node:assert/strict');
const {selectInitialEnvironmentId:select}=require('../src/lib/environment-selection');
const boundary=Date.parse('2026-09-29T17:00:00+09:00');
const old={id:'old',name:'アズヴォルト・レヴナント（2026/8/27～）',created_at:'2026-08-26',allow_match_input:true,match_input_start_at:null,match_input_end_at:new Date(boundary).toISOString()};
const next={...old,id:'new',name:'アズヴォルト・レヴナント（9/29能力調整後～）',created_at:'2026-09-28',match_input_start_at:new Date(boundary).toISOString(),match_input_end_at:null};
for(const delta of [-1,0,1])test(`initial selection at 9/29 17:00 JST ${delta}ms; explicit history/future preserved`,()=>{
 assert.equal(select([next,old],undefined,boundary+delta),delta<0?'old':'new');
 for(const id of ['old','new'])assert.equal(select([next,old],id,boundary+delta),id);
});
test('multiple open environments use existing creation order/tie behavior without mutating input',()=>{
 const rows=[{...old,match_input_end_at:null},{...next,match_input_start_at:null},{...next,id:'tie',match_input_start_at:null}];
 const before=JSON.stringify(rows);assert.equal(select(rows,undefined,boundary),'new');assert.equal(JSON.stringify(rows),before);
 assert.equal(select([rows[2],rows[1],rows[0]],undefined,boundary),'tie');
});
test('manual stop, no open environments, empty environments and invalid query have safe defaults',()=>{
 assert.equal(select([{...next,allow_match_input:false},{...old,match_input_end_at:null}],undefined,boundary),'old');
 const closed=[{...old,allow_match_input:false},{...next,allow_match_input:false}];assert.equal(select(closed,undefined,boundary),'new');
 assert.equal(select([],undefined,boundary),'');assert.equal(select([],'missing',boundary),'');
 for(const id of ['',undefined,'missing'])assert.equal(select([next,old],id,boundary-1),'old');
 assert.equal(select([next],undefined,boundary-1),'new');
});

test('all three actual pages honor explicit closed history and select an open default without raw match reads',async t=>{
 const {setup}=require('./server-page-fixture.cjs'),{state,pages}=setup();
 t.mock.method(Date,'now',()=>boundary);
 state.environments[0].allow_match_input=false;
 state.environments[1].match_input_end_at=null;
 for(const [name,page] of Object.entries(pages))for(const [params,expected] of [[{},'old'],[{environment:'new'},'new'],[{environment:'missing'},'old']]){
  state.calls.length=0;const result=await page({searchParams:Promise.resolve(params)});
  if(name==='matrix' && params.environment==='missing'){
   assert.equal(state.calls.length,0);assert.equal(result.props.children.props.role,'alert');assert.equal(result.props.children.props.children,'環境の指定が不正です。');
  }else{assert.equal(state.calls.length,1);assert.equal(state.calls[0].args.p_environment_id,expected);}
 }
 assert.ok(!state.reads.includes('matches'));
});
