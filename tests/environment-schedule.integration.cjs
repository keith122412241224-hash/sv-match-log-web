/* eslint-disable @typescript-eslint/no-require-imports */
// Historical SQL uses disposable PGlite. Current actions use dedicated native PostgreSQL.
const assert=require('node:assert/strict'),fs=require('node:fs'),Module=require('node:module');
const {test}=require('node:test');
const {randomUUID}=require('node:crypto');
const {setup}=require('./match-mutations-db.cjs');
require('./register.cjs');
const {Client,types}=require(process.env.PG_MODULE||'pg');
types.setTypeParser(1184,v=>new Date(v).toISOString());
const db=new Client({host:'127.0.0.1',port:56322,user:'postgres',password:'postgres',database:'postgres',connectionTimeoutMillis:5000});
const uuid=n=>'99999999-9999-4999-8999-'+String(n).padStart(12,'0');
const user=uuid(1),deck=uuid(2),old=uuid(3),fresh=uuid(4),open=uuid(5),stopped=uuid(6),future=uuid(7);
const result={localOnly:true,actions:[],dbWrites:[],admin:[]};
const quote=s=>'"'+s.replaceAll('"','""')+'"';let expireOnInsert=false;
class Query{
 constructor(table){this.table=table;this.filters=[];this.orders=[];this.cols='*';}
 select(cols){this.cols=cols;return this;}eq(k,v){this.filters.push([k,[v]]);return this;}in(k,v){this.filters.push([k,v]);return this;}
 is(k,v){assert.equal(v,null);this.filters.push([k,null]);return this;}
 order(k,{ascending=true}={}){this.orders.push(quote(k)+(ascending?' asc':' desc'));return this;}
 limit(n){this.maxRows=n;return this;}
 maybeSingle(){this.single=true;return this;}
 insert(rows){this.rows=Array.isArray(rows)?rows:[rows];return this;}update(row){this.updateRow=row;return this;}
 upsert(rows,{onConflict,ignoreDuplicates}){
  assert.equal(this.table,'matches');assert.equal(ignoreDuplicates,true);
  assert.ok(['user_id,request_id','user_id,guest_import_id'].includes(onConflict));
  this.conflict=onConflict.split(',').map(quote).join(',');return this.insert(rows);
 }
 async execute(){
  await db.query('savepoint action_query');
  try{
   const args=[],bind=v=>{args.push(v);return '$'+args.length;};let sql;
   if(this.rows){const cols=Object.keys(this.rows[0]);sql='insert into public.'+quote(this.table)+'('+cols.map(quote).join(',')+') values '+this.rows.map(row=>'('+cols.map(c=>bind(row[c])).join(',')+')').join(',')+(this.conflict?' on conflict('+this.conflict+') do nothing':'')+' returning *';
    if(expireOnInsert&&this.table==='matches') {expireOnInsert=false;await db.query('update public.environments set match_input_end_at=clock_timestamp() where id=$1',[open]);}
   }else{
    const where=this.filters.map(([k,vs])=>vs===null?quote(k)+' is null':vs.length?quote(k)+' in ('+vs.map(bind).join(',')+')':'false').join(' and ');
    const condition=where?' where '+where:'';
    const columns=this.cols==='*'?'*':this.cols.split(',').map(s=>quote(s.trim())).join(',');
    if(this.updateRow){
     const set=Object.entries(this.updateRow).map(([k,v])=>quote(k)+'='+bind(v)).join(',');
     sql='update public.'+quote(this.table)+' set '+set+condition+' returning '+columns;
    }else{
     const order=this.orders.length?' order by '+this.orders.join(','):'';
     const limit=this.maxRows===undefined?'':' limit '+bind(this.maxRows);
     sql='select '+columns+' from public.'+quote(this.table)+condition+order+limit;
    }
   }
   const response=await db.query(sql,args);await db.query('release savepoint action_query');return {data:this.single?response.rows[0]??null:response.rows,error:null};
  }catch(error){await db.query('rollback to savepoint action_query');await db.query('release savepoint action_query');return {data:null,error};}
 }
 then(a,b){return this.execute().then(a,b);}
}
function loadActions(){
 const load=Module._load;Module._load=function(name,...args){
 if(name==='@/lib/supabase/server')return {createSupabaseServerClient:async()=>({auth:{getUser:async()=>({data:{user:{id:user}}})},from:t=>new Query(t)})};
 if(name==='next/navigation')return {redirect:p=>{throw Error('REDIRECT:'+p);}};
 if(name==='next/cache')return {revalidatePath:()=>{}};
 return load.call(this,name,...args);
};
 try{return {actions:require('../src/app/actions'),admin:require('../src/app/admin/actions')};}
 finally{Module._load=load;}
}
const form=(environment_id,extra={})=>{const f=new FormData();for(const [k,v]of Object.entries({environment_id,my_deck_id:deck,opponent_deck_id:deck,turn_order:'first',result:'win',request_id:randomUUID(),...extra}))f.set(k,v);return f;};
async function negative(db,sql,args,code){await db.query('savepoint negative');try{await assert.rejects(db.query(sql,args),e=>e.code===code);}finally{await db.query('rollback to savepoint negative');await db.query('release savepoint negative');}}
const boundary='2026-09-29T08:00:00.000Z';
async function seed(db){
  await db.query('insert into auth.users(id,email) values($1,$2)',[user,'schedule-test@example.test']);
  await db.query('insert into public.admin_users(user_id) values($1)',[user]);
  await db.query("insert into public.decks(id,user_id,name,class_name) values($1,$2,'schedule deck','エルフ')",[deck,user]);
  for(const [id,name]of [[old,'old'],[fresh,'new'],[open,'null'],[stopped,'stopped'],[future,'future']])await db.query('insert into public.environments(id,user_id,name) values($1,$2,$3)',[id,user,name]);
}

