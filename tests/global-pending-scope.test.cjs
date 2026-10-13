/* eslint-disable @typescript-eslint/no-require-imports */
const {test}=require('node:test'),assert=require('node:assert/strict');

const {submitMatchSubmission,isMatchSubmitting,readMatchSubmission,MATCH_SUBMISSION_EVENT}=require('../src/lib/match-submission');
test('save UX prevents concurrent submissions, announces pending transitions and keeps failed payload for retry',async t=>{
 const storage=new Map(),events=[];
 global.window={dispatchEvent:e=>events.push([e.type,isMatchSubmitting('owner')])};
 global.sessionStorage={getItem:k=>storage.get(k)??null,setItem:(k,v)=>storage.set(k,v),removeItem:k=>storage.delete(k)};
 t.after(()=>{delete global.window;delete global.sessionStorage;});
 const form=new FormData();form.set('result','win');
 for(const outcome of ['error','rejected','success']){
  let resolve,reject,calls=0;
  const pending=submitMatchSubmission('owner',form,()=>{calls++;return new Promise((a,b)=>{resolve=a;reject=b;});});
  assert.equal(isMatchSubmitting('owner'),true);const identity=readMatchSubmission('owner');
  await assert.rejects(()=>submitMatchSubmission('owner',form,()=>{calls++;}),/確認中/);
  assert.equal(calls,1);
  if(outcome==='rejected'){reject(Error('offline'));await assert.rejects(pending,/入力内容を保持/);}
  else {resolve({ok:outcome==='success'});assert.deepEqual(await pending,{ok:outcome==='success'});}
  assert.equal(isMatchSubmitting('owner'),false);
  assert.deepEqual(readMatchSubmission('owner'),outcome==='success'?null:identity);
 }
 assert.deepEqual(events,Array.from({length:3},()=>[[MATCH_SUBMISSION_EVENT,true],[MATCH_SUBMISSION_EVENT,false]]).flat());
});

test('navigation indicator delays 80ms, clears on route completion and times out at 8s; POST saves do not start it',t=>{
 const Module=require('node:module'),React=require('react'),load=Module._load;
 const effects=[],listeners=new Map();let pending=false;
 t.mock.timers.enable({apis:['setTimeout']});
 global.window={setTimeout,clearTimeout,location:new URL('http://localhost/matches')};
 global.document={addEventListener:(name,fn)=>listeners.set(name,fn),removeEventListener:name=>listeners.delete(name),dispatchEvent:e=>listeners.get(e.type)?.(e)};
 global.HTMLFormElement=class {method='post';target='';};
 Module._load=function(name,...args){
  if(name==='react')return {...React,useState:()=>[pending,value=>{pending=value;}],useRef:value=>({current:value}),useCallback:fn=>fn,useEffect:fn=>effects.push(fn)};
  if(name==='next/navigation')return {usePathname:()=>'/matches',useSearchParams:()=>new URLSearchParams()};
  return load.call(this,name,...args);
 };
 const id=require.resolve('../src/components/GlobalPendingIndicator');delete require.cache[id];
 let cleanup;
 t.after(()=>{cleanup?.();Module._load=load;delete require.cache[id];delete global.window;delete global.document;delete global.HTMLFormElement;});
 const {GlobalPendingIndicator,notifyNavigationStart}=require(id);
 GlobalPendingIndicator();cleanup=effects[0]();const routeCompleted=effects[1];routeCompleted();
 listeners.get('submit')({target:new HTMLFormElement(),defaultPrevented:false});
 t.mock.timers.tick(100);assert.equal(pending,false);
 for(const href of ['http://elsewhere/analysis','/matches','#same']){notifyNavigationStart(href);t.mock.timers.tick(100);assert.equal(pending,false);}
 notifyNavigationStart('/analysis');t.mock.timers.tick(79);assert.equal(pending,false);
 t.mock.timers.tick(1);assert.equal(pending,true);t.mock.timers.tick(7919);assert.equal(pending,true);
 t.mock.timers.tick(1);assert.equal(pending,false);
 notifyNavigationStart('/matrix');t.mock.timers.tick(40);routeCompleted();t.mock.timers.tick(100);assert.equal(pending,false,'no delayed reappearance');
 notifyNavigationStart('/matrix');t.mock.timers.tick(80);assert.equal(pending,true);routeCompleted();assert.equal(pending,false);
 cleanup();assert.equal(listeners.size,0);
});
