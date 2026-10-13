/* eslint-disable @typescript-eslint/no-require-imports */
const {test}=require('node:test'),assert=require('node:assert/strict');

const fs=require('node:fs'),read=p=>fs.readFileSync(p,'utf8');
const {setup,findElement}=require('./server-page-fixture.cjs');
const {state,pages}=setup();
test('Home and Matrix use aggregate RPCs; forged all-user scope stays private and rank filters survive',async()=>{
 for(const admin of [false,true])for(const [name,page]of Object.entries(pages)){
  state.admin=admin;state.calls.length=0;
  const tree=await page({searchParams:Promise.resolve({environment:'old',scope:'all',rank:'master:ruby'})});
  assert.equal(state.calls.length,1,name);const call=state.calls[0];
  assert.equal(call.args.p_environment_id,'old');
  if(name!=='home')assert.equal(call.args.p_include_all_users,admin,name);
  if(name==='matrix'){assert.equal(call.name,'get_matchup_aggregates_v2');assert.equal(call.args.p_rank_filter,'master:ruby');}
  if(name==='analysis'){
   const data=findElement(tree,'AnalysisDashboard').props.initialData;
   assert.equal(data.selectedScope,admin?'all':'mine');assert.deepEqual(data.selectedRanks,['master:ruby']);
  }
 }
 assert.ok(!state.reads.includes('matches'));
});
test('E audit adds a catalog-only SELECT, separate from migrations, without mutation or execution statements',()=>{
 const sql=read('supabase/checks/staging_schema_audit.sql').replace(/--[^\n]*/g,'');
 assert.match(sql,/^\s*with\b/i);
 assert.doesNotMatch(sql,/\b(insert|update|delete|truncate|alter|drop|create|grant|revoke|do|call|copy|set_config|dblink|pg_read_file)\b/i);
 assert.doesNotMatch(sql,/\bfrom\s+public\./i);
 assert.equal((sql.match(/;/g)||[]).length,1);
 assert.ok(!fs.existsSync('supabase/staging/prepare_rank_testing.sql'));
 assert.ok(!fs.existsSync('docs/staging-setup.md'));
});
