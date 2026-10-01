import { ENVIRONMENT_PERIODS, deckTrend, encounterRate, winRate, type EnvironmentDashboard } from "@/lib/environment-dashboard";
import type { DashboardSelectionV2 } from "@/lib/environment-dashboard-v2";
import { normalizeRankSelection, serializeRankSelection, type RankSelection } from "@/lib/rank-selection";

type Metric<T> = ({ status: "available" } & T) | ({ status: "no_data" } & { [K in keyof T]: null });
type Total = Metric<{ totalMatches: number }>;
type Encounter = Metric<{ count: number }>;
type Winrate = Metric<{ targetRegistrations: number; evaluationCount: number; wins: number }>;
type DeckPeriod = { encounter: Encounter; winrate: Winrate };
type DashboardPeriod = { start: string; end: string; total: Total };
export type EnvironmentDashboardV3 = Omit<EnvironmentDashboard, "version" | "rankFilter" | "current" | "previous" | "decks"> & {
  version: 3; rankFilters: RankSelection; current: DashboardPeriod; previous: DashboardPeriod;
  decks: { key: string; name: string; className: string | null; current: DeckPeriod; previous: DeckPeriod }[];
};

function invalid(): never { throw new Error("環境データの形式が不正です。"); }
function object(value: unknown, keys: string[]): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return invalid();
  const v = value as Record<string, unknown>;
  if (Object.keys(v).length !== keys.length || keys.some(k => !Object.hasOwn(v, k))) return invalid();
  return v;
}
const uuid = (v: unknown): v is string => typeof v === "string" && /^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i.test(v);
function timestamp(v: unknown): string {
  if (typeof v !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?(?:Z|[+-]\d{2}:\d{2})$/.test(v) || !Number.isFinite(Date.parse(v))) return invalid();
  // Date.parse accepts impossible calendar dates such as February 30 by rolling them forward.
  const wall = v.slice(0, 19);
  if (new Date(wall + "Z").toISOString().slice(0, 19) !== wall) return invalid();
  return v;
}
function metric(value: unknown, fields: string[]) {
  const v = object(value, ["status", ...fields]);
  if (!["available", "no_data"].includes(v.status as string)) return invalid();
  for (const key of fields) {
    if (v.status === "available" ? !Number.isSafeInteger(v[key]) || (v[key] as number) < 0 : v[key] !== null) return invalid();
  }
  return v;
}
function period(value: unknown): DashboardPeriod {
  const v = object(value, ["start", "end", "total"]);
  const total = metric(v.total, ["totalMatches"]) as Total;
  if (total.status === "available" && total.totalMatches! < 1) return invalid();
  return { start: timestamp(v.start), end: timestamp(v.end), total };
}
function deckPeriod(value: unknown, total: Total): DeckPeriod {
  const v = object(value, ["encounter", "winrate"]);
  const encounter = metric(v.encounter, ["count"]) as Encounter;
  const winrate = metric(v.winrate, ["targetRegistrations", "evaluationCount", "wins"]) as Winrate;
  if (total.status !== "available" && (encounter.status !== total.status || winrate.status !== total.status)) return invalid();
  if (encounter.status === "available" && (encounter.count! < 1 || encounter.count! > total.totalMatches!)) return invalid();
  if (winrate.status === "available") {
    const { targetRegistrations: r, evaluationCount: e, wins: w } = winrate;
    if (r! < 1 || r! > total.totalMatches! || e! < r! || e! > 2 * r! || w! > e!) return invalid();
    if (encounter.status === "available" && encounter.count! > r!) return invalid();
  }
  if (encounter.status === "available" && winrate.status !== "available") return invalid();
  return { encounter, winrate };
}
export function parseEnvironmentDashboardV3(value: unknown, selection: DashboardSelectionV2): EnvironmentDashboardV3 {
  const v = object(value, ["version", "period", "rankFilters", "environmentId", "aggregatedAt", "dataThrough", "current", "previous", "decks"]);
  const ranks = normalizeRankSelection(v.rankFilters);
  if (v.version !== 3 || !ENVIRONMENT_PERIODS.some(p => p.value === v.period)
    || JSON.stringify(v.rankFilters) !== JSON.stringify(ranks) || serializeRankSelection(ranks) !== serializeRankSelection(selection.ranks)
    || !uuid(v.environmentId) || v.environmentId !== selection.environment || v.period !== selection.period) return invalid();
  const aggregatedAt = timestamp(v.aggregatedAt), dataThrough = timestamp(v.dataThrough);
  const t = Date.parse(dataThrough), at = Date.parse(aggregatedAt);
  const current = period(v.current), previous = period(v.previous);
  const span = ENVIRONMENT_PERIODS.find(p => p.value === v.period)!.hours * 3600000;
  if (t % 1800000 !== 0 || at < t || at >= t + 1800000 || Date.parse(current.end) !== t
    || Date.parse(current.start) !== t - span || Date.parse(previous.end) !== t - span || Date.parse(previous.start) !== t - 2 * span) return invalid();
  if (!Array.isArray(v.decks)) return invalid();
  const seen = new Set<string>();
  const decks = v.decks.map(value => {
    const d = object(value, ["key", "name", "className", "current", "previous"]);
    if ((!uuid(d.key) && d.key !== "unclassified") || typeof d.name !== "string" || !d.name.trim()
      || (d.className !== null && typeof d.className !== "string") || seen.has(d.key as string)) return invalid();
    if (d.key === "unclassified" && (d.name !== "未分類" || d.className !== null)) return invalid();
    seen.add(d.key as string);
    return { key: d.key as string, name: d.name, className: d.className as string | null,
      current: deckPeriod(d.current, current.total), previous: deckPeriod(d.previous, previous.total) };
  });
  if (!seen.has("unclassified")) return invalid();
  for (const label of ["current", "previous"] as const) {
    const total = label === "current" ? current.total : previous.total;
    const count = decks.filter(d => d[label].encounter.status === "available").reduce((sum, d) => sum + d[label].encounter.count!, 0);
    if (total.status === "available" && count > total.totalMatches!) return invalid();
  }
  return { version: 3, period: selection.period, rankFilters: ranks, environmentId: selection.environment,
    aggregatedAt, dataThrough, current, previous, decks };
}


