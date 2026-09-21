import { calculateEnvironmentIndex, calculateWinRate, matrixBand, type DeckLike, type MatrixCell } from "@/lib/analytics";
import { LOW_SAMPLE_THRESHOLD } from "@/lib/constants";

export type MatchupAggregate = {
  myDeckId: string | null;
  opponentDeckId: string | null;
  total: number;
  wins: number;
};

export type MatchupAggregates = {
  version: 1;
  totalMatches: number;
  groups: MatchupAggregate[];
};

const keyFor = (my: string | null, opponent: string | null) => JSON.stringify([my, opponent]);
const isCount = (value: unknown): value is number => typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
const isId = (value: unknown): value is string | null => value === null || (typeof value === "string" && value.length > 0);

// Reject incomplete, duplicate or malformed responses instead of displaying a false zero.
export function parseMatchupAggregates(value: unknown): MatchupAggregates {
  const invalid = () => new Error("相性表データを取得できませんでした。");
  if (!value || typeof value !== "object") throw invalid();
  const payload = value as Partial<MatchupAggregates>;
  if (payload.version !== 1 || !isCount(payload.totalMatches) || !Array.isArray(payload.groups)) throw invalid();
  const keys = new Set<string>();
  let total = 0;
  for (const group of payload.groups) {
    if (!group || !isId(group.myDeckId) || !isId(group.opponentDeckId)
      || !isCount(group.total) || group.total === 0 || !isCount(group.wins) || group.wins > group.total) throw invalid();
    const key = keyFor(group.myDeckId, group.opponentDeckId);
    if (keys.has(key)) throw invalid();
    keys.add(key);
    total += group.total;
    if (!Number.isSafeInteger(total)) throw invalid();
  }
  if (total !== payload.totalMatches) throw invalid();
  return payload as MatchupAggregates;
}

// Preserve the production matrix's deck order and cell presentation. The legacy
// buildWinRateMatrix remains unchanged for other consumers and parity tests.
export function buildWinRateMatrixFromAggregates(
  aggregates: MatchupAggregates,
  myDecks: DeckLike[],
  opponentDecks: DeckLike[]
) {
  const grouped = new Map(aggregates.groups.map(group => [keyFor(group.myDeckId, group.opponentDeckId), group]));
  return myDecks.map(myDeck => ({
    myDeck,
    cells: opponentDecks.map(opponentDeck => {
      const value = grouped.get(keyFor(myDeck.id, opponentDeck.id)) ?? { total: 0, wins: 0 };
      const winRate = calculateWinRate(value.wins, value.total);
      return {
        myDeckId: myDeck.id,
        opponentDeckId: opponentDeck.id,
        total: value.total,
        wins: value.wins,
        winRate,
        isLowSample: value.total > 0 && value.total < LOW_SAMPLE_THRESHOLD,
        band: matrixBand(winRate),
        environmentIndex: calculateEnvironmentIndex(winRate, value.total)
      } satisfies MatrixCell;
    })
  }));
}
