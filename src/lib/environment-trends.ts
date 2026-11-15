import { normalizeRankSelection, type RankSelection } from "@/lib/rank-selection";

export const TREND_PERIODS = [
  { value: "7d", label: "7日" }, { value: "14d", label: "14日" },
  { value: "30d", label: "30日" }, { value: "all", label: "全期間" }
] as const;
export type TrendPeriod = typeof TREND_PERIODS[number]["value"];
export type TrendMetric = "encounter" | "winrate";
export type TrendSelection = { environment: string; period: TrendPeriod; ranks: RankSelection; decks: readonly string[] };
export type TrendCatalogDeck = { id: string; name: string; class_name: string; environment_id: string | null };
export type TrendPoint = { date: string; total: number | null; encounters: number | null; registrations: number | null; evaluations: number | null; wins: number | null };
export type TrendDeck = { id: string; name: string; className: string; points: TrendPoint[] };
export type EnvironmentTrends = { version: 1; environmentId: string; period: TrendPeriod; rankFilters: RankSelection; aggregatedAt: string; dataThrough: string; decks: TrendDeck[] };
const uuid = /^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i;
function invalid(): never { throw new Error("推移データの形式が不正です。"); }
// PostgreSQL timestamps retain six fractional digits. Date.parse alone truncates
// a cutoff one microsecond after JST midnight to midnight and rejects that day.
function timestampMicros(value: string): bigint {
  const match = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.(\d{1,6}))?(?:Z|[+-]\d{2}:\d{2})$/.exec(value);
  const milliseconds = Date.parse(value);
  if (!match || !Number.isFinite(milliseconds)) return invalid();
  return BigInt(milliseconds) * BigInt(1000) + BigInt((match[1] ?? "").padEnd(6, "0").slice(3));
}
function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return invalid();
  return value as Record<string, unknown>;
}
export function parseTrendSelection(value: unknown): TrendSelection {
  const v = object(value);
  if (Object.keys(v).sort().join() !== "decks,environment,period,ranks" || typeof v.environment !== "string" || !uuid.test(v.environment)
    || !TREND_PERIODS.some(p => p.value === v.period) || !Array.isArray(v.decks) || v.decks.length < 1 || v.decks.length > 1000
    || v.decks.some(id => typeof id !== "string" || !uuid.test(id))) return invalid();
  return { environment: v.environment.toLowerCase(), period: v.period as TrendPeriod,
    ranks: normalizeRankSelection(v.ranks), decks: [...new Set<string>(v.decks.map(id => id.toLowerCase()))].sort() };
}
export function parseEnvironmentTrends(value: unknown, selection: TrendSelection): EnvironmentTrends {
  const v = object(value);
  if (v.version !== 1 || v.environmentId !== selection.environment || v.period !== selection.period
    || normalizeRankSelection(v.rankFilters).join() !== normalizeRankSelection(selection.ranks).join()
    || typeof v.aggregatedAt !== "string" || !Number.isFinite(Date.parse(v.aggregatedAt))
    || typeof v.dataThrough !== "string" || !Number.isFinite(Date.parse(v.dataThrough))
    || !Array.isArray(v.decks) || v.decks.length !== new Set(selection.decks).size) return invalid();
  const dataThrough = timestampMicros(v.dataThrough);
  if (dataThrough > timestampMicros(v.aggregatedAt)) return invalid();
  const seen = new Set<string>();
  let dates: string | undefined;
  const decks = v.decks.map(raw => {
    const d = object(raw);
    if (typeof d.id !== "string" || !selection.decks.includes(d.id) || seen.has(d.id) || typeof d.name !== "string" || !d.name
      || typeof d.className !== "string" || !Array.isArray(d.points)) return invalid();
    seen.add(d.id);
    let previous = "";
    const points = d.points.map(raw => {
      const p = object(raw);
      if (typeof p.date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(p.date)
        || !Number.isFinite(Date.parse(p.date)) || new Date(p.date).toISOString().slice(0, 10) !== p.date || p.date <= previous
        || BigInt(Date.parse(p.date + "T00:00:00+09:00")) * BigInt(1000) >= dataThrough) return invalid();
      if (previous && Date.parse(p.date) - Date.parse(previous) !== 86400000) return invalid();
      previous = p.date;
      for (const k of ["total", "encounters", "registrations", "evaluations", "wins"] as const) {
        if (p[k] !== null && (!Number.isSafeInteger(p[k]) || (p[k] as number) < (k === "wins" ? 0 : 1))) return invalid();
      }
      const point = p as TrendPoint;
      if ((point.total === null && [point.encounters, point.registrations, point.evaluations, point.wins].some(n => n !== null))
        || (point.encounters !== null && point.encounters > point.total!)
        || (point.evaluations === null ? point.registrations !== null || point.wins !== null : point.registrations === null || point.wins === null
          || point.registrations > point.total! || point.evaluations < point.registrations || point.evaluations > point.registrations * 2 || point.wins > point.evaluations)) return invalid();
      return { date: point.date, total: point.total, encounters: point.encounters, registrations: point.registrations, evaluations: point.evaluations, wins: point.wins };
    });
    const dateKey = points.map(p => p.date).join();
    if (dates !== undefined && dates !== dateKey) return invalid();
    dates = dateKey;
    const limit = selection.period === "all" ? Infinity : Number.parseInt(selection.period);
    if (points.length > limit) return invalid();
    return { id: d.id, name: d.name, className: d.className, points };
  });
  return { version: 1, environmentId: selection.environment, period: selection.period, rankFilters: normalizeRankSelection(selection.ranks),
    aggregatedAt: v.aggregatedAt, dataThrough: v.dataThrough, decks };
}
export function trendRate(point: TrendPoint, metric: TrendMetric): number | null {
  const denominator = metric === "encounter" ? point.total : point.evaluations;
  const numerator = metric === "encounter" ? point.encounters : point.wins;
  return denominator === null || numerator === null ? null : numerator / denominator * 100;
}
// Catalog order provides distinct hues; selection/metric/period changes do not alter them.
export function trendDeckColor(id: string, catalog: readonly { id: string }[]): string {
  const index = [...catalog].sort((a, b) => a.id.localeCompare(b.id)).findIndex(d => d.id === id);
  return `hsl(${(Math.max(0, index) * 137.508 + 210) % 360} 65% 36%)`;
}
export function trendLinePath(points: TrendPoint[], metric: TrendMetric, x: (i: number) => number, y: (v: number) => number) {
  let connected = false;
  return points.map((point, i) => {
    const value = trendRate(point, metric);
    if (value === null) { connected = false; return ""; }
    const command = connected ? "L" : "M"; connected = true;
    return `${command}${x(i)},${y(value)}`;
  }).join(" ");
}
