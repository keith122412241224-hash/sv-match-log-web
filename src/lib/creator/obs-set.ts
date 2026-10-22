import { UUID } from "./model";

export type ObsSetValues = { name: string; tier_work_id: string | null; correlation_id: string | null };
export type ObsSet = ObsSetValues & { id: string; revision: number; created_at: string; updated_at: string };
export function parseObsSet(input: unknown): ObsSetValues {
  const value = input as ObsSetValues;
  if (!value || typeof value.name !== "string" || !value.name.trim() || value.name.length > 120) throw Error("セット名は1〜120文字で入力してください。");
  for (const id of [value.tier_work_id, value.correlation_id]) {
    if (id !== null && (typeof id !== "string" || !UUID.test(id))) throw Error("表示する作品を選択してください。");
  }
  if (!value.tier_work_id && !value.correlation_id) throw Error("Tier表か相関図を1つ以上選択してください。");
  return { name: value.name.trim(), tier_work_id: value.tier_work_id, correlation_id: value.correlation_id };
}
