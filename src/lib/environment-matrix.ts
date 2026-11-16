import type { DeckLike, MatrixCell } from "@/lib/analytics";
import type { MatchupAggregates } from "@/lib/matchup-aggregates";

export type EnvironmentMatrixCell = MatrixCell & { displayWinRate: number | null };

// Compare exact counts so the 40/45/55/60 boundaries remain complementary.
function environmentBand(wins: bigint, total: bigint): MatrixCell["band"] {
  const percent = wins * BigInt(100);
  if (percent > total * BigInt(60)) return "favored";
  if (percent > total * BigInt(55)) return "slightly_favored";
  if (percent >= total * BigInt(45)) return "even";
  if (percent >= total * BigInt(40)) return "slightly_unfavored";
  return "unfavored";
}

/** Aggregate registrations, not unique games. Never mutate the RPC payload.
 * O(groups + decks²); no raw match expansion, extra fetches or deduplication.
 * Only the environment matrix uses this model; personal analytics stay unchanged.
 */
export function buildEnvironmentMatrix(aggregates: MatchupAggregates, decks: DeckLike[]) {
  const key = (a: string | null, b: string | null) => JSON.stringify([a, b]);
  const groups = new Map(aggregates.groups.map(group => [key(group.myDeckId, group.opponentDeckId), group]));
  const pairs = new Map<string, { total: number; wins: number; rate: number; tenths: number }>();
  return decks.map(myDeck => ({
    myDeck,
    cells: decks.map((opponent): EnvironmentMatrixCell => {
      const base = { myDeckId: myDeck.id, opponentDeckId: opponent.id, isLowSample: false, environmentIndex: null };
      if (myDeck.id === opponent.id) {
        const mirror = groups.get(key(myDeck.id, myDeck.id));
        return { ...base, total: mirror?.total ?? 0, wins: mirror?.wins ?? 0, winRate: null, displayWinRate: null, band: "even" };
      }
      // Stable ID order makes rounding independent of display/deck selection order.
      const forward = myDeck.id < opponent.id;
      const a = forward ? myDeck.id : opponent.id, b = forward ? opponent.id : myDeck.id;
      const pairKey = key(a, b);
      let pair = pairs.get(pairKey);
      if (!pair) {
        const ab = groups.get(key(a, b)), ba = groups.get(key(b, a));
        const total = (ab?.total ?? 0) + (ba?.total ?? 0);
        const wins = (ab?.wins ?? 0) + (ba ? ba.total - ba.wins : 0);
        // Round one side to tenths using integers, including exact half ties.
        const tenths = total ? Number((BigInt(wins) * BigInt(2000) + BigInt(total)) / (BigInt(total) * BigInt(2))) : 0;
        pair = { total, wins, rate: total ? wins / total * 100 : 0, tenths };
        pairs.set(pairKey, pair);
      }
      const { total } = pair;
      const wins = forward ? pair.wins : total - pair.wins;
      return { ...base, total, wins,
        winRate: total ? (forward ? pair.rate : 100 - pair.rate) : null,
        displayWinRate: total ? (forward ? pair.tenths : 1000 - pair.tenths) / 10 : null,
        band: total ? environmentBand(BigInt(wins), BigInt(total)) : "empty"
      };
    })
  }));
}
