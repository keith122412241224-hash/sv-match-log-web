import { TIER_RULE } from "./assessment-v3";
import { ALL_PAIRS_JUDGMENT_RULE, assessJudgments, JUDGMENT_RULE, LEGACY_JUDGMENT_RULE, type JudgmentRule, type Judgment } from "./judgment";
import { assessV3, verifyV3 } from "./method-v3";
import { parseResearch, type Research } from "./research-v3";
import type { ReviewSnapshot } from "./metrics";
import * as v1 from "./evaluation-v1";
import { parseEvidence, parseSource, sourceSeries, targetSupport, type EvidenceV2, type SourceV2 } from "./evidence-v2";
import { checkCorrection, reviewDiagnostics as diagnose, type ReviewContext } from "./policy-v2";

export type { Confidence, DeckAssessment, PairAssessment, Divergence, PublicEvaluation } from "./evaluation-v1";
export type { TargetDiagnostic, ReviewContext } from "./policy-v2";
export { MAX_EVALUATION_BYTES } from "./evaluation-v1";
export const EVALUATION_SCHEMA_VERSION = 2;
export const CONFIDENCE_RULE_VERSION = "review-confidence-v2";
export const PROMPT_VERSION = "environment-review-prompt-v2";
export type EvaluationV2 = {
  judgmentRule?:JudgmentRule; tierRule?:typeof TIER_RULE; reviewVersion?:3; schemaVersion:2; promptVersion:typeof PROMPT_VERSION; environmentId:string; snapshotId:string;
  public:v1.PublicEvaluation; internal:{judgments?:Judgment[];research?:Research;sources:SourceV2[];evidence:EvidenceV2[];limitations:string};
};
export type EvaluationDocument = v1.EvaluationDocument | EvaluationV2;
export function reviewDiagnostics(ctx:ReviewContext,doc?:EvaluationDocument|null,previous?:v1.PublicEvaluation|null) {
  return diagnose(ctx,doc?.schemaVersion===2 ? doc : null,previous);
}

