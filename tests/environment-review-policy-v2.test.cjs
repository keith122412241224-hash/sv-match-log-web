/* eslint-disable @typescript-eslint/no-require-imports */
const test = require("node:test");
const assert = require("node:assert/strict");
const { baselineEvaluation, reviewDiagnostics, validateEvaluation } = require("../src/lib/environment-review/evaluation.ts");
const { canonicalUrl, freshness, sourceSeries } = require("../src/lib/environment-review/evidence-v2.ts");
const sample = require("../docs/environment-review/sample.json");
const old = require("../docs/environment-review/v1/sample.json");
const [a,b] = sample.public.decks.map(d=>d.deckId);
const pairKey=a+"/"+b;
const signal=(kind,direction)=>({kind,direction,detail:"境界確認用の合成入力"});
const model=(measuredConfidence,signals=[])=>({measuredConfidence,signals,coverage:60});
function context() {
  return {schemaVersion:2,promptVersion:sample.promptVersion,snapshotId:sample.snapshotId,environmentId:sample.environmentId,
    asOf:"2026-09-07T03:00:00Z",periodStart:"2026-09-01T00:00:00Z",environmentStart:"2026-08-01T00:00:00Z",
    decks:[{deckId:a,dataTier:3,count:80,encounterRate:25,model:model("中")},{deckId:b,dataTier:2,count:100,encounterRate:30,model:model("中")}],
    pairs:[{a,b,dataRating:-1,count:40,model:model("低",[signal("concentration",0)])}]};
}
test("saved draft comparison ignores source ordering and separates source changes from rating changes",()=>{
  const { compareDraft }=require("../src/lib/environment-review/workflow.ts");
  const saved=structuredClone(sample); secondSource(saved);
  const next=structuredClone(saved); next.internal.sources.reverse();
  next.internal.sources.forEach(s=>s.targets.reverse());
  next.public.decks[0].tier=3;
  const comparison=compareDraft(next,saved);
  assert.equal(comparison.sameSources,true);
  assert.deepEqual(comparison.changedTargets,[a]);
  next.internal.sources[0].summary += "追加の根拠";
  assert.equal(compareDraft(next,saved).sameSources,false);
  assert.equal(compareDraft(next,null).sameSources,null);
});
function secondSource(doc) {
  const s=structuredClone(doc.internal.sources[0]);
  Object.assign(s,{id:"s2",url:"https://second.invalid/a",originUrl:"https://second.invalid/a",publisher:"別の著者",group:"別系列"});
  doc.internal.sources.push(s);
  for(const e of doc.internal.evidence) if(e.sourceIds.length) e.sourceIds.push(s.id);
  return s;
}
function alignMachineFields(ctx,doc,previous) {
  for (const d of reviewDiagnostics(ctx,doc,previous)) {
    const row=doc.public.decks.find(x=>x.deckId===d.target) ?? doc.public.pairs.find(x=>x.a+"/"+x.b===d.target);
    const proof=doc.internal.evidence.find(x=>x.target===d.target);
    if(proof) proof.externalTrend=d.externalTrend;
    if(!row) continue;
    row.confidence=d.confidence;
    if(d.required || row.divergence) row.divergence=["要検証","確認済み"].includes(d.status) ?
      {status:d.status,direction:d.direction,importance:d.importance,facts:"対象を直接比較しました。",hypothesis:""} : null;
  }
}
test("v2 example passes with versioned facts and discloses no source identifiers",()=>{
  assert.deepEqual(validateEvaluation(sample,context()),sample);
  assert.doesNotMatch(JSON.stringify(sample.public),/example\.invalid|sourceIds|publisher|reasonCodes/);
});
test("source-free baseline remains reproducible and legacy import only validates its matching snapshot",()=>{
  const ctx=context(), doc=baselineEvaluation(ctx);
  assert.deepEqual(validateEvaluation(doc,ctx),doc);
  assert.deepEqual(doc,baselineEvaluation(ctx));
  assert.throws(()=>validateEvaluation(old,ctx));
  assert.throws(()=>validateEvaluation(sample,{...ctx,schemaVersion:1}));
  assert.throws(()=>validateEvaluation({...doc,promptVersion:"old"},ctx));
  assert.ok(reviewDiagnostics(ctx).filter(d=>d.target!==pairKey).every(d=>d.status==="比較不能" && !d.required));
});
test("independent incompatible claims split even when a submitted proof omits the contradicting source",()=>{
  const doc=structuredClone(sample),ctx=context();
  const other=secondSource(doc);other.targets[0].direction="下振れ評価";
  assert.equal(reviewDiagnostics(ctx,doc).find(x=>x.target===a).externalTrend,"評価分裂");
  alignMachineFields(ctx,doc);
  doc.internal.evidence[0].sourceIds.pop();
  assert.throws(()=>validateEvaluation(doc,ctx),/未記載/);
});
test("reprints from the same root, same host or same original publisher form one family",()=>{
  const doc=structuredClone(sample), copy=secondSource(doc), s=doc.internal.sources[0];
  copy.provenance="quotation";copy.originUrl=s.originUrl+"?utm_source=email";
  assert.equal(new Set(sourceSeries(doc.internal.sources).values()).size,1);
  copy.originUrl="https://example.invalid/second-article";
  assert.equal(new Set(sourceSeries(doc.internal.sources).values()).size,1);
  copy.originUrl=copy.url;copy.provenance="original";copy.publisher=s.publisher;
  assert.equal(new Set(sourceSeries(doc.internal.sources).values()).size,1);
  assert.equal(canonicalUrl("https://EXAMPLE.invalid/a/?z=2&utm_source=b&a=1#section"),"https://example.invalid/a?a=1&z=2");
});
test("a still-applicable guide can predate the 7-day window; later knowledge and unsupported sources are excluded",()=>{
  const ctx=context(), s={...sample.internal.sources[0],publishedAt:"2026-08-20T00:00:00Z",originPublishedAt:"2026-08-20T00:00:00Z"};
  assert.equal(freshness(s,ctx),"applicableGuide");
  for(const change of [{topic:"trend"},{publishedAt:null},{originPublishedAt:"2026-07-31T00:00:00Z"},{versionAt:null},
    {versionAt:"2026-09-07T03:00:01Z"},{reliability:"低"},{method:"opinion"},{applicability:"superseded"}])
    assert.equal(freshness({...s,...change},ctx),"ineligible");
});
test("an unrelated deck source does not count for a matchup",()=>{
  const doc=structuredClone(sample);
  doc.internal.sources[0].targets.pop();
  assert.throws(()=>validateEvaluation(doc,context()),/他の対象/);
});
test("one-source two-step, ungrounded reason codes, unavailable evidence, unsupported direction and three-step fail",()=>{
  const change=(edit,regex)=>{
    const ctx=context(),doc=structuredClone(sample);edit(doc,ctx);alignMachineFields(ctx,doc);
    assert.throws(()=>validateEvaluation(doc,ctx),regex);
  };
  change(d=>{d.public.decks[0].tier=1;},/二段階/);
  change(d=>{d.internal.evidence[0].reasonCodes=["rank"];},/実測シグナル/);
  change(d=>{d.internal.sources[0].targets[0].direction="概ね一致";},/補正方向/);
  change(d=>{d.public.decks[0].tier=4;},/補正方向/);
  change((d,c)=>{c.decks[0].dataTier=4;d.public.decks[0].tier=1;},/三段階/);
  change(d=>{d.internal.sources[0].applicability="unknown";for(const e of d.internal.evidence) e.reasonCodes=[];},/有効な対象/);
});
test("two independent corroborating sources and a directed measured signal allow a reviewable two-step reversal, even on the first run",()=>{
  const ctx=context(),doc=structuredClone(sample);
  ctx.pairs[0]={a,b,count:40,dataRating:1,model:model("中",[signal("rank",-1)])};
  secondSource(doc);doc.public.pairs[0].rating=-1;doc.internal.evidence[2].reasonCodes=["external","rank"];
  alignMachineFields(ctx,doc);validateEvaluation(doc,ctx);
  const d=reviewDiagnostics(ctx,doc).find(x=>x.target===pairKey);
  assert.equal(d.steps,2);assert.equal(d.independentGroups,2);assert.equal(d.importance,5);
  assert.equal(d.reversal,true);assert.equal(d.largeCorrection,true);assert.equal(d.largePreviousChange,false);
  assert.equal(d.confidence,"低");
});
test("agreement or conflicting external direction only permits a one-step exception with two sources and cited directional diagnostics",()=>{
  const ctx=context(),doc=structuredClone(sample);ctx.decks[0].model.signals=[signal("rank",1)];
  doc.internal.sources[0].targets[0].direction="概ね一致";doc.internal.evidence[0].reasonCodes=["rank"];
  alignMachineFields(ctx,doc);
  assert.throws(()=>validateEvaluation(doc,ctx),/独立二系列/);
  secondSource(doc);alignMachineFields(ctx,doc);validateEvaluation(doc,ctx);
});
test("data holds, one-contributor low confidence and literal measured prose cannot be overridden",()=>{
  const ctx=context(),doc=structuredClone(sample);
  ctx.decks[0].dataTier=null;alignMachineFields(ctx,doc);assert.throws(()=>validateEvaluation(doc,ctx),/保留/);
  const c=context();c.decks[0].model=model("低",[signal("concentration",0)]);
  assert.throws(()=>validateEvaluation(sample,c),/信頼度/);
  const weak=baselineEvaluation(c);weak.public.overview.facts="対象勝率は５９．２％。";assert.throws(()=>validateEvaluation(weak,c),/公開本文/);
});
test("confidence high requires a fresh ranked primary measurement, coverage and unchanged baseline",()=>{
  const ctx=context(),doc=structuredClone(sample);ctx.decks[0].model=model("高");doc.public.decks[0].tier=3;
  const s=secondSource(doc);s.reliability="高";s.method="observed";
  const result=()=>reviewDiagnostics(ctx,doc).find(x=>x.target===a).confidence;
  assert.equal(result(),"高");ctx.decks[0].model.coverage=49;assert.equal(result(),"中");
  ctx.decks[0].model.coverage=60;doc.public.decks[0].tier=2;assert.equal(result(),"中");
});
test("missing important pre-analysis pairs require an explicit private omission rationale",()=>{
  const ctx=context();ctx.pairs[0].model=model("低",[signal("concentration",0)]);
  const doc=baselineEvaluation(ctx);assert.equal(reviewDiagnostics(ctx).find(x=>x.target===pairKey).required,true);
  doc.public.pairs=[];
  assert.throws(()=>validateEvaluation(doc,ctx),/掲載しない理由/);
  doc.internal.evidence.find(e=>e.target===pairKey).omissionReason="方向を比較できる資料がなく、他の対面を優先。";
  validateEvaluation(doc,ctx);
  doc.internal.evidence=doc.internal.evidence.filter(e=>e.target!==pairKey);
  assert.throws(()=>validateEvaluation(doc,ctx),/未掲載理由/);
});
test("prior movement and data corrections are independent with stable importance ordering",()=>{
  const ctx=context(),base=baselineEvaluation(ctx),previous=structuredClone(base.public);previous.decks[0].tier=1;
  const doc=baselineEvaluation(ctx,previous); validateEvaluation(doc,ctx,previous);
  const d=reviewDiagnostics(ctx,doc,previous)[0];
  assert.equal(d.target,a);assert.equal(d.largePreviousChange,true);assert.equal(d.previousChange,-2);
  assert.equal(d.largeCorrection,false);assert.equal(d.status,"要検証");
  const reordered={...ctx,decks:[...ctx.decks].reverse()};
  assert.deepEqual(reviewDiagnostics(reordered,doc,previous),reviewDiagnostics(ctx,doc,previous));
  doc.public.decks[0].divergence.importance=5; assert.throws(()=>validateEvaluation(doc,ctx,previous),/重要度/);
});
