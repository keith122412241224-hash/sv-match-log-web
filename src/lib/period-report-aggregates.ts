import { calculateWinRate } from "@/lib/analytics";
import { emptyPerspectiveStats, type DeckPerspectives } from "@/lib/match-perspectives";

export type PeriodReportGroup = {
  myDeckId: string | null;
  opponentDeckId: string | null;
  total: number;
  wins: number;
  firstOrdinal: number;
};
export type PeriodReportCounts = { totalMatches: number; groups: PeriodReportGroup[] };
export type PeriodReportAggregates = { version: 1; current: PeriodReportCounts; previous: PeriodReportCounts };
export type PeriodReportErrorKind = "missing_rpc" | "permission" | "database" | "invalid_json";
export class PeriodReportDataError extends Error {
  constructor(public readonly kind: PeriodReportErrorKind) {
    super("期間レポートデータを取得できませんでした。");
    this.name = "PeriodReportDataError";
  }
}

const isCount = (v: unknown): v is number => typeof v === "number" && Number.isSafeInteger(v) && v >= 0;
const isId = (v: unknown) => v === null || (typeof v === "string" && v.length > 0);
export function parsePeriodReportAggregates(value: unknown): PeriodReportAggregates {
  const invalid = () => new PeriodReportDataError("invalid_json");
  if (!value || typeof value !== "object") throw invalid();
  const data = value as Partial<PeriodReportAggregates>;
  if (data.version !== 1) throw invalid();
  for (const period of [data.current, data.previous]) {
    if (!period || !isCount(period.totalMatches) || !Array.isArray(period.groups)) throw invalid();
    let sum = 0, ordinal = 0;
    const keys = new Set<string>();
    for (const g of period.groups) {
      if (!g || !isId(g.myDeckId) || !isId(g.opponentDeckId) || !isCount(g.total) || g.total === 0
        || !isCount(g.wins) || g.wins > g.total || !isCount(g.firstOrdinal)
        || g.firstOrdinal <= ordinal || g.firstOrdinal > period.totalMatches) throw invalid();
      const key = JSON.stringify([g.myDeckId, g.opponentDeckId]);
      if (keys.has(key)) throw invalid();
      keys.add(key); ordinal = g.firstOrdinal; sum += g.total;
      if (!Number.isSafeInteger(sum) || !Number.isSafeInteger(sum * 2)) throw invalid();
    }
    if (sum !== period.totalMatches || (sum > 0 && period.groups[0].firstOrdinal !== 1)) throw invalid();
  }
  return data as PeriodReportAggregates;
}

// Iterate groups, never regenerate one element per match. SQL's ordinal preserves
// the original Map insertion order, including same-name sort ties.
export function periodDeckPerspectives(period: PeriodReportCounts, forTier: boolean) {
  const rows = new Map<string | null, DeckPerspectives>();
  const empty = (): DeckPerspectives => ({ direct: emptyPerspectiveStats(), reversed: emptyPerspectiveStats(), combined: emptyPerspectiveStats() });
  for (const g of period.groups) {
    if (forTier && (!g.myDeckId || !g.opponentDeckId || g.myDeckId === g.opponentDeckId)) continue;
    for (const source of ["direct", "reversed"] as const) {
      const id = source === "direct" ? g.myDeckId : g.opponentDeckId;
      const wins = source === "direct" ? g.wins : g.total - g.wins;
      const row = rows.get(id) ?? empty();
      for (const stats of [row[source], row.combined]) {
        stats.matches += g.total; stats.wins += wins; stats.losses += g.total - wins;
        stats.winRate = calculateWinRate(stats.wins, stats.matches);
      }
      rows.set(id, row);
    }
  }
  if (forTier) for (const g of period.groups) for (const id of [g.myDeckId, g.opponentDeckId]) {
    if (id && !rows.has(id)) rows.set(id, empty());
  }
  return rows;
}

export function periodOpponentCounts(period: PeriodReportCounts) {
  const counts = new Map<string, number>();
  for (const g of period.groups) {
    const key = g.opponentDeckId ?? "unknown";
    counts.set(key, (counts.get(key) ?? 0) + g.total);
  }
  return counts;
}

export function periodUnifiedCounts(period: PeriodReportCounts) {
  const counts = new Map<string, { totalMatches: number; deckAWins: number }>();
  for (const g of period.groups) {
    if (!g.myDeckId || !g.opponentDeckId || g.myDeckId === g.opponentDeckId) continue;
    const [a, b] = [g.myDeckId, g.opponentDeckId].sort((x, y) => x.localeCompare(y));
    const key = `${a}::${b}`, row = counts.get(key) ?? { totalMatches: 0, deckAWins: 0 };
    row.totalMatches += g.total;
    row.deckAWins += a === g.myDeckId ? g.wins : g.total - g.wins;
    counts.set(key, row);
  }
  return counts;
}
