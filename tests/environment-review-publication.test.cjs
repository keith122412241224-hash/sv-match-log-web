/* eslint-disable @typescript-eslint/no-require-imports */
const test = require('node:test');
const assert = require('node:assert/strict');
const { createElement } = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
const { memberSnapshot, previousTiers, changeLabel } = require('../src/lib/environment-review/publication');
const { ReviewReport } = require('../src/components/environment-review/ReviewReport');
const { RANK_ATOMS } = require('../src/lib/rank-selection');
const now = Date.now();
const rate = { count:0,wins:0,winRate:null,registrations:0,encounters:0,encounterRate:null,useCount:0,useWinRate:null };
const source = {
  snapshotId:'snapshot-test',environmentId:'environment-test',environmentName:'表示検証',asOf:new Date(now).toISOString(),
  periodStart:new Date(now - 7*86400000).toISOString(),shortPeriodStart:new Date(now - 3*86400000).toISOString(),
  ranks:RANK_ATOMS,matchCount:0,shortMatchCount:0,contributors:7,previousEvaluation:{internal:'private marker'},
  decks:[{deckId:'test-deck',name:'検証エルフ',className:'エルフ',...rate,dataTier:null,short:rate,byRank:{},byDay:{},topContributorShare:90}],pairs:[]
};
function fixture(comparison='unavailable') {
  return {run_id:source.snapshotId,as_of:source.asOf,published_at:source.asOf,payload:{
    snapshot:memberSnapshot(source),previousTiers:{},evaluation:{comparison,overview:{facts:'記録なし',hypothesis:''},
      decks:[{deckId:'test-deck',tier:null,reason:'件数不足',confidence:'判断保留',divergence:null}],pairs:[],changes:'初回評価'}
  }};
}
test('member projection takes only selected measurements; comparison keeps held and initial tiers distinct',()=>{
  const pub = fixture(), json = JSON.stringify(pub);
  assert.doesNotMatch(json,/previousEvaluation|topContributorShare|contributors|private marker/);
  assert.deepEqual(previousTiers(pub,'new'),{'test-deck':null});
  assert.deepEqual(previousTiers(pub,source.snapshotId),{});
  assert.equal(changeLabel(null,2),'評価保留 → Tier 2');
  assert.equal(changeLabel(undefined,null),'初回');
});
test('report distinguishes held assessments, missing comparison and no detected discrepancy',()=>{
  const unavailable = renderToStaticMarkup(createElement(ReviewReport,{publication:fixture()}));
  assert.match(unavailable,/評価保留/);
  assert.match(unavailable,/外部情報が不足しており、比較できません/);
  assert.doesNotMatch(unavailable,/大きな評価の乖離は確認されていません/);
  const assessed = renderToStaticMarkup(createElement(ReviewReport,{publication:fixture('available')}));
  assert.match(assessed,/大きな評価の乖離は確認されていません/);
  assert.match(assessed,/ミラー/);
});
test('late report retains original successful publication time',()=>{
  const pub=fixture();
  pub.payload.snapshot.asOf = new Date(now - 48*3600000).toISOString();
  assert.match(renderToStaticMarkup(createElement(ReviewReport,{publication:pub})),/更新遅延/);
  assert.equal(pub.published_at,source.asOf);
});
