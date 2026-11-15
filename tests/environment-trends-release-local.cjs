/* eslint-disable @typescript-eslint/no-require-imports */
// Dedicated unlinked local Supabase only. No cloud URL or credentials accepted.
const fs = require('node:fs'), path = require('node:path'), cp = require('node:child_process'), crypto = require('node:crypto'), assert = require('node:assert/strict');
assert.equal(process.env.ENVIRONMENT_TRENDS_LOCAL, 'local-only');
const root = path.resolve(__dirname, '..'), out = path.join(root, 'build/environment-trends-release-local');
const work = path.join(out, 'local'), dest = path.join(work, 'supabase'), project = 'svml-trends-release-20261115';
const container = 'supabase_db_' + project, api = 'http://127.0.0.1:16521';
const cli = path.join(root, 'build/stable-operations-creator-backup-tools/supabase.exe');
const indexFile = '20261114104651_environment_trends.sql', rpcFile = '20261114212352_environment_trends_rpc.sql';
const read = f => fs.readFileSync(path.join(root, f), 'utf8').replaceAll('\r\n', '\n');
assert(!fs.existsSync(path.join(dest, '.temp/project-ref')));
if (process.argv.includes('--prepare')) {
  assert(!fs.existsSync(path.join(dest, 'config.toml')), 'Use a fresh isolated workdir; never reset existing stacks');
  fs.mkdirSync(path.join(dest, 'migrations'), { recursive: true });
  const config = read('supabase/config.toml').replace(/^project_id = .*$/m, `project_id = "${project}"`)
    .replace(/\b543(\d\d)\b/g, '165$1').replace('inspector_port = 8083', 'inspector_port = 6583')
    .replace(/^enable_anonymous_sign_ins = false$/m, 'enable_anonymous_sign_ins = true');
  fs.writeFileSync(path.join(dest, 'config.toml'), config);
  for (const f of fs.readdirSync('supabase/migrations').filter(f => f.endsWith('.sql') && f < indexFile))
    fs.copyFileSync(path.join(root, 'supabase/migrations', f), path.join(dest, 'migrations', f));
  console.log('Prepared 22 historical migrations only; unlinked local API port 16521.');
  process.exit(0);
}
assert(read(path.relative(root, path.join(dest, 'config.toml'))).includes(`project_id = "${project}"`));
const report = { startedAt: new Date().toISOString(), localOnly: true, checks: [], passed: false };
const save = () => fs.writeFileSync(path.join(out, 'report.json'), JSON.stringify(report, null, 2));
function command(exe, args, input) { return cp.spawnSync(exe, args, {input, encoding:'utf8', windowsHide:true, maxBuffer:16e6, timeout:90000}); }
const psql = ['exec','-i',container,'psql','-X','-U','postgres','-d','postgres','-v','ON_ERROR_STOP=1','-Atq'];
function sql(s) { const r=command('docker',psql,s); assert.equal(r.status,0,r.stderr.slice(-1000)); return r.stdout.trim(); }
const json = s => JSON.parse(sql(s)), lit = s => "'" + String(s).replaceAll("'", "''") + "'";
function child(exe,args,input) {
  const p=cp.spawn(exe,args,{windowsHide:true,stdio:['pipe','pipe','pipe']}); let stdout='',stderr='';
  p.stdout.on('data',b=>stdout+=b); p.stderr.on('data',b=>stderr+=b); p.stdin.end(input);
  return {p,done:new Promise((resolve,reject)=>{p.on('error',reject);p.on('close',code=>resolve({code,stdout,stderr}));})};
}
const sleep = ms => new Promise(r=>setTimeout(r,ms));
const ok = (r,label) => { assert.equal(r.error,null,label+': '+r.error?.code);return r.data; };
async function main() {
  const status=command(cli,['status','--workdir',work,'-o','json']); assert.equal(status.status,0);
  const config=JSON.parse(status.stdout);assert.equal(config.API_URL,api);
  const fetchOriginal=globalThis.fetch;
  globalThis.fetch=(input,init)=>{assert.equal(new URL(typeof input==='string'||input instanceof URL?input:input.url).origin,api);return fetchOriginal(input,init);};
  const {createClient}=require('@supabase/supabase-js');
  const client=key=>createClient(api,key||config.ANON_KEY,{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}});
  const service=client(config.SERVICE_ROLE_KEY), member=client();
  const email='release-'+crypto.randomUUID()+'@example.test', password='Local!'+crypto.randomBytes(16).toString('hex');
  const user=ok(await service.auth.admin.createUser({email,password,email_confirm:true}),'Auth create').user;
  ok(await member.auth.signInWithPassword({email,password}),'Auth sign in');
  if(process.argv.includes('--recovery-only')) {
    const recovery={localOnly:true,checks:[],passed:false};
    const e=json("select jsonb_build_object('id',id) from public.environments where name='Release local' order by created_at limit 1");
    const a=json(`select jsonb_agg(id) from public.deck_archetypes where environment_id=${lit(e.id)}`);
    const args={p_environment_id:e.id,p_period:'7d',p_rank_filters:['unranked'],p_deck_ids:a};
    sql(read('supabase/operations/environment-trends/check-index.sql'));
    assert.notEqual(command('docker',psql,read('supabase/operations/environment-trends/drop-invalid-index.sql')).status,0);
    const d=crypto.randomUUID();sql(`insert into public.decks(id,user_id,name,class_name) values(${lit(d)},${lit(user.id)},'Recovery local','エルフ')`);
    const input={user_id:user.id,environment_id:e.id,my_deck_id:d,opponent_deck_id:d,my_archetype_id:a[0],opponent_archetype_id:a[0],result:'win',turn_order:'first',played_at:'2026-11-12T00:00:00Z',request_id:crypto.randomUUID()};
    try {
      sql(read('supabase/operations/environment-trends/disable-rpc.sql'));
      assert.equal((await member.rpc('get_environment_trend_aggregates_v1',args)).error?.code,'42501');
      assert.equal(sql("select has_function_privilege('authenticated','private.get_environment_trend_aggregates_v1(uuid,text,text[],uuid[])','execute')"),'f');
      ok(await member.rpc('get_environment_dashboard_aggregates_v4',{p_environment_id:e.id,p_period:'7d',p_rank_filters:['unranked']}),'summary while trend disabled');
      const inserted=ok(await member.from('matches').insert(input).select('id').single(),'input while trend disabled');
      // This isolated local fixture only: replace its index to exercise the recovery file.
      sql('drop index concurrently public.matches_environment_played_at_idx');
      const blocker=child('docker',psql,`set application_name='trend-recovery-blocker';begin;update public.matches set memo=memo where id=${lit(inserted.id)};select pg_sleep(5);commit;`);
      for(let i=0;i<40;i++){if(sql("select count(*) from pg_stat_activity where application_name='trend-recovery-blocker' and wait_event='PgSleep'")==='1')break;await sleep(50);}
      const failed=command('docker',psql,read('supabase/migrations/'+indexFile));assert.notEqual(failed.status,0);assert.match(failed.stderr,/lock timeout/);await blocker.done;
      sql(read('supabase/operations/environment-trends/drop-invalid-index.sql'));
      assert.equal(sql("select to_regclass('public.matches_environment_played_at_idx') is null"),'t');
      sql(read('supabase/migrations/'+indexFile));sql(read('supabase/operations/environment-trends/check-index.sql'));
      recovery.checks.push('Valid index deletion refused; generated INVALID detected and cleaned with recovery file; index restored without history repair; both new RPC grants revoked; existing summary and member input still work');
    } finally {
      sql('grant execute on function public.get_environment_trend_aggregates_v1(uuid,text,text[],uuid[]) to authenticated;grant execute on function private.get_environment_trend_aggregates_v1(uuid,text,text[],uuid[]) to authenticated;');
    }
    ok(await member.rpc('get_environment_trend_aggregates_v1',args),'RPC after local grant restoration');
    recovery.passed=true;fs.writeFileSync(path.join(out,'recovery-report.json'),JSON.stringify(recovery,null,2));console.log(JSON.stringify(recovery));return;
  }
  report.baselineVersions=json('select jsonb_agg(version order by version) from supabase_migrations.schema_migrations');
  assert.equal(report.baselineVersions.length,22);assert(report.baselineVersions.includes('20261026111607'));
  const snapshot=()=>sql(`select jsonb_build_object(
    'functions',(select jsonb_agg(jsonb_build_object('schema',n.nspname,'name',p.proname,'def',pg_get_functiondef(p.oid),'owner',pg_get_userbyid(p.proowner),'acl',p.proacl::text) order by p.oid) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname in ('public','private','suggestion_private') and p.proname<>'get_environment_trend_aggregates_v1' and p.prokind='f'),
    'policies',(select jsonb_agg(p order by schemaname,tablename,policyname) from pg_policies p),
    'tables',(select jsonb_agg(jsonb_build_object('name',c.relname,'rls',c.relrowsecurity,'acl',c.relacl::text) order by c.oid) from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind='r'))`);
  const before=snapshot(); fs.writeFileSync(path.join(out,'baseline-catalog.json'),before);
  assert.equal(sql("select has_function_privilege('authenticated','public.handle_new_user()','execute') or has_table_privilege('authenticated','public.matches','truncate')"),'f');
  const ids={env:crypto.randomUUID(),deck:crypto.randomUUID(),a:crypto.randomUUID(),b:crypto.randomUUID()};
  sql(`insert into public.environments(id,user_id,name,start_date,dashboard_end_at,allow_match_input) values(${lit(ids.env)},${lit(user.id)},'Release local','2026-11-01','2026-11-13T15:00:00Z',true);
    insert into public.decks(id,user_id,name,class_name) values(${lit(ids.deck)},${lit(user.id)},'Local deck','エルフ');
    insert into public.deck_archetypes(id,name,class_name,environment_id,environment_name) values(${lit(ids.a)},'Local A','エルフ',${lit(ids.env)},${lit(ids.env)}),(${lit(ids.b)},'Local B','ロイヤル',${lit(ids.env)},${lit(ids.env)});`);
  const match=()=>({user_id:user.id,environment_id:ids.env,my_deck_id:ids.deck,opponent_deck_id:ids.deck,my_archetype_id:ids.a,opponent_archetype_id:ids.a,result:'win',turn_order:'first',played_at:'2026-11-12T00:00:00Z',request_id:crypto.randomUUID()});
  const inserted=ok(await member.from('matches').insert(match()).select('id').single(),'member input before index');
  const rpc=read('supabase/migrations/'+rpcFile);
  const bad=command('docker',psql,rpc);assert.notEqual(bad.status,0);assert.match(bad.stderr,/Valid environment trend index required/);
  assert.equal(sql("select to_regprocedure('public.get_environment_trend_aggregates_v1(uuid,text,text[],uuid[])') is null"),'t');
  report.checks.push('Missing index prevents RPC creation; no partial functions');
  fs.copyFileSync(path.join(root,'supabase/migrations',indexFile),path.join(dest,'migrations',indexFile));
  const pushArgs=['db','push','--local','--skip-vault','--workdir',work,'--yes'];
  const dry=command(cli,[...pushArgs,'--dry-run']); assert.equal(dry.status,0);fs.writeFileSync(path.join(out,'index-dry-run.log'),dry.stdout+dry.stderr);
  // A real open writer forces concurrent build to wait. New member writes must still work.
  const blocker=child('docker',psql,`set application_name='trend-release-blocker';begin;update public.matches set memo=memo where id=${lit(inserted.id)};select pg_sleep(7);commit;`);
  for(let i=0;i<40;i++){if(sql("select count(*) from pg_stat_activity where application_name='trend-release-blocker' and wait_event='PgSleep'")==='1')break;await sleep(50);}
  assert.equal(sql("select count(*) from pg_stat_activity where application_name='trend-release-blocker' and wait_event='PgSleep'"),'1');
  const attempt=child(cli,pushArgs);let progress=false;
  for(let i=0;i<70;i++){if(sql("select count(*) from pg_stat_progress_create_index where relid='public.matches'::regclass")!=='0'){progress=true;break;}await sleep(50);}
  assert(progress,'Concurrent index build progress must be observable');
  const t=performance.now();ok(await member.from('matches').insert(match()),'member input during index');report.writeDuringIndexMs=Math.round(performance.now()-t);
  const failed=await attempt.done;fs.writeFileSync(path.join(out,'index-expected-timeout.log'),failed.stdout+failed.stderr);assert.notEqual(failed.code,0);assert.match(failed.stderr+failed.stdout,/lock timeout/);
  assert.equal((await blocker.done).code,0);
  const invalid=json("select jsonb_build_object('valid',indisvalid,'ready',indisready) from pg_index where indexrelid='public.matches_environment_played_at_idx'::regclass");assert.equal(invalid.valid,false);report.invalidIndex=invalid;
  assert.equal(sql("select count(*) from supabase_migrations.schema_migrations where version='20261114104651'"),'0');
  const blocked=command('docker',psql,rpc);assert.notEqual(blocked.status,0);assert.match(blocked.stderr,/Valid environment trend index required/);
  const retry=command(cli,pushArgs);assert.notEqual(retry.status,0);assert.match(retry.stdout+retry.stderr,/Equivalent environment trend index exists/);
  // Only this fresh local fixture: clean the failed index, without history repair.
  sql(read('supabase/operations/environment-trends/drop-invalid-index.sql'));
  const successful=command(cli,pushArgs);fs.writeFileSync(path.join(out,'index-success.log'),successful.stdout+successful.stderr);assert.equal(successful.status,0,successful.stderr);
  sql(read('supabase/operations/environment-trends/check-index.sql'));
  assert.notEqual(command('docker',psql,read('supabase/operations/environment-trends/drop-invalid-index.sql')).status,0,'Valid index must not be dropped');
  assert.equal(sql("select count(*) from supabase_migrations.schema_migrations where version='20261114104651'"),'1');
  report.checks.push('CLI 2.118.0 concurrent build allows real member INSERT while waiting; timeout leaves INVALID without history; invalid retry and RPC refused; local cleanup and retry succeed');
  // Transaction abort after all RPC/ACL statements must publish nothing.
  const aborted=command('docker',psql,rpc.replace(/commit;\s*$/, 'select 1/0;commit;'));
  assert.notEqual(aborted.status,0);assert.equal(sql("select count(*) from pg_proc where proname='get_environment_trend_aggregates_v1'"),'0');
  fs.copyFileSync(path.join(root,'supabase/migrations',rpcFile),path.join(dest,'migrations',rpcFile));
  const applied=command(cli,pushArgs);fs.writeFileSync(path.join(out,'rpc-success.log'),applied.stdout+applied.stderr);assert.equal(applied.status,0,applied.stderr);
  assert.equal(snapshot(),before,'Existing functions/ACL/RLS unchanged by trend migrations');
  const input=match(); input.opponent_archetype_id=ids.b;
  ok(await member.from('matches').insert(input),'member input after RPC');
  const args={p_environment_id:ids.env,p_period:'7d',p_rank_filters:['unranked'],p_deck_ids:[ids.a,ids.b]};
  let data;
  for(let i=0;i<30;i++){const r=await member.rpc('get_environment_trend_aggregates_v1',args);if(!r.error){data=r.data;break;}assert.equal(r.error.code,'PGRST202');await sleep(200);}
  assert(data,'PostgREST schema must expose new RPC');
  const summary=ok(await member.rpc('get_environment_dashboard_aggregates_v4',{p_environment_id:ids.env,p_period:'7d',p_rank_filters:['unranked']}),'existing summary');
  for(const d of data.decks){const point=d.points.at(-1),s=summary.decks.find(x=>x.key===d.id).current;assert.equal(point.total,3);assert.equal(point.encounters,s.encounter.count);assert.equal(point.evaluations,s.winrate.evaluationCount);assert.equal(point.wins,s.winrate.wins);}
  const guest=client();ok(await guest.auth.signInAnonymously(),'anonymous Auth');
  for(const c of [client(),guest,service])assert.equal((await c.rpc('get_environment_trend_aggregates_v1',args)).error?.code,'42501');
  report.acl=json("select jsonb_agg(jsonb_build_object('schema',n.nspname,'definer',p.prosecdef,'config',p.proconfig,'owner',pg_get_userbyid(p.proowner),'anon',has_function_privilege('anon',p.oid,'execute'),'member',has_function_privilege('authenticated',p.oid,'execute'),'service',has_function_privilege('service_role',p.oid,'execute'))) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where p.proname='get_environment_trend_aggregates_v1'");
  for(const f of report.acl){assert.equal(f.owner,'postgres');assert.equal(f.anon,false);assert.equal(f.member,true);assert.equal(f.service,false);assert.deepEqual(f.config,['search_path=""']);assert.equal(f.definer,f.schema==='private');}
  sql(read('supabase/operations/environment-trends/disable-rpc.sql'));
  assert.equal((await member.rpc('get_environment_trend_aggregates_v1',args)).error?.code,'42501');
  ok(await member.rpc('get_environment_dashboard_aggregates_v4',{p_environment_id:ids.env,p_period:'7d',p_rank_filters:['unranked']}),'summary while new RPC disabled');
  ok(await member.from('matches').insert(match()),'input while new RPC disabled');
  sql('grant execute on function public.get_environment_trend_aggregates_v1(uuid,text,text[],uuid[]) to authenticated;grant execute on function private.get_environment_trend_aggregates_v1(uuid,text,text[],uuid[]) to authenticated;');
  report.checks.push('Recovery SQL disables both new RPCs without affecting summary/input; invalid-index cleanup refuses valid index');
  report.finalVersions=json('select jsonb_agg(version order by version) from supabase_migrations.schema_migrations');assert.equal(report.finalVersions.length,24);
  const final=command(cli,[...pushArgs,'--dry-run']);assert.equal(final.status,0);fs.writeFileSync(path.join(out,'final-dry-run.log'),final.stdout+final.stderr);
  report.checks.push('RPC transaction abort is atomic; 24 migrations recorded once; Auth/PostgREST aggregate matches existing summary including mirrors; anonymous/service rejected; existing ACL/RLS/functions unchanged');
  report.passed=true;report.completedAt=new Date().toISOString();save();console.log(JSON.stringify(report,null,2));
}
main().catch(e=>{report.error=e.message;save();console.error(e);process.exitCode=1;});
