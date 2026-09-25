import { calculateWinRate, type DeckAnalysisSummary, type DeckLike, type WinRateSummary } from "@/lib/analytics";
import { LOW_SAMPLE_THRESHOLD } from "@/lib/constants";
import { buildWinRateMatrixFromAggregates, type MatchupAggregate } from "@/lib/matchup-aggregates";
import type { MatchResult, TurnOrder } from "@/types/database";

type Id = string | null;
type Count = { total: number; wins: number };
export type AnalysisAggregateGroup = Count & {
  myDeckId: Id; opponentDeckId: Id; cardMyDeckId: Id; cardOpponentDeckId: Id;
  turnOrder: TurnOrder; firstOrder: number;
};
export type AnalysisRecentView = {
  id: string; playedAt: string; source: "direct" | "reversed";
  result: MatchResult; turnOrder: TurnOrder; order: number;
};
export type AnalysisAggregates = {
  version: 1; registeredMatches: number; perspectives: number; totalWins: number;
  groups: AnalysisAggregateGroup[];
  recent: { deckId: Id; views: AnalysisRecentView[] }[];
};
export type AnalysisDataFailure = "missing_rpc" | "permission" | "database" | "transport" | "invalid_response";
export class AnalysisDataError extends Error {
  constructor(public readonly kind: AnalysisDataFailure, public readonly code?: string) {
    super("分析データを取得できませんでした。");
    this.name = "AnalysisDataError";
  }
}
export function emptyAnalysisAggregates(): AnalysisAggregates {
  return { version: 1, registeredMatches: 0, perspectives: 0, totalWins: 0, groups: [], recent: [] };
}
const isCount = (v: unknown): v is number => typeof v === "number" && Number.isSafeInteger(v) && v >= 0;
const isId = (v: unknown): v is Id => v === null || (typeof v === "string" && v.length > 0);
const isTurn = (v: unknown): v is TurnOrder => v === "first" || v === "second";

// All counters, ordering metadata, partitions and bounded recent lists are checked.
// A malformed/error response must never turn into a valid empty analysis.
export function parseAnalysisAggregates(value: unknown, recentDeckIds?: readonly string[]): AnalysisAggregates {
  const fail = () => new AnalysisDataError("invalid_response");
  if (!value || typeof value !== "object") throw fail();
  const p = value as Partial<AnalysisAggregates>;
  if (p.version !== 1 || !isCount(p.registeredMatches) || !isCount(p.perspectives) || !isCount(p.totalWins)
    || p.registeredMatches > p.perspectives || p.perspectives - p.registeredMatches > p.registeredMatches
    || p.totalWins > p.perspectives || !Array.isArray(p.groups) || !Array.isArray(p.recent)) throw fail();
  const keys = new Set<string>();
  const recentIds = recentDeckIds === undefined ? null : new Set<Id>(recentDeckIds);
  const cards = new Map<Id, Count & { firstOrder: number }>();
  let total = 0, wins = 0, previous = 0;
  for (const g of p.groups) {
    if (!g || !isId(g.myDeckId) || !isId(g.opponentDeckId) || !isId(g.cardMyDeckId) || !isId(g.cardOpponentDeckId)
      || !isTurn(g.turnOrder) || !isCount(g.total) || g.total === 0 || !isCount(g.wins) || g.wins > g.total
      || !isCount(g.firstOrder) || g.firstOrder <= previous || g.firstOrder > p.perspectives) throw fail();
    const key = JSON.stringify([g.myDeckId, g.opponentDeckId, g.cardMyDeckId, g.cardOpponentDeckId, g.turnOrder]);
    if (keys.has(key)) throw fail();
    keys.add(key); previous = g.firstOrder; total += g.total; wins += g.wins;
    if (!isCount(total) || !isCount(wins)) throw fail();
    if (recentIds === null || recentIds.has(g.cardMyDeckId)) {
      const c = cards.get(g.cardMyDeckId) ?? { total: 0, wins: 0, firstOrder: g.firstOrder };
      c.total += g.total; c.wins += g.wins; cards.set(g.cardMyDeckId, c);
    }
  }
  if (total !== p.perspectives || wins !== p.totalWins || (total > 0 && p.groups[0].firstOrder !== 1)) throw fail();
  const seenDecks = new Set<Id>(), orders = new Set<number>(), views = new Set<string>();
  for (const recent of p.recent) {
    if (!recent || !isId(recent.deckId) || seenDecks.has(recent.deckId) || !Array.isArray(recent.views)) throw fail();
    const c = cards.get(recent.deckId);
    if (!c || recent.views.length !== Math.min(10, c.total)) throw fail();
    seenDecks.add(recent.deckId);
    let last = 0, recentWins = 0;
    for (const v of recent.views) {
      if (!v || typeof v.id !== "string" || !v.id || typeof v.playedAt !== "string"
        || !/^\d{4}-\d{2}-\d{2}T/.test(v.playedAt) || !Number.isFinite(Date.parse(v.playedAt))
        || (v.source !== "direct" && v.source !== "reversed") || (v.result !== "win" && v.result !== "lose")
        || !isTurn(v.turnOrder) || !isCount(v.order) || v.order <= last || v.order > p.perspectives
        || orders.has(v.order)) throw fail();
      const key = JSON.stringify([v.id, v.source]);
      if (views.has(key)) throw fail();
      views.add(key); orders.add(v.order); last = v.order; recentWins += v.result === "win" ? 1 : 0;
    }
    if (recent.views[0].order !== c.firstOrder || recentWins > c.wins
      || recent.views.length - recentWins > c.total - c.wins) throw fail();
  }
  if (seenDecks.size !== cards.size) throw fail();
  return p as AnalysisAggregates;
}

