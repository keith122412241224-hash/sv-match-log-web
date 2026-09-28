/* eslint-disable @typescript-eslint/no-require-imports */
const {test}=require('node:test'),assert=require('node:assert/strict');
const {isEnvironmentInputEnabled:open,nextEnvironmentInputBoundary:next,jstInputToIso:parse,isoToJstInput:format,readMatchInputWindow,environmentInputStatus}=require('../src/lib/environment-input');
const boundary=Date.parse('2026-09-29T08:00:00.000Z'),iso=new Date(boundary).toISOString();
const env=(start=null,end=null,allow=true)=>({allow_match_input:allow,match_input_start_at:start,match_input_end_at:end});
for(const delta of [-1,0,1])test(`9/29 17:00 JST old end/new start at ${delta}ms`,()=>{
 assert.equal(open(env(null,iso),boundary+delta),delta<0);
 assert.equal(open(env(iso),boundary+delta),delta>=0);
 assert.equal([env(null,iso),env(iso)].filter(e=>open(e,boundary+delta)).length,1);
});
test('NULL windows, bounded interval and manual kill switch',()=>{
 for(const time of [boundary-1,boundary,boundary+1]){
  assert.equal(open(env(),time),true);
  assert.equal(open(env(iso,new Date(boundary+1).toISOString()),time),time===boundary);
  for(const e of [env(),env(iso),env(null,iso),env(iso,iso)])assert.equal(open({...e,allow_match_input:false},time),false);
 }
 assert.equal(open({allow_match_input:true},boundary),true);
 assert.equal(open(env('invalid'),boundary),false);
});
test('JST input, UTC storage, JST redisplay, midnight and seconds/milliseconds',()=>{
 for(const [jst,utc]of [['2026-09-29T17:00','2026-09-29T08:00:00.000Z'],['2026-09-29T00:30','2026-09-28T15:30:00.000Z'],['2026-09-29T17:00:01.001','2026-09-29T08:00:01.001Z'],['2026-09-29T17:00:01','2026-09-29T08:00:01.000Z']]){
  assert.equal(parse(jst),utc);assert.equal(parse(format(utc)),utc);
 }
 assert.equal(parse(''),null);assert.equal(format(null),'');
 for(const bad of ['2026-02-30T12:00','2026-09-29T24:00','2026-09-29T17:00Z','2026-09-29T17:00+09:00','bad'])assert.throws(()=>parse(bad));
 assert.throws(()=>readMatchInputWindow('2026-09-29T17:00','2026-09-29T17:00'));
 assert.throws(()=>readMatchInputWindow('2026-09-29T17:00','2026-09-29T16:59'));
});
test('next boundary includes future starts when all input is currently closed; ignores stopped windows',()=>{
 assert.equal(next([env(iso),env(null,iso)],boundary-1),boundary);
 assert.equal(next([env(iso),env(null,iso)],boundary),null);
 assert.equal(next([env(iso,null,false)],boundary-1),null);
 assert.equal(next([env()],boundary),null);
});
test('admin states are based on the same instant and display JST',()=>{
 assert.match(environmentInputStatus(env(null,iso),boundary-1),/現在入力可能.*17:00/);
 assert.match(environmentInputStatus(env(iso),boundary-1),/17:00から開始予定/);
 assert.equal(environmentInputStatus(env(null,iso),boundary),'入力期間終了');
 assert.equal(environmentInputStatus(env(iso,null,false),boundary),'手動停止中');
});
