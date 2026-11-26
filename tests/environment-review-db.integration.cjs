/* eslint-disable @typescript-eslint/no-require-imports */
// Runs in a fresh in-memory PostgreSQL instance. No URLs, service keys or application records.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { PGlite } = require(process.env.PGLITE_MODULE || path.resolve('build/migration-step2-baseline/tools/node_modules/@electric-sql/pglite'));
const uuid = n => '00000000-0000-4000-8000-' + String(n).padStart(12, '0');
const [admin, member, env, otherEnv, old, fresh, other, deck] = Array.from({ length: 8 }, (_, i) => uuid(i + 1));
const migrationDir = path.resolve(__dirname, '../supabase/migrations');

test('environment review permissions, history and transactional publication', async t => {
  const db = await PGlite.create();
  t.after(() => db.close());
  await db.exec(`
    create role anon nologin; create role authenticated nologin; create role service_role nologin;
    create schema private; create schema auth;
    grant usage on schema auth, private to authenticated;
    create function auth.uid() returns uuid language sql stable as $$
      select nullif(current_setting('request.jwt.claim.sub', true),'')::uuid $$;
    create function auth.jwt() returns jsonb language sql stable as $$
      select coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb $$;
    create table public.admin_users(user_id uuid primary key);
    create function public.is_admin() returns boolean language sql stable security definer set search_path='' as $$
      select exists(select 1 from public.admin_users where user_id = auth.uid()) $$;
    create table public.environments(id uuid primary key);
    insert into public.admin_users values ('${admin}');
    insert into public.environments values ('${env}'), ('${otherEnv}');`);
  const filename = fs.readdirSync(migrationDir).find(name => name.endsWith('_environment_review.sql'));
  await db.exec(fs.readFileSync(path.join(migrationDir, filename), 'utf8'));

  const projectionV2 = fs.readdirSync(migrationDir).find(name => name.endsWith('_environment_review_v2_publication.sql'));
  await db.exec(fs.readFileSync(path.join(migrationDir, projectionV2), 'utf8'));
  async function identity(user, claim = { is_anonymous: false }, role = 'authenticated') {
    await db.exec('reset role');
    await db.query("select set_config('request.jwt.claim.sub',$1,false),set_config('request.jwt.claims',$2,false)", [user, JSON.stringify(claim)]);
    assert.ok(['authenticated', 'anon', 'service_role'].includes(role));
    await db.exec('set role ' + role);
  }
  async function rows(sql, params = []) { return (await db.query(sql, params)).rows; }
  const count = async table => (await rows('select count(*)::int as n from public.environment_review_' + table))[0].n;
  const publication = async () => (await rows('select * from public.environment_review_publications where environment_id=$1', [env]))[0];
  const revision = async id => (await rows('select revision from public.environment_review_runs where id=$1', [id]))[0].revision;
  const snapshot = (id, environmentId, asOf) => ({
    snapshotId: id, environmentId, asOf, matchCount: 4, shortMatchCount: 2,
    periodStart: '2020-01-01T00:00:00Z', shortPeriodStart: '2020-01-02T00:00:00Z',
    ranks: ['unranked'], environmentName: 'テスト環境',
    decks: [{ deckId: deck, count: 8, winRate: 50, dataTier: null, concentration: 1 }], pairs: [],
    distribution: { internal: 'privateMeasurement' },
  });
  const create = s => rows('select public.environment_review_create($1,$2,$3,$4)', [s.snapshotId,s.environmentId,s.asOf,JSON.stringify(s)]);
  const doc = (s, summary) => ({
    snapshotId: s.snapshotId, environmentId: s.environmentId, public: {
      overview: { facts: summary, hypothesis: '' }, comparison: 'unavailable', changes: '', pairs: [],
      decks: [{ deckId: deck, tier: null, reason: '評価保留', confidence: '判断保留', divergence: null }],
    },
    internal: { evidence: 'privateSource' },
  });
  const projection = (s, d) => {
    const projected = structuredClone(s);
    delete projected.distribution;
    delete projected.decks[0].concentration;
    return { snapshot: projected, evaluation: d.public, previousTiers: s.snapshotId === fresh ? { [deck]: null } : {} };
  };
  const step = (id, rev, action, d, p, reason, expected, edition = null) => rows(
    'select public.environment_review_transition($1,$2,$3,$4,$5,$6,$7,$8)',
    [id,rev,action,d ? JSON.stringify(d) : null,p ? JSON.stringify(p) : null,reason,expected,edition]);
  const first = snapshot(old, env, '2020-01-05T00:00:00Z');
  const last = snapshot(fresh, env, '2020-01-06T00:00:00Z');
  const separate = snapshot(other, otherEnv, '2020-01-06T00:00:00Z');
  const a = doc(first, '初回'), b = doc(last, '更新');
  await identity(admin);
  await create(first);
  await assert.rejects(create(first), /duplicate key/);
  await create(last);
  await create(separate);
  assert.equal(await count('runs'), 3);
  await assert.rejects(step(old,0,'save',b,null,null,null), /invalid_review_identity/);
  const privateField = structuredClone(a);
  privateField.public.decks[0].sourceIds = ['admin-only'];
  await assert.rejects(step(old,0,'save',privateField,null,null,null), /invalid_review_identity/);
  await step(old,0,'save',a,null,null,null);
  await assert.rejects(step(old,0,'save',a,null,'再試行',null), /review_conflict/);
  await assert.rejects(step(old,1,'save',a,null,'再試行',null), /duplicate_analysis/);
  await assert.rejects(step(old,1,'save',doc(first,'修正'),null,null,null), /review_reason_required/);
  const tampered = projection(first, a);
  tampered.snapshot.decks[0].winRate = 99;
  await assert.rejects(step(old,1,'publish',null,tampered,null,null), /invalid_review_projection/);
  await assert.rejects(step(old,1,'publish',null,{...projection(first,a), internal: a.internal},null,null), /invalid_review_projection/);
  assert.equal(await revision(old), 1);
  assert.equal(await count('publications'), 0);

  await identity(member);
  assert.equal(await count('runs'), 0);
  assert.equal(await count('events'), 0);
  await assert.rejects(create(first), /admin_required/);
  await assert.rejects(step(old,1,'publish',null,projection(first,a),null,null), /admin_required/);
  await assert.rejects(db.exec("update public.environment_review_runs set status = 'published'"), /permission denied/);
  await identity(admin);
  await step(old,1,'publish',null,projection(first,a),null,null);
  // Upgrade a populated pilot: the historical publication must remain private.
  await db.exec('reset role');
  const memberMigration = fs.readdirSync(migrationDir).find(name => name.endsWith('_environment_review_member_release.sql'));
  await db.exec(fs.readFileSync(path.join(migrationDir,memberMigration),'utf8'));
  await identity(admin);
  const memberAction = (action,envId,id,sourceAt,expected) => rows(
    'select public.environment_review_member_action($1,$2,$3,$4,$5)',[envId,id,sourceAt,expected,action]);
  const sourceTime = async () => (await rows('select published_at::text as ts from public.environment_review_publications where environment_id=$1',[env]))[0].ts;
  const memberRow = async () => (await rows('select * from public.environment_review_member_releases where environment_id=$1',[env]))[0];
  const oldTime = await sourceTime();
  assert.equal(await count('member_releases'),0);
  await assert.rejects(memberAction('member_publish',otherEnv,old,oldTime,null),/review_conflict/);
  await memberAction('member_publish',env,old,oldTime,null);
  const approved = await memberRow();
  assert.deepEqual(approved.payload.previousTiers,{});
  assert.deepEqual(approved.payload.evaluation.decks,[{deckId:deck,tier:null,reason:'評価保留'}]);
  assert.doesNotMatch(JSON.stringify(approved.payload),/sourceIds|confidence|divergence|internal|privateSource|byDay|evidence/);
  await assert.rejects(memberAction('member_publish',env,old,oldTime,null),/review_conflict/);
  const originalDate = (await publication()).published_at.toISOString();
  assert.deepEqual((await publication()).payload, projection(first,a));
  await step(old,2,'save',doc(first,'未公開の修正'),null,'修正理由',old);
  assert.deepEqual((await publication()).payload, projection(first,a));

  await identity(member);
  assert.equal(await count('publications'), 0);
  assert.equal(await publication(),undefined);
  assert.deepEqual(await memberRow(),approved);
  await assert.rejects(memberAction('member_stop',env,old,oldTime,approved.edition), /admin_required/);
  await assert.rejects(db.exec('delete from public.environment_review_member_releases'), /permission denied/);
  assert.equal(await count('runs'), 0);
  assert.equal(await count('events'), 0);
  for (const claim of [{ is_anonymous: true }, {}, { is_anonymous: 'false' }]) {
    await identity(admin, claim);
    assert.equal(await count('publications'), 0);
    assert.equal(await count('runs'), 0);
    assert.equal(await count('member_releases'),0);
    await assert.rejects(create(first), /admin_required/);
  }
  for (const role of ['anon', 'service_role']) {
    await identity('', {}, role);
    await assert.rejects(count('publications'), /permission denied/);
    await assert.rejects(count('member_releases'), /permission denied/);
    await assert.rejects(create(first), /permission denied/);
  }

  await identity(admin);
  await step(fresh,0,'save',b,null,null,old);
  await assert.rejects(step(old,3,'publish',null,projection(first,doc(first,'未公開の修正')),null,old), /older_review/);
  await assert.rejects(step(fresh,1,'publish',null,projection(last,b),null,null), /review_conflict/);
  await step(fresh,1,'publish',null,projection(last,b),null,old);
  assert.equal((await publication()).run_id, fresh);
  const firstEdition = (await rows("select id from public.environment_review_events where run_id=$1 and action='publish'", [fresh]))[0].id;
  const firstTime = await sourceTime();
  assert.deepEqual(await memberRow(),approved);
  await assert.rejects(memberAction('member_publish',env,old,oldTime,approved.edition),/review_conflict/);
  const bEdit = doc(last, '訂正');
  await step(fresh,2,'save',bEdit,null,'記述の訂正',fresh);
  await step(fresh,3,'publish',null,projection(last,bEdit),null,fresh);
  await assert.rejects(memberAction('member_publish',env,fresh,firstTime,approved.edition),/review_conflict/);
  const editedTime = await sourceTime();
  await memberAction('member_publish',env,fresh,editedTime,approved.edition);
  const editedRelease = await memberRow();
  assert.deepEqual(editedRelease.payload.previousTiers,{[deck]:null});
  await step(fresh,4,'restore',null,null,'公開時点の初版に戻す',fresh,firstEdition);
  assert.deepEqual((await publication()).payload.evaluation, b.public);
  await assert.rejects(step(old,await revision(old),'restore',null,null,'別スナップショットの履歴',fresh,firstEdition), /review_not_restorable/);
  assert.deepEqual(await memberRow(),editedRelease);
  await assert.rejects(memberAction('member_stop',env,old,oldTime,approved.edition),/review_conflict/);
  await memberAction('member_stop',env,fresh,editedTime,editedRelease.edition);
  await assert.rejects(memberAction('member_publish',env,fresh,firstTime,null),/review_conflict/);
  await identity(member);
  assert.equal(await count('member_releases'),0);
  await identity(admin);
  const lastSuccess = (await publication()).published_at.toISOString();
  await rows('select public.environment_review_failure($1,$2,$3)', [env, fresh, '入力に問題があります']);
  assert.equal((await publication()).published_at.toISOString(), lastSuccess);
  await assert.rejects(rows('select public.environment_review_failure($1,$2,$3)', [otherEnv, fresh, 'error']), /foreign key/);
  await assert.rejects(step(old,await revision(old),'restore',null,null,'復元',old), /review_conflict/);
  await assert.rejects(step(old,await revision(old),'restore',null,null,null,fresh), /review_reason_required/);
  await step(old,await revision(old),'restore',null,null,'前回を復元',fresh);
  assert.equal((await publication()).published_at.toISOString(), originalDate);
  assert.deepEqual((await publication()).payload, projection(first,a));
  await assert.rejects(step(fresh,await revision(fresh),'withdraw',null,null,null,old), /not_current_publication/);
  await step(old,await revision(old),'withdraw',null,null,'確認中',old);
  assert.equal(await count('publications'), 0);
  await step(old,await revision(old),'restore',null,null,'確認済み',null);
  assert.equal(await count('publications'), 1);
  const events = await rows("select before_data,after_data,reason from public.environment_review_events where action='save' and reason='修正理由'");
  assert.equal(events[0].before_data.analysis.public.overview.facts, '初回');
  assert.equal(events[0].after_data.analysis.public.overview.facts, '未公開の修正');
  assert.equal((await rows('select payload from public.environment_review_publications where environment_id=$1', [otherEnv])).length, 0);
  const modern = {...separate,snapshotId:uuid(81),schemaVersion:2,ruleVersion:'environment-review-v2',promptVersion:'environment-review-prompt-v2'};
  const rate = {count:40,wins:20,winRate:50,registrations:40,encounters:40,encounterRate:100,useCount:40,useWinRate:50};
  modern.decks = [{...modern.decks[0],name:'検証用',className:'エルフ',...rate,short:{...rate,privateSource:'hidden'},byDay:{},byRank:{},
    eligibleCount:40,eligibleWinRate:50,interval95:[35,65],dataTier:3,model:{measuredConfidence:'低',internal:'hidden'}}];
  const proposed = {...doc(modern,'集計結果'),schemaVersion:2,promptVersion:modern.promptVersion,internal:{sources:[],evidence:[]}};
  proposed.public.decks[0].tier=1;
  await rows('select public.environment_review_create($1,$2,$3,$4,$5)',[modern.snapshotId,otherEnv,modern.asOf,JSON.stringify(modern),'auto']);
  await assert.rejects(step(modern.snapshotId,0,'save',{...proposed,schemaVersion:1},null,null,null),/versions_match/);
  await step(modern.snapshotId,0,'save',proposed,null,null,null);
  const { memberSnapshot } = require('../src/lib/environment-review/publication');
  const payload = {snapshot:memberSnapshot(modern),evaluation:proposed.public,previousTiers:{}};
  assert.doesNotMatch(JSON.stringify(payload),/privateSource|hidden/);
  const publish = (rev,edition) => rows('select public.environment_review_publish_v2($1,$2,$3,$4,$5,$6)',
    [modern.snapshotId,rev,JSON.stringify(payload),'',null,edition]);
  await assert.rejects(publish(1,null), /review_manual_approval_required/);
  proposed.public.decks[0].tier=3;
  await step(modern.snapshotId,1,'save',proposed,null,'補正を撤回',null);
  await assert.rejects(publish(2,'2000-01-01Z'), /review_conflict/);
  await publish(2,null);
  await identity(member);
  assert.equal(await count('publications'),0);
  await assert.rejects(publish(3,null), /no rows|permission denied|admin_required/i);
  await identity(admin);
  const modernPublished=(await rows('select payload from public.environment_review_publications where environment_id=$1',[otherEnv]))[0].payload;
  assert.deepEqual(modernPublished,payload);
});