function add<K>(map: Map<K, Count>, key: K, count: Count) {
  const current = map.get(key) ?? { total: 0, wins: 0 };
  current.total += count.total; current.wins += count.wins; map.set(key, current);
}
function rows<K>(map: Map<K, Count>, label: (id: K) => string): WinRateSummary[] {
  return [...map].map(([id, c]) => ({ label: label(id), ...c, winRate: calculateWinRate(c.wins, c.total) }));
}
const summaryOrder = (a: WinRateSummary, b: WinRateSummary) => b.total - a.total || (b.winRate ?? 0) - (a.winRate ?? 0);

// Process only grouped integer counts and at most ten views per card deck.
// First-occurrence ordering re-creates the old Map insertion/stable-sort contract.
export function buildAnalysisFromAggregates(a: AnalysisAggregates, decks: DeckLike[], archetypes: DeckLike[]) {
  const visible = archetypes.length > 0 ? archetypes : decks;
  const names = new Map([...decks, ...archetypes].map(d => [d.id, d.name]));
  const cardNames = new Map(visible.map(d => [d.id, d.name]));
  const name = (id: Id) => (id === null ? undefined : names.get(id)) ?? "不明";
  const my = new Map<Id, Count>(), opponent = new Map<Id, Count>(), turns = new Map<TurnOrder, Count>();
  const pairs = new Map<string, MatchupAggregate>();
  const cards = new Map<Id, { counts: Count; first: Count; second: Count; opponents: Map<Id, Count> }>();
  for (const g of a.groups) {
    add(my, g.myDeckId, g); add(opponent, g.opponentDeckId, g); add(turns, g.turnOrder, g);
    const key = JSON.stringify([g.myDeckId, g.opponentDeckId]);
    const pair = pairs.get(key) ?? { myDeckId: g.myDeckId, opponentDeckId: g.opponentDeckId, total: 0, wins: 0 };
    pair.total += g.total; pair.wins += g.wins; pairs.set(key, pair);
    const card = cards.get(g.cardMyDeckId) ?? {
      counts: { total: 0, wins: 0 }, first: { total: 0, wins: 0 }, second: { total: 0, wins: 0 }, opponents: new Map<Id, Count>()
    };
    card.counts.total += g.total; card.counts.wins += g.wins;
    card[g.turnOrder].total += g.total; card[g.turnOrder].wins += g.wins;
    add(card.opponents, g.cardOpponentDeckId, g); cards.set(g.cardMyDeckId, card);
  }
  const recent = new Map(a.recent.map(r => [r.deckId, r.views.map(v => v.result)]));
  const summaries: DeckAnalysisSummary[] = visible.map(deck => {
    const c = cards.get(deck.id);
    const matchups = rows(c?.opponents ?? new Map<Id, Count>(), id => (id === null ? undefined : cardNames.get(id)) ?? "不明")
      .filter(r => r.total >= 5);
    return {
      deck, total: c?.counts.total ?? 0,
      winRate: calculateWinRate(c?.counts.wins ?? 0, c?.counts.total ?? 0),
      firstWinRate: calculateWinRate(c?.first.wins ?? 0, c?.first.total ?? 0),
      secondWinRate: calculateWinRate(c?.second.wins ?? 0, c?.second.total ?? 0),
      isLowSample: Boolean(c && c.counts.total > 0 && c.counts.total < LOW_SAMPLE_THRESHOLD),
      goodMatchups: [...matchups].sort((x, y) => (y.winRate ?? 0) - (x.winRate ?? 0) || y.total - x.total).slice(0, 3),
      badMatchups: [...matchups].sort((x, y) => (x.winRate ?? 0) - (y.winRate ?? 0) || y.total - x.total).slice(0, 3),
      recentResults: recent.get(deck.id) ?? []
    };
  });
  return {
    registeredMatches: a.registeredMatches, perspectives: a.perspectives, totalWins: a.totalWins,
    winRate: calculateWinRate(a.totalWins, a.perspectives),
    byMyDeck: rows(my, name).sort(summaryOrder), byOpponentDeck: rows(opponent, name).sort(summaryOrder),
    byTurn: rows(turns, id => id === "first" ? "先攻" : "後攻").sort(summaryOrder),
    matrix: buildWinRateMatrixFromAggregates({ version: 1, totalMatches: a.perspectives, groups: [...pairs.values()] }, visible, visible),
    summaries
  };
}
