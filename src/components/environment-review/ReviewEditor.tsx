"use client";
import { useState } from "react";
import type { Confidence, EvaluationDocument } from "@/lib/environment-review/evaluation";
import { matchupLabel, tierLabel } from "@/lib/environment-review/publication";
import type { ReviewSnapshot } from "@/lib/environment-review/metrics";

const field = "w-full rounded-md border border-slate-300 bg-white p-2";
export function ReviewEditor({ document, decks, onApply }: {
  document: EvaluationDocument; decks: ReviewSnapshot["decks"]; onApply: (text:string) => void;
}) {
  const [draft,setDraft] = useState(document);
  const [target,setTarget] = useState("overview");
  const options = new Map(decks.map(d => [d.deckId,d.name]));
  const pub = draft.public;
  const deck = pub.decks.find(d => d.deckId === target), pair = pub.pairs.find(p => p.a+"/"+p.b === target);
  const row = deck ?? pair;
  function setPublic(value: Partial<typeof pub>) { setDraft({...draft,public:{...pub,...value}}); }
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
    {row && <><label>{deck?"総合Tier":"総合対面相性"}<select className={field} value={(deck?deck.tier:pair!.rating)??""} onChange={e=>{
      const value=e.target.value===""?null:Number(e.target.value);
      updateRow(deck?{tier:value}:{rating:value});
    }}><option value="">評価保留</option>{(deck?[1,2,3,4,5]:[-2,-1,0,1,2]).map(v=><option key={v} value={v}>{deck?tierLabel(v):matchupLabel(v)}</option>)}</select></label>
      <label>信頼度<select className={field} value={row.confidence} onChange={e=>updateRow({confidence:e.target.value as Confidence})}>{["高","中","低","判断保留"].map(c=><option key={c}>{c}</option>)}</select></label>
      {area("評価理由",row.reason,reason=>updateRow({reason}))}
      {row.divergence && <>{area("乖離で確認できた事実",row.divergence.facts,facts=>updateRow({divergence:{...row.divergence!,facts}}))}
        {area("乖離要因の仮説",row.divergence.hypothesis,hypothesis=>updateRow({divergence:{...row.divergence!,hypothesis}}))}</>}
    </>}
    <button className="justify-self-start rounded-md border border-slate-300 px-3 py-2 font-semibold" type="button" onClick={()=>onApply(JSON.stringify(draft,null,2))}>修正をJSONに反映</button>
  </div></details>;
}
