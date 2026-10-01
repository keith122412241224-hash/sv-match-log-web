/* eslint-disable @typescript-eslint/no-require-imports */
const {test}=require('node:test'),assert=require('node:assert/strict');
const {parseEnvironmentDashboardV3:parse,buildEnvironmentViewV3:view}=require('../src/lib/environment-dashboard-v3');
const {parseEnvironmentDashboardV2}=require('../src/lib/environment-dashboard-v2');
const {deckTrend}=require('../src/lib/environment-dashboard');
const {renderToStaticMarkup}=require('react-dom/server'),React=require('react');
const {EnvironmentData}=require('../src/components/environment/EnvironmentData');
const id=n=>`e5000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const selection={environment:id(1),period:'24h',ranks:['a','aa']};
const empty=()=>({encounter:{status:'no_data',count:null},winrate:{status:'no_data',targetRegistrations:null,evaluationCount:null,wins:null}});
const metric=(n,e=n,w=n,c=n)=>({encounter:c?{status:'available',count:c}:{status:'no_data',count:null},winrate:{status:'available',targetRegistrations:n,evaluationCount:e,wins:w}});
function payload(){return {version:3,environmentId:id(1),period:'24h',rankFilters:['a','aa'],aggregatedAt:'2026-10-01T00:14:00Z',dataThrough:'2026-10-01T00:00:00Z',current:{start:'2026-09-30T00:00:00Z',end:'2026-10-01T00:00:00Z',total:{status:'available',totalMatches:1}},previous:{start:'2026-09-29T00:00:00Z',end:'2026-09-30T00:00:00Z',total:{status:'no_data',totalMatches:null}},decks:[{key:id(2),name:'一戦ミラー',className:'エルフ',current:metric(1,2,1),previous:empty()},{key:'unclassified',name:'未分類',className:null,current:empty(),previous:empty()}]};}
test('v3 accepts one/two registrations and no_data, while old parser remains strict',()=>{
 const p=payload();assert.deepEqual(parse(p,selection),p);assert.equal(view(parse(p,selection)).rows[0].winRate,50);
 p.current.total.totalMatches=2;p.decks[0].current=metric(2);assert.deepEqual(parse(p,selection),p);
 assert.throws(()=>parseEnvironmentDashboardV2({...p,version:2},selection));
 p.current.total={status:'no_data',totalMatches:null};p.decks[0].current=empty();assert.equal(view(parse(p,selection)).rows.length,0);
});
test('v3 fails closed on suppression, leaked keys, impossible counts, versions, time and ranks',()=>{
 for(const mutate of [p=>p.version=2,p=>p.rankFilters=['aa','a'],p=>p.rankFilters=[],p=>p.rankFilters=['a','a'],p=>p.rankFilters=['all'],p=>p.user_id=id(9),p=>p.current.total.status='privacy_suppressed',p=>p.current.total.totalMatches=0,p=>p.current.total.totalMatches=null,p=>p.decks[0].current.encounter.count=2,p=>p.decks[0].current.encounter.count=0,p=>p.decks[0].current.winrate.targetRegistrations=0,p=>p.decks[0].current.winrate.evaluationCount=3,p=>p.decks[0].current.winrate.wins=3,p=>p.decks[0].current.winrate.memo='private',p=>p.decks[0].current.winrate.status='privacy_suppressed',p=>p.previous.total.totalMatches=0,p=>p.decks.push(p.decks[0]),p=>p.decks.pop(),p=>p.dataThrough='2026-10-01T00:01:00Z',p=>p.current.start='2026-02-30T00:00:00Z']){const p=payload();mutate(p);assert.throws(()=>parse(p,selection));}
 assert.throws(()=>parse(payload(),{...selection,ranks:['a']}));
});
test('row population includes own-only and opponent-only from one record; TOP5 retains ten target threshold',()=>{
 const p=payload();p.current.total.totalMatches=1000;
 p.decks=[...Array.from({length:7},(_,i)=>({key:id(10+i),name:'共通'+i,className:'エルフ',current:metric([1,9,10,29,30,40,50][i]),previous:empty()})),{key:id(30),name:'自分のみ',className:'エルフ',current:metric(1,1,1,0),previous:empty()},{key:id(31),name:'前期のみ',className:'エルフ',current:empty(),previous:metric(4)},...p.decks.slice(1)];
 const v=view(p);assert.equal(v.rows.length,8);assert.equal(v.rows.find(d=>d.name==='自分のみ').encounterRate,0);assert.equal(v.encounters.length,5);assert.equal(view(payload()).encounters[0].current.encounter.count,1);assert.equal(v.wins.length,5);assert.ok(v.wins.every(d=>d.current.winrate.targetRegistrations>=10));
});
test('v3 uses the existing exact trend rule and comparison population',()=>{
 const p=payload();for(const n of [29,30,200]){p.current.total.totalMatches=n;p.previous.total={status:'available',totalMatches:n};p.decks[0].previous=metric(1);p.decks[0].current=metric(2);
  assert.deepEqual(view(p).rows[0].trend,deckTrend(p.decks[0],p.current.total,p.previous.total));assert.equal(view(p).rows[0].trend.state,n===29?'insufficient':'increase');}
 p.decks[0].previous=empty();assert.equal(view(p).rows[0].trend.state,'no_previous');
});
test('UI displays low-count numbers and count labels, with compact copy and collapsed accessible help',()=>{
 const p=payload();p.decks.push({key:id(9),name:'未観測共通',className:'エルフ',current:empty(),previous:empty()});
 const html=renderToStaticMarkup(React.createElement(EnvironmentData,{data:p,activeDeckIds:[id(2),id(9)]}));
 for(const s of ['50.0%','対象戦績1件','勝率集計件数','対象戦績数','前の期間より遭遇率が増えたデッキを表示します。','前の期間より遭遇率が減ったデッキを表示します。','前の期間のデータがありません。','集計について'])assert.ok(html.includes(s),s);
 assert.match(html,/勝率集計2件/);assert.doesNotMatch(html,/参考|サンプル不足|少人数|評価件数|対象登録件数|未観測共通|未分類|<details[^>]*open/);
 const hidden=renderToStaticMarkup(React.createElement(EnvironmentData,{data:p,activeDeckIds:[]}));assert.ok(!hidden.includes('<h3 class="break-words font-semibold">一戦ミラー'));
});
