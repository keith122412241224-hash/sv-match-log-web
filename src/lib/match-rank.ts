import { RANKS, MASTER_GROUPS, GRANDMASTER_RATINGS, type RankTier, type MasterGroup, type GrandmasterRating } from "@/constants/ranks";

export type MatchRank = { rank_tier: RankTier | null; master_group: MasterGroup | null; grandmaster_rating: GrandmasterRating | null };
export const EMPTY_RANK: MatchRank = { rank_tier: null, master_group: null, grandmaster_rating: null };
type RankInput = { [K in keyof MatchRank]?: unknown };

// Missing legacy fields and empty form controls mean unentered; other values must validate.
export function validateMatchRank(input: RankInput): { ok: true; value: MatchRank } | { ok: false; message: string } {
  const normalize = (value: unknown) => value === undefined || value === null || value === "" ? null : value;
  const rank = normalize(input.rank_tier), group = normalize(input.master_group), rating = normalize(input.grandmaster_rating);
  if (rank === null && group === null && rating === null) return { ok: true, value: { ...EMPTY_RANK } };
  if (!RANKS.some(item => item.value === rank)) return { ok: false, message: "ランクの入力内容を確認してください。" };
  if (rank === "master") {
    if (!MASTER_GROUPS.some(item => item.value === group) || rating !== null) return { ok: false, message: "Master区分を選択し、GrandMaster区分は指定しないでください。" };
  } else if (rank === "grandmaster") {
    if (!GRANDMASTER_RATINGS.some(item => item.value === rating) || group !== null) return { ok: false, message: "GrandMaster区分を選択し、Master区分は指定しないでください。" };
  } else if (group !== null || rating !== null) return { ok: false, message: "このランクでは子区分を指定できません。" };
  return { ok: true, value: { rank_tier: rank, master_group: group, grandmaster_rating: rating } as MatchRank };
}
