/* eslint-disable @typescript-eslint/no-require-imports */
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { buildReviewSnapshot, matchupRating, interval95 } = require("../src/lib/environment-review/metrics");
const { buildReviewSnapshotV2, candidateMatchupRating, wilsonCenter } = require("../src/lib/environment-review/data-model");

const master = id => ({ deckId:id, name:id, className:"エルフ", isOther:false, contributors:1, pilots:1, userEqualWinRate:50, topContributorShare:100 });
const cell = (my,opp,wins,total,extra = {}) => ({
  my,opp,wins,total,rank:"unranked",turn:"first",day:"2026-11-21",recent:true,...extra
});
function snapshot(cells) {
  return buildReviewSnapshot({environmentId:"env",environmentName:"テスト環境",asOf:"2026-11-23T00:00:00Z",
    periodStart:"2026-11-16T00:00:00Z",shortPeriodStart:"2026-11-20T00:00:00Z",
    contributors:2,decks:["a","b","c"].map(master),
    pairBias:[{a:"a",b:"b",contributors:2,topContributorShare:60,userEqualWinRate:50}],cells},"fixed");
}
test("環境評価の両者視点、登録側ランク、先後反転、ミラー、未分類、短期集計を区別する", () => {
  const rows = [cell("a","b",8,10),cell("b","a",2,5,{rank:"grandmaster:epic",recent:false}),
    cell("a","a",1,2),cell(null,"a",1,1),cell(null,null,0,1)];
  const data = snapshot(rows), a = data.decks[0], pair = data.pairs[0];
  assert.deepEqual(snapshot(rows),data);
  assert.deepEqual([data.matchCount,data.shortMatchCount,a.count,a.registrations,a.wins,a.eligibleCount],[19,14,20,18,13,15]);
  assert.deepEqual([a.useCount,a.encounters,a.useWinRate],[12,8,75]);
  assert.equal(data.pairs.length,1);
  assert.deepEqual([pair.a,pair.b,pair.count,pair.wins,pair.short.count],["a","b",15,11,10]);
  assert.deepEqual([pair.byTurn.first.count,pair.byTurn.second.count,pair.byRank["grandmaster:epic"].wins],[10,5,3]);
  assert.equal(data.decks[2].winRate,null);
  assert.equal(data.decks[2].encounterRate,0);
});
test("データTierの保留、少数上振れ、Wilson区間、登録側と反転側の偏り", () => {
  const judge = cells => snapshot(cells).decks[0].dataTier;
  assert.equal(judge([cell("a","b",9,9)]),null);
  assert.equal(judge([cell("a","b",10,10)]),3);
  assert.equal(judge([cell("a","b",20,20)]),2);
  assert.equal(judge([cell("a","b",35,40)]),1);
  assert.equal(judge([cell("a","b",0,40)]),5);
  assert.equal(judge([cell("a","b",12,20),cell("b","a",13,20)]),null);
  assert.equal(judge([cell("a","a",20,40)]),null);
  assert.equal(interval95(0,0),null);
  assert.ok(interval95(50,100)[0] < 50 && interval95(50,100)[1] > 50);
  assert.throws(() => snapshot([cell("x","b",0,1)]));
  assert.throws(() => snapshot([cell("a","b",2,1)]));
});
test("対面評価しきい値は表裏対称で10件未満を保留する", () => {
  assert.equal(matchupRating(9,9),null);
  assert.deepEqual([39,40,45,55,60,61].map(w => matchupRating(w,100)),[-2,-1,0,0,1,2]);
  for (let count = 10; count < 140; count++) for (let wins = 0; wins <= count; wins++)
    assert.equal(matchupRating(wins,count) + matchupRating(count-wins,count),0);
});

function v2(cells, eligibleBias) {
  const pairBias = new Map();
  for (const { my, opp } of cells) if (my && opp && my !== opp) {
    const [a,b] = [my,opp].sort();
    pairBias.set(a + "::" + b,{a,b,contributors:2,topContributorShare:60,userEqualWinRate:50});
  }
  return buildReviewSnapshotV2({environmentId:"env",environmentName:"テスト",asOf:"2026-11-23T00:00Z",
    periodStart:"2026-11-16T00:00Z",shortPeriodStart:"2026-11-20T00:00Z",environmentStart:"2026-11-01T00:00Z",
    contributors:2,decks:["a","b","c","d"].map(master),pairBias:[...pairBias.values()],cells,eligibleBias},"id");
}
test("v2の標準化は環境の相手分布を使い、未観測・10件未満の重みをデッキのWilson中心で埋める", () => {
  const rows = [cell("a","b",12,20),cell("a","c",3,5),cell("b","c",0,15),cell("c","d",10,60),cell("b","a",0,10)];
  const a = v2(rows).decks[0], m = a.model;
  assert.equal(a.eligibleCount,35);
  assert.equal(m.legacyTier,a.dataTier);
  assert.ok(Math.abs(m.coverage - 20) < 1e-10);
  const expected = .8 * wilsonCenter(25,35) + .2 * wilsonCenter(22,30);
  assert.ok(Math.abs(m.effectiveRate - expected) < 1e-10);
  assert.equal(m.fitConfidence,"低");
  assert.equal(m.majorMatchups.find(x => x.opponentId === "d").estimatedRate,null);
  assert.deepEqual(v2(rows),v2([...rows].reverse()));
});
test("v2は小標本の傾向・同等範囲内の確認・未判断を分け、表裏を保つ", () => {
  const p = v2([cell("a","b",7,10)]).pairs[0];
  assert.equal(p.winRate,70);
  assert.equal(p.model.legacyRating,2);
  assert.equal(p.model.candidateRating,null);
  assert.equal(p.dataRating,null);
  assert.equal(p.model.assessment,"有利傾向");
  assert.equal(p.model.measuredConfidence,"低");
  assert.equal(candidateMatchupRating(5,10),null);
  assert.equal(candidateMatchupRating(500,1000),0);
  for (let count = 1; count <= 160; ++count) for (let wins = 0; wins <= count; ++wins) {
    const r = candidateMatchupRating(wins,count), s = candidateMatchupRating(count-wins,count);
    if (r === null) assert.equal(s,null);
    else assert.equal(r + s,0);
  }
});
test("登録者ランク・3日と前4日の非重複比較・所属不明を区別する", () => {
  const rows = [cell("b","a",0,30,{rank:"grandmaster:legend"}),cell("a","b",0,30,{recent:false,rank:"aa"})];
  const bias = {key:"a",contributors:5,pilots:2,topContributorShare:30,userEqualWinRate:50,withoutLargestWinRate:50,
    upperContributors:2,upperPilots:0,otherRankContributors:2};
  const model = v2(rows,[bias]).decks[0].model;
  assert.equal(model.upper.direction,1);
  assert.equal(model.upper.combined.winRate,100);
  assert.equal(model.upper.direct.count,0);
  assert.equal(model.short.count,30);
  assert.ok(model.signals.some(x => x.kind === "trend" && x.direction === 1));
  assert.ok(model.signals.some(x => x.kind === "perspective"));
  assert.equal(model.measuredConfidence,"低");
  assert.equal(v2(rows).decks[0].model.upper.direction,0);
  const sparse = v2([cell("a","b",3,4)]).decks[0];
  assert.equal(sparse.model.fitConfidence,"判断保留");
  assert.equal(sparse.model.measuredConfidence,"判断保留");
});
