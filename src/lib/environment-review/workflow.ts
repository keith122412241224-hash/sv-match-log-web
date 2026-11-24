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
    const existing = await client.from("environment_review_runs").select("id").eq("environment_id",environment).eq("as_of",snapshot.asOf).eq("snapshot->>schemaVersion",String(snapshot.schemaVersion)).single();
    checkDb(existing.error);
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
  return createHash("sha256").update(JSON.stringify(canonical(doc.internal.sources))).digest("hex");
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
  if (!Number.isSafeInteger(revision) || revision !== run.revision) throw new Error("別の画面で更新されています。履歴を再読み込みしてください。");
  if (reason != null && (typeof reason !== "string" || reason.length > 1000)) throw new Error("操作理由は1000文字以内で入力してください。");
  if (expectedPublication !== null) reviewId(expectedPublication);
  const current = await publicationFor(client,run.environment_id);
  if ((current?.run_id ?? null) !== expectedPublication) throw new Error("公開中の評価が変更されました。再読み込みしてください。");
  let analysis: EvaluationDocument | null = null, payload: MemberPayload | null = null;
  const warnings: string[] = [];
  if (action === "preview" || action === "save" || action === "publish") {
    await verifyMaster(client,run.snapshot);
    const frozenPrevious = run.snapshot.previousEvaluation?.payload.evaluation ?? null;
    analysis = validateEvaluation(action === "publish" ? run.analysis : body.document, run.snapshot, frozenPrevious);
    const diagnosticRows = run.snapshot.schemaVersion === 2 ? reviewDiagnostics(run.snapshot, analysis, frozenPrevious) : [];
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
    if (action === "preview") return { payload, warnings: [...new Set(warnings)], diagnostics: diagnosticRows, analysis,
      draftComparison: compareDraft(analysis,run.analysis), publishedEdition: current?.published_at ?? null };
    if (action === "publish" && warnings.length && (body.confirmChanges !== true || run.mode !== "manual")) throw new Error("大きな評価変更を確認してから公開してください。");
  }
  if (!["save","publish","withdraw","restore"].includes(String(action))) throw new Error("操作が不正です。");
  if (action === "publish" && run.snapshot.schemaVersion === 2) {
    if (body.publishedEdition !== (current?.published_at ?? null)) throw new Error("公開版が変わりました。もう一度プレビューしてください。");
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
