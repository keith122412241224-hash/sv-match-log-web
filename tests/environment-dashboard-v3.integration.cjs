/* eslint-disable @typescript-eslint/no-require-imports */
// Real local PG17 + Auth + PostgREST. Fixed loopback endpoints, never production.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {Client}=require(process.env.PG_MODULE||'pg');
const f=require('./environment-dashboard-fixture.cjs');
const out=path.resolve('build/ux-evidence'),rpc='get_environment_dashboard_aggregates_v3';
const raw=fs.readFileSync(out+'/keys.json'),keys=JSON.parse(raw.toString(raw[0]===255?'utf16le':'utf8').replace(/^\uFEFF/,''));
assert.equal(keys.API_URL,'http://127.0.0.1:58321');assert.equal(keys.DB_URL,'postgresql://postgres:postgres@127.0.0.1:58322/postgres');
const db=new Client({host:'127.0.0.1',port:58322,user:'postgres',password:'postgres',database:'postgres'});
const atoms=['unranked',...f.leaves],report={localOnly:true,comparisons:0,auth:[],checks:[]};
async function http(route,body,token,admin=false){const r=await fetch(keys.API_URL+route,{method:'POST',headers:{apikey:admin?keys.SERVICE_ROLE_KEY:keys.ANON_KEY,'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{})},body:JSON.stringify(body)});return {status:r.status,body:await r.json()};}
async function claim(claims,role='authenticated'){await db.query('reset role');await db.query("select set_config('request.jwt.claims',$1,false)",[JSON.stringify(claims)]);await db.query('set role '+role);}
const call=async(env,period='24h',ranks=atoms,v=3)=>(await db.query(`select public.get_environment_dashboard_aggregates_v${v}($1,$2,$3::text[]) p`,[env,period,ranks])).rows[0].p;
async function rejects(fn,code){await db.query('savepoint negative');try{await assert.rejects(fn,e=>e.code===code);}finally{await db.query('rollback to negative');}}
function expected(rows,env,period,ranks,anchor){
 const span=BigInt({'24h':24,'3d':72,'7d':168,'30d':720}[period])*f.HOUR;
 const result={};
 for(const [label,end] of [['current',anchor],['previous',anchor-span]]){
  const selected=rows.filter(r=>r.environment===env&&r.played>=end-span&&r.played<end&&ranks.includes(!r.rank?'unranked':r.rank==='master'?'master:emerald':r.rank==='grandmaster'?'grandmaster:none':r.rank));
  result[label]={total:{status:selected.length?'available':'no_data',totalMatches:selected.length||null},decks:f.catalog.map(d=>{
   let count=0,target=0,evaluation=0,wins=0;
   for(const r of selected){const my=(r.my??'unclassified')===d.key,op=(r.opponent??'unclassified')===d.key;if(op)count++;if(my||op)target++;if(my){evaluation++;if(r.result==='win')wins++;}if(op){evaluation++;if(r.result==='lose')wins++;}}
   return {key:d.key,encounter:{status:count?'available':'no_data',count:count||null},winrate:{status:target?'available':'no_data',targetRegistrations:target||null,evaluationCount:evaluation||null,wins:target?wins:null}};
  })};
 }return result;
}
function audit(p,rows){
 const exact=(o,k)=>assert.deepEqual(Object.keys(o).sort(),k.sort());
 exact(p,['version','period','rankFilters','environmentId','aggregatedAt','dataThrough','current','previous','decks']);
 for(const label of ['current','previous']){exact(p[label],['start','end','total']);exact(p[label].total,['status','totalMatches']);}
 for(const d of p.decks){exact(d,['key','name','className','current','previous']);for(const label of ['current','previous']){exact(d[label],['encounter','winrate']);exact(d[label].encounter,['status','count']);exact(d[label].winrate,['status','targetRegistrations','evaluationCount','wins']);}}
 const json=JSON.stringify(p);assert.ok(!json.includes('privacy_suppressed'));
 for(const secret of [...f.users,...rows.map(r=>r.id),...rows.map(r=>r.privateDeck),'PRIVATE-DECK','PRIVATE-MEMO','@example.test'])assert.ok(!json.includes(secret),'private field escaped');
 assert.deepEqual(p.decks.map(d=>d.key),f.catalog.map(d=>d.key).sort());
}
const catalog=async()=> (await db.query("select n.nspname,p.proname,pg_get_functiondef(p.oid) definition,p.proacl::text acl from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname in ('public','private') order by 1,2,p.oid")).rows;
(async()=>{await db.connect();let sessions,anchor,rows;try{
 if(fs.existsSync(out+'/sessions.json')){const saved=JSON.parse(fs.readFileSync(out+'/sessions.json','utf8'));sessions=saved.sessions;f.users.splice(0,5,...saved.users);}else{
  sessions=[];const password=require('node:crypto').randomBytes(20).toString('hex');
  for(let i=0;i<5;i++){const email=`ux-${Date.now()}-${i}@example.test`;const u=await http('/auth/v1/admin/users',{email,password,email_confirm:true},keys.SERVICE_ROLE_KEY,true);assert.equal(u.status,200);f.users[i]=u.body.id;const login=await http('/auth/v1/token?grant_type=password',{email,password});assert.equal(login.status,200);sessions.push(login.body);}
 }
 anchor=BigInt(Math.floor(Date.now()/1800000)*1800000)*1000n;rows=f.fixture(anchor);
 f.env.single=f.uuid(240);rows.push({id:f.uuid(9800),environment:f.env.single,user:f.users[0],my:f.catalog[0].key,opponent:f.catalog[0].key,played:anchor-f.HOUR,rank:'a',result:'win',privateDeck:f.uuid(300)});
 fs.writeFileSync(out+'/sessions.json',JSON.stringify({sessions,users:f.users,anchor:String(anchor),env:f.env}));
 await db.query('begin');await db.query('delete from public.matches where environment_id=any($1::uuid[])',[Object.values(f.env)]);
 for(let i=0;i<5;i++)await db.query("insert into public.decks(id,user_id,name,class_name) values($1,$2,'PRIVATE-DECK','エルフ') on conflict(id) do nothing",[f.uuid(300+i),f.users[i]]);
 for(const [name,id]of Object.entries(f.env))await db.query("insert into public.environments(id,user_id,name,allow_match_input,created_at,memo) values($1,$2,$3,true,'2020-01-01','PRIVATE-MEMO') on conflict(id) do nothing",[id,f.users[0],name]);
 for(const d of f.catalog.filter(d=>d.key!=='unclassified'))await db.query('insert into public.deck_archetypes(id,name,class_name,is_active) values($1,$2,$3,$4) on conflict(id) do nothing',[d.key,d.name,d.className,d.name!=='Shared inactive']);
 for(const r of rows){const [tier,child]=(r.rank||'').split(':');await db.query("insert into public.matches(id,user_id,environment_id,my_deck_id,opponent_deck_id,my_archetype_id,opponent_archetype_id,result,turn_order,played_at,rank_tier,master_group,grandmaster_rating,memo) values($1,$2,$3,$4,$4,$5,$6,$7,'first',$8,$9,$10,$11,'PRIVATE-MEMO')",[r.id,r.user,r.environment,r.privateDeck,r.my,r.opponent,r.result,f.iso(r.played),tier||null,tier==='master'?child||'emerald':null,tier==='grandmaster'?child||'none':null]);}
 await db.query('commit');
 const before=await catalog();await db.query('begin');
 for(const v of [2,3]){const def=(await db.query(`select pg_get_functiondef('private.get_environment_dashboard_aggregates_v${v}(uuid,text,text[])'::regprocedure) d`)).rows[0].d;await db.query(def.replace('pg_catalog.statement_timestamp()',`timestamptz '${f.iso(anchor+14n*60_000_000n)}'`));}
 await claim({sub:f.users[0],is_anonymous:false});
 for(const env of Object.values(f.env))for(const period of ['24h','3d','7d','30d'])for(const ranks of [atoms,...atoms.map(a=>[a]),['a','aa'],['master:sapphire','master:diamond'],atoms.slice(12)]){
  const p=await call(env,period,ranks),want=expected(rows,env,period,ranks,anchor);assert.equal(p.version,3);assert.deepEqual(p.rankFilters,atoms.filter(a=>ranks.includes(a)));
  for(const label of ['current','previous']){assert.deepEqual(p[label].total,want[label].total);for(const d of want[label].decks)assert.deepEqual(p.decks.find(v=>v.key===d.key)[label],{encounter:d.encounter,winrate:d.winrate},`${env}/${period}/${ranks}/${label}/${d.key}`);}
  audit(p,rows);report.comparisons++;
 }
 const single=await call(f.env.single);assert.equal(single.current.total.totalMatches,1);assert.deepEqual(single.decks.find(d=>d.key===f.catalog[0].key).current.winrate,{status:'available',targetRegistrations:1,evaluationCount:2,wins:1});
 assert.equal((await call(f.env.single,'24h',atoms,2)).current.total.status,'privacy_suppressed');
 assert.deepEqual(await call(f.env.ranks,'24h',['aa','aa','unranked']),await call(f.env.ranks,'24h',['unranked','aa']));
 report.checks.push('one-registration mirror 1 target / 2 evaluations / 1 win; v2 still suppressed; duplicate ranks do not multiply counts');
 for(const ranks of [null,[],['all'],['unknown'],[null],Array(18).fill('a')])await rejects(()=>call(f.env.single,'24h',ranks),'22023');
 await rejects(()=>call(null),'22023');await rejects(()=>call(f.env.single,'bad'),'22023');
 for(const claims of [{},{sub:f.users[0]},{sub:f.users[0],is_anonymous:true},{sub:f.users[0],is_anonymous:'false'},{sub:f.users[0],is_anonymous:null}]){await claim(claims);await rejects(()=>call(f.env.single),'42501');report.auth.push('reject claims '+JSON.stringify({...claims,sub:claims.sub?'member':undefined}));}
 await claim({sub:f.users[0],is_anonymous:false},'anon');await rejects(()=>call(f.env.single),'42501');
 await claim({sub:f.users[0],is_anonymous:false},'service_role');await rejects(()=>call(f.env.single),'42501');
 await db.query('rollback');assert.deepEqual(await catalog(),before);report.checks.push('all function definitions and ACLs unchanged after rollback of fixed test clock');
 const definitions=(await db.query("select n.nspname,p.proname,p.prosecdef,p.proconfig,p.proacl::text acl,md5(pg_get_functiondef(p.oid)) md5 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where p.proname like 'get_environment_dashboard_aggregates%' order by 1,2")).rows;
 for(const d of definitions.filter(d=>d.proname===rpc)){assert.equal(d.prosecdef,d.nspname==='private');assert.deepEqual(d.proconfig,['search_path=""']);assert.equal(d.acl,'{postgres=X/postgres,authenticated=X/postgres}');}
 report.definitions=definitions;
 const args={p_environment_id:f.env.single,p_period:'24h',p_rank_filters:atoms};
 const member=await http('/rest/v1/rpc/'+rpc,args,sessions[0].access_token);assert.equal(member.status,200);assert.equal(member.body.current.total.totalMatches,1);audit(member.body,rows);
 const anon=await http('/auth/v1/signup',{});assert.equal(anon.status,200);assert.equal((await http('/rest/v1/rpc/'+rpc,args,anon.body.access_token)).status,403);
 assert.equal((await http('/rest/v1/rpc/'+rpc,args)).status,401);
 assert.equal((await http('/rest/v1/rpc/'+rpc,args,keys.SERVICE_ROLE_KEY,true)).status,403);
 report.auth.push('PostgREST member 200 / unsigned 401 / anonymous sign-in 403 / service-role 403');
 await claim({sub:f.users[0],is_anonymous:false});const own=await db.query('select distinct user_id from public.matches');assert.deepEqual(own.rows.map(r=>r.user_id),[f.users[0]]);report.checks.push('direct matches RLS remains owner-only');await db.query('reset role');
 report.postgres=(await db.query('select version()')).rows[0].version;
 fs.writeFileSync(out+'/integration.json',JSON.stringify(report,null,2));console.log(JSON.stringify({comparisons:report.comparisons,auth:report.auth,checks:report.checks},null,2));
}finally{await db.query('rollback').catch(()=>{});await db.end();}})().catch(e=>{console.error(e.stack);process.exitCode=1;});
