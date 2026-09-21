import { getCurrentUser } from "@/lib/data";
import { parseMatchupAggregates, type MatchupAggregates } from "@/lib/matchup-aggregates";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function getMatchupAggregates(environmentId?: string, includeAllUsers = false): Promise<MatchupAggregates> {
  // Match the old page's anonymous path; AppShell still redirects to login.
  if (!await getCurrentUser()) return { version: 1, totalMatches: 0, groups: [] };
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("get_matchup_aggregates_v1", {
    p_environment_id: environmentId || null,
    p_include_all_users: includeAllUsers
  });
  if (error) throw new Error("相性表データを取得できませんでした。");
  return parseMatchupAggregates(data);
}
