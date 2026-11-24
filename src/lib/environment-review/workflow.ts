import { encounterTier, tierMethod } from "./assessment-v3";
import { UUID } from "@/lib/creator/model";
import { createHash } from "node:crypto";
import type { creatorClient } from "@/lib/creator/server";
import { collectReviewSnapshot } from "./snapshot";
import type { ReviewSnapshot } from "./metrics";
import { reviewDiagnostics, validateEvaluation, type EvaluationDocument } from "./evaluation";
import { memberSnapshot, previousTiers, type MemberPayload, type Publication } from "./publication";

type Client = Awaited<ReturnType<typeof creatorClient>>["client"];
export type ReviewRun = { id: string; environment_id: string; as_of: string; mode: string; revision: number; status: string; created_at: string; updated_at: string; published_at: string | null };
export type RunDetail = ReviewRun & { snapshot: ReviewSnapshot & { previousEvaluation?: Publication | null }; analysis: EvaluationDocument | null };
export type ReviewEvent = { id: number; run_id: string | null; action: string; reason: string | null; created_at: string };
export const RUN_FIELDS = "id,environment_id,as_of,mode,revision,status,created_at,updated_at,published_at";
export class ReviewConflict extends Error {}

// JSONB preserves array order but may return object keys in a different order.
function digest(value: unknown) {
  const json = JSON.stringify(value, (_, item) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) return item;
    return Object.fromEntries(Object.keys(item).sort().map(key => [key, item[key]]));
  });
  return createHash("sha256").update(json).digest("hex");
}
export function reviewId(value: unknown) {
  if (typeof value !== "string" || !UUID.test(value)) throw new Error("環境または評価のIDが不正です。");
  return value;
}
export function checkDb(error: {message: string} | null) {
  if (!error) return;
  const messages: Record<string,string> = {
    older_review:"同じ環境に新しい評価があります。過去の公開版は履歴から復元できます。",
    review_manual_approval_required:"大きな補正または公開版との差があるため手動確認が必要です。",
    review_conflict:"他の画面で更新されました。履歴を再読み込みしてください。",
    duplicate_analysis:"同じ内容の下書きが既に保存されています。",
    review_reason_required:"変更・復元の理由を入力してください。",
    review_not_restorable:"この公開版は既に公開中か、復元できません。"
  };
  if (error.message === "review_conflict") throw new ReviewConflict(messages.review_conflict);
  throw new Error(messages[error.message] ?? error.message);
}
export async function publicationFor(client: Client, environment: string): Promise<Publication | null> {
  const result = await client.from("environment_review_publications").select("run_id,as_of,published_at,payload").eq("environment_id",environment).maybeSingle();
  checkDb(result.error);
  return result.data;
}
export async function runDetail(client: Client, runId: string, environment: string): Promise<RunDetail> {
  const result = await client.from("environment_review_runs").select("*").eq("id",runId).eq("environment_id",environment).single();
  checkDb(result.error);
  return result.data;
}
export async function createSnapshot(client: Client, environment: string) {
  const snapshot = await collectReviewSnapshot(environment);
  const previous = await publicationFor(client,environment);
  const result = await client.rpc("environment_review_create", {
    p_id: snapshot.snapshotId, p_environment_id: environment, p_as_of: snapshot.asOf,
    p_snapshot: {...snapshot, previousEvaluation: previous && Date.parse(previous.as_of) <= Date.parse(snapshot.asOf) ? previous : null}, p_mode: "manual"
  });
  if (result.error?.code === "23505") {
    const retry = await client.from("environment_review_runs").select("id").eq("environment_id",environment).eq("id",snapshot.snapshotId).maybeSingle();
    checkDb(retry.error);
    if (retry.data) return retry.data.id as string;
    const existing = await client.from("environment_review_runs").select("id,snapshot").eq("environment_id",environment).eq("as_of",snapshot.asOf).eq("snapshot->>schemaVersion",String(snapshot.schemaVersion)).single();
    checkDb(existing.error);
    if (!existing.data?.snapshot?.weekly) throw new ReviewConflict("同じ締切に旧期間の評価があります。過去版は履歴から確認してください。");
    return existing.data!.id as string;
  }
  checkDb(result.error);
  return snapshot.snapshotId;
}
async function verifyMaster(client: Client, snapshot: ReviewSnapshot) {
  const ids = snapshot.decks.map(d => d.deckId);
  const expected = new Map(snapshot.decks.map(d => [d.deckId,d]));
  for (let i = 0; i < ids.length; i += 50) {
    const group = ids.slice(i,i+50);
    const result = await client.from("deck_archetypes").select("id,name,class_name,environment_id").in("id",group);
    checkDb(result.error);
    if (result.data?.length !== group.length || result.data.some(d => {
      const deck = expected.get(d.id);
      return !deck || deck.name !== d.name || deck.className !== d.class_name || (d.environment_id !== null && d.environment_id !== snapshot.environmentId);
    })) throw new Error("デッキマスタが集計時点と一致しません。スナップショットを再作成してください。");
  }
}

