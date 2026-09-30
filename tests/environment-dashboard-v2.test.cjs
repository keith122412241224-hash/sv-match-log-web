/* eslint-disable @typescript-eslint/no-require-imports */
const {test}=require('node:test'),assert=require('node:assert/strict');
const {parseEnvironmentDashboardV2,environmentHrefV2}=require('../src/lib/environment-dashboard-v2');
const env='e1000000-0000-4000-8000-000000000200',selection={environment:env,period:'24h',ranks:['a','aa']};
function payload(){const hidden={encounter:{status:'privacy_suppressed',count:null},winrate:{status:'privacy_suppressed',targetRegistrations:null,evaluationCount:null,wins:null}};return {version:2,period:'24h',rankFilters:['a','aa'],environmentId:env,aggregatedAt:'2026-09-30T00:14:00Z',dataThrough:'2026-09-30T00:00:00Z',current:{start:'2026-09-29T00:00:00Z',end:'2026-09-30T00:00:00Z',total:{status:'privacy_suppressed',totalMatches:null}},previous:{start:'2026-09-28T00:00:00Z',end:'2026-09-29T00:00:00Z',total:{status:'privacy_suppressed',totalMatches:null}},decks:[{key:'unclassified',name:'未分類',className:null,current:hidden,previous:structuredClone(hidden)}]};}
test('v2 validates canonical ranks and reuses strict metric/privacy response validation',()=>{
 assert.deepEqual(parseEnvironmentDashboardV2(payload(),selection),payload());
 for(const mutate of [p=>p.rankFilters=['aa','a'],p=>p.rankFilters=['a','a'],p=>p.rankFilters=[],p=>p.rankFilters=['master'],p=>p.rankFilter='all',p=>p.user_id='secret',p=>p.version=1,p=>p.current.total.totalMatches=2,p=>p.decks[0].current.encounter.count=1,p=>p.decks[0].current.winrate.wins=1,p=>p.decks[0].current.winrate.targetRegistrations=2,p=>p.current.end='2026-10-01T00:00:00Z']){const p=payload();mutate(p);assert.throws(()=>parseEnvironmentDashboardV2(p,selection));}
 assert.throws(()=>parseEnvironmentDashboardV2(payload(),{...selection,ranks:['a']}));
 assert.equal(new URL(environmentHrefV2({...selection,ranks:['aa','a','a']}),'http://local').searchParams.get('ranks'),'a,aa');
});
