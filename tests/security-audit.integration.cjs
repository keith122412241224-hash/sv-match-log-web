/* eslint-disable @typescript-eslint/no-require-imports */
require('./register.cjs');
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const {setup,ids}=require('./match-mutations-db.cjs');

test('security proposal preserves RLS, admin checks and triggers in disposable PostgreSQL', {timeout:120000}, async()=>{
 const {db,claim}=await setup();
 const report={localOnly:true,checks:[]};
 try{
  const policies=async()=> (await db.query("select * from pg_policies where schemaname in ('public','suggestion_private','storage') order by schemaname,tablename,policyname")).rows;
  const originalPolicies=await policies();
  for(const phase of ['before','after']){
   if(phase==='after'){
    await db.exec('reset role');
    await db.exec(fs.readFileSync('docs/security/2026-10-26-hardening-proposal.sql','utf8'));
    assert.deepEqual(await policies(),originalPolicies,'no RLS policy change');
   }
   await db.exec('reset role');
   const truncate=(await db.query("select has_table_privilege('authenticated','public.matches','truncate') allowed")).rows[0].allowed;
   assert.equal(truncate,phase==='before');
   for(const [role,user,admin,visible]of [['admin',ids.a,true,2],['member',ids.b,false,1],['anonymous',null,false,0]]){
    await claim(user);
    assert.equal((await db.query('select public.is_admin() allowed')).rows[0].allowed,admin);
    assert.equal((await db.query('select count(*)::int n from public.matches')).rows[0].n,visible);
    await assert.rejects(db.query('select * from suggestion_private.approvals'),/permission denied/);
    if(phase==='after')await assert.rejects(db.exec('truncate public.matches'),/permission denied/);
    await assert.rejects(db.query('select public.handle_new_user()'),phase==='before'?/trigger functions can only be called as triggers/:/permission denied/);
    if(!admin){
     await assert.rejects(db.query('insert into public.admin_users(user_id) values($1)',[ids.b]),/row-level security|permission denied/);
     assert.equal((await db.query("update public.deck_archetypes set name='forged' where id=$1 returning id",[ids.arch])).rows.length,0);
     assert.equal((await db.query("update public.matches set result='lose' where id=$1 returning id",[ids.match])).rows.length,0);
     assert.equal((await db.query('delete from public.matches where id=$1 returning id',[ids.match])).rows.length,0);
    }else{
     assert.equal((await db.query("update public.deck_archetypes set name='local-updated' where id=$1 returning id,updated_at",[ids.arch])).rows.length,1);
    }
    report.checks.push(phase+': '+role+' admin/RLS/private ledger/trigger invocation');
   }
   await claim(ids.b);
   await db.query("select set_config('request.jwt.claims',$1,false)",[JSON.stringify({sub:ids.b,is_anonymous:false,user_metadata:{is_admin:true,role:'admin'}})]);
   assert.equal((await db.query('select public.is_admin() allowed')).rows[0].allowed,false);
   await assert.rejects(db.query('update public.matches set user_id=$1 where id=$2',[ids.a,ids.other]),/row-level security/);
   await db.exec('reset role');
   const newId=phase==='before'?'00000000-0000-4000-8000-000000000091':'00000000-0000-4000-8000-000000000092';
   await db.query("insert into auth.users(id,email,raw_user_meta_data) values($1,'fixture@example.test',$2)",[newId,JSON.stringify({display_name:'fixture',is_admin:true})]);
   assert.equal((await db.query('select count(*)::int n from public.profiles where id=$1',[newId])).rows[0].n,1);
   assert.equal((await db.query('select count(*)::int n from public.admin_users where user_id=$1',[newId])).rows[0].n,0);
   report.checks.push(phase+': signup trigger still creates profile; metadata cannot grant admin');
  }
  assert.deepEqual((await db.query("select proconfig from pg_proc where oid='public.set_updated_at()'::regprocedure")).rows[0].proconfig,['search_path=""']);
  await db.exec('create role fixture_auth_admin; grant usage on schema auth to fixture_auth_admin; grant insert on auth.users to fixture_auth_admin');
  assert.equal((await db.query("select has_function_privilege('fixture_auth_admin','public.handle_new_user()','execute') allowed")).rows[0].allowed,false);
  await db.exec('set role fixture_auth_admin');
  await db.exec("insert into auth.users(id,email) values('00000000-0000-4000-8000-000000000093','auth-fixture@example.test')");
  await db.exec('reset role');
  assert.equal((await db.query("select count(*)::int n from public.profiles where id='00000000-0000-4000-8000-000000000093'")).rows[0].n,1);
  report.checks.push('Auth-like insert-only role without function EXECUTE still fires the signup trigger');
  report.passed=true;
  if(process.env.SECURITY_AUDIT_OUTPUT)fs.writeFileSync(process.env.SECURITY_AUDIT_OUTPUT,JSON.stringify(report,null,2));
  console.log(JSON.stringify(report));
 }finally{await db.close();}
});
