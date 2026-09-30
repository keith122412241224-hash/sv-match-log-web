import { createSupabaseServerClient } from "@/lib/supabase/server";
import { parseEnvironmentDashboard, type DashboardSelection } from "@/lib/environment-dashboard";

export async function getEnvironmentDashboard(selection: DashboardSelection) {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("get_environment_dashboard_aggregates_v1", {
    p_environment_id: selection.environment, p_period: selection.period, p_rank_filter: selection.rank
  });
  if (error) throw new Error("環境データを取得できませんでした。");
  return parseEnvironmentDashboard(data, selection);
}
