/* eslint-disable @typescript-eslint/no-require-imports */
const {test}=require('node:test'),assert=require('node:assert/strict');
const legacy=require('./fixtures/weekly-report-e430a56');
const current=require('../src/lib/weekly-report');
const {parsePeriodReportAggregates}=require('../src/lib/period-report-aggregates');
const {periodCounts}=require('./period-report-fixture.cjs');
const decks=['A','B','C','D'].map((id,i)=>({id,name:i<2?'同名':id,class_name:'エルフ',is_active:true}));
let sequence=0;
const match=(extra={})=>({id:String(++sequence).padStart(12,'0'),my_deck_id:'A',opponent_deck_id:'B',my_archetype_id:null,opponent_archetype_id:null,result:'win',played_at:'2026-09-05T01:00:00.000Z',...extra});
const sorted=rows=>[...rows].sort((a,b)=>b.played_at.localeCompare(a.played_at)||b.id.localeCompare(a.id));
function compare(rows,previous=[],period=legacy.buildWeeklyPeriod('2026-09-05')){
  const payload=parsePeriodReportAggregates({version:1,current:periodCounts(rows),previous:periodCounts(previous)});
  const report=current.buildWeeklyReportFromAggregates(payload,decks,period);
  const expected=legacy.buildWeeklyReport(sorted(rows),sorted(previous),decks,period);
  assert.deepEqual(report,expected,'entire model including exact AI JSON/prompt, warnings, floating values, order');
  assert.deepEqual(current.buildWeeklyReport(sorted(rows),sorted(previous),decks,period),expected,'retained raw path');
  return report;
}
for(const count of [0,1,999,1000,1001,10000,100000])test(`Production full-model parity at ${count} current and previous rows`,()=>{
  const rows=Array.from({length:count},(_,i)=>match({my_deck_id:['A','B','C','unknown',null][i%5],opponent_deck_id:['B','A','C','D',null][i%5],result:i%3?'win':'lose'}));
  compare(rows,rows.map(m=>({...m,result:m.result==='win'?'lose':'win'})));
});
test('direct 10/5 plus reversed 10/7 is 20/12; mirror and Tier differ',()=>{
  const rows=[...Array.from({length:10},(_,i)=>match({result:i<5?'win':'lose'})),...Array.from({length:10},(_,i)=>match({my_deck_id:'B',opponent_deck_id:'A',result:i<7?'lose':'win'}))];
  const r=compare(rows),a=r.myDeckWinRates.find(d=>d.deckId==='A');assert.equal(a.matches,20);assert.equal(a.wins,12);assert.equal(a.winRate,60);
  const mirror=compare([match({opponent_deck_id:'A'})]);assert.equal(mirror.totalMatches,1);assert.equal(mirror.myDeckWinRates[0].matches,2);assert.equal(mirror.myDeckWinRates[0].winRate,50);assert.equal(mirror.tierCandidates[0].matches,0);assert.deepEqual(mirror.unifiedMatchups,[]);
});
test('all wins/losses, reversed-only, mirrors, fallback IDs, unknown/inactive and same-name ties',()=>{
  for(const result of ['win','lose'])for(const rows of [
    [match({result})],[match({my_deck_id:'B',opponent_deck_id:'A',result})],
    [match({opponent_deck_id:'A',result}),match({result})],
    [match({my_archetype_id:'C',opponent_archetype_id:'D',result})],
    [match({my_deck_id:'inactive',opponent_deck_id:'missing',result}),match({my_deck_id:null,opponent_deck_id:null,result})],
    [match({result}),match({my_deck_id:'C',opponent_deck_id:'D',result}),match({my_deck_id:'B',opponent_deck_id:'A',result})]
  ]){compare(rows,[]);compare([],rows);compare(rows,rows);}
});
test('period dates stay exactly Production for one day, 7 days, multiple weeks, month and year crossings',()=>{
  for(const [start,end]of [['2026-09-05','2026-09-05'],['2026-09-05',undefined],['2026-09-01','2026-09-30'],['2026-08-28','2026-09-10'],['2025-12-31','2026-01-02'],['2026-09-05','2026-09-01']]){
    const p=current.buildWeeklyPeriod(start,end);assert.deepEqual(p,legacy.buildWeeklyPeriod(start,end));assert.deepEqual(current.getPreviousWeeklyReportPeriod(p),legacy.getPreviousWeeklyReportPeriod(p));compare([match()],[],p);
  }
  assert.equal(current.buildWeeklyPeriod('2026-09-05','2026-09-05').endIso,'2026-09-05T14:59:59.999Z');
});
test('malformed payloads cannot become normal empty reports',()=>{
  const valid={version:1,current:periodCounts([match()]),previous:periodCounts([])};
  for(const value of [null,[],{}, {...valid,version:2},{...valid,current:{totalMatches:0,groups:null}},
    {...valid,current:{totalMatches:2,groups:valid.current.groups}},
    ...[{wins:2},{total:-1},{total:0},{firstOrdinal:0},{myDeckId:42}].map(extra=>({...valid,current:{totalMatches:1,groups:[{...valid.current.groups[0],...extra}]}}))]){
    assert.throws(()=>parsePeriodReportAggregates(value),e=>e.kind==='invalid_json');
  }
  assert.equal(parsePeriodReportAggregates({version:1,current:periodCounts([]),previous:periodCounts([])}).current.totalMatches,0);
});
