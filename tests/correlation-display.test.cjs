/* eslint-disable @typescript-eslint/no-require-imports */
const {test}=require('node:test'),assert=require('node:assert/strict');
const React=require('react'),{renderToStaticMarkup}=require('react-dom/server');
const {correlationDisplayNames,correlationEdgeLabel,correlationNameStyle}=require('../src/lib/creator/correlation-display');
const {CorrelationArtwork}=require('../src/components/creator/CorrelationArtwork');
const images=[{id:'a',name:'ランプD.png',archetype_id:'deck-a',revision:1},{id:'b',name:'ランプD.png',archetype_id:null,revision:1},{id:'c',name:'不明.png',archetype_id:'missing',revision:1}];
const nodes=images.map((image,i)=>({id:String(i),imageId:image.id,x:100+i*600,y:250,width:160,height:184}));
const edge={id:'edge',sourceNodeId:'0',targetNodeId:'1',label:'有利',origin:'manual',visible:true,type:'forward'};
const doc={version:1,title:'相関図',showTitle:true,showNames:true,nodes,edges:[edge]};
const render=(document=doc)=>renderToStaticMarkup(React.createElement(CorrelationArtwork,{document,title:'legacy',images,displayNames:correlationDisplayNames(images,[{id:'deck-a',name:'ランプドラゴン'}])}));
test('correlation names resolve only by linked ID; missing/unset IDs use original names without inference or mutation',()=>{
 const before=JSON.stringify(images);
 assert.deepEqual(correlationDisplayNames(images,[{id:'deck-a',name:'ランプドラゴン'}]),{a:'ランプドラゴン',b:'ランプD.png',c:'不明.png'});
 assert.equal(JSON.stringify(images),before);
 const html=render();assert.match(html,/ランプドラゴン/);assert.match(html,/ランプD.png/);assert.match(html,/不明.png/);
});
test('correlation render suppresses only the default label and preserves all stored values',()=>{
 for(const label of ['有利',' 有利 '])assert.equal(correlationEdgeLabel(label),'');
 for(const label of ['微有利','要注意','構築次第','','有利条件あり'])assert.equal(correlationEdgeLabel(label),label);
 const before=JSON.stringify(doc),html=render();
 assert.equal((html.match(/data-correlation-legend/g)||[]).length,1);
 assert.match(html,/矢印方向：有利側 → 不利側/);assert.match(html,/片方向のみ/);
 assert.doesNotMatch(html,/<text[^>]*>有利<\/text>/);assert.equal(JSON.stringify(doc),before);
});
test('edge statistics render independently of default, custom and empty labels, including zero',()=>{
 for(const label of ['有利','微有利','']){
  for(const [winRate,matchCount,expected] of [[60,10,'60% / 10戦'],[0,null,'0%'],[null,0,'0戦'],[null,null,null]]){
   const html=render({...doc,edges:[{...edge,label,winRate,matchCount}]});
   assert.equal((html.match(/<text /g)||[]).length,Number(label==='微有利')+Number(expected!==null));
   if(expected)assert.ok(html.includes(expected));
   if(label==='微有利')assert.match(html,/>微有利<\/text>/);
  }
 }
 const html=render({...doc,showLabels:false,edges:[{...edge,label:'要注意',winRate:60,matchCount:10}]});
 assert.doesNotMatch(html,/要注意/);assert.match(html,/60% \/ 10戦/);
 assert.doesNotMatch(render({...doc,showStats:false,edges:[{...edge,winRate:60,matchCount:10}]}),/60%/);
});
test('bidirectional custom labels survive without a forward legend; legacy forward and title toggle work',()=>{
 const html=render({...doc,edges:[{...edge,type:'bidirectional',label:'構築次第'}]});
 assert.equal((html.match(/<polygon /g)||[]).length,2);assert.match(html,/>構築次第<\/text>/);assert.doesNotMatch(html,/data-correlation-legend/);
 assert.doesNotMatch(render({...doc,edges:[{...edge,visible:false}]}),/data-correlation-legend/);
 assert.match(render({...doc,showTitle:false,edges:[{...edge,type:undefined}]}),/data-correlation-legend[^>]*top:32px/);
});
test('long official names reserve two lines within existing node dimensions without ellipsis',()=>{
 const short=correlationNameStyle('ランプドラゴン',160,184),long=correlationNameStyle('ハイランダーネメシス・コントロール構築',160,184);
 assert.ok(long.fontSize<short.fontSize);assert.ok(long.fontSize>=12);assert.ok(long.labelHeight<184);
 const html=render();assert.match(html,/overflow-wrap:anywhere/);assert.doesNotMatch(html,/text-overflow:ellipsis/);
 assert.match(html,/width:160px;height:120px;object-fit:contain/);
});
