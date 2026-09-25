/* eslint-disable @typescript-eslint/no-require-imports */
const {test}=require('node:test'),assert=require('node:assert/strict');
let response,thrown,calls=[];
const server=require.resolve('../src/lib/supabase/server');
require.cache[server]={id:server,filename:server,loaded:true,exports:{createSupabaseServerClient:async()=>({rpc:async(name,args)=>{calls.push({name,args});if(thrown)throw thrown;return response;}})}};
const {getPeriodReportAggregates}=require('../src/lib/period-report-data');
const {buildWeeklyPeriod,getPreviousWeeklyReportPeriod}=require('../src/lib/weekly-report');
test('one RPC exact inclusive bounds and distinct failures, never silently zero',async()=>{
  const p=buildWeeklyPeriod('2026-08-30','2026-09-03'),prev=getPreviousWeeklyReportPeriod(p);
  response={data:{version:1,current:{totalMatches:0,groups:[]},previous:{totalMatches:0,groups:[]}},error:null};
  assert.equal((await getPeriodReportAggregates(p,prev)).current.totalMatches,0);
  assert.deepEqual(calls,[{name:'get_period_report_aggregates_v1',args:{p_current_start:p.startIso,p_current_end:p.endIso,p_previous_start:prev.startIso,p_previous_end:prev.endIso}}]);
  for(const [code,kind]of [['PGRST202','missing_rpc'],['42883','missing_rpc'],['42501','permission'],['PGRST301','permission'],['57014','database']]){
    response={data:null,error:{code}};await assert.rejects(()=>getPeriodReportAggregates(p,prev),e=>e.kind===kind);
  }
  response={data:{version:1},error:null};await assert.rejects(()=>getPeriodReportAggregates(p,prev),e=>e.kind==='invalid_json');
  thrown=new Error('transport');await assert.rejects(()=>getPeriodReportAggregates(p,prev),e=>e.kind==='database');
});
