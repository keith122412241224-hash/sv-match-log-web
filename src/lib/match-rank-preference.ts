import { EMPTY_RANK, validateMatchRank, type MatchRank } from "@/lib/match-rank";
import { RANK_ATOMS, type RankAtomicFilter } from "@/lib/rank-selection";
import { safeGetItem, safeSetItem } from "@/lib/browser-preferences";

export function rankFromSelection(value: unknown): MatchRank {
  if (typeof value !== "string" || !RANK_ATOMS.includes(value as RankAtomicFilter) || value === "unranked") return { ...EMPTY_RANK };
  const [tier, child] = value.split(":");
  const result = validateMatchRank({ rank_tier: tier, master_group: tier === "master" ? child : null, grandmaster_rating: tier === "grandmaster" ? child : null });
  return result.ok ? result.value : { ...EMPTY_RANK };
}

export function rankToSelection(rank: MatchRank): RankAtomicFilter {
  const result = validateMatchRank(rank);
  if (!result.ok || !result.value.rank_tier) return "unranked";
  const { rank_tier: tier, master_group: group, grandmaster_rating: rating } = result.value;
  return (tier === "master" ? `master:${group}` : tier === "grandmaster" ? `grandmaster:${rating}` : tier) as RankAtomicFilter;
}

export function lastRankKey(userId?: string, guest = false): string | null {
  return guest ? "svml:last-rank:v1:guest" : userId ? `svml:last-rank:v1:user:${encodeURIComponent(userId)}` : null;
}

// The key is versioned. Only exact canonical strings are accepted, including
// unranked (all NULL); JSON, old triples and incomplete parent ranks are invalid.
export function readLastRank(key: string | null): MatchRank {
  return key ? rankFromSelection(safeGetItem(key)) : { ...EMPTY_RANK };
}

export function rememberLastRank(key: string | null, rank: MatchRank): void {
  // Preference failures must not turn a saved match into an error/retry.
  if (key) safeSetItem(key, rankToSelection(rank));
}
