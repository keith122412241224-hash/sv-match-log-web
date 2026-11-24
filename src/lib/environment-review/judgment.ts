import { anchoredStrength, allPairTargets } from "./assessment-v3";
import { fail, id, indexed, list, object, oneOf, string, type Confidence, type Divergence, type PublicEvaluation } from "./evaluation-v1";
import type { ReviewSnapshot } from "./metrics";
import { originGroups, type Research } from "./research-v3";

export const LEGACY_JUDGMENT_RULE = "evidence-judgment-v1";
export const JUDGMENT_RULE = "evidence-judgment-v2";
export type JudgmentRule = typeof JUDGMENT_RULE | typeof LEGACY_JUDGMENT_RULE;
type Support = {id:string; group:string; value:number|null; credible:boolean};
type Subject = {target:string; base:number|null; measured:Confidence; count:number; reference:number|null; support:Support[]};

export function judgmentSubjects(s:ReviewSnapshot, research:Research) {
  const subjects=new Map<string,Subject>();
  function register(target:string, base:number|null, measured:Confidence, count:number, reference=base) {
    const subject:Subject={target,base,measured,count,reference,support:[]};
    subjects.set(target,subject);
    return subject;
  }
  for(const d of s.decks) register(d.deckId,anchoredStrength(d,s).tier,d.model?.measuredConfidence??"低",d.eligibleCount);
  for(const p of s.pairs) {
    const rate=p.model?.estimatedRate;
    const tendency=p.count>=10 && rate!=null ? rate>55?1:rate<45?-1:null : null;
    register(p.a+"/"+p.b,p.dataRating,p.model?.measuredConfidence??"低",p.count,p.dataRating??tendency);
  }
  const groups=originGroups(research.sources,true);
  for(const source of research.sources) {
    const support=(value:number|null)=>({id:source.id,group:groups.get(source.id)!,value,credible:source.reliability!=="低"});
    if(source.outcome==="採用") for(const claim of source.claims) {
      const subject=subjects.get(claim.target)??register(claim.target,null,"判断保留",0);
      subject.support.push(support(claim.value));
    }
    if(source.guideCheck?.status==="本文確認") for(const row of source.guideCheck.rows) {
      const subject=subjects.get(row.deckId);
      if(subject && row.offset!==undefined) subject.support.push(support((subject.base??0)-row.offset));
    }
  }
  return subjects;
}

function readChoice(raw:unknown) {
  const j=object(raw,"target value priority confidence sourceIds reason counterargument uncertainty","AI判断");
  const target=string(j.target,"対象",260), pair=target.includes("/");
  const value=j.value;
  if(value!==null && (typeof value!=="number" || !Number.isInteger(value) || value<(pair?-2:1) || value>(pair?2:5))) fail("総合評価の尺度が不正です。");
  const sourceIds=list(j.sourceIds,id,100,"参照資料");
  indexed(sourceIds,k=>k,"参照資料");
  return {target,value,priority:oneOf(j.priority,["実測","外部","総合","保留"] as const,"判断の主軸"),
    confidence:oneOf(j.confidence,["判断保留","低","中","高"] as const,"評価信頼度"),sourceIds,
    reason:string(j.reason,"公開用の独自判断"),counterargument:string(j.counterargument,"反対材料と適用条件"),uncertainty:string(j.uncertainty,"不確実性と見直し条件")};
}
export type Judgment=ReturnType<typeof readChoice>;

