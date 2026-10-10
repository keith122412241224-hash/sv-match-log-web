import { ENVIRONMENT_PERIODS } from "@/lib/environment-dashboard";
import { serializeRankSelection, type RankSelection } from "@/lib/rank-selection";

// v1-v3 keep their fixed-period contract.
export const DASHBOARD_PERIODS = [...ENVIRONMENT_PERIODS, { value: "all", label: "全期間", hours: null }] as const;
export type DashboardPeriodV4 = typeof DASHBOARD_PERIODS[number]["value"];
export type DashboardSelectionV4 = { environment: string; period: DashboardPeriodV4; ranks: RankSelection };
export function normalizeDashboardPeriod(value: unknown): DashboardPeriodV4 {
  return DASHBOARD_PERIODS.find(p => p.value === value)?.value ?? "7d";
}
export function initialDashboardPeriod(value: unknown, end?: string | null, now = Date.now()): DashboardPeriodV4 {
  return value === undefined && end && Date.parse(end) <= now ? "all" : normalizeDashboardPeriod(value);
}
export function dashboardPeriodLabel(period: DashboardPeriodV4) {
  return period === "all" ? "環境全期間" : `直近${DASHBOARD_PERIODS.find(p => p.value === period)!.label}`;
}
export function environmentHrefV4(selection: DashboardSelectionV4) {
  return `/environment?${new URLSearchParams({ environment: selection.environment, period: selection.period, ranks: serializeRankSelection(selection.ranks) })}`;
}
