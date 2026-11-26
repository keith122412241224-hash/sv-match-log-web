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
  assert.doesNotMatch(unavailable,/実測のみ（外部資料不足）|総評の全文/);
  assert.match(unavailable,/環境下位・評価材料不足/);
  assert.doesNotMatch(unavailable,/乖離分析・統計の詳細/);
  assert.doesNotMatch(unavailable,/大きな評価の乖離は確認されていません/);
  const assessed = renderToStaticMarkup(createElement(ReviewReport,{publication:fixture('available'),preview:true}));
  assert.match(assessed,/大きな評価の乖離は確認されていません/);
  assert.match(assessed,/ミラー・評価対象外">－<\/td>/);
});
test('member overview shows the opening conclusions without expanding the analysis',()=>{
  const pub=fixture('partial');
  pub.payload.evaluation.overview={facts:'中心のデッキです。対策が必要です。短期では変化があります。長い経緯です。',hypothesis:'詳しい仮説です。'};
  const html=renderToStaticMarkup(createElement(ReviewReport,{publication:pub}));
  assert.match(html,/中心のデッキです。対策が必要です。短期では変化があります。/);
  assert.doesNotMatch(html,/長い経緯です|詳しい仮説です|総評の全文|実測＋一部の外部資料/);
});
test('Tier table hides only the held legacy Rally Royal when the current ID is displayed', () => {
  const current = '45ac59ea-037c-4b2f-8334-9bdd3839f4c3';
  const legacy = '5fa97cd2-2607-4d66-bfb2-d8db0cd85914';
  const name = '連携ロイヤル';
  const pub = fixture();
  const { snapshot, evaluation } = pub.payload;
  const rows = [
    ['other-held', '別の保留', null, 6],
    [legacy, name, null, 3],
    ['other-fourth', '別のTier 4', 4, 8],
    [current, name, 4, 5],
    ['other-fifth', '別のTier 5', 5, 1],
  ];
  snapshot.decks = rows.map(([deckId, name, , encounterRate]) => ({
    ...snapshot.decks[0], deckId, name, encounterRate, className: name === '連携ロイヤル' ? 'ロイヤル' : 'エルフ',
  }));
  evaluation.decks = rows.map(([deckId, , tier]) => ({ ...evaluation.decks[0], deckId, tier }));

  function table() {
    const html = renderToStaticMarkup(createElement(ReviewReport, { publication: pub }));
    const section = html.split('>Tier表</h3>')[1].split('</section>')[0];
    return section.split(/>Tier [1-5]<\/strong>/).slice(1).map(group =>
      [...group.matchAll(/<button\b[^>]*>(.*?)<\/button>/gs)].map(match => match[1].replace(/<[^>]*>/g, ''))
    );
  }

  const original = JSON.stringify(pub);
  assert.deepEqual(table(), [[], [], [], ['別のTier 4', name], ['別のTier 5', '別の保留']]);
  assert.equal(JSON.stringify(pub), original);

  evaluation.decks.find(row => row.deckId === legacy).tier = 5;
  assert.deepEqual(table()[4], [name, '別のTier 5', '別の保留']);
  evaluation.decks.find(row => row.deckId === legacy).tier = null;
  const oldDeck = snapshot.decks.find(row => row.deckId === legacy);
  const originalClass = oldDeck.className;
  oldDeck.className = 'エルフ';
  assert.deepEqual(table()[4], ['別のTier 5', '別の保留', name]);
  oldDeck.className = originalClass;
  evaluation.decks = evaluation.decks.filter(row => row.deckId !== current);
  assert.deepEqual(table(), [[], [], [], ['別のTier 4'], ['別のTier 5', '別の保留', name]]);
});
test('late report retains original successful publication time',()=>{
  const pub=fixture();
  pub.payload.snapshot.asOf = new Date(now - 48*3600000).toISOString();
  assert.match(renderToStaticMarkup(createElement(ReviewReport,{publication:pub})),/更新遅延/);
  assert.equal(pub.published_at,source.asOf);
});

test('matrix glyphs distinguish the stored judgment from a measured trend in both directions', () => {
  const pub = fixture(), { snapshot, evaluation } = pub.payload;
  const a = snapshot.decks[0].deckId, b = 'z-deck';
  snapshot.decks.push({ ...snapshot.decks[0], deckId:b, name:'相手ロイヤル', className:'ロイヤル' });
  const measured = { a, b, count:20, winRate:80, dataRating:null };
  const pair = { a, b, rating:null, reason:'評価理由', confidence:'中', divergence:null };
  snapshot.pairs.push(measured);
  evaluation.pairs.push(pair);
  function cells() {
    const html = renderToStaticMarkup(createElement(ReviewReport, {publication:pub}));
    return [...html.matchAll(/<button[^>]*aria-label="([^"]+ 対 [^"]+)"[^>]*>(.*?)<\/button>/gs)]
      .map(m => [m[1], m[2].replace(/<[^>]*>/g,'')]);
  }
  for (const [rating, forward, reverse] of [[2,'◎','×'],[1,'○','▲'],[0,'△','△'],[-1,'▲','○'],[-2,'×','◎']]) {
    pair.rating = rating;
    assert.deepEqual(cells().map(c=>c[1]),[forward,reverse]);
  }
  pair.confidence='低';
  assert.deepEqual(cells().map(c=>c[1]),['×','◎']);
  pair.rating=null;
  for (const [count,winRate] of [[20,80],[20,50],[3,100],[0,null]]) {
    Object.assign(measured,{count,winRate});
    assert.deepEqual(cells().map(c=>c[1]),['','']);
  }
});
