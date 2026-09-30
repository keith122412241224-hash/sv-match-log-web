import { parseAnalysisPageRankFilter, type AnalysisPageRankFilter } from "@/lib/analysis-page-rank-filter";
import { normalizeRankSelection, type RankSelection } from "@/lib/rank-selection";
import { AnalysisDataError, emptyAnalysisAggregates, parseAnalysisAggregates } from "@/lib/analysis-aggregates";
import { getCurrentUser, type MatchFilters } from "@/lib/data";
import type { WinRateMode } from "@/lib/match-perspectives";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function getAnalysisAggregates(environmentId: string, mode: WinRateMode, filters: MatchFilters, recentDeckIds?: readonly string[], rankFilter: AnalysisPageRankFilter | RankSelection = "all") {
  const ranks = typeof rankFilter === "string" ? null : normalizeRankSelection(rankFilter);
  const rank = typeof rankFilter === "string" ? parseAnalysisPageRankFilter(rankFilter) : "all";
  if (!await getCurrentUser()) return emptyAnalysisAggregates();
  const supabase = await createSupabaseServerClient();
  let response;
  try {
    response = await supabase.rpc(ranks ? "get_analysis_aggregates_v3" : rank === "all" ? "get_analysis_aggregates_v1" : "get_analysis_aggregates_v2", {
      ...(ranks ? { p_rank_filters: ranks } : rank === "all" ? {} : { p_rank_filter: rank }),
      p_environment_id: environmentId || null,
      p_include_all_users: Boolean(filters.includeAllUsers),
      p_include_reversed: mode === "combined",
      p_use_archetype: filters.deckIdField === "archetype",
      p_my_deck_id: filters.myDeckId || null,
      p_opponent_deck_id: filters.opponentDeckId || null,
      p_result: filters.result || null,
      p_turn_order: filters.turnOrder || null,
      p_played_from: filters.playedAtFrom || null,
      p_played_to: filters.playedAtTo || null,
      p_recent_deck_ids: recentDeckIds === undefined ? null : [...recentDeckIds]
    });
  } catch {
    throw new AnalysisDataError("transport");
  }
  if (response.error) {
    const code = response.error.code;
    throw new AnalysisDataError(code === "PGRST202" || code === "42883" ? "missing_rpc"
      : code === "42501" || code === "PGRST301" || code === "PGRST302" ? "permission" : "database", code);
  }
  const data = parseAnalysisAggregates(response.data, recentDeckIds);
  if (mode === "direct" && (data.registeredMatches !== data.perspectives || data.recent.some(r => r.views.some(v => v.source !== "direct")))) {
    throw new AnalysisDataError("invalid_response");
  }
  return data;
}
