/* eslint-disable @typescript-eslint/no-require-imports */
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const {ANALYSIS_RANK_FILTERS}=require('../src/lib/analysis-rank-filter');
const {withPeriodReportRank,getPeriodReportRankLabel}=require('../src/lib/period-report-rank');
const {buildWeeklyReport,buildWeeklyPeriod,buildWeeklyReportPrompt}=require('../src/lib/weekly-report');
const calls=[];let data={version:1,current:{totalMatches:0,groups:[]},previous:{totalMatches:0,groups:[]}},error=null;
const id=require.resolve('../src/lib/supabase/server');require.cache[id]={id,filename:id,loaded:true,exports:{createSupabaseServerClient:async()=>({rpc:async(name,args)=>{calls.push({name,args});return{data,error};}})}};
const {getPeriodReportAggregates}=require('../src/lib/period-report-data');
test('R4 routes all to v1 and each selected rank to exactly one v2 with unchanged four bounds',async()=>{
 const p=buildWeeklyPeriod('2026-09-01','2026-09-07');for(const {value}of ANALYSIS_RANK_FILTERS){calls.length=0;await getPeriodReportAggregates(p,p,value);assert.deepEqual(calls,[{name:value==='all'?'get_period_report_aggregates_v1':'get_period_report_aggregates_v2',args:{...(value==='all'?{}:{p_rank_filter:value}),p_current_start:p.startIso,p_current_end:p.endIso,p_previous_start:p.startIso,p_previous_end:p.endIso}}]);}
 for(const value of [undefined,null,'']){calls.length=0;await getPeriodReportAggregates(p,p,value);assert.equal(calls[0].name,'get_period_report_aggregates_v1');}
});
test('R4 invalid filters/errors cannot silently expand to all, retry v1 or become zero',async()=>{
 const p=buildWeeklyPeriod('2026-09-01');calls.length=0;await assert.rejects(()=>getPeriodReportAggregates(p,p,'aa'));assert.equal(calls.length,0);
 for(const code of ['PGRST202','42883','42501','22023','XX000']){error={code};calls.length=0;await assert.rejects(()=>getPeriodReportAggregates(p,p,'master'));assert.equal(calls.length,1);assert.equal(calls[0].name,'get_period_report_aggregates_v2');}error=null;
 data={version:1};await assert.rejects(()=>getPeriodReportAggregates(p,p,'grandmaster:none'));
});
test('R4 all returns exact model identity; selected rank adds only AI population metadata and prompt JSON',()=>{
 const report=buildWeeklyReport([],[],[],buildWeeklyPeriod('2026-09-01'));for(const v of [undefined,null,'','all']){assert.equal(withPeriodReportRank(report,v),report);assert.equal(getPeriodReportRankLabel(v),undefined);}
 for(const option of ANALYSIS_RANK_FILTERS.filter(x=>x.value!=='all')){const out=withPeriodReportRank(report,option.value);assert.equal(out.aiJson.rankFilter.value,option.value);assert.equal(out.aiJson.rankFilter.label,option.label);assert.match(out.aiJson.rankFilter.description,/当期間・前期間/);const {rankFilter,...json}=out.aiJson;assert.deepEqual(json,report.aiJson);assert.deepEqual({...out,aiJson:report.aiJson,aiPrompt:report.aiPrompt},report);assert.equal(out.aiPrompt,buildWeeklyReportPrompt(out.aiJson));assert.ok(out.aiPrompt.includes(JSON.stringify(out.aiJson,null,2)));assert.ok(rankFilter.description.includes('反転時もランクは変換しません'));}
 assert.throws(()=>withPeriodReportRank(report,'none'));
});

test('environment-scoped period report preserves distinct JST bounds and rank, rejects invalid environment before RPC',async()=>{
 data={version:1,current:{totalMatches:0,groups:[]},previous:{totalMatches:0,groups:[]}};
 const current=buildWeeklyPeriod('2026-09-08','2026-09-14'),previous=buildWeeklyPeriod('2026-09-01','2026-09-07');
 const environment='00000000-0000-4000-8000-000000000010';
 for(const {value}of ANALYSIS_RANK_FILTERS){
  calls.length=0;assert.deepEqual(await getPeriodReportAggregates(current,previous,value,environment),data);
  assert.deepEqual(calls,[{name:'get_period_report_aggregates_v3',args:{p_environment_id:environment,p_rank_filter:value,p_current_start:current.startIso,p_current_end:current.endIso,p_previous_start:previous.startIso,p_previous_end:previous.endIso}}]);
 }
 calls.length=0;await assert.rejects(()=>getPeriodReportAggregates(current,previous,'all','invalid'));assert.deepEqual(calls,[]);
 const sql=fs.readFileSync('supabase/legacy-migrations/pre-baseline/018_period_report_rank_aggregates_v2.sql','utf8').replace(/--[^\n]*/g,'');
 assert.equal((sql.match(/create or replace function/g)||[]).length,1);assert.doesNotMatch(sql,/\b(alter|drop|insert|update|delete|truncate|trigger|index|policy)\b/i);
});
