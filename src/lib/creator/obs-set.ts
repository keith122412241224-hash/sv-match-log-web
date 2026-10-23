import { UUID } from "./model";
import { DASHBOARD_PERIODS, type DashboardPeriodV4 } from "@/lib/environment-dashboard-period";
import { RANK_ATOMS, normalizeRankSelection, type RankSelection } from "@/lib/rank-selection";

export const OBS_CONTENTS = ["environment", "tier", "correlation"] as const;
export type ObsContent = typeof OBS_CONTENTS[number];
export const OBS_LABELS = { environment: "環境データ", tier: "Tier表", correlation: "相関図" };
export type ObsOptions = { environment_id: string | null; environment_period: DashboardPeriodV4; environment_ranks: RankSelection; content_order: ObsContent[]; display_mode: "continuous" | "individual" };
export type ObsSetValues = { name: string; tier_work_id: string | null; correlation_id: string | null } & Partial<ObsOptions>;
export type ObsSet = ObsSetValues & ObsOptions & { id: string; revision: number; created_at: string; updated_at: string };
export function obsOptions(value?: Partial<ObsOptions> | null): ObsOptions {
  return { environment_id: value?.environment_id ?? null, environment_period: value?.environment_period ?? "7d", environment_ranks: value?.environment_ranks ?? RANK_ATOMS, content_order: value?.content_order ?? [...OBS_CONTENTS], display_mode: value?.display_mode ?? "continuous" };
}
export function selectedObsContents(value: ObsSetValues): ObsContent[] {
  return obsOptions(value).content_order.filter(k => k === "environment" ? !!value.environment_id : k === "tier" ? !!value.tier_work_id : !!value.correlation_id);
}
export function obsCompositionUrl(id: string, transparent = false, view?: ObsContent) {
  const params = new URLSearchParams();
  if (transparent) params.set("transparent", "1");
  if (view) params.set("view", view);
  return `/admin/obs/composition/${id}${params.size ? `?${params}` : ""}`;
}
export function parseObsSet(input: unknown): ObsSetValues {
  const value = input as ObsSetValues;
  if (!value || typeof value.name !== "string" || !value.name.trim() || value.name.length > 120) throw Error("セット名は1〜120文字で入力してください。");
  for (const id of [value.tier_work_id, value.correlation_id]) {
    if (id !== null && (typeof id !== "string" || !UUID.test(id))) throw Error("表示する作品を選択してください。");
  }
  const extended = ["environment_id", "environment_period", "environment_ranks", "content_order", "display_mode"].some(k => Object.hasOwn(value, k));
  for (const key of ["environment_period", "environment_ranks", "content_order", "display_mode"] as const) {
    if (Object.hasOwn(value, key) && value[key] == null) throw Error("表示設定が不正です。");
  }
  const options = obsOptions(value);
  if (options.environment_id !== null && (typeof options.environment_id !== "string" || !UUID.test(options.environment_id))) throw Error("環境を選択してください。");
  if (!DASHBOARD_PERIODS.some(p => p.value === options.environment_period)) throw Error("期間の指定が不正です。");
  options.environment_ranks = normalizeRankSelection(options.environment_ranks);
  if (!Array.isArray(options.content_order) || options.content_order.length !== 3 || new Set(options.content_order).size !== 3 || options.content_order.some(k => !OBS_CONTENTS.includes(k))) throw Error("表示順序が不正です。");
  if (!["continuous", "individual"].includes(options.display_mode)) throw Error("表示方法が不正です。");
  if (!options.environment_id && !value.tier_work_id && !value.correlation_id) throw Error("表示するコンテンツを1つ以上選択してください。");
  return { name: value.name.trim(), tier_work_id: value.tier_work_id, correlation_id: value.correlation_id, ...(extended ? options : {}) };
}
