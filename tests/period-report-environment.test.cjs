/* eslint-disable @typescript-eslint/no-require-imports */
const {test}=require('node:test'),assert=require('node:assert/strict');
const {parsePeriodReportEnvironment:parse,resolvePeriodReportEnvironment:resolve,withPeriodReportEnvironment:annotate}=require('../src/lib/period-report-environment');
const {buildWeeklyReport,buildWeeklyPeriod}=require('../src/lib/weekly-report');
const {reportDisplayContext}=require('../src/lib/report-display-context');
const env={id:'00000000-0000-4000-8000-000000000123',name:'過去環境・長い表示名'},calls=[];
const empty={version:1,current:{totalMatches:0,groups:[]},previous:{totalMatches:0,groups:[]}};
let error=null;
const id=require.resolve('../src/lib/supabase/server');
require.cache[id]={id,filename:id,loaded:true,exports:{createSupabaseServerClient:async()=>({rpc:async(name,args)=>{calls.push({name,args});return{data:empty,error};}})}};
const {getPeriodReportAggregates:load}=require('../src/lib/period-report-data');

test('environment values fail closed; omitted/all preserve legacy semantics and past environments remain selectable',()=>{
  for(const value of [undefined,null,'all'])assert.equal(parse(value),null);
  assert.equal(parse(env.id.toUpperCase()),env.id);
  assert.deepEqual(resolve(env.id,[{...env,allow_match_input:false}]),env);
  for(const value of ['', 'bad',' all ',[],['all'],123])assert.throws(()=>parse(value));
  assert.throws(()=>resolve(env.id,[]));
});
test('all dispatch is unchanged; environment+rank sends one v3 request with unchanged four date bounds',async()=>{
  const p=buildWeeklyPeriod('2026-09-29','2026-10-02');
  assert.equal(p.startIso,'2026-09-28T15:00:00.000Z');assert.equal(p.endIso,'2026-10-02T14:59:59.999Z');
  for(const value of [undefined,null,'all'])for(const rank of ['all','master:sapphire']){
    calls.length=0;await load(p,p,rank,value);
    assert.equal(calls[0].name,rank==='all'?'get_period_report_aggregates_v1':'get_period_report_aggregates_v2');
    assert.ok(!Object.hasOwn(calls[0].args,'p_environment_id'));
  }
  for(const rank of ['all','master:sapphire','grandmaster:none']){
    calls.length=0;await load(p,p,rank,env.id);
    assert.deepEqual(calls,[{name:'get_period_report_aggregates_v3',args:{p_environment_id:env.id,p_rank_filter:rank,p_current_start:p.startIso,p_current_end:p.endIso,p_previous_start:p.startIso,p_previous_end:p.endIso}}]);
  }
  calls.length=0;await assert.rejects(()=>load(p,p,'all','bad'));assert.equal(calls.length,0);
  for(const code of ['PGRST202','22023','42501','XX000']){
    error={code};calls.length=0;await assert.rejects(()=>load(p,p,'all',env.id));assert.equal(calls.length,1);
  }error=null;
});
test('all leaves the complete report identical; selected environment with no previous data cannot advertise a change',()=>{
  const row={id:'1',my_deck_id:'a',opponent_deck_id:'b',my_archetype_id:null,opponent_archetype_id:null,result:'win',played_at:'2026-09-29T01:00:00Z'};
  const p=buildWeeklyPeriod('2026-09-29','2026-10-02');
  for(const rows of [[],[row]]){
    const report=buildWeeklyReport(rows,[],[],p);assert.equal(annotate(report,null),report);
    const selected=annotate(report,env);
    assert.equal(selected.totalMatches,rows.length);assert.equal(selected.aiJson.summary.matchDelta,null);
    assert.equal(selected.aiJson.summary.comparisonStatus,'no_previous');
    assert.ok(Object.values(selected.changes).every(items=>items.length===0));
    assert.ok(selected.opponentDeckRanking.every(r=>r.shareChange===null&&r.previousShare===null));
    assert.ok(selected.aiJson.opponentDeckRanking.every(r=>r.previousShare===null));
    assert.match(selected.aiPrompt,/比較対象なし/);assert.ok(selected.aiPrompt.includes(env.name));
    assert.equal(reportDisplayContext(selected.aiJson),`対象期間：2026/9/29〜10/2 ｜ 前期間：9/25〜9/28 ｜ 環境：${env.name} ｜ ランク：すべて`);
  }
  const report=buildWeeklyReport([row],[row],[],p),selected=annotate(report,env);
  assert.equal(selected.changes,report.changes);assert.equal(selected.aiJson.summary,report.aiJson.summary);
  assert.deepEqual({...selected,aiJson:report.aiJson,aiPrompt:report.aiPrompt},report);
});
