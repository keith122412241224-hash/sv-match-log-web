import { fail, type Confidence, type Divergence, type PublicEvaluation } from "./evaluation-v1";
import { originGroups, type Research } from "./research-v3";
import { tierMethod, TIER_RULE } from "./assessment-v3";
import type { ReviewSnapshot } from "./metrics";

export function assessV3(s: ReviewSnapshot, research: Research, rule?:typeof TIER_RULE) {
  const groups = originGroups(research.sources);
  const accepted = research.sources.filter(r=>r.outcome==="採用");
  const shares=new Map(s.decks.map(d=>[d.deckId,d.encounterRate??0]));
  function decision(target:string, deck:boolean, base:number|null, measured:Confidence, count:number, measuredDirection=0) {
    const refs = accepted.flatMap(r=>r.claims.filter(c=>c.target===target).map(c=>({group:groups.get(r.id)!,value:c.value,verified:r.reliability==="高" && c.topic==="実戦検証"})));
    const opinions = refs.filter(r=>r.value!==null);
    const values = opinions.map(r=>r.value!);
    const independent = new Set(opinions.map(r=>r.group)).size;
    const strongEvidence=independent>=3 && opinions.some(o=>o.verified);
    const unanimous = values.length>0 && values.every(v=>v===values[0]);
    const requested = unanimous ? values[0] : null;
    let after = base;
    if (requested !== null) {
      if (base === null) {
        // Never infer equivalence or a strong direction from a single matchup guide.
        if (deck ? independent >= 2 : independent >= (measuredDirection * requested < 0 ? 2 : 1) && requested !== 0)
          after = deck ? requested===1 && strongEvidence ? 1 : Math.max(2,Math.min(4,requested)) : Math.sign(requested);
      } else if (independent >= 2 && (deck || base * requested >= 0)) {
        const steps=deck && strongEvidence && Math.abs(requested-base)>=2 ? 2 : 1;
        after = base + steps*Math.sign(requested-base);
      }
    }
    const changed = after!==base, provisional = changed && base===null;
    const confidence:Confidence = after===null ? "判断保留" : changed || measured==="判断保留" || !unanimous && values.length>0 ? "低" : measured;
    const label = provisional ? "外部情報を中心とした暫定評価" : refs.length ? "外部情報も考慮した評価" : "実測を中心とした評価";
    const reason = label+"。"+(provisional ? "直接扱う資料に基づく暫定判断です。対戦の追加が必要です。" :
      changed ? "独立した資料が示す方向へ一段階補正しました。" : deck ? "遭遇頻度を起点に主要対面への適性を評価しました。" : "実測の方向と区間を併記しています。");
    let divergence:Divergence|null = null;
    const comparisonBase=base ?? (!deck && measuredDirection!==0 ? measuredDirection : null);
    if (comparisonBase!==null && values.some(v=>base===null ? Math.sign(v)!==comparisonBase : v!==base)) {
      const up = requested!==null && (deck ? requested<comparisonBase : requested>comparisonBase);
      divergence = {status:base!==null && unanimous && independent>=2 && ["高","中"].includes(measured) && count>=20 ? "確認済み":"要検証",
        direction:requested===null ? "評価が分かれている" : up ? "過小評価の可能性":"過大評価の可能性",
        importance:Math.min(5,(changed ? 4 : independent>=2 ? 3 : 2)+Number(target.split("/").every(id=>(shares.get(id)??0)>=5))),facts:"実測に基づく評価と直接資料で評価が異なります。",hypothesis:""};
    }
    return {after,confidence,reason,divergence,covered:refs.length>0};
  }
  let covered=0;
  const decks=s.decks.map(d=>{
    const field=tierMethod(rule)(d,s);
    const x=decision(d.deckId,true,field.tier,d.model?.measuredConfidence ?? "低",d.eligibleCount);
    if(x.covered) covered++;
    let confidence = x.confidence;
    if (confidence==="高" && ((field.fieldRate===null && !x.covered) || (rule && x.divergence))) confidence="中";
    return {deckId:d.deckId,tier:x.after,confidence,reason:x.reason.split("。")[0]+"。"+field.reason+(x.after!==field.tier ? "独立した直接資料を加えて補正しました。" : ""),divergence:x.divergence};
  });
  const subjects=new Map(s.pairs.map(p=>[p.a+"/"+p.b,{a:p.a,b:p.b,count:p.count,dataRating:p.dataRating,model:p.model}]));
  for(const r of accepted) for(const c of r.claims) if(c.topic==="対面相性" && !subjects.has(c.target)) {
    const [a,b]=c.target.split("/");
    subjects.set(c.target,{a,b,count:0,dataRating:null,model:undefined});
  }
  const pairs=[...subjects.values()].map(p=>{
    const x=decision(p.a+"/"+p.b,false,p.dataRating,p.model?.measuredConfidence ?? "低",p.count,p.count>=10 && (p.model?.estimatedRate??50)>55 ? 1 : p.count>=10 && (p.model?.estimatedRate??50)<45 ? -1 : 0);
    if(x.covered) covered++;
    const caution=p.model?.signals.filter(signal=>["concentration","equalWeight","perspective","turn"].includes(signal.kind)).map(signal=>({
      concentration:"登録者の集中または分布未確認",equalWeight:"登録者ごとの重みで成績が変動",perspective:"使用側と相手側に差",turn:"先後差あり"
    }[signal.kind as "concentration"|"equalWeight"|"perspective"|"turn"]));
    const reason=caution?.length ? x.reason+" 偏りの確認項目は"+caution.join("、")+"です。" : x.reason;
    return {a:p.a,b:p.b,rating:x.after,confidence:x.confidence,reason,divergence:x.divergence};
  });
  const comparison:PublicEvaluation["comparison"]=!covered ? "unavailable" : covered===pairs.length+decks.length ? "available" : "partial";
  return {overview:{facts:"対象期間の実戦を基に、環境での立ち位置と対策優先度を個別に評価しました。",hypothesis:""},
    changes:"同一スナップショットの実測値を使用しています。",decks,pairs,comparison};
}

export function verifyV3(actual:PublicEvaluation, expected:PublicEvaluation, exactReason=false) {
  if(actual.comparison!==expected.comparison) fail("外部根拠の充足度が一致しません。");
  const keys=(e:PublicEvaluation)=>[...e.decks.map(d=>({key:d.deckId,value:d.tier,...d})),
    ...e.pairs.map(p=>({key:p.a+"/"+p.b,value:p.rating,...p}))];
  const proposed=keys(actual), wanted=new Map(keys(expected).map(x=>[x.key,x]));
  if(proposed.length!==wanted.size || new Set(proposed.map(x=>x.key)).size!==wanted.size) fail("全対象の一意な記載が必要です。");
  for(const p of proposed) {
    const e=wanted.get(p.key);
    if(!e || p.value!==e.value || p.confidence!==e.confidence || (exactReason ? p.reason!==e.reason || p.divergence?.facts!==e.divergence?.facts || p.divergence?.hypothesis!==e.divergence?.hypothesis : !p.reason.startsWith(e.reason.split("。")[0]+"。")) ||
        !!p.divergence!==!!e.divergence || p.divergence?.status!==e.divergence?.status ||
        p.divergence?.importance!==e.divergence?.importance || p.divergence?.direction!==e.divergence?.direction)
      fail(p.key+" の評価・根拠区分・乖離・信頼度がv3の検証結果と一致しません。");
  }
}