function validatePublicText(pub:v1.PublicEvaluation) {
  const texts=[pub.overview.facts,pub.overview.hypothesis,pub.changes];
  for(const row of [...pub.decks,...pub.pairs]) {
    texts.push(row.reason);
    if(row.divergence) texts.push(row.divergence.facts,row.divergence.hypothesis);
  }
  for(const value of texts) {
    if(/(?:[\d.,]+\s*(?:%|パーセント|ポイント|件|勝|敗|戦|人|割)|(?:Tier|ティア)\s*[1-5]|\d+\s*段階)/iu.test(value.normalize("NFKC"))) v1.fail("勝率・件数・Tier・段階数等の数値は公開本文に転記せず、スナップショットの構造化表示を使用してください。");
  }
}
export function validateEvaluation(value:unknown,ctx:ReviewContext,previous?:v1.PublicEvaluation|null):EvaluationDocument {
  if(ctx.schemaVersion!==2) return v1.validateEvaluation(value,ctx);
  if (value && typeof value==="object" && "reviewVersion" in value) {
    const versioned="tierRule" in value;
    const deliberative="judgmentRule" in value;
    const root=v1.object(value,"schemaVersion promptVersion reviewVersion environmentId snapshotId public internal"+(versioned ? " tierRule" : "")+(deliberative?" judgmentRule":""),"取り込みJSON v3");
    if(versioned && root.tierRule!==TIER_RULE) v1.fail("未対応のTier評価ルール版です。");
    const rule=versioned ? TIER_RULE : undefined;
    if(root.reviewVersion!==3 || root.schemaVersion!==2 || ctx.promptVersion!==PROMPT_VERSION || root.promptVersion!==ctx.promptVersion ||
        root.environmentId!==ctx.environmentId || root.snapshotId!==ctx.snapshotId) v1.fail("v3の対象スナップショットまたは版が一致しません。");
    const judgmentRule = root.judgmentRule===JUDGMENT_RULE ? JUDGMENT_RULE : root.judgmentRule===ALL_PAIRS_JUDGMENT_RULE ? ALL_PAIRS_JUDGMENT_RULE : root.judgmentRule===LEGACY_JUDGMENT_RULE ? LEGACY_JUDGMENT_RULE : undefined;
    if(deliberative && (!versioned || !judgmentRule)) v1.fail("未対応の総合判断方式です。");
    const i=v1.object(root.internal,"research sources evidence limitations"+(deliberative?" judgments":""),"v3内部資料");
    if(!Array.isArray(i.sources) || i.sources.length || !Array.isArray(i.evidence) || i.evidence.length) v1.fail("v3資料はresearchに入力してください。");
    const snapshot=ctx as ReviewSnapshot;
    const research=parseResearch(i.research,snapshot);
    const base=assessV3(snapshot,deliberative?{...research,sources:[]}:research,rule);
    const decision=deliberative?assessJudgments(snapshot,research,i.judgments,base,judgmentRule):null;
    const expected=decision?.expected??base;
    const {pub}=v1.parsePublic(root.public ?? expected,ctx,expected.pairs.length);
    validatePublicText(pub);
    verifyV3(pub,expected,!!decision);
    return {...(decision && {judgmentRule}),...(rule && {tierRule:rule}),schemaVersion:2,promptVersion:PROMPT_VERSION,reviewVersion:3,snapshotId:ctx.snapshotId,environmentId:ctx.environmentId,
      public:pub,internal:{...(decision && {judgments:decision.judgments}),research,sources:[],evidence:[],limitations:v1.string(i.limitations,"制約",1800)}};
  }
  const root=v1.object(value,"schemaVersion promptVersion environmentId snapshotId public internal","取り込みJSON v2");
  if(root.schemaVersion!==2 || root.promptVersion!==PROMPT_VERSION || ctx.promptVersion && ctx.promptVersion!==PROMPT_VERSION) v1.fail("スキーマ・プロンプト版がスナップショットと一致しません。");
  if(root.snapshotId!==ctx.snapshotId || root.environmentId!==ctx.environmentId) v1.fail("環境・スナップショットIDが一致しません。");
  const {pub}=v1.parsePublic(root.public,ctx);
  validatePublicText(pub);
  const deckIndex=v1.indexed(pub.decks,d=>d.deckId,"デッキ評価");
  const pairIndex=v1.indexed(pub.pairs,p=>p.a+"/"+p.b,"対面評価");
  if(deckIndex.size!==ctx.decks.length || ctx.decks.some(d=>!deckIndex.has(d.deckId))) v1.fail("全デッキに評価が必要です。");
  const measured=new Map<string,ReviewContext["decks"][number]|ReviewContext["pairs"][number]>(ctx.decks.map(d=>[d.deckId,d]));
  for(const p of ctx.pairs) measured.set(p.a+"/"+p.b,p);
  for(const target of pairIndex.keys()) if(!measured.has(target)) v1.fail("記録のない対面です。");
  const i=v1.object(root.internal,"sources evidence limitations","内部情報");
  const sources=v1.list(i.sources,parseSource,100,"外部資料");
  const byId=v1.indexed(sources,s=>s.id,"資料ID");
  v1.indexed(sources,s=>s.url,"正規化後の参照URL");
  const refsByTarget=new Map<string,SourceV2[]>();
  for(const s of sources) {
    if(s.environmentId!==ctx.environmentId) v1.fail("能力変更・対象環境の境界が一致しません。");
    for(const c of s.targets) {
      if(!measured.has(c.target)) v1.fail("資料が直接扱う対象が不明です。");
      const refs=refsByTarget.get(c.target) ?? []; refs.push(s); refsByTarget.set(c.target,refs);
    }
  }
  const evidence=v1.list(i.evidence,parseEvidence,measured.size,"対象別の根拠");
  const proofs=v1.indexed(evidence,e=>e.target,"対象別の根拠");
  for(const e of evidence) if(!measured.has(e.target)) v1.fail("内部根拠の対象が不明です。");
  const limitations=v1.string(i.limitations,"制約",1800,pub.comparison==="available");
  const doc:EvaluationV2={schemaVersion:2,promptVersion:PROMPT_VERSION,environmentId:ctx.environmentId,snapshotId:ctx.snapshotId,public:pub,internal:{sources,evidence,limitations}};
  const series=sourceSeries(sources);
  const initiallyRequired=new Set(diagnose(ctx,null,previous).filter(d=>d.required).map(d=>d.target));
  let comparable=0;
  for(const d of diagnose(ctx,doc,previous)) {
    const row=deckIndex.get(d.target) ?? pairIndex.get(d.target), proof=proofs.get(d.target);
    const refs=refsByTarget.get(d.target) ?? [];
    if(!proof) {
      if(row || d.required || initiallyRequired.has(d.target) || refs.length) v1.fail(d.target+" の根拠または未掲載理由がありません。");
      continue;
    }
    const support=targetSupport(refs,d.target,ctx,series,d.before!==null);
    if(proof.sourceIds.some(id=>!byId.has(id) || !refs.some(s=>s.id===id)) ||
       support.refs.some(s=>!proof.sourceIds.includes(s.id))) v1.fail(d.target+" の直接資料が未記載、または他の対象の資料が含まれています。");
    if(proof.externalTrend!==support.trend) v1.fail(d.target+" の外部傾向を対象別の有効資料と一致させてください: "+support.trend);
    if(row && support.trend!=="比較不能") comparable++;
    if(!row && !proof.omissionReason) v1.fail(d.target+" の対面を掲載しない理由が必要です。");
    if((d.required || initiallyRequired.has(d.target)) && !row?.divergence && !proof.omissionReason) v1.fail(d.target+" の重要な乖離候補に分析または未掲載理由が必要です。");
    if(!row) continue;
    if(proof.omissionReason && row.divergence) v1.fail("掲載済みの乖離には未掲載理由を指定できません。");
    if(row.confidence!==d.confidence) v1.fail(d.target+" の機械判定信頼度は「"+d.confidence+"」です。");
    if(row.divergence && (row.divergence.status!==d.status || row.divergence.direction!==d.direction || row.divergence.importance!==d.importance)) v1.fail(d.target+" の乖離区分・方向・重要度が機械判定と一致しません。");
    checkCorrection(d,proof,measured.get(d.target)!,support);
  }
  const comparison=comparable===0 ? "unavailable" : comparable===measured.size ? "available" : "partial";
  if(pub.comparison!==comparison) v1.fail("公開用の外部情報充足度は "+comparison+" です。");
  return doc;
}

