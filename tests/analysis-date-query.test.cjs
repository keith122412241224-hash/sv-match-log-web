/* eslint-disable @typescript-eslint/no-require-imports */
const {test}=require('node:test'),assert=require('node:assert/strict');
const {validateAnalysisDates,analysisDatesFromQuery}=require('../src/lib/analysis-date-query');
const {invalid,valid}=require('./analysis-date-cases.cjs');
for(const [i,value] of invalid.entries())test('Analysis rejects invalid date '+i+' on either boundary',()=>{
  for(const field of ['playedFrom','playedTo']){const r=validateAnalysisDates({[field]:value});assert.equal(r.ok,false);assert.equal(r.error.field,field);assert.doesNotMatch(r.error.message,/RangeError|SQL|script|SELECT/);}
});
for(const [i,params]of valid.entries())test('Analysis valid JST interval '+i+' retains old UTC conversion',()=>{
 const result=validateAnalysisDates(params);assert.equal(result.ok,true);
 for(const [field,output,suffix]of [['playedFrom','playedAtFrom','00'],['playedTo','playedAtTo','59.999']])assert.equal(result.value[output],params[field]?new Date(params[field]+':'+suffix+'+09:00').toISOString():undefined);
});
test('Analysis ordering includes the same minute and rejects reversed bounds',()=>{
 assert.equal(validateAnalysisDates({playedFrom:'2026-10-13T00:01',playedTo:'2026-10-13T00:00'}).ok,false);
 assert.deepEqual(validateAnalysisDates({playedFrom:'2026-01-01T00:00',playedTo:'2026-01-01T00:00'}).value,{playedFrom:'2026-01-01T00:00',playedTo:'2026-01-01T00:00',playedAtFrom:'2025-12-31T15:00:00.000Z',playedAtTo:'2025-12-31T15:00:59.999Z'});
});
test('Analysis query extraction distinguishes absent, empty, duplicates and malformed encoding',()=>{
 for(const raw of ['playedFrom=','playedFrom=%E0%A4%A','playedFrom=%ZZ','playedFrom=2026-01-01T00%3A00&playedFrom=2026-01-01T00%3A00'])assert.equal(validateAnalysisDates(analysisDatesFromQuery(new URLSearchParams(raw))).ok,false);
 assert.equal(validateAnalysisDates(analysisDatesFromQuery(new URLSearchParams('ranks=a'))).ok,true);
});