test('initial two migrations: 21 SQL period boundaries, JST switch, defaults and invalid windows',async t=>{
 const versions=[];
 const {db}=await setup({seed:false,stopBeforeMigration:'20260929053719_analysis_rank_tiers.sql',
  afterMigration:(_,file)=>versions.push(file.split('_')[0])});
 t.after(()=>db.close());
 assert.deepEqual(versions,['20260928010000','20260928060000']);
 let predicateCases=0;
  for(const delta of [-1,0,1])for(const [start,end,allow,want]of [[null,null,true,true],[boundary,null,true,delta>=0],[null,boundary,true,delta<0],[boundary,'2026-09-29T08:00:00.001Z',true,delta===0],[null,null,false,false],[boundary,null,false,false],[null,boundary,false,false]]){
   const time=new Date(Date.parse(boundary)+delta).toISOString();assert.equal((await db.query('select public.is_match_input_window_open($1,$2,$3,$4) as open',[allow,start,end,time])).rows[0].open,want);
   predicateCases++;
  }
 assert.equal(predicateCases,21);
 await seed(db);
 await db.query('begin');
 try {
  await db.query("update public.environments set match_input_end_at='2026-09-29 17:00 Asia/Tokyo' where id=$1",[old]);
  await db.query("update public.environments set match_input_start_at='2026-09-29 17:00 Asia/Tokyo' where id=$1",[fresh]);
  const windows=(await db.query('select id,match_input_start_at,match_input_end_at from public.environments where id in ($1,$2) order by id',[old,fresh])).rows;
  assert.equal(new Date(windows[0].match_input_end_at).toISOString(),boundary);
  assert.equal(new Date(windows[1].match_input_start_at).toISOString(),boundary);
  for(const delta of [-1,0,1]){const time=new Date(Date.parse(boundary)+delta).toISOString();const ids=(await db.query('select id from public.environments where id in ($1,$2) and public.is_match_input_window_open(allow_match_input,match_input_start_at,match_input_end_at,$3)',[old,fresh,time])).rows.map(r=>r.id);assert.deepEqual(ids,[delta<0?old:fresh]);}
  await negative(db,'update public.environments set match_input_start_at=match_input_end_at where id=$1',[old],'23514');
  // Existing NULL defaults and old rows remain unchanged on migration.
  assert.deepEqual((await db.query('select match_input_start_at,match_input_end_at from public.environments where id=$1',[open])).rows[0],{match_input_start_at:null,match_input_end_at:null});
 } finally {await db.query('rollback');}
});

