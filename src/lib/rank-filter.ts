import { GRANDMASTER_RATINGS, MASTER_GROUPS, RANKS, type RankOption, type RankTier } from "@/constants/ranks";
import { ANALYSIS_RANK_FILTERS } from "@/lib/analysis-rank-filter";
import { ANALYSIS_PAGE_RANK_FILTERS, parseAnalysisPageRankFilter, type AnalysisPageRankFilter } from "@/lib/analysis-page-rank-filter";

export type RankFilter = AnalysisPageRankFilter | "grandmaster-plus";
export type RankFilterOption = RankOption & { value: RankFilter; fullLabel: string };
const master = RANKS.find(r => r.value === "master")!;
const grandmaster = RANKS.find(r => r.value === "grandmaster")!;
const option = (r: RankOption & { value: RankFilter }, fullLabel = r.label): RankFilterOption => ({ ...r, fullLabel });

export const RANK_FILTER_GROUPS: readonly { label: string; options: readonly RankFilterOption[] }[] = [
  { label: "すべて", options: [option({ value: "all", label: "すべて", order: 0 })] },
  { label: "通常ランク", options: RANKS.filter(r => r.order < master.order).map(r => option(r)) },
  { label: "Master", options: [
    option({ ...master, value: "master-plus", label: `${master.label}以上` }), option(master),
    ...MASTER_GROUPS.map(g => option({ ...g, value: `master:${g.value}` }, `${master.label} / ${g.label}`))
  ] },
  { label: "GrandMaster", options: [
    option({ ...grandmaster, value: "grandmaster-plus", label: `${grandmaster.label}以上` }), option(grandmaster),
    ...GRANDMASTER_RATINGS.map(g => option({ ...g, value: `grandmaster:${g.value}`, iconSrc: grandmaster.iconSrc }, `${grandmaster.label} / ${g.label}`))
  ] }
];
export const RANK_FILTER_OPTIONS = RANK_FILTER_GROUPS.flatMap(g => g.options);

// Preserve the established parser and wire values; only the cumulative GM value is new.
export function parseRankFilter(value?: string | null): RankFilter {
  return value === "grandmaster-plus" ? value : parseAnalysisPageRankFilter(value);
}
export function normalizeRankFilter(value: unknown): RankFilter {
  if (typeof value !== "string") return "all";
  try { return parseRankFilter(value); } catch { return "all"; }
}
export function rankDestinationSupport(value: RankFilter) {
  return { analysis: ANALYSIS_PAGE_RANK_FILTERS.some(r => r.value === value), matrix: ANALYSIS_RANK_FILTERS.some(r => r.value === value) };
}
export function rankTiersAtOrAbove(tier: RankTier): RankTier[] {
  const minimum = RANKS.find(r => r.value === tier)!.order;
  return RANKS.filter(r => r.order >= minimum).map(r => r.value);
}