export function buildEnvironmentViewV3(data: EnvironmentDashboardV3) {
  const rows = data.decks.filter(d => d.key !== "unclassified" && d.current.winrate.status === "available" && d.current.winrate.targetRegistrations! > 0)
    .map(d => ({ ...d, encounterRate: d.current.encounter.status === "no_data" && data.current.total.status === "available" ? 0 : encounterRate(d.current.encounter, data.current.total),
      winRate: winRate(d.current.winrate), trend: deckTrend(d, data.current.total, data.previous.total) }));
  const stable = (a: { key: string }, b: { key: string }) => a.key < b.key ? -1 : a.key > b.key ? 1 : 0;
  return {
    rows,
    encounters: rows.filter(d => d.current.encounter.status === "available" && d.encounterRate !== null).sort((a, b) => b.encounterRate! - a.encounterRate! || stable(a, b)).slice(0, 5),
    wins: rows.filter(d => d.winRate !== null && d.current.winrate.targetRegistrations! >= 10)
      .sort((a, b) => b.winRate! - a.winRate! || b.current.winrate.targetRegistrations! - a.current.winrate.targetRegistrations! || stable(a, b)).slice(0, 5),
    increases: rows.filter(d => d.trend.state === "increase").sort((a, b) => b.trend.delta! - a.trend.delta! || stable(a, b)).slice(0, 3),
    decreases: rows.filter(d => d.trend.state === "decrease").sort((a, b) => a.trend.delta! - b.trend.delta! || stable(a, b)).slice(0, 3)
  };
}
