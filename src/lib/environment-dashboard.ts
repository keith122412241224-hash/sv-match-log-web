import { RANK_FILTER_OPTIONS, normalizeRankFilter, type RankFilter } from "@/lib/rank-filter";

export const ENVIRONMENT_PERIODS = [
  { value: "24h", label: "24時間", hours: 24 }, { value: "3d", label: "3日", hours: 72 },
  { value: "7d", label: "7日", hours: 168 }, { value: "30d", label: "30日", hours: 720 }
] as const;
export const ENVIRONMENT_RANKS = RANK_FILTER_OPTIONS;
export type EnvironmentPeriod = typeof ENVIRONMENT_PERIODS[number]["value"];
export type EnvironmentRank = RankFilter;
export type PublicStatus = "available" | "no_data" | "privacy_suppressed";
export type Total = { status: PublicStatus; totalMatches: number | null };
export type Encounter = { status: PublicStatus; count: number | null };
export type Winrate = { status: PublicStatus; targetRegistrations: number | null; evaluationCount: number | null; wins: number | null };
export type DeckPeriod = { encounter: Encounter; winrate: Winrate };
export type DashboardDeck = { key: string; name: string; className: string | null; current: DeckPeriod; previous: DeckPeriod };
export type DashboardPeriod = { start: string; end: string; total: Total };
export type EnvironmentDashboard = {
  version: 1; period: EnvironmentPeriod; rankFilter: EnvironmentRank; environmentId: string;
  aggregatedAt: string; dataThrough: string; current: DashboardPeriod; previous: DashboardPeriod; decks: DashboardDeck[];
};
export type DashboardSelection = { environment: string; period: EnvironmentPeriod; rank: EnvironmentRank };
export const normalizeEnvironmentPeriod = (v: unknown): EnvironmentPeriod => ENVIRONMENT_PERIODS.find(p => p.value === v)?.value ?? "7d";
export const normalizeEnvironmentRank = normalizeRankFilter;
export function environmentHref(s: DashboardSelection) {
  return `/environment?${new URLSearchParams({ environment: s.environment, period: s.period, rank: s.rank })}`;
}

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
  if (!["available", "no_data", "privacy_suppressed"].includes(v.status as string)) return invalid();
  for (const key of fields) {
    if (v.status === "available" ? !Number.isSafeInteger(v[key]) || (v[key] as number) < 0 : v[key] !== null) return invalid();
  }
  return v;
}
function period(value: unknown): DashboardPeriod {
  const v = object(value, ["start", "end", "total"]);
  const total = metric(v.total, ["totalMatches"]) as Total;
  if (total.status === "available" && total.totalMatches! < 3) return invalid();
  return { start: timestamp(v.start), end: timestamp(v.end), total };
}
function deckPeriod(value: unknown, total: Total): DeckPeriod {
  const v = object(value, ["encounter", "winrate"]);
  const encounter = metric(v.encounter, ["count"]) as Encounter;
  const winrate = metric(v.winrate, ["targetRegistrations", "evaluationCount", "wins"]) as Winrate;
  if (total.status !== "available" && (encounter.status !== total.status || winrate.status !== total.status)) return invalid();
  if (encounter.status === "available" && (encounter.count! < 3 || encounter.count! > total.totalMatches!)) return invalid();
  if (winrate.status === "available") {
    const { targetRegistrations: r, evaluationCount: e, wins: w } = winrate;
    if (r! < 3 || r! > total.totalMatches! || e! < r! || e! > 2 * r! || w! > e!) return invalid();
    if (encounter.status === "available" && encounter.count! > r!) return invalid();
  }
  if (encounter.status === "available" && winrate.status !== "available") return invalid();
  return { encounter, winrate };
}
export function parseEnvironmentDashboard(value: unknown, selection: DashboardSelection): EnvironmentDashboard {
  const v = object(value, ["version", "period", "rankFilter", "environmentId", "aggregatedAt", "dataThrough", "current", "previous", "decks"]);
  if (v.version !== 1 || !ENVIRONMENT_PERIODS.some(p => p.value === v.period) || !ENVIRONMENT_RANKS.some(r => r.value === v.rankFilter)
    || !uuid(v.environmentId) || v.environmentId !== selection.environment || v.period !== selection.period || v.rankFilter !== selection.rank) return invalid();
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
  return { version: 1, period: selection.period, rankFilter: selection.rank, environmentId: selection.environment,
    aggregatedAt, dataThrough, current, previous, decks };
}

