import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { DashboardSelectionV4 } from "@/lib/environment-dashboard-period";
import { parseEnvironmentDashboardV4 } from "@/lib/environment-dashboard-v4";
import { normalizeRankSelection } from "@/lib/rank-selection";

export async function getEnvironmentDashboard(selection: DashboardSelectionV4) {
  const ranks = normalizeRankSelection(selection.ranks);
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("get_environment_dashboard_aggregates_v4", {
    p_environment_id: selection.environment, p_period: selection.period, p_rank_filters: ranks
  });
  if (error) throw new Error("環境データを取得できませんでした。");
  return parseEnvironmentDashboardV4(data, selection);
}
