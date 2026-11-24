import type { Confidence, Direction, PublicEvaluation, ReviewContext as LegacyContext, Trend } from "./evaluation-v1";
import { fail } from "./evaluation-v1";
import type { EvidenceV2, ReasonCode, SourceV2, Support } from "./evidence-v2";
import { sourceSeries, targetSupport } from "./evidence-v2";

type SignalKind = "rank"|"trend"|"concentration"|"equalWeight"|"perspective"|"smallSample"|"matchup"|"turn";
export type Signal = {kind:SignalKind;direction:-1|0|1;detail:string};
type Model = {measuredConfidence:Confidence;signals:Signal[];coverage?:number;legacyTier?:number|null;candidateTier?:number|null};
type Population = {count:number;eligibleCount?:number;encounterRate?:number|null;model?:Model};
export type ReviewContext = Omit<LegacyContext,"decks"|"pairs"> & {
  schemaVersion?:number;environmentStart?:string|null;promptVersion?:string;
  decks:(LegacyContext["decks"][number] & Population)[];
  pairs:(LegacyContext["pairs"][number] & Population)[];
};
export type PolicyInput = {public:PublicEvaluation;internal:{sources:SourceV2[];evidence:EvidenceV2[]}};
export type TargetDiagnostic = {
  target:string;before:number|null;after:number|null;steps:number;signedChange:number|null;previousChange:number|null;
  reversal:boolean;largeCorrection:boolean;largePreviousChange:boolean;independentGroups:number;externalTrend:Trend;
  signals:string[];status:"確認済み"|"要検証"|"比較不能"|"該当なし";direction:Direction;importance:number;required:boolean;
  confidence:Confidence;omissionReason:string|null;
};
const labels:Record<SignalKind,string> = {rank:"ランク帯差",trend:"直近と全期間の差",concentration:"登録者への集中",equalWeight:"ユーザー均等勝率との差",perspective:"使用・反転視点の差",smallSample:"少数サンプル",matchup:"主要対面・環境適性",turn:"先攻・後攻差"};
function delta(after:number|null,before:number|null,deck:boolean) {
  return after===null || before===null ? null : (deck ? before-after : after-before);
}
const level:Confidence[]=["判断保留","低","中","高"];
function confidence(after:number|null,measured:Confidence,steps:number,s:Support,coverage:number|undefined,isDeck:boolean):Confidence {
  if(after===null) return "判断保留";
  let cap=2;
  if(s.trend==="比較不能" || s.trend==="評価分裂" || steps>=2 || !s.ranked) cap=1;
  else if(s.groups>=2 && s.freshStrong && steps===0 && (!isDeck || (coverage ?? 0)>=50)) cap=3;
  return level[Math.min(cap,Math.max(1,level.indexOf(measured)))];
}
function priority(hasCandidate:boolean,steps:number,reversal:boolean,previousLarge:boolean,major:boolean,signals:Signal[],s:Support,count:number) {
  if (!hasCandidate) return 1;
  // One point for each evidence axis. Reversals and two-step corrections always trigger review.
  const external=s.trend==="上振れ評価" || s.trend==="下振れ評価" || s.trend==="評価分裂";
  const points=1+Number(major)+Number(signals.length>=2 || signals.some(x=>x.kind==="concentration" || x.kind==="smallSample"))
    +Number(steps>0 || previousLarge || external)+Number(count>=20 && external && s.groups>=2);
  return reversal ? 5 : Math.min(5,Math.max(steps>=2 || previousLarge ? 4 : 2,points));
}
export function reviewDiagnostics(ctx:ReviewContext,doc?:PolicyInput|null,previous?:PublicEvaluation|null):TargetDiagnostic[] {
  const sources=doc?.internal.sources ?? [], series=sourceSeries(sources);
  const references=new Map<string,SourceV2[]>();
  for(const s of sources) for(const c of s.targets) {
    const refs=references.get(c.target) ?? []; refs.push(s); references.set(c.target,refs);
  }
  const current=new Map<string,number|null>(), prior=new Map<string,number|null>();
  for(const [evaluation, map] of [[doc?.public,current],[previous,prior]] as const) {
    for(const d of evaluation?.decks ?? []) map.set(d.deckId,d.tier);
    for(const p of evaluation?.pairs ?? []) map.set(p.a+"/"+p.b,p.rating);
  }
  const proofs=new Map((doc?.internal.evidence ?? []).map(e=>[e.target,e]));
  const shares=new Map(ctx.decks.map(d=>[d.deckId,d.encounterRate ?? 0]));
  function diagnose(target:string,pop:Population,before:number|null,isDeck:boolean,major:boolean):TargetDiagnostic {
    const after=doc ? current.get(target) ?? null : before;
    const prev=prior.get(target) ?? null;
    const change=delta(after,before,isDeck), steps=Math.abs(change ?? 0);
    const previousChange=delta(after,prev,isDeck), previousLarge=Math.abs(previousChange ?? 0)>=2;
    const reversal=!isDeck && before!==null && after!==null && before*after<0;
    const s=targetSupport(references.get(target) ?? [],target,ctx,series,before!==null);
    const external=s.trend==="上振れ評価" || s.trend==="下振れ評価" || s.trend==="評価分裂";
    const signals=pop.model?.signals ?? [], count=pop.eligibleCount ?? pop.count;
    const measured=pop.model?.measuredConfidence ?? "低";
    const confirmed=external && count>=20 && level.indexOf(measured)>=2 && s.ranked;
    const candidate=external || steps>0 || previousLarge || signals.length>0;
    const status=confirmed ? "確認済み" : candidate ? "要検証" : s.trend==="比較不能" ? "比較不能" : "該当なし";
    const direction:Direction=s.trend==="評価分裂" ? "評価が分かれている" : s.trend==="上振れ評価" ? "過小評価の可能性" : s.trend==="下振れ評価" ? "過大評価の可能性" : "判断保留";
    const importance=priority(candidate,steps,reversal,previousLarge,major,signals,s,count);
    const reasons = [...new Set(signals.map(x=>labels[x.kind]))];
    if(external) reasons.push("実測と外部評価の差");
    if(steps>0) reasons.push("総合評価への補正");
    if(reversal) reasons.push("有利・不利の逆転");
    if(previousLarge) reasons.push("前回公開からの大幅変動");
    return {target,before,after,steps,signedChange:change,previousChange,reversal,largeCorrection:steps>=2,largePreviousChange:previousLarge,
      independentGroups:s.groups,externalTrend:s.trend,signals:reasons,status,direction,importance,required:candidate && importance>=3,
      confidence:confidence(after,measured,steps,s,pop.model?.coverage,isDeck),omissionReason:proofs.get(target)?.omissionReason ?? null};
  }
  const result = [
    ...ctx.decks.map(d=>diagnose(d.deckId,d,d.dataTier,true,(shares.get(d.deckId) ?? 0)>=10)),
    ...ctx.pairs.map(p=>diagnose(p.a+"/"+p.b,p,p.dataRating,false,(shares.get(p.a) ?? 0)>=10 && (shares.get(p.b) ?? 0)>=10))
  ];
  return result.sort((a,b)=>b.importance-a.importance || (a.target<b.target ? -1 : a.target>b.target ? 1 : 0));
}
export function checkCorrection(diag:TargetDiagnostic,proof:EvidenceV2,pop:Population,support:Support) {
  const {target,before,after,steps,signedChange}=diag;
  const reject=(why:string)=>fail(target+" "+why);
  if(before===null && after!==null) reject("データ評価が保留のため総合評価も保留です。");
  const signals=pop.model?.signals ?? [];
  const isSignalCode=(k:ReasonCode):k is SignalKind=>Object.hasOwn(labels,k);
  for(const code of proof.reasonCodes) {
    if(isSignalCode(code) && !signals.some(s=>s.kind===code)) reject("指定した理由種別の実測シグナルがありません: "+code);
    if(code==="tournament" && !support.refs.some(s=>s.setting==="tournament") ||
       code==="build" && !support.refs.some(s=>s.topic==="guide") ||
       code==="external" && (support.groups===0 || support.trend==="比較不能") ||
       code==="split" && support.trend!=="評価分裂") reject("理由種別と外部資料の内容が一致しません: "+code);
  }
  if(!steps) return;
  if(steps>=3) reject("三段階以上の補正は取り込めません。");
  if(!proof.reasonCodes.length || !support.groups || support.trend==="比較不能") reject("補正には有効な対象別資料と構造化理由が必要です。");
  const matchupAlreadyApplied = pop.model?.candidateTier === before && pop.model?.legacyTier !== before;
  const alignedSignal=signals.some(s=>s.direction===Math.sign(signedChange!) && proof.reasonCodes.includes(s.kind)
    && !(s.kind==="matchup" && matchupAlreadyApplied));
  const alignedExternal=signedChange!>0 ? support.trend==="上振れ評価" : support.trend==="下振れ評価";
  const supportedSourceReason=proof.reasonCodes.some(code=>["external","build","tournament"].includes(code));
  if(!alignedSignal && !(alignedExternal && support.ranked && supportedSourceReason)) reject("補正方向を裏付ける実測指標または直接のランク戦資料が必要です。");
  if(!alignedExternal && (!alignedSignal || support.groups<2 || !support.ranked)) reject("外部傾向と異なる補正には、整合する実測指標、独立二系列、ランク戦資料が必要です。");
  if(steps>=2 && (support.groups<2 || !alignedSignal || !alignedExternal || !support.ranked || !["高","中"].includes(pop.model?.measuredConfidence ?? ""))) reject("二段階補正には一致する独立二系列、実測信頼度中以上、補正方向を支持する指標とランク戦資料が必要です。");
}
