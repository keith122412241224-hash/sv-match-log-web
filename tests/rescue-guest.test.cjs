/* eslint-disable @typescript-eslint/no-require-imports */
const {test}=require('node:test'),assert=require('node:assert/strict');
const {appendGuestMatch,readGuestRecords,displayGuestMatches}=require('../src/lib/guest-records');
const row={local_id:'legacy',environment_id:'e',my_deck_id:'a',opponent_deck_id:'b',result:'win',turn_order:'first',played_at:'2026-09-20T00:00:00Z'};
test('C append rereads latest storage and preserves unknown records, legacy fields and IDs verbatim',()=>{
 let raw=JSON.stringify([row]);const storage={getItem:()=>raw,setItem:(k,v)=>{raw=v;}};
 displayGuestMatches(readGuestRecords(raw));
 const unknown=[{futureVersion:5,content:[1,2]},null,'unrecognized',{...row,local_id:'broken',rank_tier:'master'}];
 const concurrent={...row,local_id:'other-tab'};
 raw=JSON.stringify([...unknown,concurrent,row]);
 const fresh={...row,local_id:'fresh',rank_tier:null,master_group:null,grandmaster_rating:null};
 const visible=appendGuestMatch(storage,fresh);
 assert.deepEqual(JSON.parse(raw),[fresh,...unknown,concurrent,row]);
 assert.deepEqual(visible,[fresh,concurrent,row]);
 assert.equal('rank_tier' in JSON.parse(raw).at(-1),false);
});
for(const raw of ['{bad','{}','null','42'])test('C malformed storage stays untouched: '+raw,()=>{
 let writes=0;assert.throws(()=>appendGuestMatch({getItem:()=>raw,setItem:()=>writes++},row));assert.equal(writes,0);
});
test('C storage denial/quota fails explicitly and retains old payload',()=>{
 const original=JSON.stringify([row]);let raw=original;
 assert.throws(()=>appendGuestMatch({getItem:()=>{throw Error('denied');},setItem:()=>{throw Error('unexpected');}},row),/denied/);
 assert.throws(()=>appendGuestMatch({getItem:()=>raw,setItem:()=>{throw Error('quota');}},row),/quota/);
 assert.equal(raw,original);
});
