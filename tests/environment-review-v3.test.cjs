/* eslint-disable @typescript-eslint/no-require-imports */
const {test}=require("node:test"), assert=require("node:assert/strict");
const {cellLabel, strength, anchoredStrength, TIER_RULE, priority}=require("../src/lib/environment-review/assessment-v3");
const {parseResearch,originGroups}=require("../src/lib/environment-review/research-v3");
const {validateEvaluation}=require("../src/lib/environment-review/evaluation");
const ctx={schemaVersion:2,promptVersion:"environment-review-prompt-v2",snapshotId:"s",environmentId:"env",asOf:"2025-03-01T03:00:00Z",
  environmentStart:"2025-02-01T00:00:00Z",decks:["a","b"].map(deckId=>({deckId,eligibleCount:0,count:0,dataTier:null})),pairs:[]};
const observed="2025-03-01T04:00:00Z";
function source(id="one") {
  return {id,publisher:id,author:id,dataset:id,url:"https://note.com/"+id,origin:"https://note.com/"+id,
    publishedAt:"2025-02-23T00:00:00Z",updatedAt:null,retrievedAt:observed,environmentId:"env",channel:"note",
    reliability:"中",applicability:"同環境の直接対面",outcome:"採用",reason:"実戦解説",claims:[{target:"a/b",value:1,topic:"対面相性",basis:"直接検証",conditions:"特定構築"}]};
}
const research=(sources=[])=>({analyzedAt:observed,mode:"current",searchLog:"直接資料を確認",sources});
const doc=r=>({schemaVersion:2,reviewVersion:3,promptVersion:ctx.promptVersion,environmentId:"env",snapshotId:"s",public:null,internal:{research:r,sources:[],evidence:[],limitations:"局所的なデータ"}});
function aiDoc(sources, choices) {
  const root=doc(research(sources));
  return {...root,tierRule:TIER_RULE,judgmentRule:"evidence-judgment-v1",internal:{...root.internal,judgments:choices}};
}
const choice=(opts={})=>({target:"a/b",value:2,priority:"外部",confidence:"低",sourceIds:["one"],reason:"条件を満たす構築の勝ち筋を重く評価",
  counterargument:"対策札の普及で逆転する可能性",uncertainty:"別の使用者の記録で再検討",...opts});
