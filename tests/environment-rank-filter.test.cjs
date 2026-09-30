/* eslint-disable @typescript-eslint/no-require-imports */
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const rank=require('../src/lib/rank-filter'),env=require('../src/lib/environment-dashboard');
const {RANKS,MASTER_GROUPS,GRANDMASTER_RATINGS}=require('../src/constants/ranks');
const fixture=require('./environment-dashboard-fixture.cjs');
test('E1.1 exact ordered wire contract, four nonselectable groups and no duplicate choices',()=>{
 assert.deepEqual(rank.RANK_FILTER_OPTIONS.map(x=>x.value),fixture.filters);
 assert.deepEqual(rank.RANK_FILTER_GROUPS.map(g=>[g.label,g.options.length]),[['すべて',1],['通常ランク',6],['Master',7],['GrandMaster',7]]);
 assert.equal(new Set(fixture.filters).size,21);
});
for(const value of fixture.filters)test('E1.1 parse and URL round trip '+value,()=>{
 assert.equal(rank.parseRankFilter(value),value);assert.equal(env.normalizeEnvironmentRank(value),value);
 const selection={environment:fixture.env.three,period:'3d',rank:value};const q=new URL(env.environmentHref(selection),'http://localhost').searchParams;
 assert.equal(q.get('rank'),value);assert.equal(q.get('environment'),selection.environment);
});
test('E1.1 invalid/null values cannot mean GM none; URL normalizes but strict parser rejects invalid values',()=>{
 for(const value of ['none','null','master:none','grandmaster:emerald','aa-plus','MASTER','master:EMERALD','grandmaster:',' grandmaster','all;select']){assert.throws(()=>rank.parseRankFilter(value));assert.equal(env.normalizeEnvironmentRank(value),'all');}
 for(const value of [undefined,null,''])assert.equal(rank.parseRankFilter(value),'all');
 assert.equal(env.normalizeEnvironmentRank(['master']), 'all');assert.equal(rank.parseRankFilter('grandmaster:none'),'grandmaster:none');
});
test('E1.1 labels and all existing icon paths use original mapping; no invented GM assets',()=>{
 for(const tier of RANKS){const o=rank.RANK_FILTER_OPTIONS.find(x=>x.value===tier.value);assert.equal(o.label,tier.label);assert.equal(o.iconSrc,tier.iconSrc);assert.ok(fs.existsSync('public'+o.iconSrc));}
 assert.deepEqual(MASTER_GROUPS.map(g=>rank.RANK_FILTER_OPTIONS.find(x=>x.value==='master:'+g.value).label),['エメラルド','トパーズ','ルビー','サファイア','ダイヤモンド']);
 for(const g of MASTER_GROUPS){const o=rank.RANK_FILTER_OPTIONS.find(x=>x.value==='master:'+g.value);assert.equal(o.iconSrc,g.iconSrc);assert.ok(fs.existsSync('public'+o.iconSrc));assert.equal(o.fullLabel,'Master / '+g.label);}
 for(const g of GRANDMASTER_RATINGS){const o=rank.RANK_FILTER_OPTIONS.find(x=>x.value==='grandmaster:'+g.value);assert.equal(o.label,g.label);assert.equal(o.fullLabel,'GrandMaster / '+g.label);assert.equal(o.iconSrc,'/ranks/grandmaster.png');}
 assert.equal(rank.RANK_FILTER_OPTIONS[0].iconSrc,undefined);
 assert.equal(rank.RANK_FILTER_OPTIONS.find(x=>x.value==='master-plus').iconSrc,'/ranks/master.png');
});
test('E1.1 cumulative tier meaning and destination capabilities do not silently widen filters',()=>{
 assert.deepEqual(rank.rankTiersAtOrAbove('master'),['master','grandmaster']);assert.deepEqual(rank.rankTiersAtOrAbove('grandmaster'),['grandmaster']);
 for(const tier of ['beginner','d','c','b','a','aa'])assert.deepEqual(rank.rankDestinationSupport(tier),{analysis:true,matrix:false});
 assert.deepEqual(rank.rankDestinationSupport('grandmaster-plus'),{analysis:false,matrix:false});
 for(const value of ['master-plus','master','grandmaster',...fixture.leaves.slice(6)])assert.deepEqual(rank.rankDestinationSupport(value),{analysis:true,matrix:true});
});
test('E1.1 RPC output keeps exact E1 privacy and aggregation sections',()=>{
 const read=f=>fs.readFileSync('supabase/migrations/'+f,'utf8').replaceAll('\r\n','\n');
 const old=read('20260930004618_environment_dashboard_aggregates_v1.sql'),updated=read('20260930040027_environment_dashboard_rank_filters.sql');
 const tail=s=>s.slice(s.indexOf('    ), totals as'),s.indexOf('$function$;')+11);
 assert.equal(tail(updated),tail(old));
 assert.equal((updated.match(/create or replace function/g)||[]).length,1);
 assert.doesNotMatch(updated.replace(/--[^\n]*/g,''),/\b(grant|revoke|alter|drop|insert|update|delete|create index|policy)\b/i);
});