function evidenceFingerprint(doc: EvaluationDocument) {
  function canonical(value: unknown): unknown {
    if (Array.isArray(value)) return value.map(canonical).sort((a,b) =>
      JSON.stringify(a).localeCompare(JSON.stringify(b), "en"));
    if (!value || typeof value !== "object") return value;
    return Object.fromEntries(Object.entries(value).sort(([a],[b]) => a < b ? -1 : a > b ? 1 : 0)
      .map(([key,entry]) => [key,canonical(entry)]));
  }
  return createHash("sha256").update(JSON.stringify(canonical(doc.schemaVersion===2 && doc.internal.research ? doc.internal.research.sources : doc.internal.sources))).digest("hex");
}

export function compareDraft(next: EvaluationDocument, saved: EvaluationDocument | null) {
  const fingerprint = evidenceFingerprint(next);
  if (!saved) return { fingerprint, sameSources: null, changedTargets: [] };
  function decisions(doc: EvaluationDocument) {
    return new Map([...doc.public.decks.map(d => [d.deckId,d.tier] as const),
      ...doc.public.pairs.map(p => [p.a + "/" + p.b,p.rating] as const)]);
  }
  const before = decisions(saved), after = decisions(next);
  const changedTargets = [...new Set([...before.keys(),...after.keys()])].filter(id => before.get(id) !== after.get(id)).sort();
  return { fingerprint, sameSources: evidenceFingerprint(saved) === fingerprint, changedTargets };
}

