import { parseEnvironmentDashboard, type EnvironmentDashboard, type EnvironmentPeriod } from "@/lib/environment-dashboard";
import { normalizeRankSelection, serializeRankSelection, type RankSelection } from "@/lib/rank-selection";

export type DashboardSelectionV2 = { environment: string; period: EnvironmentPeriod; ranks: RankSelection };
export type EnvironmentDashboardV2 = Omit<EnvironmentDashboard, "version" | "rankFilter"> & { version: 2; rankFilters: RankSelection };
export function environmentHrefV2(s: DashboardSelectionV2) {
  return `/environment?${new URLSearchParams({ environment: s.environment, period: s.period, ranks: serializeRankSelection(s.ranks) })}`;
}
export function parseEnvironmentDashboardV2(value: unknown, selection: DashboardSelectionV2): EnvironmentDashboardV2 {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("環境データの形式が不正です。");
  const v = value as Record<string, unknown>;
  const keys = ["version", "period", "rankFilters", "environmentId", "aggregatedAt", "dataThrough", "current", "previous", "decks"];
  const ranks = normalizeRankSelection(v.rankFilters);
  if (v.version !== 2 || Object.keys(v).length !== keys.length || keys.some(k => !Object.hasOwn(v, k))
    || JSON.stringify(v.rankFilters) !== JSON.stringify(ranks) || serializeRankSelection(ranks) !== serializeRankSelection(selection.ranks)) throw new Error("環境データの形式が不正です。");
  // The existing strict metric/privacy validator remains the single implementation.
  const { rankFilters: _ranks, ...metrics } = v;
  void _ranks;
  const validated = parseEnvironmentDashboard({ ...metrics, version: 1, rankFilter: "all" }, { environment: selection.environment, period: selection.period, rank: "all" });
  const { rankFilter: _rank, ...rest } = validated;
  void _rank;
  return { ...rest, version: 2, rankFilters: ranks };
}
