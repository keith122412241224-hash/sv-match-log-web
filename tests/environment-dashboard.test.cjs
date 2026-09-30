/* eslint-disable @typescript-eslint/no-require-imports */
const {test}=require('node:test'),assert=require('node:assert/strict');
const m=require('../src/lib/environment-dashboard.ts');
const id=n=>`e1000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const total=n=>({status:'available',totalMatches:n});
const encounter=n=>({status:'available',count:n});
const win=(r=30,e=40,w=20)=>({status:'available',targetRegistrations:r,evaluationCount:e,wins:w});
const hidden=s=>({encounter:{status:s,count:null},winrate:{status:s,targetRegistrations:null,evaluationCount:null,wins:null}});
const deck=(n,c=20,p=10)=>({key:id(n),name:'Deck '+n,className:'エルフ',current:{encounter:encounter(c),winrate:win()},previous:{encounter:encounter(p),winrate:win()}});
const selection={environment:id(90),period:'7d',rank:'all'};
function payload(){return {version:1,period:'7d',rankFilter:'all',environmentId:id(90),aggregatedAt:'2026-09-30T00:14:00Z',dataThrough:'2026-09-30T00:00:00Z',
 current:{start:'2026-09-23T00:00:00Z',end:'2026-09-30T00:00:00Z',total:total(100)},previous:{start:'2026-09-16T00:00:00Z',end:'2026-09-23T00:00:00Z',total:total(100)},
 decks:[deck(1),{key:'unclassified',name:'未分類',className:null,current:hidden('no_data'),previous:hidden('no_data')}]};}
test('E1 encounter denominator, zero, null and privacy',()=>{
 assert.equal(m.encounterRate(encounter(40),total(220)),40/220*100);
 assert.equal(m.encounterRate(encounter(0),total(0)),null);
 for(const status of ['no_data','privacy_suppressed']){assert.equal(m.encounterRate({status,count:null},total(220)),null);assert.equal(m.encounterRate(encounter(4),{status,totalMatches:null}),null);}
});
test('E1 win rate and source registration eligibility, not evaluations',()=>{
 assert.equal(m.winRate(win(32,60,32)),32/60*100);
 for(const n of [1,9,10,29,30])assert.equal(m.sampleLabel(win(n,2*n,n)),n<10?'サンプル不足':n<30?'参考':null);
 const p=payload();p.decks[0].current.winrate=win(9,18,9);assert.equal(m.buildEnvironmentView(p).wins.length,0);
 for(const status of ['no_data','privacy_suppressed']){const w=hidden(status).winrate;assert.equal(m.winRate(w),null);assert.equal(m.sampleLabel(w),null);}
 assert.equal(m.winRate(win(0,0,0)),null);
});
test('E1 TOP5 caps, stable ties, source registration tiebreak and unclassified exclusion',()=>{
 const p=payload();p.decks=Array.from({length:7},(_,i)=>deck(7-i,10,10));
 let v=m.buildEnvironmentView(p);assert.deepEqual(v.encounters.map(d=>d.key),[1,2,3,4,5].map(id));assert.equal(v.wins.length,5);
 p.decks=p.decks.slice(0,3);p.decks[1].current.winrate=win(40,40,20);v=m.buildEnvironmentView(p);assert.equal(v.wins.length,3);assert.equal(v.wins[0].key,p.decks[1].key);
 p.decks.push({...deck(0,90,3),key:'unclassified'});v=m.buildEnvironmentView(p);for(const k of ['encounters','wins','increases','decreases'])assert.ok(v[k].every(d=>d.key!=='unclassified'));
});
for(const [c,p,state] of [[101,100,'increase'],[100,101,'decrease'],[100,100,'flat']])test(`E1 exact 0.5 boundary ${state}`,()=>assert.equal(m.deckTrend(deck(1,c,p),total(200),total(200)).state,state));
for(const [c,p] of [[20499,20000],[20000,20499]])test(`E1 subthreshold ${c}/${p}`,()=>assert.equal(m.deckTrend(deck(1,c,p),total(100000),total(100000)).state,'flat'));
test('E1 comparison unavailable states never become flat',()=>{
 const d=deck(1);assert.equal(m.deckTrend(d,total(29),total(100)).state,'insufficient');
 assert.equal(m.deckTrend(d,total(100),{status:'no_data',totalMatches:null}).state,'no_comparison');
 d.previous=hidden('no_data');assert.equal(m.deckTrend(d,total(100),total(100)).state,'no_previous');
 d.previous=hidden('privacy_suppressed');assert.equal(m.deckTrend(d,total(100),total(100)).state,'privacy_suppressed');
 d.previous=deck(1).previous;d.current=hidden('no_data');assert.equal(m.deckTrend(d,total(100),total(100)).state,'no_current');
});
test('E1 TOP3 only directional qualifying data, no padding',()=>{
 const p=payload();p.decks=[deck(1,20,10),deck(2,5,20),deck(3,15,15)];const v=m.buildEnvironmentView(p);
 assert.deepEqual(v.increases.map(d=>d.key),[id(1)]);assert.deepEqual(v.decreases.map(d=>d.key),[id(2)]);
});
test('E1 parser accepts exact contract and separate metric suppression',()=>{
 const p=payload();assert.deepEqual(m.parseEnvironmentDashboard(p,selection),p);
 p.decks[0].current.encounter={status:'privacy_suppressed',count:null};assert.doesNotThrow(()=>m.parseEnvironmentDashboard(p,selection));
});
const mutations={
 missing:p=>delete p.version, version:p=>p.version=2, period:p=>p.period='custom',rank:p=>p.rankFilter='master:ruby',environment:p=>p.environmentId=id(91),
 timestamp:p=>p.aggregatedAt='invalid',boundary:p=>p.current.end='2026-09-30T00:00:01Z',cutoff:p=>p.dataThrough='2026-09-30T00:01:00Z',
 impossibleDate:p=>p.aggregatedAt='2026-09-31T00:14:00Z',
 invalidStatus:p=>p.current.total.status='unknown',negative:p=>p.decks[0].current.encounter.count=-1,fraction:p=>p.decks[0].current.encounter.count=1.5,
 suppressionValue:p=>p.decks[0].current.encounter.status='privacy_suppressed',duplicate:p=>p.decks.push(p.decks[0]),
 excessWins:p=>p.decks[0].current.winrate.wins=41,excessTargets:p=>p.decks[0].current.winrate.targetRegistrations=41,
 excessEvaluations:p=>p.decks[0].current.winrate.evaluationCount=61,excessEncounters:p=>p.decks[0].current.encounter.count=101,
 zeroAvailable:p=>p.current.total.totalMatches=0,unsafeInteger:p=>p.current.total.totalMatches=Number.MAX_SAFE_INTEGER+1,
 missingCatalog:p=>p.decks.pop(),privateField:p=>p.decks[0].user_id=id(200),catalogName:p=>p.decks[0].name='',
 periodSuppressed:p=>p.current.total={status:'privacy_suppressed',totalMatches:null},invalidKey:p=>p.decks[0].key='personal-deck',
 noDataValue:p=>p.decks[1].current.encounter.count=0
};
for(const [name,change] of Object.entries(mutations))test('E1 parser rejects '+name,()=>{const p=payload();change(p);assert.throws(()=>m.parseEnvironmentDashboard(p,selection));});
test('E1 URL defaults, safe query and one-decimal formatting',()=>{
 assert.equal(m.normalizeEnvironmentPeriod('custom'),'7d');assert.equal(m.normalizeEnvironmentRank('master:emerald'),'all');assert.equal(m.normalizeEnvironmentRank(['master']),'all');
 assert.equal(m.environmentHref(selection),`/environment?environment=${id(90)}&period=7d&rank=all`);assert.equal(m.formatEnvironmentPercent(50),'50.0%');
});
