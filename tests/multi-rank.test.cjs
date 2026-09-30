/* eslint-disable @typescript-eslint/no-require-imports */
const {test}=require('node:test'),assert=require('node:assert/strict');
const r=require('../src/lib/rank-selection');
test('17 disjoint atoms, presets, canonical ordering and duplicate removal',()=>{
 assert.equal(r.RANK_ATOMS.length,17);assert.equal(new Set(r.RANK_ATOMS).size,17);assert.equal(r.RANK_ATOMS[0],'unranked');
 assert.deepEqual(r.normalizeRankSelection(['grandmaster:none','master:diamond','grandmaster:none']),['master:diamond','grandmaster:none']);
 for(const p of r.RANK_PRESETS){assert.equal(r.getRankSelectionLabel(p.ranks),p.label);assert.deepEqual(r.expandLegacyRankFilter(p.value),p.ranks);}
 assert.equal(r.getRankSelectionLabel(['master:sapphire','master:diamond','grandmaster:none','grandmaster:epic']),'カスタム（4区分）');
 assert.deepEqual(r.expandLegacyRankFilter('grandmaster-plus'),r.GRANDMASTER_ATOMS);
});
test('all 21 legacy URLs expand without losing the source population',()=>{
 const {RANK_FILTER_OPTIONS}=require('../src/lib/rank-filter');
 for(const {value}of RANK_FILTER_OPTIONS){const selection=r.parseRankSelection({rank:value});assert.ok(selection.length);assert.deepEqual(selection,r.expandLegacyRankFilter(value));}
 assert.deepEqual(r.parseRankSelection({}),r.RANK_ATOMS);
});
test('URL round trip, stable order and strict invalid input rejection',()=>{
 const selection=['grandmaster:epic','master:sapphire','grandmaster:none'];const wire=new URLSearchParams({ranks:r.serializeRankSelection(selection)}).toString();
 assert.deepEqual(r.parseRankSelection(Object.fromEntries(new URLSearchParams(wire))),r.normalizeRankSelection(selection));
 for(const value of [[],null,{},[''],['unknown'],['MASTER'],['master-plus'],['grandmaster'],[null],Array(18).fill('a')])assert.throws(()=>r.normalizeRankSelection(value));
 for(const params of [{ranks:''},{ranks:'null'},{ranks:null},{ranks:['a','b']},{ranks:'a',rank:'master'},{rank:''},{rank:'bad'},{rank:'unranked'}])assert.throws(()=>r.parseRankSelection(params));
 assert.deepEqual(r.parseRankSelection({ranks:'a,a'}),['a']);
});
test('parents have checked, indeterminate and empty draft states',()=>{
 assert.deepEqual(r.rankGroupState([],r.MASTER_ATOMS),{checked:false,indeterminate:false});
 assert.deepEqual(r.rankGroupState(['master:sapphire'],r.MASTER_ATOMS),{checked:false,indeterminate:true});
 assert.deepEqual(r.rankGroupState(r.MASTER_ATOMS,r.MASTER_ATOMS),{checked:true,indeterminate:false});
 assert.deepEqual(r.toggleRankGroup(['master:sapphire'],r.MASTER_ATOMS),r.MASTER_ATOMS);
 assert.deepEqual(r.toggleRankGroup(r.MASTER_ATOMS,r.MASTER_ATOMS),[]);
 assert.deepEqual(r.toggleRankGroup(['unranked'],r.GRANDMASTER_ATOMS),['unranked',...r.GRANDMASTER_ATOMS]);
});
test('matrix navigation is exact set equivalence, never widened',()=>{
 const {ANALYSIS_RANK_FILTERS}=require('../src/lib/analysis-rank-filter');
 for(const p of ANALYSIS_RANK_FILTERS)assert.equal(r.rankSelectionToMatrixFilter(r.expandLegacyRankFilter(p.value)),p.value);
 for(const selection of [['a'],['unranked'],['master:sapphire','master:diamond'],['grandmaster:none','grandmaster:epic']])assert.equal(r.rankSelectionToMatrixFilter(selection),null);
});
test('atomic option labels reuse Japanese rank metadata and icons',()=>{
 const options=r.ATOMIC_RANK_GROUPS.flatMap(g=>g.options);assert.deepEqual(options.map(o=>o.value),r.RANK_ATOMS);
 assert.deepEqual(r.ATOMIC_RANK_GROUPS[2].options.map(o=>o.label),['エメラルド','トパーズ','ルビー','サファイア','ダイヤモンド']);
 assert.ok(r.ATOMIC_RANK_GROUPS[3].options.every(o=>o.iconSrc==='/ranks/grandmaster.png'));
 assert.equal(r.RANK_PRESETS.some(p=>p.value==='grandmaster-plus'),false);
});