test("AI can reverse a measured matchup without mutating the snapshot; projection and sources are checked",()=>{
  const snapshot={...ctx,pairs:[{a:"a",b:"b",count:23,wins:7,dataRating:-2}]};
  const immutable=JSON.stringify(snapshot),input=aiDoc([source()],[choice()]);
  const result=validateEvaluation(input,snapshot);
  assert.equal(result.public.pairs[0].rating,2);assert.equal(result.public.pairs[0].divergence.status,"要検証");
  assert.deepEqual(validateEvaluation(result,snapshot),result);assert.equal(JSON.stringify(snapshot),immutable);
  assert.throws(()=>validateEvaluation({...result,public:{...result.public,pairs:[{...result.public.pairs[0],rating:1}]}},snapshot));
  assert.throws(()=>validateEvaluation({...input,internal:{...input.internal,judgments:[]}},snapshot));
  for(const changes of [{sourceIds:["another"]},{target:"b/a"},{confidence:"高"},{value:0,confidence:"判断保留"},{reason:"勝率99%"},{wins:20}])
    assert.throws(()=>validateEvaluation(aiDoc([source()],[choice(changes)]),snapshot));
});
test("real-world publication checks keep a fresh guide as scoped evidence only; copies cannot raise confidence",()=>{
  const guide={...source("guide"),outcome:"不採用",channel:"攻略",claims:[],guideCheck:{status:"本文確認",observations:[{name:"別名",aliasId:"a",tier:1,basis:"構築一致"}]}};
  const snapshot={...ctx,decks:ctx.decks.map(d=>({...d,name:d.deckId}))};
  const c=choice({target:"a",value:1,sourceIds:["guide"]});
  assert.equal(validateEvaluation(aiDoc([guide],[c]),snapshot).public.decks[0].tier,1);
  assert.throws(()=>validateEvaluation(aiDoc([{...guide,environmentId:"previous"}],[c]),snapshot));
  assert.throws(()=>validateEvaluation(aiDoc([{...guide,guideCheck:{status:"検索結果のみ",observations:[]}}],[c]),snapshot));
  assert.throws(()=>validateEvaluation(aiDoc([guide],[c,choice({sourceIds:["guide"]})]),snapshot));
  assert.throws(()=>validateEvaluation(aiDoc([source(),source("two")],[choice({confidence:"高",value:-2,sourceIds:["one","two"]})]),ctx));
  const second={...source("two"),dataset:source().dataset};
  assert.throws(()=>validateEvaluation(aiDoc([source(),second],[choice({confidence:"高",sourceIds:["one","two"]})]),ctx));
  assert.deepEqual(validateEvaluation(aiDoc([],[]),ctx).public.decks.map(d=>d.tier),[null,null]);
  assert.throws(()=>validateEvaluation(aiDoc([],[choice({target:"a",priority:"実測",sourceIds:[],value:2})]),ctx));
});
test("matrix keeps all observational states, mirror direction and confidence separate",()=>{
  for(const [n,w,label,reverse] of [[39,25,"有利傾向","不利傾向"],[43,22,"実測は拮抗","実測は拮抗"],[32,14,"不利傾向","有利傾向"],[1,0,"少数参考","少数参考"],[0,0,"対戦記録なし","対戦記録なし"]]){
    assert.equal(cellLabel(null,w,n),label);assert.equal(cellLabel(null,n-w,n),reverse);
  }
  assert.equal(cellLabel(0,200,400),"五分");assert.equal(priority(14),"高");assert.equal(strength(ctx.decks[0]).tier,null);
});
test("dated original sources can be read after cutoff only in current mode",()=>{
  const r=research([source()]);parseResearch(r,ctx);
  assert.throws(()=>parseResearch({...r,mode:"historical"},ctx));
  for(const change of [{environmentId:"old"},{updatedAt:"2027-01-01T00:00:00Z"},{reliability:"低"},{publishedAt:"2025-01-01T00:00:00Z"}])
    assert.throws(()=>parseResearch(research([{...source(),...change}]),ctx));
});
test("guide comparisons cover the snapshot and remain internal with zero votes",()=>{
  const guide={...source("guide"),channel:"攻略",outcome:"不採用",claims:[],guideCheck:{status:"本文確認",
    rows:ctx.decks.map(d=>({deckId:d.deckId,relation:"実測保留・掲載あり",offset:-1,reason:"実測不足のため据え置き"}))}};
  const run=s=>validateEvaluation(doc(research([s])),ctx);
  assert.deepEqual(run(guide).public,validateEvaluation(doc(research()),ctx).public);
  assert.deepEqual(run(guide).internal.research.sources[0].guideCheck,{...guide.guideCheck,candidates:[]});
  for(const change of [{outcome:"採用"},{environmentId:"old"},{updatedAt:"2025-03-02T00:00:00Z"},
    {guideCheck:{...guide.guideCheck,rows:guide.guideCheck.rows.slice(1)}},
    {guideCheck:{...guide.guideCheck,rows:[guide.guideCheck.rows[0],guide.guideCheck.rows[0]]}},
    {guideCheck:{...guide.guideCheck,status:"検索結果のみ"}}]) assert.throws(()=>run({...guide,...change}));
  assert.throws(()=>run({...guide,guideCheck:{...guide.guideCheck,rows:guide.guideCheck.rows.map(r=>({...r,offset:undefined}))}}));
  assert.doesNotThrow(()=>run({...guide,guideCheck:{status:"検索結果のみ",rows:[]}}));
  assert.throws(()=>parseResearch(research([guide,{...source(),origin:guide.url}]),ctx));
});
test("new names, aliases, emerging decks, patch boundaries and rival opinions are independent of master names",()=>{
  const {researchPlan}=require("../src/lib/environment-review/research-plan");
  const fake={...ctx,environmentName:"任意パック",periodStart:"2025-02-27T00:00:00Z",matchCount:20,shortMatchCount:5,
    decks:ctx.decks.map((d,i)=>({...d,name:["新型Ａ","別のデッキ"][i],encounters:4,encounterRate:20,short:{encounters:4},eligibleWinRate:40})),
    pairs:[{a:"a",b:"b",count:20,dataRating:-1}]};
  const observation=(name,tier,aliasId=null)=>({name,tier,aliasId,basis:"同一の主要カードと勝ち筋"});
  const guide=(key,tier)=>({...source(key),channel:"攻略",outcome:"不採用",claims:[],guideCheck:{status:"本文確認",
    observations:[observation("新型A",tier),observation("別表記",3,"b"),observation("新しい混成型",3)]}});
  const collision={...fake,decks:fake.decks.map(d=>({...d,name:"新型A"}))};
  const {readGuide}=require("../src/lib/environment-review/guide-comparison");
  const ambiguous=readGuide({status:"本文確認",observations:[observation("新型Ａ",1)]},collision);
  assert(ambiguous.rows.every(r=>r.relation==="対応不明"));assert.deepEqual(ambiguous.candidates,["新型Ａ"]);
  const material=research([guide("alpha",1),guide("beta",2),source("match")]);
  const result=validateEvaluation({...doc(material),tierRule:TIER_RULE},fake);
  const plan=researchPlan(fake,result.internal.research);
  assert.equal(plan.targets[0].priority,1);
  assert(plan.targets.find(t=>t.key==="a").reasons.includes("外部見解が分裂"));
  assert(plan.targets.find(t=>t.key==="a/b").reasons.includes("対面の実測と外部見解に差"));
  assert(plan.candidates.every(c=>c.name==="新しい混成型"));
  assert(plan.targets.every(t=>t.queries.every(q=>q.includes("任意パック") && q.includes(t.name))));
  assert.deepEqual(validateEvaluation(result,fake),result);
  assert.deepEqual(researchPlan(fake,result.internal.research),plan);
  const boundary={effectiveAt:"2025-02-25T00:00:00Z",url:"https://example.org/update"};
  assert.throws(()=>parseResearch({...material,balanceChange:boundary},fake));
  const fresh={...source(),publishedAt:"2025-02-26T00:00:00Z",scopeStart:boundary.effectiveAt};
  assert.doesNotThrow(()=>parseResearch({...research([fresh]),balanceChange:boundary},fake));
  assert.throws(()=>parseResearch({...research([fresh]),balanceChange:{...boundary,effectiveAt:"2025-02-28T00:00:00Z"}},fake));
  assert.throws(()=>parseResearch({...research([{...fresh,scopeStart:"2025-02-24T00:00:00Z"}]),balanceChange:boundary},fake));
});
test("cross-posts and shared datasets are one family, distinct authors on note can be independent",()=>{
  const a=source("a"),b=source("b"),c=source("c"),d=source("d");
  assert.equal(new Set(originGroups([a,b]).values()).size,2);
  b.author=a.author;c.dataset=b.dataset;d.origin=c.url;
  assert.equal(new Set(originGroups([a,b,c,d]).values()).size,1);
});
test("direct evidence enables provisional unobserved matchups without inventing measurements",()=>{
  const input=doc(research([source()])),before=JSON.stringify(ctx), result=validateEvaluation(input,ctx);
  assert.equal(result.public.pairs[0].rating,1);assert.equal(result.public.pairs[0].confidence,"低");
  assert.equal(result.public.comparison,"partial");assert.equal(JSON.stringify(ctx),before);
  assert.deepEqual(validateEvaluation(result,ctx),result);
  assert.throws(()=>validateEvaluation({...result,snapshotId:"other"},ctx));
  result.public.pairs[0].rating=2;assert.throws(()=>validateEvaluation(result,ctx));
});
test("encounter bands anchor the tier; frequency alone cannot award Tier 1",()=>{
  const model={majorMatchups:[],direct:{wins:10},reversed:{wins:0},signals:[],upper:{direction:0}};
  const deck={model,eligibleCount:20,encounters:30,encounterRate:12,short:{encounters:5}};
  assert.equal(strength(deck).presence,1);assert.equal(strength(deck).tier,2);
  const sameRecord={...deck,encounterRate:1.2};
  assert.equal(strength(sameRecord).tier,4);
  assert.equal(strength({...sameRecord,model:{...model,direct:{wins:18}}}).tier,3);
  const scarce={...deck,encounters:2,eligibleCount:3,encounterRate:.5};
  assert.equal(strength(scarce).tier,null);
});
test("independent direct evidence can yield provisional Tier 1 with low confidence",()=>{
  const researchSources=["one","two","three"].map(id=>{const s=source(id);
    return {...s,reliability:"高",claims:[{...s.claims[0],topic:"実戦検証",target:"a",value:1}]};});
  const first=validateEvaluation(doc(research(researchSources)),ctx).public.decks[0];
  assert.equal(first.tier,1);assert.equal(first.confidence,"低");
  researchSources[1].dataset=researchSources[0].dataset;
  assert.equal(validateEvaluation(doc(research(researchSources)),ctx).public.decks[0].tier,2);
});
test("frozen v3.0 and v3.1 apply different rules to the same sparse record",()=>{
  const m={majorMatchups:[],direct:{wins:13},reversed:{wins:0},signals:[],upper:{direction:0},estimatedRate:68,measuredConfidence:"低"};
  const deck={...ctx.decks[0],eligibleCount:18,encounters:17,encounterRate:2.1,model:m};
  const s={...ctx,decks:[deck],pairs:[]};
  const v30=validateEvaluation(doc(research()),s), v31=validateEvaluation({...doc(research()),tierRule:TIER_RULE},s);
  assert.equal(v30.public.decks[0].tier,2); assert.equal(v31.public.decks[0].tier,3);
  assert.deepEqual(validateEvaluation(v30,s),v30); assert.deepEqual(validateEvaluation(v31,s),v31);
  assert.throws(()=>validateEvaluation({...v31,tierRule:"unknown"},s));
  assert.throws(()=>validateEvaluation({...v30,tierRule:TIER_RULE},s));
});
test("field coverage and contributor sensitivity bound a promotion to one tier",()=>{
  const pair=weight=>({count:12,wins:10,weight,used:true,estimatedRate:76});
  const model={majorMatchups:[pair(.12),pair(.12)],signals:[],direct:{wins:30},reversed:{wins:0},
    upper:{direction:0},estimatedRate:65,bias:{userEqualWinRate:60,withoutLargestWinRate:60}};
  const deck={eligibleCount:40,encounters:10,encounterRate:3,model};
  assert.equal(anchoredStrength(deck).tier,2);
  model.majorMatchups.push({...pair(.4),used:false});
  assert.equal(anchoredStrength(deck).tier,3);
  model.majorMatchups.pop(); model.signals=[{kind:"concentration"}];model.bias.withoutLargestWinRate=43;
  assert.equal(anchoredStrength(deck).tier,3);
});
test("tier rule revision does not affect mirror directions or provisional pair decisions",()=>{
  const v=doc(research([source()]));
  assert.deepEqual(validateEvaluation({...v,tierRule:TIER_RULE},ctx).public.pairs,validateEvaluation(v,ctx).public.pairs);
});
test("no sources cannot generate a divergence or arbitrary verdict",()=>{
  const result=validateEvaluation(doc(research()),ctx);
  assert.equal(result.public.comparison,"unavailable");assert.equal(result.public.decks[0].divergence,null);
  assert(!JSON.stringify(result.public).includes("searchLog"));result.public.decks[0].tier=1;
  assert.throws(()=>validateEvaluation(result,ctx));
});
