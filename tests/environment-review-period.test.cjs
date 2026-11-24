/* eslint-disable @typescript-eslint/no-require-imports */
const test=require('node:test');
const assert=require('node:assert/strict');
const {buildPeriodSnapshot,periodStarts}=require('../src/lib/environment-review/period-source');
const {memberSnapshot}=require('../src/lib/environment-review/publication');
const env={environmentId:'env',environmentName:'対象環境',environmentStart:'2026-01-01T00:00:00Z',asOf:'2026-01-12T00:00:00Z'};
const catalog=['a','b'].map(id=>({id,name:id,class_name:'エルフ',is_active:true,is_other:false}));
const row={user:'u1',my:'a',opp:'b',rank:'unranked',turn:'first',day:'2026-01-03',window:0,total:12,wins:9};
test('one full population, nested windows, same pair direction, and server-only contributor identity',()=>{
 const s=buildPeriodSnapshot(env,catalog,[row,{...row,user:'u2',day:'2026-01-08',window:7,my:'b',opp:'a',total:5,wins:2},
  {...row,user:'u3',day:'2026-01-11',window:3,total:2,wins:0},{...row,window:3,my:'b',opp:'b',total:1,wins:1}],'sample');
 assert.deepEqual([s.matchCount,s.weekly.matchCount,s.shortMatchCount],[20,8,3]);
 const p=s.pairs[0];assert.deepEqual([p.count,p.wins,p.short.count,p.short.wins],[19,12,2,0]);
 assert.deepEqual([s.weekly.pairs[0].count,s.weekly.pairs[0].wins],[7,3]);
 assert.equal(p.contributors,3);assert.equal(s.decks[0].eligibleCount,19);
 assert.ok(!JSON.stringify(s).includes('"u1"'));assert.ok(!('weekly' in memberSnapshot(s)));
});
test('recent windows stop at the current environment boundary, future periods fail',()=>{
 assert.equal(periodStarts(env.asOf,env.asOf).week,new Date(env.asOf).toISOString());
 assert.throws(()=>periodStarts(env.asOf,env.environmentStart));
});
