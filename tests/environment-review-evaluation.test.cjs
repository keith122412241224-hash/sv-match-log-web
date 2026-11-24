/* eslint-disable @typescript-eslint/no-require-imports */
const test = require("node:test");
const assert = require("node:assert/strict");
const {validateEvaluation} = require("../src/lib/environment-review/evaluation.ts");
const sample = require("../docs/environment-review/v1/sample.json");

const [a,b] = sample.public.decks.map(d => d.deckId);
function context() {
  return {
    snapshotId: sample.snapshotId, environmentId: sample.environmentId, periodStart: "2026-09-01T00:00:00Z", asOf: "2026-09-07T03:00:00Z",
    decks: [{deckId:a,count:22,dataTier:3,contributors:4,topContributorShare:40}, {deckId:b,count:40,dataTier:2}],
    pairs: [{a,b,count:15,dataRating:0}]
  };
}
function attempt(change) {
  const result = structuredClone(sample), ctx = context();
  change(result,ctx);
  return () => validateEvaluation(result,ctx);
}
test("sample returns an allowlisted member projection with deck and matchup divergences", () => {
  const result = validateEvaluation(sample,context());
  assert.equal(result.public.decks[0].divergence.status,"確認済み");
  assert.equal(result.public.pairs[0].divergence.status,"要検証");
  assert.deepEqual(result,sample);
  assert.doesNotMatch(JSON.stringify(result.public),/example\.invalid|sourceIds|publisher|rationale/);
});
test("deck divergence can remain visible when the data and overall tiers agree", () => {
  const accepted = attempt(r => {r.public.decks[0].tier = 3;})();
  assert.equal(accepted.public.decks[0].divergence.direction,"過小評価の可能性");
});
for (const [label, change] of [
  ["schema", r => {r.schemaVersion = 2;}],
  ["environment", r => {r.environmentId = "old-env";}],
  ["snapshot", r => {r.snapshotId = "old-snapshot";}],
  ["extra observed field", r => {r.public.decks[0].winRate = 99;}],
  ["hidden source in public", r => {r.public.overview.url = "https://example.invalid";}],
  ["source URL in prose", r => {r.public.changes = "https://example.invalid/";}],
  ["unknown deck", r => {r.public.decks[0].deckId = "bad";}],
  ["missing catalog deck", r => {r.public.decks.pop();}],
  ["duplicated deck", r => {r.public.decks[1] = r.public.decks[0];}],
  ["nonintegral tier", r => {r.public.decks[0].tier = 1.2;}],
  ["out-of-range matchup", r => {r.public.pairs[0].rating = -3;}],
  ["mirror", r => {r.public.pairs[0].b = a;}],
  ["backwards", r => {Object.assign(r.public.pairs[0], {a:b,b:a});}],
  ["summary of different environment", r => {r.internal.sources[0].environmentId = "other";}],
  ["credentials in source URL", r => {r.internal.sources[0].url = "https://name:secret@example.invalid";}],
  ["invalid calendar date", r => {r.internal.sources[0].retrievedAt = "2026-09-31T10:00:00Z";}],
  ["stale comparand", r => {r.internal.sources[0].publishedAt = "2026-08-12T00:00:00Z";}],
  ["source with no publication date cannot confirm", r => {r.internal.sources[0].publishedAt = null;}],
  ["missing source", r => {r.internal.evidence[0].sourceIds = ["unknown"];}],
  ["missing internal basis", r => {r.internal.evidence.pop();}],
  ["duplicate internal basis", r => {r.internal.evidence[1] = r.internal.evidence[0];}],
  ["disagreement without two groups", r => {r.internal.evidence[0].externalTrend = "評価分裂";}],
  ["unavailable comparison with confirmed gap", r => {r.public.comparison = "unavailable";}],
  ["insufficient measurements", (r,ctx) => {ctx.decks[0].dataTier = null;}],
  ["incorrect confidence", r => {r.public.decks[0].confidence = "高";}],
  ["ineligible mirrors do not raise confidence", (r,ctx) => {ctx.decks[0].eligibleCount = 15;}],
  ["missing correction reason", r => {r.public.pairs[0].reason = "  ";}],
  ["unreviewed divergence direction", r => {r.public.decks[0].divergence.direction = "過大評価の可能性";}],
  ["missing limitations for incomplete external research", r => {r.internal.limitations = "";}],
]) {
  test("rejects " + label, () => assert.throws(attempt(change)));
}
test("an unavailable external comparison preserves a measured-only assessment and holds a sparse matchup", () => {
  const result = attempt((r,ctx) => {
    r.internal.sources = [];
    r.public.comparison = "unavailable";
    r.public.decks[0].tier = ctx.decks[0].dataTier;
    for (const d of r.public.decks) {d.confidence = "低"; d.divergence = null;}
    for (const e of r.internal.evidence) {e.sourceIds = []; e.externalTrend = "比較不能";}
    ctx.pairs[0].dataRating = null;
    const row = r.public.pairs[0];
    row.rating = null; row.confidence = "判断保留"; row.divergence.direction = "判断保留";
  })();
  assert.equal(result.public.pairs[0].rating,null);
  assert.equal(result.public.comparison,"unavailable");
});
test("confidence accounts for independent sources and measured concentration", () => {
  const high = (r) => {
    r.internal.sources.push({...r.internal.sources[0], id:"s2", url:"https://second.invalid/opinion", group:"別の発信者"});
    r.internal.evidence[0].sourceIds.push("s2");
    r.public.decks[0].confidence = "高";
  };
  assert.equal(attempt(high)().public.decks[0].confidence,"高");
  assert.throws(attempt((r,ctx) => {high(r); ctx.decks[0].topContributorShare = 80;}));
  assert.throws(attempt(r => {high(r); r.internal.sources[1].group = r.internal.sources[0].group;}));
});
