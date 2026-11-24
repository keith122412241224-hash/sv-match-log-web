"use client";
import { useState } from "react";
import type { Confidence, EvaluationDocument } from "@/lib/environment-review/evaluation";
import { assessJudgments, type Judgment } from "@/lib/environment-review/judgment";
import { assessV3 } from "@/lib/environment-review/method-v3";
import { matchupLabel, tierLabel } from "@/lib/environment-review/publication";
import type { ReviewSnapshot } from "@/lib/environment-review/metrics";

const field = "w-full rounded-md border border-slate-300 bg-white p-2";
export function ReviewEditor({ document, snapshot, onApply, onDirtyChange }: {
  document: EvaluationDocument; snapshot: ReviewSnapshot; onApply: (text:string) => void; onDirtyChange: (dirty:boolean) => void;
}) {
  const [draft,setDraft] = useState(document);
  const [target,setTarget] = useState("overview");
  const [error,setError]=useState("");
  const options = new Map(snapshot.decks.map(d => [d.deckId,d.name]));
  const pub = draft.public;
  const deck = pub.decks.find(d => d.deckId === target), pair = pub.pairs.find(p => p.a+"/"+p.b === target);
  const row = deck ?? pair;
  const ai=draft.schemaVersion===2 && draft.judgmentRule ? draft : null;
  const stored=ai?.internal.judgments?.find(j=>j.target===target);
  function editJudgment(update:Partial<Judgment>) {
    if(!ai || !row) return;
    const value=deck?deck.tier:pair!.rating;
    const current:Judgment=stored??{target,value,confidence:row.confidence,priority:value===null?"保留":"実測",reason:row.reason,counterargument:"",uncertainty:"",sourceIds:[]};
    setDraft({...ai,internal:{...ai.internal,judgments:[...(ai.internal.judgments??[]).filter(j=>j.target!==target),{...current,...update}]}});
    setError("");onDirtyChange(true);
  }
  function apply() {
    try {
      if(ai && ai.internal.research) {
        const measured=assessV3(snapshot,{...ai.internal.research,sources:[]},ai.tierRule);
        const {expected}=assessJudgments(snapshot,ai.internal.research,ai.internal.judgments,measured,ai.judgmentRule);
        onApply(JSON.stringify({...ai,public:{...expected,overview:pub.overview,changes:pub.changes}},null,2));
      } else onApply(JSON.stringify(draft,null,2));
    } catch(cause) {setError(cause instanceof Error?cause.message:"判断根拠を確認してください。");}
  }
  function setPublic(value: Partial<typeof pub>) { setDraft({...draft,public:{...pub,...value}}); onDirtyChange(true); }
  function updateRow(value: {reason?:string; confidence?:Confidence; tier?:number|null; rating?:number|null; divergence?:NonNullable<typeof row>["divergence"]}) {
    if (deck) setPublic({decks:pub.decks.map(d => d === deck ? {...d,...value} : d)});
    if (pair) setPublic({pairs:pub.pairs.map(p => p === pair ? {...p,...value} : p)});
  }
  function area(label:string,value:string,change:(v:string)=>void) {
    return <label className="grid gap-1">{label}<textarea className={field} rows={3} value={value} onChange={e=>change(e.target.value)} /></label>;
  }
  return <details className="rounded-md border border-slate-200 p-3"><summary className="cursor-pointer font-semibold">項目別に評価を修正</summary><div className="mt-3 grid gap-3 text-sm">
    <label>修正する項目<select className={field} value={target} onChange={e=>setTarget(e.target.value)}><option value="overview">環境総評・前回からの変更</option>
    <optgroup label="デッキ評価">{pub.decks.map(d=><option key={d.deckId} value={d.deckId}>{options.get(d.deckId)}</option>)}</optgroup>
    <optgroup label="対面評価">{pub.pairs.map(p=><option key={p.a+"/"+p.b} value={p.a+"/"+p.b}>{options.get(p.a)} 対 {options.get(p.b)}</option>)}</optgroup></select></label>
    {target==="overview" && <>{area("確認できた事実",pub.overview.facts,facts=>setPublic({overview:{...pub.overview,facts}}))}
      {area("環境考察・仮説",pub.overview.hypothesis,hypothesis=>setPublic({overview:{...pub.overview,hypothesis}}))}
      {area("前回評価からの変更点",pub.changes,changes=>setPublic({changes}))}</>}
    {row && <><label>{deck?"総合Tier":"総合対面相性"}<select className={field} value={(stored?stored.value:deck?deck.tier:pair!.rating)??""} onChange={e=>{
      const value=e.target.value===""?null:Number(e.target.value);
      if(ai) editJudgment({value,...(value===null?{priority:"保留",confidence:"判断保留"} as const:{})}); else updateRow(deck?{tier:value}:{rating:value});
    }}><option value="">評価保留</option>{(deck?[1,2,3,4,5]:[-2,-1,0,1,2]).map(v=><option key={v} value={v}>{deck?tierLabel(v):matchupLabel(v)}</option>)}</select></label>
      <label>信頼度<select className={field} value={stored?.confidence??row.confidence} onChange={e=>(ai?editJudgment:updateRow)({confidence:e.target.value as Confidence})}>{["高","中","低","判断保留"].map(c=><option key={c}>{c}</option>)}</select></label>
      {area("評価理由",stored?.reason??row.reason,reason=>(ai?editJudgment:updateRow)({reason}))}
      {ai && <><label>判断の主軸<select className={field} value={stored?.priority??((deck?deck.tier:pair!.rating)===null?"保留":"実測")} onChange={e=>editJudgment({priority:e.target.value as Judgment["priority"]})}>{["実測","外部","総合","保留"].map(k=><option key={k}>{k}</option>)}</select></label>
      {area("反対材料・適用条件",stored?.counterargument??"",counterargument=>editJudgment({counterargument}))}
      {area("不確実性・見直し条件",stored?.uncertainty??"",uncertainty=>editJudgment({uncertainty}))}</>}
      {!ai && row.divergence && <>{area("乖離で確認できた事実",row.divergence.facts,facts=>updateRow({divergence:{...row.divergence!,facts}}))}
        {area("乖離要因の仮説",row.divergence.hypothesis,hypothesis=>updateRow({divergence:{...row.divergence!,hypothesis}}))}</>}
    </>}
    {error && <p role="alert">{error}</p>}
    <button className="justify-self-start rounded-md border border-slate-300 px-3 py-2 font-semibold" type="button" onClick={apply}>修正をJSONに反映</button>
    <button type="button" className="justify-self-start text-sm underline" onClick={()=>{setDraft(document);onDirtyChange(false);}}>編集を取り消す</button>
  </div></details>;
}
