/* eslint-disable @typescript-eslint/no-require-imports */
const {test}=require('node:test'),assert=require('node:assert/strict');
const fixture=require('./environment-dashboard-fixture.cjs');
const {expandLegacyRankFilter}=require('../src/lib/rank-selection');
const mock=(p,value)=>{const id=require.resolve(p);require.cache[id]={id,filename:id,loaded:true,exports:value};};
let user={is_anonymous:false},calls=[],failure=false;
mock('../src/lib/data',{getCurrentUser:async()=>user});
mock('../src/lib/environment-dashboard-data',{getEnvironmentDashboard:async s=>{calls.push(s);if(failure)throw Error('PRIVATE INTERNAL ERROR');return {ranks:s.ranks};}});
const {GET}=require('../src/app/api/environment/route');
const url=rank=>'http://localhost/api/environment?'+new URLSearchParams({environment:fixture.env.three,period:'7d',rank});
test('E1.1 API accepts all 21 exact values once and retains private no-store',async()=>{
 for(const rank of fixture.filters){calls=[];const r=await GET(new Request(url(rank)));assert.equal(r.status,200);assert.deepEqual(calls,[{environment:fixture.env.three,period:'7d',ranks:expandLegacyRankFilter(rank)}]);assert.equal(r.headers.get('cache-control'),'private, no-store');assert.equal(r.headers.get('vary'),'Cookie');}
});
test('E1.1 API rejects invalid and extra filters before RPC; authentication fails closed',async()=>{
 for(const value of ['none','NULL','aa-plus','master:none','grandmaster:emerald','invalid']){calls=[];assert.equal((await GET(new Request(url(value)))).status,400);assert.equal(calls.length,0);}
 for(const extra of ['&rank=all','&user_id=secret']){calls=[];assert.equal((await GET(new Request(url('master:diamond')+extra))).status,400);assert.equal(calls.length,0);}
 for(const value of [null,{is_anonymous:true},{}]){user=value;calls=[];assert.equal((await GET(new Request(url('grandmaster:none')))).status,401);assert.equal(calls.length,0);}user={is_anonymous:false};
 failure=true;calls=[];const r=await GET(new Request(url('master:diamond')));assert.equal(r.status,503);assert.equal(calls.length,1);assert.ok(!(await r.text()).includes('PRIVATE'));failure=false;
});
