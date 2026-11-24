/* eslint-disable @typescript-eslint/no-require-imports */
// Disposable in-memory Postgres, using the repository's complete migration harness.
require("./register.cjs");
const assert = require("node:assert/strict");
const { setup,ids } = require("./match-mutations-db.cjs");
const { buildReviewSnapshot } = require("../src/lib/environment-review/metrics");
const { buildReviewSnapshotV2 } = require("../src/lib/environment-review/data-model");
const { RANK_ATOMS } = require("../src/lib/rank-selection");
async function run() {
  const { db, claim } = await setup();
  const read = async () => (await db.query("select public.get_environment_review_source_v1($1) as d",[ids.env])).rows[0].d;
  const readV2 = async () => (await db.query("select public.get_environment_review_source_v2($1) as d",[ids.env])).rows[0].d;
  try {
    // Fixed historic environment boundaries make verification independent of machine time.
    await db.query("update public.environments set start_date='2026-10-01',dashboard_end_at='2026-10-05T09:17:00Z' where id=$1",[ids.env]);
    await db.query("update public.deck_archetypes set created_at='2026-09-01T00:00Z' where id in ($1,$2)",[ids.arch,ids.arch2]);
    const getDate = s => new Date(s).toISOString();
    const fixture = [
      ["2026-09-30T14:59:59.999999Z",ids.env], ["2026-09-30T15:00:00Z",ids.env],
      ["2026-10-02T09:16:59.999999Z",ids.env], ["2026-10-02T09:17:00Z",ids.env],
      ["2026-10-05T09:16:59.999999Z",ids.env], ["2026-10-05T09:17:00Z",ids.env],
      ["2026-10-05T09:16:59Z",ids.env2]
    ];
    for (const [played,env] of fixture) await db.query(
      `insert into public.matches(user_id,environment_id,my_deck_id,opponent_deck_id,my_archetype_id,opponent_archetype_id,result,turn_order,played_at,created_at)
       values ($1,$2,$3,$3,$4,$5,'win','first',$6,$6)`,[ids.a,env,ids.deck,ids.arch,ids.arch2,played]);
    await db.query("update public.matches set played_at='2026-10-04T09:00Z',created_at='2026-10-04T09:00Z' where id=$1",[ids.other]);
    await claim(ids.a);
    const source = await read(), snap = buildReviewSnapshot(source,"fixed");
    assert.equal(getDate(source.asOf),"2026-10-05T09:17:00.000Z");
    assert.equal(getDate(source.periodStart),"2026-09-30T15:00:00.000Z");
    assert.equal(getDate(source.shortPeriodStart),"2026-10-02T09:17:00.000Z");
    assert.deepEqual([snap.matchCount,snap.shortMatchCount,snap.contributors],[5,3,2]);
    const a = snap.decks.find(d => d.deckId === ids.arch);
    assert.deepEqual([a.count,a.registrations,a.pilots,a.contributors,a.userEqualWinRate],[6,5,2,2,75]);
    assert.ok(Math.abs(a.topContributorShare - 100*4/6) < 1e-9);
    assert.deepEqual([snap.pairs[0].contributors,snap.pairs[0].userEqualWinRate,snap.pairs[0].topContributorShare],[1,100,100]);
    for (const privateId of [ids.a,ids.b,ids.deck,ids.match,ids.other]) assert.ok(!JSON.stringify(source).includes(privateId));
    const v2source = await readV2(), v2 = buildReviewSnapshotV2(v2source,"fixed");
    assert.equal(getDate(v2.environmentStart),"2026-09-30T15:00:00.000Z");
    const displayFields = { ...v2source };
    delete displayFields.environmentStart;
    delete displayFields.eligibleBias;
    assert.deepEqual(displayFields,source);
    const eligible = v2.decks.find(d => d.deckId === ids.arch);
    assert.equal(eligible.eligibleCount,4);
    assert.equal(eligible.model.bias.contributors,1);
    assert.equal(eligible.model.bias.pilots,1);
    assert.equal(eligible.model.bias.topContributorShare,100);
    assert.equal(eligible.model.bias.withoutLargestWinRate,null);
    assert.equal(eligible.model.bias.upperContributors,0);
    for (const privateId of [ids.a,ids.b,ids.deck,ids.match,ids.other]) assert.ok(!JSON.stringify(v2source).includes(privateId));
    await claim(ids.b);
    await assert.rejects(read(), /Administrator access required/);
    await assert.rejects(readV2(), /Administrator access required/);
    await claim(null);
    await assert.rejects(read(), /permission denied/);
    await assert.rejects(readV2(), /permission denied/);
    await db.exec("reset role");
    // Backfilled before the cutoff in played_at, but created at or after it.
    for (const registered of ["2026-10-05T09:17:00Z","2026-10-05T09:17:00.000001Z"]) {
      await db.query(`insert into public.matches(user_id,environment_id,my_deck_id,opponent_deck_id,my_archetype_id,opponent_archetype_id,
        result,turn_order,played_at,created_at) values ($1,$2,$3,$3,$4,$5,'lose','first','2026-10-04T12:00Z',$6)`,
        [ids.b,ids.env,ids.bdeck,ids.arch,ids.arch2,registered]);
    }
    await db.query(`insert into public.deck_archetypes(name,class_name,created_at)
      values ('締切後分類','エルフ','2026-10-05T09:17:00Z')`);
    await claim(ids.a);
    assert.deepEqual(await readV2(),v2source);
    assert.equal(buildReviewSnapshot(await read(),"legacy").matchCount,snap.matchCount + 2);
    await db.exec("reset role");
    // Both users contribute to the Tier population; the b user's mirror above did not.
    await db.query(`insert into public.matches(user_id,environment_id,my_deck_id,opponent_deck_id,my_archetype_id,opponent_archetype_id,
      result,turn_order,played_at,created_at,rank_tier,master_group,grandmaster_rating)
      values ($1,$2,$3,$3,$4,$5,'lose','second','2026-10-04T12:00Z','2026-10-05T09:16:59.999999Z','grandmaster',null,'legend')`,
      [ids.b,ids.env,ids.bdeck,ids.arch,ids.arch2]);
    await claim(ids.a);
    const withSecond = await readV2();
    const stats = withSecond.eligibleBias.find(r => r.key === ids.arch);
    assert.deepEqual([stats.contributors,stats.pilots,stats.topContributorShare,stats.userEqualWinRate,
      stats.withoutLargestWinRate,stats.upperContributors,stats.upperPilots],[2,2,80,50,0,1,1]);
    const reverseStats = withSecond.eligibleBias.find(r => r.key === ids.arch2);
    assert.deepEqual([reverseStats.pilots,reverseStats.withoutLargestWinRate,reverseStats.upperContributors,
      reverseStats.upperPilots],[0,100,1,0]);
    const withSecondSnapshot = buildReviewSnapshotV2(withSecond,"new");
    assert.ok(withSecondSnapshot.decks.find(d => d.deckId === ids.arch).model.signals.some(s => s.kind === "equalWeight"));
    await db.exec("reset role");
    // A closed fixture includes archived data. No row from a different environment enters the denominator.
    await db.query("update public.environments set start_date='2026-09-01' where id=$1",[ids.env]);
    await db.query(`insert into public.matches(user_id,environment_id,my_deck_id,opponent_deck_id,my_archetype_id,opponent_archetype_id,
      result,turn_order,played_at,created_at,rank_tier,master_group,grandmaster_rating)
      select $1,$2,$3,$3,case when n%3=0 then null else $4::uuid end,case when n%2=0 then $4::uuid else $5::uuid end,
        (case when n%4=0 then 'lose' else 'win' end)::public.match_result,
        (case when n%5=0 then 'first' else 'second' end)::public.turn_order,
        '2026-09-26T12:00Z'::timestamptz + n * interval '1 minute',
        '2026-09-26T12:00Z'::timestamptz + n * interval '1 minute',
        nullif(split_part(atom,':',1),'unranked'),
        case when atom like 'master:%' then split_part(atom,':',2) end,
        case when atom like 'grandmaster:%' then split_part(atom,':',2) end
        from generate_series(1,16000) n cross join lateral (select ($6::text[])[n%17+1] as atom) ranks`,
      [ids.a,ids.env,ids.deck,ids.arch,ids.arch2,RANK_ATOMS]);
    await claim(ids.a);
    const startTime = performance.now();
    const aggregate = await read();
    const result = buildReviewSnapshot(aggregate,"fixed");
    const elapsed = Math.round(performance.now()-startTime);
    const compiled = buildReviewSnapshotV2(await readV2(),"compiled");
    assert.deepEqual([compiled.matchCount,compiled.shortMatchCount],[result.matchCount - 2,result.shortMatchCount - 2]);
    assert.equal(compiled.ranks.length,17);
    assert.equal(compiled.decks.find(d => d.deckId === ids.arch).eligibleCount,
      result.decks.find(d => d.deckId === ids.arch).eligibleCount - 2);
    for (const [window,scope] of [["7d","full"],["3d","short"]]) {
      const existing = (await db.query("select public.get_environment_dashboard_aggregates_v4($1,$2) as d",[ids.env,window])).rows[0].d;
      assert.equal(scope === "full" ? result.matchCount : result.shortMatchCount,existing.current.total.totalMatches);
      for (const d of result.decks) {
        const e = existing.decks.find(r => r.key === d.deckId).current, s = scope === "full" ? d : d.short;
        assert.deepEqual([s.encounters,s.registrations,s.count,s.wins],
          [e.encounter.count ?? 0,e.winrate.targetRegistrations ?? 0,e.winrate.evaluationCount ?? 0,e.winrate.wins ?? 0]);
      }
    }
    for (const rank of RANK_ATOMS) {
      const existing = (await db.query("select public.get_environment_dashboard_aggregates_v4($1,'7d',$2) as d",[ids.env,[rank]])).rows[0].d;
      for (const d of result.decks) {
        const e = existing.decks.find(r => r.key === d.deckId).current;
        assert.equal(d.byRank[rank].count,e.winrate.evaluationCount ?? 0);
      }
    }
    await db.exec("reset role");
    await db.query("update public.deck_archetypes set is_other=true,is_active=false where id=$1",[ids.arch2]);
    await claim(ids.a);
    const marked = buildReviewSnapshot(await read(),"other");
    assert.equal(marked.decks.find(d => d.deckId === ids.arch2).dataTier,null);
    assert.equal(marked.decks.find(d => d.deckId === ids.arch).eligibleCount,0);
    assert.equal(marked.pairs[0].dataRating,null);
    assert.deepEqual((await readV2()).eligibleBias,[]);
    console.log(`PGlite snapshot: ${result.matchCount} registrations, ${aggregate.cells.length} aggregate groups, ${elapsed}ms; 3d/7d counts and 17 rank subsets match existing v4.`);
    console.log("PASS: snapshot RPC with full schema, window boundaries, environment isolation, counts, user bias and role checks.");
  } finally { await db.close(); }
}
run().catch(e => { console.error(e); process.exitCode=1; });