export function assessJudgments(snapshot:ReviewSnapshot,research:Research,input:unknown,baseline:PublicEvaluation,rule:JudgmentRule=LEGACY_JUDGMENT_RULE) {
  const subjects=judgmentSubjects(snapshot,research);
  const required = rule===JUDGMENT_RULE ? allPairTargets(snapshot.decks) : [];
  for (const target of required) {
    if (!subjects.has(target)) subjects.set(target,{target,base:null,measured:"判断保留",count:0,reference:null,support:[]});
  }
  const judgments=list(input,readChoice,subjects.size,"AI判断"), byKey=indexed(judgments,j=>j.target,"判断対象");
  const missing = required.filter(key=>!byKey.has(key));
  if (missing.length) fail("対面の個別判断または保留理由が不足しています（"+missing.length+"件） "+missing.slice(0,3).join(", "));
  for(const key of byKey.keys()) if(!subjects.has(key)) fail("戦績・直接資料に存在しない対象です。");
  const decks:PublicEvaluation["decks"]=[], pairs:PublicEvaluation["pairs"]=[];
  const baseDecks=new Map(baseline.decks.map(d=>[d.deckId,d]));
  const basePairs=new Map(baseline.pairs.map(p=>[p.a+"/"+p.b,p]));
  let covered=0;
  for(const subject of subjects.values()) {
    const {target,base,support,reference,measured,count}=subject, pair=target.includes("/");
    const choice=byKey.get(target);
    if(support.length) covered++;
    if(!choice) {
      if(support.length) fail(target+" の資料を考慮した判断または保留理由が必要です。");
      if(pair) pairs.push(basePairs.get(target)!); else decks.push(baseDecks.get(target)!);
      continue;
    }
    const {value,confidence,priority,sourceIds}=choice;
    if(support.length!==sourceIds.length || support.some(x=>!sourceIds.includes(x.id))) fail(target+" の直接資料と参照IDが一致しません。");
    if((value===null)!==(confidence==="判断保留") || (value===null)!==(priority==="保留")) fail("保留と信頼度・判断の主軸が矛盾します。");
    if((priority==="外部" || priority==="総合") && !support.length) fail("外部判断には対象を直接扱う資料が必要です。");
    if(value!==null && !count && !support.length && base===null) fail("実測も直接資料もない対象は保留です。");
    if(priority==="実測" && base===null && !count) fail("実測を優先する根拠がありません。");
    if(rule===JUDGMENT_RULE && pair && value!==null && count<10 && confidence!=="低") fail("少数戦の対面は低信頼の暫定評価としてください。");
    const credibleGroups=new Set(support.filter(x=>x.credible).map(x=>x.group)).size;
    const opinions=support.flatMap(x=>x.value===null?[]:[x.value]);
    const disputed=new Set(opinions).size>1;
    const changed=value!==base;
    const contrary=opinions.length>0 && !opinions.includes(value??NaN);
    if(confidence==="高" && (disputed || contrary || (measured!=="高" || changed) && credibleGroups<2)) fail("高信頼には強い実測または独立した複数の根拠が必要です。");
    if(confidence==="中" && (count<10 || measured==="判断保留") && !credibleGroups) fail("実測が少なく直接資料の確かさも不足しています。");
    const externalDifference=reference!==null && opinions.some(v=>v!==reference);
    let divergence:Divergence|null=null;
    if(changed || externalDifference || disputed) {
      const sign=reference===null ? 0 : value!==null && value!==reference ? Math.sign(value-reference) : Math.sign((opinions[0]??reference)-reference);
      divergence={status:"要検証",direction:disputed?"評価が分かれている":!sign?"判断保留":((pair?sign:-sign)>0?"過小評価の可能性":"過大評価の可能性"),
        importance:changed?4:3,facts:changed?"観測期間の基礎判定と総合判断に差があります。":"対象を直接扱う評価の方向に差があります。",hypothesis:""};
    }
    const provisional=value!==null && base===null;
    const prefix=priority==="実測"?"実測を中心とした暫定評価。":priority==="総合"?"総合判断による暫定評価。":"外部情報を中心とした暫定評価。";
    const reason=(provisional?prefix:"")+choice.reason;
    const common={confidence,reason,divergence};
    if(pair) {const [a,b]=target.split("/");pairs.push({a,b,rating:value,...common});}
    else decks.push({deckId:target,tier:value,...common});
  }
  const comparison:PublicEvaluation["comparison"]=covered===0?"unavailable":covered===subjects.size?"available":"partial";
  return {judgments,expected:{...baseline,decks,pairs,comparison}};
}
