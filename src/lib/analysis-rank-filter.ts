import { GRANDMASTER_RATINGS, MASTER_GROUPS } from "@/constants/ranks";

export type AnalysisRankFilter = "all" | "master-plus" | "master" | "grandmaster"
  | `master:${(typeof MASTER_GROUPS)[number]["value"]}`
  | `grandmaster:${(typeof GRANDMASTER_RATINGS)[number]["value"]}`;

export const ANALYSIS_RANK_FILTERS: readonly { value: AnalysisRankFilter; label: string }[] = [
  { value: "all", label: "すべて（未登録含む）" },
  { value: "master-plus", label: "Master以上" },
  { value: "master", label: "Masterのみ" },
  { value: "grandmaster", label: "GrandMasterのみ" },
  ...MASTER_GROUPS.map(group => ({ value: `master:${group.value}` as const, label: `Master / ${group.label}` })),
  ...GRANDMASTER_RATINGS.map(rating => ({ value: `grandmaster:${rating.value}` as const, label: `GrandMaster / ${rating.label}` }))
];

// Unknown conditions must not silently expand the requested data scope.
export function parseAnalysisRankFilter(value?: string | null): AnalysisRankFilter {
  if (value === undefined || value === null || value === "") return "all";
  const option = ANALYSIS_RANK_FILTERS.find(option => option.value === value);
  if (!option) throw new Error("ランクの絞り込み条件が不正です。");
  return option.value;
}
