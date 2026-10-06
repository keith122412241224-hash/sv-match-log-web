/* eslint-disable @typescript-eslint/no-require-imports */
const {test}=require('node:test'),assert=require('node:assert/strict');
const {newTierDocument}=require('../src/lib/creator/model');
const {parseCorrelation,correlationFromTier,boundNode,removeNode,edgeGeometry}=require('../src/lib/creator/correlation');
const id=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
function sample(){const tier=newTierDocument();tier.rows[0].imageIds=[id(1),id(2)];tier.rows[2].imageIds=[id(3),id(1)];return correlationFromTier(tier);}
test('correlation: Tier order, no duplicate image selection, bounded initial layouts including full capacity',()=>{
 const doc=sample();assert.deepEqual(doc.nodes.map(n=>n.imageId),[id(1),id(2),id(3)]);assert.equal(doc.nodes[0].y,doc.nodes[1].y);assert.ok(doc.nodes[2].y>doc.nodes[0].y);assert.deepEqual(parseCorrelation(doc),doc);
 for(let rowCount=1;rowCount<=30;rowCount++){
  const tier=newTierDocument();tier.rows=Array.from({length:rowCount},(_,i)=>({id:id(1000+i),name:String(i),color:'#ffffff',imageIds:[]}));
  for(let i=0;i<300;i++)tier.rows[i%rowCount].imageIds.push(id(i+1));
  assert.equal(parseCorrelation(correlationFromTier(tier)).nodes.length,300);
 }
});
test('correlation: rejects malformed IDs, nonfinite/outside coordinates, invalid endpoints, self/duplicate/reverse edges and generated origin',()=>{
 const d=sample(),[a,b]=d.nodes,e={id:id(10),sourceNodeId:a.id,targetNodeId:b.id,origin:'manual',label:'57% / 42戦',visible:true};
 assert.deepEqual(parseCorrelation({...d,edges:[e]}).edges,[e]);
 for(const nodes of [[{...a,x:-1}], [{...a,x:1920}], [{...a,width:Infinity}], [{...a,height:0}], [a,a]])assert.throws(()=>parseCorrelation({...d,nodes}));
 for(const edges of [[{...e,targetNodeId:a.id}], [{...e,targetNodeId:id(999)}], [e,{...e,id:id(11),sourceNodeId:b.id,targetNodeId:a.id}], [{...e,origin:'generated'}], [{...e,label:'x'.repeat(61)}]])assert.throws(()=>parseCorrelation({...d,edges}));
});
test('correlation: rectangular edge anchors follow move/resize, overlap hides safely, node deletion prunes only incident edges',()=>{
 const d=sample(),a={...d.nodes[0],x:100,y:100,width:100,height:100},b={...d.nodes[1],x:400,y:100,width:100,height:100};
 assert.deepEqual(edgeGeometry(a,b).start,{x:200,y:150});assert.deepEqual(edgeGeometry(a,b).end,{x:400,y:150});
 assert.equal(edgeGeometry({...a,width:200},b).start.x,300);
 assert.equal(edgeGeometry(a,{...b,x:500}).end.x,500);assert.equal(edgeGeometry(a,{...b,x:150}),null);
 assert.equal(edgeGeometry(a,{...a,id:b.id}),null);
 const bounded=boundNode(a,{x:9999,y:-100,width:240,height:276});assert.equal(bounded.x,1680);assert.equal(bounded.y,0);
 const edge={id:id(55),sourceNodeId:a.id,targetNodeId:b.id,origin:'manual',label:'有利',visible:true};
 const after=removeNode({...d,edges:[edge]},a.id);assert.equal(after.nodes.length,2);assert.equal(after.edges.length,0);
});
