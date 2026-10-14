/* eslint-disable @typescript-eslint/no-require-imports */
const {test}=require('node:test'),assert=require('node:assert/strict');
const {decideSuggestion,suggestionWritesEnabled}=require('../src/lib/suggestion-decision');
const id='00000000-0000-4000-8000-000000000001';
function form(){const f=new FormData();for(const[k,v]of Object.entries({suggestion_id:id,id,class_name:'エルフ',name:'採用名',status:'rejected'}))f.set(k,v);return f;}
test('candidate operations default to paused, including unknown mode, without any RPC',async()=>{
 const old=process.env.ADMIN_SUGGESTION_WRITES;try{for(const mode of [undefined,'','false','paused','true','RPC']){if(mode===undefined)delete process.env.ADMIN_SUGGESTION_WRITES;else process.env.ADMIN_SUGGESTION_WRITES=mode;assert.equal(suggestionWritesEnabled(),false);for(const op of ['approve','reject'])assert.equal((await decideSuggestion({rpc(){throw Error('must not query');}},form(),op)).status,'paused');}}finally{if(old===undefined)delete process.env.ADMIN_SUGGESTION_WRITES;else process.env.ADMIN_SUGGESTION_WRITES=old;}
});
test('candidate RPC validates fields and rejects direct approved/pending status changes',async()=>{
 process.env.ADMIN_SUGGESTION_WRITES='rpc';const no={rpc(){throw Error('must not query');}};
 for(const[k,v]of [['suggestion_id','bad'],['class_name','bad'],['name','  ']]){const f=form();f.set(k,v);assert.equal((await decideSuggestion(no,f,'approve')).status,'invalid');}
 for(const status of ['approved','pending','']){const f=form();f.set('status',status);assert.equal((await decideSuggestion(no,f,'reject')).status,'invalid');}
});
test('candidate RPC sends stable identity and normalized payload, returns original deck ID',async()=>{
 process.env.ADMIN_SUGGESTION_WRITES='rpc';const f=form();f.set('name',' 採用名 ');let calls=0;
 const client={rpc:async(name,args)=>{calls++;assert.equal(name,'decide_deck_suggestion');assert.deepEqual(args,{p_id:id,p_operation:'approve',p_class:'エルフ',p_name:'採用名'});return{data:{status:calls===1?'approved':'already_approved',archetype_id:id},error:null};}};
 assert.equal((await decideSuggestion(client,f,'approve')).archetypeId,id);assert.equal((await decideSuggestion(client,f,'approve')).status,'already_approved');assert.equal(calls,2);
});
test('candidate RPC distinguishes old DB, permissions, constraint rejection and uncertain transport without leaking details',async()=>{
 process.env.ADMIN_SUGGESTION_WRITES='rpc';for(const[code,status]of [['PGRST202','unavailable'],['42883','unavailable'],['42501','forbidden'],['23505','database'],['23514','database'],['55P03','unknown'],['57014','unknown'],['','unknown']]){const r=await decideSuggestion({rpc:async()=>({data:null,error:{code,message:'private SQL secret'}})},form(),'approve');assert.equal(r.status,status);assert(!JSON.stringify(r).includes('private SQL'));}
 assert.equal((await decideSuggestion({rpc:async()=>{throw Error('lost');}},form(),'approve')).status,'unknown');
});
test('candidate RPC does not accept malformed or missing successful receipts',async()=>{
 process.env.ADMIN_SUGGESTION_WRITES='rpc';for(const data of [null,{},[],{status:'madeup'},{status:'approved'},{status:'already_approved',archetype_id:'bad'}])assert.equal((await decideSuggestion({rpc:async()=>({data,error:null})},form(),'approve')).status,'unknown');
});
test('candidate terminal and legacy responses are distinct and do not fallback to INSERT',async()=>{
 process.env.ADMIN_SUGGESTION_WRITES='rpc';for(const status of ['legacy','conflict','missing','inconsistent','rejected','already_rejected'])assert.equal((await decideSuggestion({rpc:async()=>({data:{status},error:null})},form(),'approve')).status,status);
});