export async function reviewAction(client: Client, run: RunDetail, body: Record<string,unknown>) {
  const { action, revision, reason, expectedPublication } = body;
  if (!Number.isSafeInteger(revision) || revision !== run.revision) throw new ReviewConflict("他の操作で評価が更新されました。再読み込みして内容を確認してください。");
  if (reason != null && (typeof reason !== "string" || reason.length > 1000)) throw new Error("操作理由は1000文字以内で入力してください。");
  if (expectedPublication !== null) reviewId(expectedPublication);
  const current = await publicationFor(client,run.environment_id);
  if ((current?.run_id ?? null) !== expectedPublication) throw new ReviewConflict("公開中の評価が変更されました。再読み込みして内容を確認してください。");
  let analysis: EvaluationDocument | null = null, payload: MemberPayload | null = null;
  const warnings: string[] = [];
  if (action === "preview" || action === "save" || action === "publish") {
    await verifyMaster(client,run.snapshot);
    const frozenPrevious = run.snapshot.previousEvaluation?.payload.evaluation ?? null;
    analysis = validateEvaluation(action === "publish" ? run.analysis : body.document, run.snapshot, frozenPrevious);
    const isV3=analysis.schemaVersion===2 && analysis.reviewVersion===3;
    if (isV3 && action==="publish" && run.mode!=="manual") throw new Error("v3は管理者による手動確認が必要です。");
    if (analysis.schemaVersion===2 && analysis.reviewVersion===3) {
      for (const d of analysis.public.decks) {
        const measured=run.snapshot.decks.find(x=>x.deckId===d.deckId);
        const base=measured?.dataTier;
        const composite=measured ? tierMethod(analysis.tierRule)(measured,run.snapshot).tier : null;
        const anchor=encounterTier(measured?.encounterRate??null);
        if (analysis.tierRule && anchor!==null && d.tier!==null && Math.abs(anchor-d.tier)>=2)
          warnings.push("遭遇率の基礎Tierからの大幅変更　"+(measured?.name??d.deckId)+"　"+d.reason);
        if(analysis.judgmentRule && composite!==null && d.tier===null) warnings.push("実測基礎から判断保留への変更　"+(measured?.name??d.deckId));
        if(d.tier!==null && (composite===null || Math.abs(composite-d.tier)>=2)) warnings.push("外部資料による大幅補正・暫定評価　"+(measured?.name??d.deckId));
        if(d.tier!==null && (base==null || Math.abs(base-d.tier)>=2)) warnings.push("大幅補正・暫定評価　"+(run.snapshot.decks.find(x=>x.deckId===d.deckId)?.name ?? d.deckId));
      }
      if(analysis.judgmentRule) {
        const choices=analysis.internal.judgments??[];
        const names=new Map(run.snapshot.decks.map(d=>[d.deckId,d.name]));
        for(const choice of choices) {
          const label=choice.target.split("/").map(id=>names.get(id)??id).join(" 対 ");
          const pair=analysis.public.pairs.find(p=>p.a+"/"+p.b===choice.target);
          if(choice.priority==="外部" || pair?.divergence || choice.confidence==="高" && choice.sourceIds.length)
            warnings.push("原典・反対材料・判断の適用範囲を確認　"+label);
        }
        if(choices.some(c=>c.sourceIds.length)) warnings.push("参照資料の実在、本文の対象環境と独立性を原典で確認してください。");
      }
      if(analysis.public.pairs.some(p=>p.reason.startsWith("外部情報を中心"))) warnings.push("外部資料に基づく暫定対面を確認してください。");
    }
    const diagnosticRows = run.snapshot.schemaVersion === 2 && !isV3 ? reviewDiagnostics(run.snapshot, analysis, frozenPrevious) : [];
    const names = new Map(run.snapshot.decks.map(d => [d.deckId,d.name]));
    const targetName = (key: string) => key.split("/").map(id => names.get(id) ?? id).join(" 対 ");
    for (const row of diagnosticRows) {
      if (row.largeCorrection || row.reversal) warnings.push("データ評価からの大幅補正　" + targetName(row.target));
      if (row.required && row.omissionReason) warnings.push("重要な乖離候補の未掲載　" + targetName(row.target));
    }
    const prior = previousTiers(current, run.id);
    payload = { snapshot: memberSnapshot(run.snapshot), evaluation: analysis.public, previousTiers: prior };
    const publishedTiers = new Map(current?.payload.evaluation.decks.map(d => [d.deckId,d.tier]));
    for (const d of analysis.public.decks) {
      const priorTier = publishedTiers.get(d.deckId);
      if (priorTier != null && d.tier != null && Math.abs(priorTier - d.tier) >= 2) {
        warnings.push("前回公開評価からの大幅変動　" + targetName(d.deckId));
      }
    }
    const previousPairs = new Map(current?.payload.evaluation.pairs.map(p => [p.a+"/"+p.b,p.rating]));
    for (const p of analysis.public.pairs) {
      const previous = previousPairs.get(p.a+"/"+p.b);
      if (previous != null && p.rating != null && Math.abs(previous-p.rating) >= 2) warnings.push("前回公開評価からの大幅変動　" + targetName(p.a + "/" + p.b));
    }
    const needsSourceReview=analysis.schemaVersion===2 && analysis.judgmentRule && analysis.internal.judgments?.some(j=>j.sourceIds.length);
    const sourceEdition=needsSourceReview?digest({id:run.id,analysis}):null;
    if(action==="publish" && sourceEdition && body.sourceEdition!==sourceEdition) throw new Error("この版の原典と判断根拠を確認してください。");
    if (action === "preview") {
      const publishedEdition = current?.published_at ?? null;
      const reviewKey = digest({ id: run.id, revision, expectedPublication, publishedEdition, analysis, warnings, payload });
      return { payload, warnings: [...new Set(warnings)], diagnostics: diagnosticRows, analysis, reviewKey, sourceEdition,
        matchesSaved: run.analysis !== null && digest(analysis) === digest(run.analysis),
        draftComparison: compareDraft(analysis,run.analysis), publishedEdition };
    }
    if (action === "publish" && body.confirmChanges !== true) throw new Error("公開内容の確認チェックを入れてください。");
    if (action === "publish" && warnings.length && (body.confirmChanges !== true || run.mode !== "manual")) throw new Error("大きな評価変更を確認してから公開してください。");
  }
  if (!["save","publish","withdraw","restore"].includes(String(action))) throw new Error("操作が不正です。");
  if (action === "publish") {
    if (body.publishedEdition !== (current?.published_at ?? null)) throw new ReviewConflict("公開版が変わりました。再読み込みしてプレビューを確認してください。");
    const result = await client.rpc("environment_review_publish_v2", {
      p_id:run.id, p_revision:revision, p_public:payload, p_reason:reason ?? "",
      p_expected_publication_id:expectedPublication, p_expected_published_at:body.publishedEdition
    });
    checkDb(result.error);
    return {revision:result.data};
  }
  const result = await client.rpc("environment_review_transition", {
    p_id: run.id, p_revision: revision, p_action: action, p_analysis: action === "save" ? analysis : null,
    p_public: action === "publish" ? payload : null, p_reason: reason ?? "", p_expected_publication_id: expectedPublication,
    p_restore_event_id: action === "restore" ? body.restoreEvent ?? null : null
  });
  checkDb(result.error);
  return { revision: result.data };
}

