/* eslint-disable @typescript-eslint/no-require-imports */
const {test}=require('node:test'),assert=require('node:assert/strict');
const {parseCorrelation,correlationFromTier}=require('../src/lib/creator/correlation');
const {newTierDocument}=require('../src/lib/creator/model');
const id=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const old=()=>({version:1,showTitle:true,showNames:true,nodes:[1,2].map(n=>({id:id(n),imageId:id(n+10),x:n*200,y:200,width:160,height:184})),edges:[{id:id(3),sourceNodeId:id(1),targetNodeId:id(2),origin:'manual',label:'有利',visible:true}]});
test('UX: legacy diagrams normalize without losing edges; independent title including empty',()=>{
 const d=parseCorrelation(old(),'Tier');assert.equal(d.title,'Tier');assert.equal(d.edges[0].type,'forward');assert.equal(d.edges[0].winRate,null);assert.equal(d.showStats,true);
 assert.equal(parseCorrelation({...old(),title:''},'Tier').title,'');
 const tier=newTierDocument();tier.title='Initial';const graph=correlationFromTier(tier);tier.title='Changed';assert.equal(graph.title,'Initial');
});
test('UX: manual numeric values, null, zero, types and visibility round trip; reject malformed',()=>{
 for(const values of [{winRate:null,matchCount:null},{winRate:0,matchCount:0},{winRate:57.1,matchCount:42},{winRate:100,matchCount:null},{winRate:null,matchCount:3}]){
  const doc=old();doc.title='Independent';doc.showLabels=false;doc.showStats=false;Object.assign(doc.edges[0],values,{type:'bidirectional'});
  const parsed=parseCorrelation(doc);assert.deepEqual(parsed.edges[0],doc.edges[0]);assert.equal(parsed.showStats,false);assert.equal(parsed.showLabels,false);
 }
 for(const patch of [{winRate:-1},{winRate:101},{winRate:NaN},{winRate:'57'},{matchCount:1.5},{matchCount:-1},{matchCount:Infinity},{matchCount:9007199254740992},{type:'reverse'},{type:null}]){const doc=old();Object.assign(doc.edges[0],patch);assert.throws(()=>parseCorrelation(doc));}
 for(const patch of [{title:null},{title:'x'.repeat(121)},{showStats:null},{showLabels:0}])assert.throws(()=>parseCorrelation({...old(),...patch}));
});