export function encounterRate(e: Encounter, t: Total): number | null {
  return e.status === "available" && t.status === "available" && e.count !== null && t.totalMatches !== null && t.totalMatches > 0
    ? e.count / t.totalMatches * 100 : null;
}
export function winRate(w: Winrate): number | null {
  return w.status === "available" && w.wins !== null && w.evaluationCount !== null && w.evaluationCount > 0 ? w.wins / w.evaluationCount * 100 : null;
}
export function sampleLabel(w: Winrate): "サンプル不足" | "参考" | null {
  if (w.status !== "available" || w.targetRegistrations === null) return null;
  return w.targetRegistrations < 10 ? "サンプル不足" : w.targetRegistrations < 30 ? "参考" : null;
}
export type TrendState = "increase" | "decrease" | "flat" | "no_comparison" | "insufficient" | "privacy_suppressed" | "no_previous" | "no_current" | "unclassified";
export type Trend = { state: TrendState; current: number | null; previous: number | null; delta: number | null };
export function deckTrend(d: DashboardDeck, c: Total, p: Total): Trend {
  const unavailable = (state: TrendState): Trend => ({ state, current: null, previous: null, delta: null });
  if (d.key === "unclassified") return unavailable("unclassified");
  const ce = d.current.encounter, pe = d.previous.encounter;
  if ([c.status, p.status, ce.status, pe.status].includes("privacy_suppressed")) return unavailable("privacy_suppressed");
  if (c.status === "no_data" || p.status === "no_data") return unavailable("no_comparison");
  if (c.totalMatches === null || p.totalMatches === null) return unavailable("no_comparison");
  if (c.totalMatches < 30 || p.totalMatches < 30) return unavailable("insufficient");
  if (pe.status === "no_data" && ce.status === "no_data") return unavailable("no_comparison");
  if (pe.status === "no_data") return unavailable("no_previous");
  if (ce.status === "no_data") return unavailable("no_current");
  const current = encounterRate(ce, c), previous = encounterRate(pe, p);
  if (current === null || previous === null) return unavailable("no_comparison");
  // Exact rational comparison: avoid floating-point errors at +/-0.5 percentage points.
  const cross = BigInt(ce.count!) * BigInt(p.totalMatches) - BigInt(pe.count!) * BigInt(c.totalMatches);
  const denominator = BigInt(c.totalMatches) * BigInt(p.totalMatches);
  const state = BigInt(200) * cross >= denominator ? "increase" : BigInt(200) * cross <= -denominator ? "decrease" : "flat";
  return { state, current, previous, delta: current - previous };
}
export function buildEnvironmentView(data: EnvironmentDashboard) {
  const rows = data.decks.map(d => ({ ...d, encounterRate: encounterRate(d.current.encounter, data.current.total),
    winRate: winRate(d.current.winrate), sample: sampleLabel(d.current.winrate), trend: deckTrend(d, data.current.total, data.previous.total) }));
  const stable = (a: { key: string }, b: { key: string }) => a.key < b.key ? -1 : a.key > b.key ? 1 : 0;
  const classified = rows.filter(d => d.key !== "unclassified");
  return {
    rows,
    encounters: classified.filter(d => d.encounterRate !== null).sort((a, b) => b.encounterRate! - a.encounterRate! || stable(a, b)).slice(0, 5),
    wins: classified.filter(d => d.winRate !== null && d.current.winrate.targetRegistrations! >= 10)
      .sort((a, b) => b.winRate! - a.winRate! || b.current.winrate.targetRegistrations! - a.current.winrate.targetRegistrations! || stable(a, b)).slice(0, 5),
    increases: classified.filter(d => d.trend.state === "increase").sort((a, b) => b.trend.delta! - a.trend.delta! || stable(a, b)).slice(0, 3),
    decreases: classified.filter(d => d.trend.state === "decrease").sort((a, b) => a.trend.delta! - b.trend.delta! || stable(a, b)).slice(0, 3)
  };
}
export const formatEnvironmentPercent = (n: number) => `${n.toFixed(1)}%`;
export const publicStatusLabel = (s: PublicStatus) => s === "privacy_suppressed" ? "データ量が少ないため非表示" : "観測なし";
