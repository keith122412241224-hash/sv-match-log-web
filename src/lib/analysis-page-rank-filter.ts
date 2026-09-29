import { RANKS, type RankTier } from "@/constants/ranks";
import { ANALYSIS_RANK_FILTERS, type AnalysisRankFilter } from "@/lib/analysis-rank-filter";

// Only analysis v2 supports these additional tiers; other reports retain their existing contract.
export type AnalysisPageRankFilter = AnalysisRankFilter | RankTier;

export const ANALYSIS_PAGE_RANK_FILTERS: readonly { value: AnalysisPageRankFilter; label: string }[] = [
  ANALYSIS_RANK_FILTERS[0],
  ...RANKS.filter(rank => rank.value !== "master" && rank.value !== "grandmaster"),
  ...ANALYSIS_RANK_FILTERS.slice(1)
];

export function parseAnalysisPageRankFilter(value?: string | null): AnalysisPageRankFilter {
  if (value === undefined || value === null || value === "") return "all";
  const option = ANALYSIS_PAGE_RANK_FILTERS.find(option => option.value === value);
  if (!option) throw new Error("ランクの絞り込み条件が不正です。");
  return option.value;
}
