/* eslint-disable @typescript-eslint/no-require-imports */
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
let recent=[],rankRows=[],error=null,throwQuery=false;const calls=[];
const supabase={auth:{getUser:async()=>({data:{user:{id:'owner'}}})},rpc:async(name,args)=>{calls.push(['rpc',name,args]);return {data:{summary:{total:4000,wins:2000,winRate:50,firstWinRate:51,secondWinRate:49},recent},error:null};},
 from(table){calls.push(['from',table]);const q={};for(const method of ['select','eq','in','limit'])q[method]=(...args)=>{calls.push([method,...args]);return q;};q.then=(yes,no)=>(throwQuery?Promise.reject(Error('network')):Promise.resolve({data:rankRows,error})).then(yes,no);return q;}
};
const filename=require.resolve('../src/lib/supabase/server');require.cache[filename]={id:filename,filename,loaded:true,exports:{createSupabaseServerClient:async()=>supabase}};
const {getHomeDashboard}=require('../src/lib/data');
const row=id=>({id,played_at:'2026-09-20T00:00:00Z',result:'win',turn_order:'first',environment:null,my_deck:null,opponent_deck:null});
test('B one owner-filtered bounded batch enriches RPC IDs, preserves ordering/statistics and ignores unrelated rows',async()=>{
 recent=[row('b'),row('a')];rankRows=[{id:'a',rank_tier:'master',master_group:'ruby',grandmaster_rating:null},{id:'b',rank_tier:null,master_group:null,grandmaster_rating:null},{id:'foreign',rank_tier:'aa'}];calls.length=0;
 const data=await getHomeDashboard('e',10);
 assert.equal(data.summary.total,4000);assert.deepEqual(data.recent.map(r=>r.id),['b','a']);assert.equal(data.recent[1].master_group,'ruby');assert.equal(data.recent[0].rank_tier,null);
 assert.deepEqual(calls,[['rpc','get_home_dashboard',{p_environment_id:'e',p_limit:10}],['from','matches'],['select','id,rank_tier,master_group,grandmaster_rating'],['eq','user_id','owner'],['in','id',['b','a']],['limit',50]]);
});
test('B complete rank RPC response and empty recent list need zero supplemental reads',async()=>{
 for(const rows of [[],[{...row('a'),rank_tier:null,master_group:null,grandmaster_rating:null}]]){
  recent=rows;calls.length=0;const data=await getHomeDashboard();assert.deepEqual(data.recent,rows);assert.equal(calls.length,1);
 }
});
test('B supplemental failure/missing row keeps RPC statistics and distinguishes unavailable rank from null',async()=>{
 recent=[row('a')];rankRows=[];for(const kind of ['missing','error','throw']){
  error=kind==='error'?{code:'42501',message:'denied'}:null;throwQuery=kind==='throw';calls.length=0;
  const data=await getHomeDashboard();assert.equal(data.summary.total,4000);assert.equal(data.recent[0].rank_tier,undefined);assert.equal(calls.filter(c=>c[0]==='rpc').length,1);
 }error=null;throwQuery=false;
});
test('B defensive batch cap never pages matches',async()=>{
 recent=Array.from({length:60},(_,i)=>row(String(i)));rankRows=[];calls.length=0;await getHomeDashboard();assert.equal(calls.find(c=>c[0]==='in')[2].length,50);assert.equal(calls.filter(c=>c[0]==='from').length,1);
});
test('B all 13 rank images exist with PNG headers and unchanged rank option values',()=>{
 const {RANKS,MASTER_GROUPS}=require('../src/constants/ranks');const options=[...RANKS,...MASTER_GROUPS];assert.equal(options.length,13);
 for(const o of options){assert.ok(o.iconSrc);assert.equal(fs.readFileSync('public'+o.iconSrc).subarray(1,4).toString(),'PNG');}
 assert.deepEqual(RANKS.map(o=>o.value),['beginner','d','c','b','a','aa','master','grandmaster']);
});