/** Editable starting point. The frozen measurements remain server-owned. */
export function baselineEvaluation(ctx:ReviewContext,previous?:v1.PublicEvaluation|null):EvaluationV2 {
  const diagnostics=new Map(diagnose(ctx,null,previous).map(d=>[d.target,d]));
  const detail=(target:string)=>{
    const d=diagnostics.get(target)!;
    return {confidence:d.confidence,reason:d.before===null ? "判定に必要な戦績が不足しています。" : "対象期間のデータ評価を採用しました。",
      divergence:d.required && d.status==="要検証" ? {status:d.status,direction:d.direction,importance:d.importance,facts:"実測上の確認項目は"+d.signals.join("、")+"です。",hypothesis:""} : null};
  };
  return {schemaVersion:2,promptVersion:PROMPT_VERSION,environmentId:ctx.environmentId,snapshotId:ctx.snapshotId,
    public:{overview:{facts:"固定した対象期間の戦績を基に評価しました。",hypothesis:""},comparison:"unavailable",
      decks:ctx.decks.map(d=>({deckId:d.deckId,tier:d.dataTier,...detail(d.deckId)})),
      pairs:ctx.pairs.map(p=>({a:p.a,b:p.b,rating:p.dataRating,...detail(p.a+"/"+p.b)})),
      changes:previous ? "同一環境の前回公開評価を比較対象にしています。" : "比較できる前回の公開評価はありません。"},
    internal:{sources:[],limitations:"比較に使用できる外部資料をまだ登録していません。",
      evidence:[...diagnostics.keys()].map(target=>({target,sourceIds:[],externalTrend:"比較不能",rationale:"スナップショットのデータ評価を採用。",facts:"分析対象期間の集計値を使用。",hypothesis:"",reasonCodes:[],uncertainty:"外部評価との比較は未確定。",omissionReason:null}))}};
}
