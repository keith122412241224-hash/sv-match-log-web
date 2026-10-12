import type { Database } from "@/types/database";
import type { MatchRank } from "@/lib/match-rank";

export const MATCH_REQUEST_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

// Compare submitted fields, not server timestamps or compatibility deck IDs
// derived from an archetype. Replays never refresh the original played_at.
export function matchesRequest(row: Database["public"]["Tables"]["matches"]["Row"], form: FormData, rank: MatchRank) {
  const sameDeck = (side: "my" | "opponent") => {
    const archetype = String(form.get(`${side}_archetype_id`) ?? "").toLowerCase();
    return archetype ? row[`${side}_archetype_id`] === archetype
      : row[`${side}_deck_id`] === String(form.get(`${side}_deck_id`) ?? "").toLowerCase();
  };
  return row.environment_id === String(form.get("environment_id") ?? "").toLowerCase()
    && row.turn_order === form.get("turn_order") && row.result === form.get("result")
    && row.rank_tier === rank.rank_tier && row.master_group === rank.master_group
    && row.grandmaster_rating === rank.grandmaster_rating && sameDeck("my") && sameDeck("opponent");
}
