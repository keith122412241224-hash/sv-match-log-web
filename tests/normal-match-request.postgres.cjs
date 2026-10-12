/* eslint-disable @typescript-eslint/no-require-imports */
// Real, disposable PostgreSQL + PostgREST. Never uses project env/remote DB URLs.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const {spawn,spawnSync,execFileSync}=require('node:child_process'),{AsyncLocalStorage}=require('node:async_hooks');
const root=process.cwd(),out=path.resolve(process.env.NORMAL_MATCH_OUTPUT||'build/normal-match-idempotency/native');
const bin=path.resolve(process.env.POSTGRES_BIN||'build/guest-import-final-audit/tools/pgsql/bin');
const restBin=path.resolve(process.env.POSTGREST_BIN||'build/guest-import-final-audit/tools/postgrest/postgrest.exe');
const {Client}=require(path.resolve(process.env.PG_MODULE||'build/migration-step3-local/tools/node_modules/pg'));
const host='127.0.0.1',port=55519,apiPort=55520,database='normal_match_request_test';
const connection={host,port,user:'auditadmin',database,connectionTimeoutMillis:2000};
const nativeFetch=global.fetch,children=[],clients=[],fds=[],sleep=ms=>new Promise(r=>setTimeout(r,ms));
const report={localOnly:true,hostedAuth:false,concurrency:[],actions:[],aggregation:[],checks:[]};
const migration='20261012090650_normal_match_request_identity.sql';
const connect=async(dbname=database)=>{const c=new Client({...connection,database:dbname});await c.connect();clients.push(c);return c;};
const start=(exe,args,name,extra={})=>{const fd=fs.openSync(path.join(out,name+'.log'),'w');fds.push(fd);const p=spawn(exe,args,{windowsHide:true,stdio:['ignore',fd,fd],env:{...process.env,...extra}});children.push(p);return p;};
async function until(fn){for(let i=0;i<100;i++){if(await fn())return;await sleep(100);}throw Error('readiness timeout');}
(async()=>{
 fs.mkdirSync(out,{recursive:true});const data=fs.mkdtempSync(path.join(out,'pgdata-'));
 const init=spawnSync(path.join(bin,'initdb.exe'),['-D',data,'-U','auditadmin','-A','trust','-E','UTF8','--locale=C'],{windowsHide:true,encoding:'utf8'});
 fs.writeFileSync(path.join(out,'initdb.log'),init.stdout+init.stderr);assert.equal(init.status,0);
 start(path.join(bin,'postgres.exe'),['-D',data,'-h',host,'-p',String(port)],'postgres');
 await until(async()=>{const c=new Client({...connection,database:'postgres'});try{await c.connect();await c.end();return true;}catch{await c.end().catch(()=>{});return false;}});
 const bootstrap=await connect('postgres');assert.equal(path.resolve((await bootstrap.query("select current_setting('data_directory') d")).rows[0].d).toLowerCase(),data.toLowerCase());
 await bootstrap.query('create role postgres superuser');await bootstrap.query('create database '+database);
 const admin=await connect();report.target=(await admin.query('select current_database() name,inet_server_addr()::text host,version() version')).rows[0];
 assert.equal(report.target.name,database);assert.equal(report.target.host.split('/')[0],host);
 await admin.query('set role postgres');global.normalTestDb={query:(...a)=>admin.query(...a),exec:s=>admin.query(s),close:async()=>{}};
 const adapter=path.join(out,'pg-adapter.cjs');fs.writeFileSync(adapter,'exports.PGlite={create:async()=>global.normalTestDb};');process.env.PGLITE_MODULE=adapter;
 const {setup,ids}=require('./match-mutations-db.cjs');
 let securityBefore;
 const security=async()=> (await admin.query("select c.relname,c.relacl::text,c.relrowsecurity,(select jsonb_agg(to_jsonb(p) order by policyname) from pg_policies p where p.schemaname='public' and p.tablename=c.relname) policies from pg_class c where c.oid in ('public.matches'::regclass,'public.environments'::regclass) order by c.relname")).rows;
 await setup({beforeMigration:async(_,f)=>{if(f===migration)securityBefore=await security();}});
 assert.deepEqual(await security(),securityBefore);report.checks.push('new migration preserves matches/environment RLS and GRANT');
 await admin.query("create role authenticator login noinherit; grant anon,authenticated to authenticator; grant usage on schema public to anon,authenticated;");
 await admin.query("create or replace function auth.uid() returns uuid language sql stable as $$select coalesce(nullif(current_setting('request.jwt.claim.sub',true),''),nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'sub')::uuid$$");
 const assume=async(c,u=ids.a)=>{await c.query('reset role');await c.query("select set_config('request.jwt.claim.sub',$1,false),set_config('request.jwt.claims',$2,false)",[u||'',JSON.stringify(u?{sub:u,is_anonymous:false}:{})]);await c.query('set role '+(u?'authenticated':'anon'));};
 const row=(id,owner=ids.a)=>({user_id:owner,request_id:id,environment_id:ids.env,my_deck_id:owner===ids.a?ids.deck:ids.bdeck,opponent_deck_id:owner===ids.a?ids.deck:ids.bdeck,my_archetype_id:ids.arch,opponent_archetype_id:ids.arch,result:'lose',turn_order:'first',played_at:new Date().toISOString()});
 const insert=(c,r)=>c.query('insert into public.matches('+Object.keys(r).join(',')+') values('+Object.keys(r).map((_,i)=>'$'+(i+1)).join(',')+') on conflict(user_id,request_id) do nothing returning *',Object.values(r));
 const rows=async(id,owner=ids.a)=>(await admin.query('select * from public.matches where request_id=$1 and user_id=$2',[id,owner])).rows;
 const connections=await Promise.all(Array.from({length:5},()=>connect()));const pids=await Promise.all(connections.map(async c=>(await c.query('select pg_backend_pid() p')).rows[0].p));assert.equal(new Set(pids).size,5);report.backendPids=pids;
 for(const c of connections)await assume(c);
 for(const n of [2,5])for(let trial=0;trial<3;trial++){
  const r=row(crypto.randomUUID());await connections[0].query('begin');await insert(connections[0],r);
  let finished=0;const waiting=connections.slice(1,n).map(c=>insert(c,{...r,result:'win'}).then(v=>{finished++;return v;}));
  await sleep(120);assert.equal(finished,0,'competitors really wait on an uncommitted unique key');await connections[0].query('commit');
  const replies=await Promise.all(waiting);assert.ok(replies.every(r=>r.rowCount===0));assert.equal((await rows(r.request_id)).length,1);assert.equal((await rows(r.request_id))[0].result,'lose');
  report.concurrency.push({connections:n,trial,blockedBeforeCommit:true,count:1,originalUnchanged:true});
 }
 const rollback=row(crypto.randomUUID());await connections[0].query('begin');await insert(connections[0],rollback);const waiting=insert(connections[1],rollback);await sleep(80);await connections[0].query('rollback');assert.equal((await waiting).rowCount,1);
 const locked=row(crypto.randomUUID());await connections[0].query('begin');await insert(connections[0],locked);await connections[1].query("set lock_timeout='100ms'");await assert.rejects(insert(connections[1],locked),e=>e.code==='55P03');await connections[0].query('commit');await connections[1].query('set lock_timeout=0');assert.equal((await insert(connections[1],locked)).rowCount,0);
 report.checks.push('transaction rollback and lock timeout retries save exactly once');
 const secret=crypto.randomBytes(48).toString('hex');
 start(restBin,[],'postgrest',{PATH:bin+';'+process.env.PATH,PGRST_DB_URI:`postgresql://authenticator@${host}:${port}/${database}`,PGRST_DB_SCHEMAS:'public',PGRST_DB_ANON_ROLE:'anon',PGRST_JWT_SECRET:secret,PGRST_SERVER_HOST:host,PGRST_SERVER_PORT:String(apiPort),PGRST_DB_POOL:'10'});
 const origin=`http://${host}:${apiPort}`;await until(async()=>{try{return(await nativeFetch(origin+'/')).status===200;}catch{return false;}});
 const jwt=u=>{const a=Buffer.from(JSON.stringify({alg:'HS256',typ:'JWT'})).toString('base64url'),b=Buffer.from(JSON.stringify({role:'authenticated',sub:u,is_anonymous:false,exp:Math.floor(Date.now()/1000)+3600})).toString('base64url');return a+'.'+b+'.'+crypto.createHmac('sha256',secret).update(a+'.'+b).digest('base64url');};
 require('./register.cjs');global.fetch=nativeFetch;
 const {createClient}=require('@supabase/supabase-js'),sessions=new AsyncLocalStorage(),Module=require('node:module'),load=Module._load,invalidated=[];
 const sdk=(u=ids.a,fault={})=>{const c=createClient(origin,'local-public-fixture',{auth:{persistSession:false,autoRefreshToken:false},global:{headers:u?{Authorization:'Bearer '+jwt(u)}:{},fetch:async(url,options)=>{
  const target=String(url).replace('/rest/v1/','/');assert.equal(new URL(target).origin,origin);
  const isWrite=options.method==='POST'&&new URL(target).pathname==='/matches';
  if(isWrite&&fault.fail)return new Response(JSON.stringify({message:'injected database error'}),{status:503});
  if(!isWrite&&fault.read)return new Response(JSON.stringify({message:'injected read error'}),{status:400});
  const response=await nativeFetch(target,options);if(isWrite&&fault.lost){fault.lost=false;throw Error('response lost after COMMIT');}return response;
 }}});c.auth.getUser=async()=>({data:{user:u?{id:u,is_anonymous:false}:null}});return c;};
 Module._load=function(name,...args){if(name==='@/lib/supabase/server')return{createSupabaseServerClient:async()=>sessions.getStore()};if(name==='next/cache')return{revalidatePath:p=>invalidated.push(p)};if(name==='next/navigation')return{redirect:p=>{throw Error('redirect:'+p);}};return load.call(this,name,...args);};
 const actions=require('../src/app/actions.ts'),a=sdk(),b=sdk(ids.b);
 const form=(id,extra={})=>{const f=new FormData();for(const[k,v]of Object.entries({request_id:id,environment_id:ids.env,my_archetype_id:ids.arch,opponent_archetype_id:ids.arch,result:'lose',turn_order:'first',...extra}))f.set(k,v);return f;};
 const save=(f,client=a)=>sessions.run(client,()=>actions.createMatchInline(f));
 const id=crypto.randomUUID();assert.equal((await save(form(id))).status,'inserted');const original=await rows(id);
 for(let i=0;i<10;i++)assert.equal((await save(form(id))).status,'replayed');assert.deepEqual(await rows(id),original);
 for(const extra of [{result:'win'},{turn_order:'second'},{environment_id:ids.env2},{rank_tier:'aa'},{my_archetype_id:ids.arch2},{opponent_archetype_id:ids.arch2}])assert.equal((await save(form(id,extra))).status,'conflict');assert.deepEqual(await rows(id),original);
 assert.equal((await save(form(crypto.randomUUID()))).status,'inserted');assert.equal((await save(form(id,{user_id:ids.a}),b)).status,'inserted');assert.equal((await rows(id,ids.b)).length,1);
 report.actions.push('initial insert + 10 replays = one unchanged row; six payload conflicts; different ID same content; other user same ID; forged owner ignored');
 for(const n of [2,5]){const key=crypto.randomUUID(),result=await Promise.all(Array.from({length:n},()=>save(form(key))));assert.equal(result.filter(r=>r.status==='inserted').length,1);assert.equal(result.filter(r=>r.status==='replayed').length,n-1);assert.equal((await rows(key)).length,1);report.actions.push({postgrestConcurrentActions:n,statuses:result.map(r=>r.status),count:1});}
 const lost={lost:true},lostId=crypto.randomUUID();assert.equal((await save(form(lostId),sdk(ids.a,lost))).ok,false);assert.equal((await rows(lostId)).length,1);const beforeRetry=await rows(lostId);assert.equal((await save(form(lostId))).status,'replayed');assert.deepEqual(await rows(lostId),beforeRetry);
 const failed={fail:true},failedId=crypto.randomUUID();assert.equal((await save(form(failedId),sdk(ids.a,failed))).status,'error');assert.equal((await rows(failedId)).length,0);failed.fail=false;assert.equal((await save(form(failedId),sdk(ids.a,failed))).status,'inserted');
 assert.equal((await save(form(crypto.randomUUID()),sdk(ids.a,{read:true}))).status,'error');
 await admin.query('update public.environments set allow_match_input=false where id=$1',[ids.env]);assert.equal((await save(form(lostId))).status,'replayed');assert.equal((await save(form(crypto.randomUUID()))).ok,false);await admin.query('update public.environments set allow_match_input=true where id=$1',[ids.env]);
 await admin.query('update public.deck_archetypes set is_active=false where id=$1',[ids.arch]);assert.equal((await save(form(lostId))).status,'replayed');await admin.query('update public.deck_archetypes set is_active=true where id=$1',[ids.arch]);
 for(const invalid of ['', 'x', '0'.repeat(500),crypto.randomUUID().replace(/-/g,'')])assert.equal((await save(form(invalid))).ok,false);
 await assert.rejects(save(form(crypto.randomUUID()),sdk(null)),/redirect:\/login/);
 const denied=await save(form(crypto.randomUUID(),{my_archetype_id:'',my_deck_id:ids.bdeck}));assert.equal(denied.ok,false);
 const anon=await nativeFetch(origin+'/matches',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(row(crypto.randomUUID()))});assert.equal(anon.status,401);
 assert.deepEqual(await(await nativeFetch(origin+'/matches?request_id=eq.'+lostId,{headers:{Authorization:'Bearer '+jwt(ids.b)}})).json(),[]);
 report.actions.push('lost commit reply, actual DB error/read error, closed window replay, inactive archetype replay, invalid/missing IDs, anon and foreign decks');
 // Dedicated aggregate population: one historic win and one new loss for A;
 // B has no match in this environment. Mirror-deck v4 denominator is checked separately.
 const env=crypto.randomUUID();await admin.query("insert into public.environments(id,user_id,name) values($1,$2,'aggregate regression')",[env,ids.a]);
 await insert(connections[0],{...row(null),environment_id:env,result:'win'});
 const aggregateId=crypto.randomUUID();assert.equal((await save(form(aggregateId,{environment_id:env}))).status,'inserted');
 // Advance this synthetic population into the completed-hour v4 window. The
 // production RPC deliberately excludes the current partial hour.
 await admin.query("update public.matches set played_at=now()-interval '2 hours' where environment_id=$1",[env]);
 await assume(admin);
 const queries=[['Home','select public.get_home_dashboard($1) p'],['Analysis','select public.get_analysis_aggregates_v3($1) p'],['Matrix','select public.get_matchup_aggregates_v1($1) p'],['Environment v4',"select public.get_environment_dashboard_aggregates_v4($1,'all') p"],['Period Report',"select public.get_period_report_aggregates_v3(now()-interval '1 day',now()+interval '1 day',now()-interval '3 days',now()-interval '2 days',p_environment_id:=$1) p"],['OBS', 'select public.get_analysis_aggregates_v3_exclusive($1) p']];
 const snapshot=async()=>{const result={};for(const[name,sql]of queries){result[name]=(await admin.query(sql,[env])).rows[0].p;delete result[name].aggregatedAt;}return result;};
 const aggregates=await snapshot();assert.equal(aggregates.Home.summary.total,2);assert.equal(aggregates.Home.summary.wins,1);assert.equal(aggregates.Home.summary.winRate,50);
 for(let i=0;i<10;i++)assert.equal((await save(form(aggregateId,{environment_id:env}))).status,'replayed');assert.deepEqual(await snapshot(),aggregates);
 report.aggregation={beforeAndAfterReplay:aggregates,homeCount:2,homeWinRate:50,identical:true};
 assert.equal((await save(form(crypto.randomUUID(),{environment_id:env}))).status,'inserted');assert.equal((await snapshot()).Home.summary.total,3);
 const edited=await sessions.run(a,()=>actions.updateMatchInline(original[0].id,form(id,{result:'win'})));assert.equal(edited.ok,true);assert.equal((await rows(id))[0].request_id,id);assert.equal((await save(form(id))).status,'conflict');assert.equal((await sessions.run(a,()=>actions.deleteMatchInline(original[0].id))).ok,true);
 const guestRow={local_id:id,...row(undefined),my_archetype_id:ids.arch,opponent_archetype_id:ids.arch};
 const guest=()=>{const f=new FormData();f.set('guest_matches_json',JSON.stringify([guestRow]));return f;};
 assert.equal((await sessions.run(a,()=>actions.importGuestMatches(guest()))).ok,true);assert.equal((await sessions.run(a,()=>actions.importGuestMatches(guest()))).ok,true);
 await admin.query('reset role');assert.equal((await admin.query('select count(*)::int n from public.matches where guest_import_id=$1',[id])).rows[0].n,1);
 report.checks.push('normal edit/delete, guest replay and independent guest identity preserved');
 // Reapply candidate over 6,280 SYNTHETIC legacy rows in this isolated DB.
 await admin.query('alter table public.matches drop column request_id');
 await admin.query("notify pgrst,'reload schema'");await sleep(500);
 assert.equal((await save(form(crypto.randomUUID()))).status,'error');
 report.checks.push('new Action fails closed when migration/schema column is absent');
 await admin.query("insert into public.matches(user_id,environment_id,my_deck_id,opponent_deck_id,result,turn_order) select $1,$2,$3,$3,'win','first' from generate_series(1,greatest(0,6280-(select count(*)::int from public.matches)))",[ids.a,ids.env,ids.deck]);
 const metadata=async()=>({data:(await admin.query("select count(*)::int n,md5(string_agg((to_jsonb(m)-'request_id')::text,'' order by id)) digest from public.matches m")).rows[0],security:await security()});
 const before=await metadata(),sql=fs.readFileSync(path.join(root,'supabase/migrations',migration),'utf8');
 await connections[0].query('begin');await connections[0].query('select id from public.matches limit 1');
 await assert.rejects(admin.query(sql),e=>e.code==='55P03');await admin.query('rollback');await connections[0].query('rollback');assert.deepEqual(await metadata(),before);
 const began=Date.now();await admin.query(sql);assert.deepEqual(await metadata(),before);assert.equal((await admin.query('select count(*)::int n from public.matches where request_id is not null')).rows[0].n,0);
 const indexes=(await admin.query("select indexrelid::regclass::text name,indisvalid,indisunique,pg_get_indexdef(indexrelid) definition from pg_index where indrelid='public.matches'::regclass and indexrelid::regclass::text like '%request%'")).rows;assert.equal(indexes.length,1);assert.equal(indexes[0].indisvalid,true);assert.equal(indexes[0].indisunique,true);
 await assert.rejects(admin.query(sql),e=>e.code==='42701');await admin.query('rollback');assert.deepEqual(await metadata(),before);
 await admin.query("notify pgrst,'reload schema'");await sleep(500);
 const ts=require('typescript'),old=new Module(path.join(root,'src/app/old-normal-actions.cjs'),module);old.filename=path.join(root,'src/app/old-normal-actions.cjs');old.paths=module.paths;old._compile(ts.transpileModule(execFileSync('git',['show','b14538fc70651293173efec95886b8c2241552a8:src/app/actions.ts'],{encoding:'utf8'}),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,old.filename);
 const legacy=form('');legacy.delete('request_id');assert.equal((await sessions.run(a,()=>old.exports.createMatchInline(legacy))).ok,true);assert.equal((await admin.query('select count(*)::int n from public.matches')).rows[0].n,6281);
 report.migration={syntheticRows:before.data.n,allFieldsPreserved:true,securityPreserved:true,legacyNulls:true,lockTimeoutAtomic:true,reapplyAtomic:true,oldAppCompatible:true,indexes,elapsedMs:Date.now()-began};
 Module._load=load;report.passed=true;
})().catch(e=>{report.error=e.stack;console.error(e);process.exitCode=1;}).finally(async()=>{global.fetch=nativeFetch;for(const c of clients)await c.end().catch(()=>{});for(const p of children.reverse()){p.kill();await Promise.race([new Promise(r=>p.once('exit',r)),sleep(2000)]);}for(const f of fds)fs.closeSync(f);fs.writeFileSync(path.join(out,'result.json'),JSON.stringify(report,null,2));console.log(JSON.stringify({passed:report.passed,error:report.error,concurrency:report.concurrency.length}));});
