/* eslint-disable @typescript-eslint/no-require-imports */
require('./register.cjs');
const {test}=require('node:test'),assert=require('node:assert/strict');
const {setup,ids}=require('./match-mutations-db.cjs');
const {runAdminBatch}=require('../src/lib/admin-batch-server'),{batchSnapshot}=require('../src/lib/admin-batch');
for(const kind of ['environment','archetype'])test('batch '+kind+': actual SQL partial failure, retry, lost response, stale baseline and RLS',async()=>{
 const {db,claim,Query}=await setup();
 try{
  const table=kind==='environment'?'environments':'deck_archetypes',targets=kind==='environment'?[ids.env,ids.env2]:[ids.arch,ids.arch2];
  await db.exec(`create function public.batch_fault() returns trigger language plpgsql as $$begin if new.name='FAIL' then raise exception 'private detail' using errcode='23514';end if;return new;end$$;create trigger batch_fault before update on public.${table} for each row execute function public.batch_fault();`);
  const client={from:t=>new Query(t)};
  const read=async id=>(await client.from(table).select('*').eq('id',id).maybeSingle()).data;
  async function form(names){const f=new FormData();for(const[id,i]of targets.map((id,i)=>[id,i])){f.append(kind+'_ids',id);f.set('name_'+id,names[i]);f.set('class_name_'+id,'エルフ');f.set('sort_order_'+id,'2');f.set('baseline_'+id,JSON.stringify(batchSnapshot(kind,await read(id))));}return f;}
  await claim(ids.a);let input=await form(['saved','FAIL']),r=await runAdminBatch(client,kind,input);
  assert.equal(r.succeeded,1);assert.equal(r.failed,1);assert.equal(r.rows[1].status,'database');assert(!JSON.stringify(r).includes('private detail'));assert.equal((await read(targets[0])).name,'saved');assert.notEqual((await read(targets[1])).name,'FAIL');
  await client.from(table).update({name:'other admin'}).eq('id',targets[0]);input.delete(kind+'_ids');input.append(kind+'_ids',targets[1]);input.set('name_'+targets[1],'retried');r=await runAdminBatch(client,kind,input);assert.equal(r.succeeded,1);assert.equal((await read(targets[0])).name,'other admin');assert.equal((await read(targets[1])).name,'retried');
  input=await form(['stale1','stale2']);await client.from(table).update({name:'concurrent'}).eq('id',targets[0]);r=await runAdminBatch(client,kind,input);assert.equal(r.rows[0].status,'conflict');assert.equal((await read(targets[0])).name,'concurrent');
  input=await form(['raced1','raced2']);let injected=false;
  const racing={from(t){const q=new Query(t),update=q.update.bind(q);q.update=v=>{update(v);const execute=q.execute.bind(q);q.execute=async()=>{if(!injected){injected=true;await db.query('update public.'+table+' set name=$1 where id=$2',['between read and update',targets[0]]);}return execute();};return q;};return q;}};
  r=await runAdminBatch(racing,kind,input);assert.equal(r.rows[0].status,'conflict');assert.equal((await read(targets[0])).name,'between read and update');
  input=await form(['unknown1','unknown2']);const lost={from(t){const q=new Query(t),update=q.update.bind(q);q.update=v=>{update(v);const execute=q.execute.bind(q);q.execute=async()=>{await execute();throw Error('response lost after commit');};return q;};return q;}};
  r=await runAdminBatch(lost,kind,input);assert.equal(r.unknown,2);assert.equal((await read(targets[0])).name,'unknown1');r=await runAdminBatch(client,kind,input,true);assert.equal(r.succeeded,2);
  input=await form(['denied1','denied2']);await claim(ids.b);r=await runAdminBatch(client,kind,input);assert.equal(r.succeeded,0);await claim(ids.a);assert.equal((await read(targets[0])).name,'unknown1');
 }finally{await db.close();}
});
