import { randomUUID } from "node:crypto";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getIsAdmin } from "@/lib/data";
import { buildReviewSnapshotV2, type ReviewSourceV2 } from "./data-model";

export async function collectReviewSnapshot(environmentId: string) {
  if (!await getIsAdmin()) throw new Error("管理者権限が必要です。");
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("get_environment_review_source_v2", { p_environment_id: environmentId });
  if (error || !data || data.environmentId !== environmentId || !Array.isArray(data.eligibleBias) ||
      typeof data.environmentStart !== "string" || !Number.isFinite(Date.parse(data.environmentStart))) {
    throw new Error("指定環境の実戦データを集計できませんでした。");
  }
  return buildReviewSnapshotV2(data as ReviewSourceV2, randomUUID());
}
