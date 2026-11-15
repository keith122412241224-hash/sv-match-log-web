import { createSupabaseServerClient } from "@/lib/supabase/server";
import { parseEnvironmentTrends, type TrendSelection } from "@/lib/environment-trends";

export async function getEnvironmentTrends(selection: TrendSelection) {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("get_environment_trend_aggregates_v1", {
    p_environment_id: selection.environment, p_period: selection.period,
    p_rank_filters: selection.ranks, p_deck_ids: selection.decks
  });
  if (error) throw new Error("推移データを取得できませんでした。");
  return parseEnvironmentTrends(data, selection);
}
