import { createSupabaseServerClient } from "@/lib/supabase/server";
import { parseEnvironmentDashboardV2, type DashboardSelectionV2 } from "@/lib/environment-dashboard-v2";
import { normalizeRankSelection } from "@/lib/rank-selection";

export async function getEnvironmentDashboard(selection: DashboardSelectionV2) {
  const ranks = normalizeRankSelection(selection.ranks);
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("get_environment_dashboard_aggregates_v2", {
    p_environment_id: selection.environment, p_period: selection.period, p_rank_filters: ranks
  });
  if (error) throw new Error("環境データを取得できませんでした。");
  return parseEnvironmentDashboardV2(data, selection);
}