test('current schema: native period enforcement, request replay, guest import and admin JST save',async()=>{
 const {actions,admin}=loadActions();
 await db.connect();try{
  const versions=fs.readdirSync('supabase/migrations').filter(file=>file.endsWith('.sql')).sort().map(file=>file.split('_')[0]);
  assert.deepEqual((await db.query('select version from supabase_migrations.schema_migrations order by version')).rows.map(r=>r.version),versions);
  await db.query('begin');
  assert.equal((await db.query('select count(*)::int n from public.matches')).rows[0].n,0,'native stack must be empty');
  await seed(db);
  await db.query("update public.environments set match_input_end_at=clock_timestamp()-interval '1 second' where id=$1",[old]);
  await db.query("update public.environments set match_input_start_at=clock_timestamp()-interval '1 second' where id=$1",[fresh]);
  await db.query('update public.environments set allow_match_input=false where id=$1',[stopped]);
  await db.query("update public.environments set match_input_start_at=clock_timestamp()+interval '1 hour' where id=$1",[future]);
  await db.query('delete from public.admin_users where user_id=$1',[user]);
  await db.query("select set_config('request.jwt.claim.sub',$1,true)",[user]);await db.query('set local role authenticated');
  const insert="insert into public.matches(user_id,environment_id,my_deck_id,opponent_deck_id,result,turn_order) values($1,$2,$3,$3,'win','first')";
  for(const [id,allowed]of [[old,false],[fresh,true],[open,true],[stopped,false],[future,false]]){
   if(allowed)await db.query(insert,[user,id,deck]);else await negative(db,insert,[user,id,deck],'P0001');result.dbWrites.push({environment:id,allowed});
   for(const next of ['home','continue']){assert.equal((await actions.createMatchInline(form(id,{next_action:next}))).ok,allowed);await assert.rejects(actions.createMatch(form(id,{next_action:next})),allowed?(next==='home'?/REDIRECT:\/$/:/REDIRECT:\/matches\?saved=1/):/REDIRECT:\/matches\?error=/);result.actions.push({id,next,allowed});}
  }
  const replayId=randomUUID();
  const replay=()=>form(fresh,{request_id:replayId, next_action:'continue'});
  assert.equal((await actions.createMatchInline(replay())).ok,true);
  assert.equal((await actions.createMatchInline(replay())).ok,true);
  assert.equal((await actions.createMatchInline(form(fresh,{request_id:replayId,result:'lose'}))).status,'conflict');
  assert.deepEqual((await db.query('select result from public.matches where user_id=$1 and request_id=$2',[user,replayId])).rows,[{result:'win'}]);
  await negative(db,"insert into public.matches(user_id,environment_id,my_deck_id,opponent_deck_id,result,turn_order,request_id) values($1,$2,$3,$3,'win','first',$4)",[user,fresh,deck,replayId],'23505');
  const guest=new FormData();guest.set('guest_matches_json',JSON.stringify([old,fresh,open].map((id,i)=>({local_id:'guest-'+i,environment_id:id,my_deck_id:deck,opponent_deck_id:deck,turn_order:'first',result:'win',played_at:'2026-09-20T00:00:00Z'}))));
  assert.deepEqual((await actions.importGuestMatches(guest)).importedIds,['guest-1','guest-2']);result.partialGuest=true;
  result.nonAdminAuthenticatedDefense=true;
  await db.query('reset role');await db.query('insert into public.admin_users(user_id) values($1)',[user]);await db.query('set local role authenticated');
  expireOnInsert=true;const race=await actions.createMatchInline(form(open));assert.equal(race.ok,false);assert.match(race.message,/現在戦績を入力できません/);result.validationInsertRace=true;
  // Admin uses actual Server Action parsing and persists UTC through real RLS.
  const edit=new FormData();for(const [k,v]of Object.entries({environment_ids:open,[`name_${open}`]:'JST schedule',[`allow_match_input_${open}`]:'on',[`match_input_start_at_${open}`]:'2026-09-29T00:30',[`match_input_end_at_${open}`]:'2026-09-29T17:00'}))edit.set(k,v);
  await assert.rejects(admin.updateEnvironmentsBatch(edit),/REDIRECT:\/admin\?notice=environments_updated/);
  const stored=(await db.query('select match_input_start_at,match_input_end_at from public.environments where id=$1',[open])).rows[0];assert.deepEqual(stored,{match_input_start_at:'2026-09-28T15:30:00.000Z',match_input_end_at:boundary});result.admin.push(stored);
  edit.set(`match_input_end_at_${open}`,'2026-09-28T00:30');await assert.rejects(admin.updateEnvironmentsBatch(edit),/environments_update_failed/);assert.deepEqual((await db.query('select match_input_start_at,match_input_end_at from public.environments where id=$1',[open])).rows[0],stored);
  result.passed=true;
 }finally{await db.query('rollback');await db.end();fs.mkdirSync('build/environment-schedule',{recursive:true});fs.writeFileSync('build/environment-schedule/db-result.json',JSON.stringify(result,null,2));}
});
