import { parseAnalysisRankFilter, type AnalysisRankFilter } from "@/lib/analysis-rank-filter";
import { getCurrentUser } from "@/lib/data";
import { parseMatchupAggregates, type MatchupAggregates } from "@/lib/matchup-aggregates";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { normalizeRankSelection, rankSelectionToMatrixFilter, type RankSelection } from "@/lib/rank-selection";
import { getAnalysisAggregates } from "@/lib/analysis-data";

export async function getMatchupAggregates(environmentId?: string, includeAllUsers = false, rankFilter: AnalysisRankFilter | RankSelection = "all"): Promise<MatchupAggregates> {
  const ranks = typeof rankFilter === "string" ? null : normalizeRankSelection(rankFilter);
  const rank = typeof rankFilter === "string" ? parseAnalysisRankFilter(rankFilter) : rankSelectionToMatrixFilter(ranks!);
  if (ranks && rank === null) {
    // Direct registrations only. No card/recent payload is needed for the matrix.
    const analysis = await getAnalysisAggregates(environmentId || "", "direct", { includeAllUsers, deckIdField: "archetype" }, [], ranks);
    const pairs = new Map<string, MatchupAggregates["groups"][number]>();
    for (const group of analysis.groups) {
      const key = JSON.stringify([group.myDeckId, group.opponentDeckId]);
      const pair = pairs.get(key) ?? { myDeckId: group.myDeckId, opponentDeckId: group.opponentDeckId, total: 0, wins: 0 };
      pair.total += group.total; pair.wins += group.wins; pairs.set(key, pair);
    }
    return parseMatchupAggregates({ version: 1, totalMatches: analysis.registeredMatches, groups: [...pairs.values()] });
  }
  // Match the old page's anonymous path; AppShell still redirects to login.
  if (!await getCurrentUser()) return { version: 1, totalMatches: 0, groups: [] };
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc(rank === "all" ? "get_matchup_aggregates_v1" : "get_matchup_aggregates_v2", {
    ...(rank === "all" ? {} : { p_rank_filter: rank }),
    p_environment_id: environmentId || null,
    p_include_all_users: includeAllUsers
  });
  if (error) throw new Error("相性表データを取得できませんでした。");
  return parseMatchupAggregates(data);
}
