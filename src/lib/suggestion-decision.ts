import { SHADOWVERSE_CLASSES } from "@/lib/constants";

export type SuggestionDecision = { status: string; message: string; archetypeId?: string };
export const suggestionPauseMessage = "候補の採用・却下は移行作業のため一時停止中です。入力を控え、再開の案内をお待ちください。";
export function suggestionWritesEnabled() { return process.env.ADMIN_SUGGESTION_WRITES === "rpc"; }
export const suggestionMessages: Record<string, string> = {
  approved: "候補を標準デッキとして採用しました。",
  already_approved: "既に同じ内容で採用済みです。新しいデッキは追加していません。",
  rejected: "候補を却下しました。",
  already_rejected: "既に却下済みです。",
  invalid: "候補ID・クラス・標準デッキ名を確認してください。",
  missing: "候補が見つかりません。一覧を読み直してください。",
  legacy: "過去の承認済み候補です。承認先が未確定のため、再採用せず管理者による確認が必要です。",
  inconsistent: "承認状態と標準デッキの対応を確認できません。再登録せず管理者による確認が必要です。",
  conflict: "候補の状態または承認内容が異なります。入力を控え、一覧を読み直して確認してください。",
  forbidden: "管理者権限を確認できません。ログイン状態を確認してください。",
  unavailable: "承認機能の準備が完了していません。入力を控え、再開の案内をお待ちください。",
  database: "DBで処理を受け付けられませんでした。同名デッキや候補の状態を確認してください。",
  unknown: "結果を確認できません。入力を変更せず、同じ操作を再試行すると承認状態を確認できます。"
};
type Client = { rpc: (name: string, args: Record<string, unknown>) => PromiseLike<{ data: unknown; error: { code?: string } | null }> };
export async function decideSuggestion(client: Client, form: FormData, operation: "approve" | "reject"): Promise<SuggestionDecision> {
  const result = (status: string, archetypeId?: string) => ({ status, message: suggestionMessages[status], ...(archetypeId ? { archetypeId } : {}) });
  if (!suggestionWritesEnabled()) return { status: "paused", message: suggestionPauseMessage };
  const id = String(form.get(operation === "approve" ? "suggestion_id" : "id") ?? "");
  const className = String(form.get("class_name") ?? "").trim(), name = String(form.get("name") ?? "").trim();
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)
    || (operation === "approve" && (!name || !(SHADOWVERSE_CLASSES as readonly string[]).includes(className)))
    || (operation === "reject" && form.get("status") !== "rejected")) return result("invalid");
  try {
    const { data, error } = await client.rpc("decide_deck_suggestion", { p_id: id, p_operation: operation, p_class: className || null, p_name: name || null });
    if (error) return result(error.code === "42501" ? "forbidden" : ["42883", "PGRST202"].includes(error.code ?? "") ? "unavailable"
      : /^(22|23)[A-Z0-9]{3}$/.test(error.code ?? "") ? "database" : "unknown");
    const value = data as { status?: string; archetype_id?: string } | null;
    if (!value?.status || !Object.hasOwn(suggestionMessages, value.status)) return result("unknown");
    if (["approved", "already_approved"].includes(value.status) && !/^[0-9a-f-]{36}$/i.test(value.archetype_id ?? "")) return result("unknown");
    return result(value.status, value.archetype_id);
  } catch { return result("unknown"); }
}
