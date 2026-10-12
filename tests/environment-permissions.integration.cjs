/* eslint-disable @typescript-eslint/no-require-imports */
// Run with PGLITE_MODULE pointing to a local installation, or call run() with
// the same fixture adapter backed by a disposable native PostgreSQL database.
const assert = require('node:assert/strict');
const fs = require('node:fs'), Module = require('node:module');
const { setup } = require('./match-mutations-db.cjs');
const migration = '20261012075121_environment_admin_write_policies.sql';
const uuid = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const people = { a: uuid(101), b: uuid(102), admin: uuid(103) };
const environments = { a: uuid(201), b: uuid(202), admin: uuid(203), referenced: uuid(204) };
const deck = uuid(301);

async function run({ keepOpen = false } = {}) {
  const report = { checks: [], rejected: [], baseline: {}, migration, localOnly: true };
  let before, baselineDelete, beforeAggregates;
  async function assume(db, user, extra = {}) {
    await db.exec('reset role');
    await db.query("select set_config('request.jwt.claim.sub',$1,false),set_config('request.jwt.claims',$2,false)",
      [user || '', JSON.stringify({ sub: user, role: user ? 'authenticated' : 'anon', is_anonymous: false, ...extra })]);
    await db.exec(user ? 'set role authenticated' : 'set role anon');
    assert.equal((await db.query('select current_user as r')).rows[0].r, user ? 'authenticated' : 'anon');
  }
  const rows = async (db, sql, args = []) => (await db.query(sql, args)).rows;
  const snapshot = async db => ({
    environments: await rows(db, 'select * from public.environments order by id'),
    matches: await rows(db, 'select * from public.matches order by id'),
    policies: await rows(db, "select *, roles::text[] as roles from pg_policies where schemaname in ('public','storage') order by schemaname,tablename,policyname"),
    grants: await rows(db, "select table_schema,table_name,grantee,privilege_type from information_schema.role_table_grants where table_schema in ('public','storage') order by 1,2,3,4"),
    functions: await rows(db, "select n.nspname,p.proname,pg_get_functiondef(p.oid) definition,p.proacl::text acl,p.proowner,p.proconfig from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname in ('public','private') order by 1,2,p.oid"),
    constraints: await rows(db, "select c.conname,pg_get_constraintdef(c.oid) definition from pg_constraint c join pg_namespace n on n.oid=c.connamespace where n.nspname='public' order by c.conname"),
    triggers: await rows(db, "select pg_get_triggerdef(t.oid) definition from pg_trigger t join pg_class c on c.oid=t.tgrelid join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and not t.tgisinternal order by t.oid")
  });
  async function aggregates(db) {
    const values=[];
    for (const user of [people.a, people.b, people.admin]) {
      await assume(db,user);
      for(const env of [environments.b,environments.referenced]) {
        for(const period of ['24h','3d','7d','30d','all']) for(const ranks of [['unranked'],['grandmaster:epic'],['unranked','grandmaster:epic']]) {
          const value=(await rows(db,'select public.get_environment_dashboard_aggregates_v4($1,$2,$3) value',[env,period,ranks]))[0].value;
          // Query time changes; semantic boundaries and values must not.
          delete value.aggregatedAt; values.push(value);
        }
        for(const fn of ['get_home_dashboard','get_analysis_aggregates_v3','get_matchup_aggregates_v2'])
          values.push((await rows(db,`select public.${fn}(p_environment_id=>$1) value`,[env]))[0].value);
        if(user===people.admin)values.push((await rows(db,"select public.get_period_report_aggregates_v3('2026-09-01Z','2026-10-31Z','2026-07-01Z','2026-08-31Z','all',$1) value",[env]))[0].value);
      }
    }
    await db.exec('reset role');return values;
  }
  async function referencedDelete(db) {
    await assume(db, people.admin); await db.exec('begin');
    try {
      const deleted = await rows(db, 'delete from public.environments where id=$1 returning id', [environments.referenced]);
      const detached = await rows(db, 'select count(*)::int n from public.matches where environment_id is null');
      return { deleted: deleted.length, detachedMatches: detached[0].n };
    } catch (e) { return { sqlstate: e.code }; }
    finally { await db.exec('rollback'); await db.exec('reset role'); }
  }
  const fixture = await setup({
    async beforeMigration(db, file) {
      if (file !== migration) return;
      for (const id of Object.values(people)) await db.query('insert into auth.users(id,email) values($1,$2)', [id, id+'@example.test']);
      await db.query('insert into public.admin_users(user_id) values($1)', [people.admin]);
      for (const [name, id] of Object.entries(environments)) await db.query('insert into public.environments(id,user_id,name) values($1,$2,$3)', [id, people[name] || people.admin, 'Historical '+name]);
      await db.query("insert into public.decks(id,user_id,name,class_name) values($1,$2,'Local deck','エルフ')", [deck, people.a]);
      for (let i = 0; i < 3; i++) await db.query("insert into public.matches(user_id,environment_id,my_deck_id,opponent_deck_id,result,turn_order,played_at) values($1,$2,$3,$3,'win','first',now()-interval '1 hour')", [people.a,environments.referenced,deck]);
      await db.query("update public.environments set dashboard_end_at='2026-09-29T08:00:00Z' where id=$1",[environments.b]);
      for(let i=0;i<3;i++)await db.query("insert into public.matches(user_id,environment_id,my_deck_id,opponent_deck_id,result,turn_order,played_at) values($1,$2,$3,$3,'lose','second','2026-09-28T08:00:00Z')",[people.a,environments.b,deck]);
      await assume(db, people.a);
      const id = (await rows(db, "insert into public.environments(user_id,name) values($1,'before-fix') returning id", [people.a]))[0].id;
      assert.equal((await rows(db, "update public.environments set name='changed before fix' where id=$1 returning id", [environments.a])).length, 1);
      assert.equal((await rows(db, 'delete from public.environments where id=$1 returning id', [id])).length, 1);
      report.baseline.memberInsertUpdateDelete = 'reproduced';
      baselineDelete = await referencedDelete(db);
      beforeAggregates = await aggregates(db);
      before = await snapshot(db);
    },
    async afterMigration(db, file) {
      if (file !== migration) return;
      const after = await snapshot(db);
      for (const key of ['environments','matches','functions','constraints','triggers']) assert.deepEqual(after[key], before[key], 'migration preserves '+key);
      const retained = p => p.tablename !== 'environments' || p.cmd === 'SELECT';
      assert.deepEqual(after.policies.filter(retained), before.policies.filter(retained));
      const expectedGrants = before.grants.filter(g => !(g.table_name === 'environments' && g.privilege_type === 'TRUNCATE' && ['anon','authenticated'].includes(g.grantee)));
      assert.deepEqual(after.grants, expectedGrants);
      const write = after.policies.filter(p => p.tablename === 'environments' && p.cmd !== 'SELECT');
      assert.deepEqual(write.map(p=>p.cmd).sort(), ['DELETE','INSERT','UPDATE']);
      for (const p of write) {
        assert.deepEqual(p.roles,['authenticated']);
        if (p.cmd !== 'INSERT') assert.match(p.qual,/is_admin/);
        if (p.cmd !== 'DELETE') assert.match(p.with_check,/is_admin/);
      }
      assert.equal((await rows(db,"select relrowsecurity from pg_class where oid='public.environments'::regclass"))[0].relrowsecurity,true);
      assert.deepEqual(await aggregates(db),beforeAggregates);
      report.aggregateComparisons=beforeAggregates.length;
      report.checks.push('upgrade preserves every existing environment/match, SELECT policy, function/ACL, FK and trigger; only three write policies and two TRUNCATE grants change');
    }
  });
  const { db, Query } = fixture;
  try {
    for (const [role, user] of [['anon',null],['A',people.a],['B',people.b]]) {
      await assume(db,user,{ user_metadata:{is_admin:true},is_admin:true });
      assert.equal((await rows(db,'select public.is_admin() value'))[0].value,false);
      assert.ok((await rows(db,'select id from public.environments')).length>=4);
      for (const owner of [user || people.a, people.admin]) {
        await assert.rejects(db.query("insert into public.environments(user_id,name) values($1,'forbidden')",[owner]),e=>e.code==='42501');
        report.rejected.push(role+' INSERT (including forged owner)');
      }
      for (const id of Object.values(environments)) {
        const changed=await rows(db,"update public.environments set name='forbidden',start_date='2026-09-01',match_input_start_at='2026-09-01Z',match_input_end_at='2026-12-01Z',dashboard_end_at='2026-09-29T08:00:00Z',user_id=$2 where id=$1 returning id",[id,people.admin]);
        assert.equal(changed.length,0);
        assert.equal((await rows(db,'delete from public.environments where id=$1 returning id',[id])).length,0);
        report.rejected.push(role+' UPDATE/DELETE '+Object.keys(environments).find(k=>environments[k]===id));
      }
      await assert.rejects(db.exec('truncate public.environments cascade'),e=>e.code==='42501');
      await assert.rejects(db.query('insert into public.admin_users(user_id) values($1)',[user||people.a]),e=>e.code==='42501');
    }
    await db.exec('reset role');
    assert.deepEqual(await rows(db,'select * from public.environments where id=any($1::uuid[]) order by id',[Object.values(environments)]),before.environments);
    report.checks.push('anon and members A/B retain SELECT but cannot insert, alter/delete own or other historical environments, forge admin/user_id, self-enrol admin, or TRUNCATE');
    assert.deepEqual(await referencedDelete(db),baselineDelete);
    report.baseline.referencedDelete = baselineDelete;
    report.checks.push('referenced environment deletion retains pre-migration FK/trigger outcome (test rolled back)');

    await assume(db,people.admin);
    const created=(await rows(db,"insert into public.environments(user_id,name) values($1,'admin-created') returning id",[people.admin]))[0].id;
    await assert.rejects(db.query("insert into public.environments(user_id,name) values($1,'forged author')",[people.a]),e=>e.code==='42501');
    for (const id of Object.values(environments)) assert.equal((await rows(db,"update public.environments set name='Admin edited',start_date='2026-09-01',match_input_start_at=null,match_input_end_at=null,dashboard_end_at='2026-09-29T08:00:00Z' where id=$1 returning id",[id])).length,1);
    assert.equal((await rows(db,'delete from public.environments where id=$1 returning id',[created])).length,1);
    // Revocation is read from admin_users, not a cached/admin claim in a JWT.
    await db.exec('reset role');await db.query('delete from public.admin_users where user_id=$1',[people.admin]);
    await assume(db,people.admin,{is_admin:true});
    assert.equal((await rows(db,"update public.environments set name='revoked admin' where id=$1 returning id",[environments.admin])).length,0);
    await db.exec('reset role');await db.query('insert into public.admin_users(user_id) values($1)',[people.admin]);
    report.checks.push('admin inserts with session author, edits historical environments of any author and all date fields, deletes unused row; revocation takes effect immediately');

    await assume(db,people.a);
    const match=(await rows(db,"insert into public.matches(user_id,environment_id,my_deck_id,opponent_deck_id,result,turn_order) values($1,$2,$3,$3,'win','first') returning id",[people.a,environments.a,deck]))[0].id;
    assert.equal((await rows(db,"update public.matches set result='lose' where id=$1 returning id",[match])).length,1);
    await assume(db,people.b);assert.equal((await rows(db,"update public.matches set result='win' where id=$1 returning id",[match])).length,0);
    await assume(db,people.a);assert.equal((await rows(db,'delete from public.matches where id=$1 returning id',[match])).length,1);
    report.checks.push('member registers in a historical shared environment, edits/deletes own match; other member cannot edit it');

    // Actual Server Actions and native form API, using DB-backed session clients.
    require('./register.cjs');const load=Module._load;let activeUser=people.admin;
    const client={auth:{getUser:async()=>({data:{user:activeUser?{id:activeUser,is_anonymous:false,user_metadata:{is_admin:true}}:null}})},from:t=>new Query(t)};
    Module._load=function(name,...args){if(name==='@/lib/supabase/server')return {createSupabaseServerClient:async()=>client};if(name==='next/navigation')return {redirect:p=>{throw Error('redirect:'+p);}};if(name==='next/cache')return {revalidatePath:()=>{}};return load.call(this,name,...args);};
    try {
      const actions=require('../src/app/admin/actions'),{POST}=require('../src/app/admin/environments/route');
      const form=()=>{const f=new FormData();for(const [k,v]of Object.entries({name:'Action created',user_id:people.admin,is_admin:'true',environment_ids:environments.a,[`name_${environments.a}`]:'Action edited',[`allow_match_input_${environments.a}`]:'on',[`match_input_start_at_${environments.a}`]:'',[`match_input_end_at_${environments.a}`]:'',[`dashboard_end_at_${environments.a}`]:'2026-09-29T17:00'}))f.set(k,v);return f;};
      for(const who of [null,people.a,people.b]){activeUser=who;await assume(db,who);await assert.rejects(actions.createEnvironment(form(),true),/redirect:/);await assert.rejects(actions.updateEnvironmentsBatch(form(),true),/redirect:/);await assert.rejects(actions.deleteEnvironment(environments.a),/redirect:/);
        for(const operation of ['create','update']){const f=form();f.set('operation',operation);const response=await POST(new Request('http://localhost/admin/environments',{method:'POST',headers:{host:'localhost',origin:'http://localhost'},body:f}));assert.equal(response.status,303);assert.match(response.headers.get('location'),/environments_update_failed/);}
      }
      activeUser=people.admin;await assume(db,activeUser);
      assert.equal((await actions.createEnvironment(form(),true)).notice,'environment_created');
      assert.equal((await actions.updateEnvironmentsBatch(form(),true)).notice,'environments_updated');
      assert.equal(new Date((await rows(db,'select dashboard_end_at from public.environments where id=$1',[environments.a]))[0].dashboard_end_at).toISOString(),'2026-09-29T08:00:00.000Z');
      const originForm=form();originForm.set('operation','update');assert.equal((await POST(new Request('http://localhost/admin/environments',{method:'POST',headers:{host:'localhost',origin:'http://elsewhere'},body:originForm}))).status,403);
      report.checks.push('actual admin create/update/delete actions and form API reject anon/members despite forged form fields; admin edits member-authored row and JST cutoff; cross-origin POST rejected');
    } finally { Module._load=load; }
    report.passed=true;
    if(process.env.ENVIRONMENT_PERMISSIONS_OUTPUT)fs.writeFileSync(process.env.ENVIRONMENT_PERMISSIONS_OUTPUT,JSON.stringify(report,null,2));
    return {report,...fixture,people,environments,assume};
  } finally { if(!keepOpen)await db.close(); }
}
module.exports={run,migration,people,environments};
if(require.main===module)require('node:test').test('shared environment admin policies: upgrade, real RLS roles, data preservation, actions and reference compatibility',{timeout:120000},async()=>{const {report}=await run();console.log(JSON.stringify(report));});
