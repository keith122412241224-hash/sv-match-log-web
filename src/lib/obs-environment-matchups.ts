import { AnalysisDataError, buildAnalysisFromAggregates, parseAnalysisAggregates } from "@/lib/analysis-aggregates";
import { buildEnvironmentViewV4, type EnvironmentDashboardV4 } from "@/lib/environment-dashboard-v4";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export type ObsMatchups = ReturnType<typeof buildAnalysisFromAggregates>["matrix"];

// Only the guarded OBS page calls this loader. The dashboard owns all boundaries
// and rank selection; never reconstruct its time window on the application side.
export async function getObsEnvironmentMatchups(dashboard: EnvironmentDashboardV4): Promise<ObsMatchups> {
  const decks = buildEnvironmentViewV4(dashboard).encounters.map(row => ({
    id: row.key, name: row.name, class_name: row.className ?? ""
  }));
  if (!decks.length) return [];
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("get_analysis_aggregates_v3_exclusive", {
    p_environment_id: dashboard.environmentId,
    p_played_from: dashboard.current.start,
    p_played_to: dashboard.current.end,
    p_rank_filters: dashboard.rankFilters,
    p_include_all_users: true,
    p_include_reversed: true,
    p_use_archetype: true,
    p_recent_deck_ids: [],
    p_my_deck_id: null, p_opponent_deck_id: null, p_result: null, p_turn_order: null
  });
  if (error) throw new AnalysisDataError("database", error.code);
  const aggregates = parseAnalysisAggregates(data, []);
  if (aggregates.perspectives !== aggregates.registeredMatches * 2) throw new AnalysisDataError("invalid_response");
  return buildAnalysisFromAggregates(aggregates, decks, decks).matrix;
}
