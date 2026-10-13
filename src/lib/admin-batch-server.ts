import type { SupabaseClient } from "@supabase/supabase-js";
import { batchResult, batchSnapshot, batchUuid, readBatchBaseline, readBatchValues, sameBatchValues, type BatchKind, type BatchRow } from "./admin-batch";

/** Each row remains a separate transaction. Only a returned matching ID proves an update. */
export async function runAdminBatch(client: SupabaseClient, kind: BatchKind, form: FormData, checkOnly = false) {
  const submitted = form.getAll(`${kind}_ids`).map(String), ids = [...new Set(submitted)];
  const table = kind === "environment" ? "environments" : "deck_archetypes";
  async function update(id: string): Promise<BatchRow> {
    const label = String(form.get(`name_${id}`) ?? "").trim() || "名前未入力の行";
    const row = (status: BatchRow["status"], message: string): BatchRow => ({ id, label, status, message });
    if (!batchUuid.test(id)) return row("validation", "更新対象IDが不正です。画面を読み直してください。");
    if (submitted.filter(value => value === id).length !== 1) return row("validation", "同じIDが重複しています。この行は更新していません。");
    let values, baseline;
    try { values = readBatchValues(kind, form, id); baseline = readBatchBaseline(kind, form.get(`baseline_${id}`)); }
    catch (error) { return row("validation", error instanceof Error ? error.message : "入力内容を確認してください。"); }
    try {
      const current = await client.from(table).select("*").eq("id", id).maybeSingle();
      if (current.error) return row("unknown", "保存状態を取得できませんでした。接続・ログイン状態を確認し、保存状態を確認してください。");
      if (!current.data) return row("missing", "対象が見つからないか、更新権限がありません。画面を読み直してください。");
      if (checkOnly) {
        if (sameBatchValues(current.data, values)) return row("success", "現在の保存値が送信内容と一致することを確認しました。");
        if (baseline && sameBatchValues(current.data, baseline)) return row("database", "送信前の保存値のままです。入力内容を確認して再試行できます。");
        return row("conflict", "保存値が送信内容と異なります。入力を控え、画面を読み直して比較してください。");
      }
      if (baseline && !sameBatchValues(current.data, baseline)) return row("conflict", "編集開始後に保存値が変わっています。入力を控え、画面を読み直してから編集してください。");
      const expected = baseline ?? batchSnapshot(kind, current.data);
      let query = client.from(table).update(values).eq("id", id);
      // Compare-and-set on existing columns closes the read/update race without a migration.
      for (const [key, value] of Object.entries(expected)) query = value === null ? query.is(key, null) : query.eq(key, value);
      const response = await query.select("id");
      if (response.error) {
        const code = response.error.code ?? "";
        return /^(22|23|28|40|42|55)[A-Z0-9]{3}$|^57014$/.test(code)
          ? row("database", "DBで更新を受け付けられませんでした。入力・権限を確認して再試行してください。")
          : row("unknown", "更新応答を確認できませんでした。再送する前に保存状態を確認してください。");
      }
      if (response.data?.length === 1 && response.data[0].id === id) return row("success", "入力内容を保存しました。");
      if (response.data?.length === 0) {
        const found = await client.from(table).select("id").eq("id", id).maybeSingle();
        if (found.error) return row("unknown", "更新対象の状態を確認できません。保存状態を確認してください。");
        return found.data ? row("conflict", "保存直前に値または権限が変わり、更新されませんでした。画面を読み直してください。") : row("missing", "更新対象がありません。この行は更新していません。");
      }
      return row("unknown", "更新結果のIDを確認できません。保存状態を確認してください。");
    } catch { return row("unknown", "通信が途切れ、保存結果を確認できません。再送する前に保存状態を確認してください。"); }
  }
  const rows: BatchRow[] = [];
  for (let i = 0; i < ids.length; i += 5) rows.push(...await Promise.all(ids.slice(i, i + 5).map(update)));
  return batchResult(kind, rows);
}
