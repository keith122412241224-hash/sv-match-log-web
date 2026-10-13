import { SHADOWVERSE_CLASSES } from "@/lib/constants";
import { jstInputToIso, readMatchInputWindow } from "@/lib/environment-input";

export type BatchKind = "environment" | "archetype";
export type BatchStatus = "success" | "validation" | "database" | "missing" | "unknown" | "conflict";
export type BatchRow = { id: string; label: string; status: BatchStatus; message: string };
export type BatchResult = { total: number; succeeded: number; failed: number; unknown: number; rows: BatchRow[]; notice: string; error?: string };
export type BatchValues = Record<string, string | number | boolean | null>;
export const batchFields = {
  environment: ["name", "start_date", "allow_match_input", "match_input_start_at", "match_input_end_at", "dashboard_end_at"],
  archetype: ["name", "class_name", "sort_order", "is_active"]
} as const;
export const batchLabels: Record<BatchStatus, string> = { success: "保存済み", validation: "入力エラー", database: "DB更新失敗", missing: "更新対象なし", unknown: "結果確認不能", conflict: "保存値が変更されています" };
export const batchUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function batchSnapshot(kind: BatchKind, row: object): BatchValues {
  const values = row as BatchValues;
  return Object.fromEntries(batchFields[kind].map(key => [key, values[key] ?? null]));
}

export function readBatchValues(kind: BatchKind, form: FormData, id: string): BatchValues {
  const text = (key: string) => String(form.get(`${key}_${id}`) ?? "").trim();
  const name = text("name");
  if (!name) throw Error("名前を入力してください。");
  if (kind === "archetype") {
    const class_name = text("class_name"), order = text("sort_order");
    if (!(SHADOWVERSE_CLASSES as readonly string[]).includes(class_name)) throw Error("クラスを選択してください。");
    if (!/^-?\d+$/.test(order) || !Number.isSafeInteger(Number(order)) || Number(order) < -2147483648 || Number(order) > 2147483647) throw Error("表示順は整数で入力してください。");
    return { name, class_name, sort_order: Number(order), is_active: form.get(`is_active_${id}`) === "on" };
  }
  const date = text("start_date");
  if (date && (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(Date.parse(date)) || new Date(date).toISOString().slice(0, 10) !== date)) throw Error("開始日を正しく入力してください。");
  return { name, start_date: date || null, allow_match_input: form.get(`allow_match_input_${id}`) === "on",
    ...readMatchInputWindow(text("match_input_start_at"), text("match_input_end_at")),
    ...(form.has(`dashboard_end_at_${id}`) ? { dashboard_end_at: jstInputToIso(text("dashboard_end_at")) } : {}) };
}

export function readBatchBaseline(kind: BatchKind, value: FormDataEntryValue | null): BatchValues | null {
  if (value === null) return null; // Compatibility with existing native POST callers.
  try {
    const row = JSON.parse(String(value));
    if (!row || Array.isArray(row) || typeof row !== "object") throw Error();
    for (const key of batchFields[kind]) {
      const v = row[key];
      if (["allow_match_input", "is_active"].includes(key) ? typeof v !== "boolean" : key === "sort_order" ? !Number.isInteger(v) : key === "name" || key === "class_name" ? typeof v !== "string" : v !== null && typeof v !== "string") throw Error();
    }
    return batchSnapshot(kind, row);
  } catch { throw Error("編集開始時の情報を確認できません。入力を控えてから画面を読み直してください。"); }
}

export function sameBatchValues(current: BatchValues, expected: BatchValues): boolean {
  const comparable = (key: string, value: BatchValues[string]) => key.endsWith("_at") && typeof value === "string"
    ? `${Date.parse(value)}:${(value.match(/\.(\d+)/)?.[1] ?? "").padEnd(6, "0").slice(3)}` : value;
  return Object.entries(expected).every(([key, value]) => comparable(key, current[key]) === comparable(key, value));
}

export function batchSummary(result: Pick<BatchResult, "total" | "succeeded" | "failed" | "unknown">, kind: BatchKind): string {
  const name = kind === "environment" ? "環境" : "標準デッキ";
  if (!result.total) return "更新対象がありません。";
  if (result.succeeded === result.total) return `${name}${result.total}件を更新しました。`;
  return `${result.total}件中${result.succeeded}件を更新しました。${result.failed ? `${result.failed}件は更新できませんでした。` : ""}${result.unknown ? `${result.unknown}件は保存結果の確認が必要です。` : ""}`;
}

export function batchResult(kind: BatchKind, rows: BatchRow[]): BatchResult {
  const succeeded = rows.filter(r => r.status === "success").length, unknown = rows.filter(r => r.status === "unknown").length;
  const ok = rows.length > 0 && succeeded === rows.length;
  const result: BatchResult = { total: rows.length, succeeded, unknown, failed: rows.length - succeeded - unknown, rows,
    notice: kind === "environment" ? ok ? "environments_updated" : "environments_update_failed" : ok ? "batch_updated" : "batch_update_failed" };
  if (!ok) result.error = batchSummary(result, kind);
  return result;
}