export async function publishReviewed(client: Client, run: RunDetail, body: Record<string, unknown>) {
  if (body.confirmChanges !== true) throw new Error("公開内容の確認チェックを入れてください。");
  const checked = await reviewAction(client, run, {...body, action:"preview"});
  if (!checked.analysis || !checked.reviewKey || body.reviewKey !== checked.reviewKey ||
      body.publishedEdition !== checked.publishedEdition) {
    throw new ReviewConflict("評価内容または公開版が変更されました。再読み込みして再確認してください。");
  }
  if(checked.sourceEdition && body.sourceEdition!==checked.sourceEdition) throw new Error("確認した調査資料の版が一致しません。");
  if (checked.warnings.length && run.mode !== "manual") throw new Error("大きな評価変更には手動での管理者確認が必要です。");
  let draft = run;
  if (checked.matchesSaved) {
    if (run.status !== "draft") throw new Error("同じ内容は公開済みです。過去版は履歴から復元してください。");
  } else {
    const saved = await reviewAction(client, run, {...body, action:"save", document:checked.analysis});
    try {
      draft = await runDetail(client, run.id, run.environment_id);
      if (draft.revision !== saved.revision || draft.status !== "draft" || digest(draft.analysis) !== digest(checked.analysis)) {
        throw new ReviewConflict("保存後に評価が更新されました。");
      }
    } catch (error) {
      throw new ReviewConflict("下書きを保存しました。再読み込みして保存内容を確認してください。 " + (error instanceof Error ? error.message : ""));
    }
  }
  // Never adopt a newer publication or revision between saving and publishing.
  try {
    return await reviewAction(client, draft, {...body, action:"publish", revision:draft.revision});
  } catch (error) {
    throw new ReviewConflict("下書きは保存済みです。公開状態を再読み込みして再確認してください。 " +
      (error instanceof Error ? error.message : ""));
  }
}
