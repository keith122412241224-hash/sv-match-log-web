/* eslint-disable @typescript-eslint/no-require-imports */
const {test}=require('node:test'),assert=require('node:assert/strict');
const {newTierDocument,tierLayout,tierImagePosition}=require('../src/lib/creator/model');
test('intrinsic Tier frames: mixed aspect ratios share height, wrap without overlap and preserve saved data',()=>{
 const doc=newTierDocument(),ratios={landscape:600/315,square:1,portrait:.5,trimmed:.75,clear:2};
 doc.rows[0].imageIds=Array.from({length:25},(_,i)=>Object.keys(ratios)[i%5]);doc.rows[1].imageIds=['portrait','landscape'];
 const before=JSON.stringify(doc),layout=tierLayout(doc,ratios);
 doc.rows.forEach((row,r)=>row.imageIds.forEach((id,i)=>{const frame=tierImagePosition(layout,i,r);assert.equal(frame.height,layout.imageSize);assert.ok(Math.abs(frame.width/frame.height-ratios[id])<1e-10);assert.ok(frame.left+frame.width<=1664-layout.padding+.001);assert.ok(frame.top+frame.height<=layout.heights[r]);if(i){const previous=tierImagePosition(layout,i-1,r);assert.ok(frame.top>previous.top||frame.left>=previous.left+previous.width+layout.gap-.001);}}));
 assert.ok(layout.frames[0].at(-1).top>layout.padding);assert.ok(layout.contentHeight*layout.scale<=912);assert.equal(JSON.stringify(doc),before);
});
test('intrinsic Tier frames: extreme width, invalid/missing metrics and title-off remain bounded without distortion',()=>{
 const doc=newTierDocument();doc.showTitle=false;doc.rows[0].imageIds=['wide','square','invalid','missing'];
 const layout=tierLayout(doc,{wide:1000,square:1,invalid:NaN});
 for(const f of layout.frames[0]){assert.equal(f.height,layout.imageSize);assert.ok(f.left+f.width<=1664+.001);assert.ok(Number.isFinite(f.width)&&f.width>0);}
 assert.ok(Math.abs(layout.frames[0][0].width/layout.imageSize-1000)<1e-9);assert.equal(layout.frames[0][2].width/layout.imageSize,1);assert.ok(layout.contentHeight*layout.scale<=984);
});
