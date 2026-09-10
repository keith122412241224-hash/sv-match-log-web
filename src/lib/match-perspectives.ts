import { calculateWinRate } from "@/lib/analytics";
import type { Match, MatchResult, TurnOrder } from "@/types/database";

export type WinRateMode = "direct" | "combined";
export type MatchSides = Pick<Match, "my_deck_id" | "opponent_deck_id" | "my_archetype_id" | "opponent_archetype_id" | "result">;
export type PerspectiveStats = { matches: number; wins: number; losses: number; winRate: number | null };
export type DeckPerspectives = { direct: PerspectiveStats; reversed: PerspectiveStats; combined: PerspectiveStats };

export function resolveWinRateMode(value: string | undefined, scope: string): WinRateMode {
  return value === "direct" || value === "combined" ? value : scope === "all" ? "combined" : "direct";
}

export function reverseResult(result: MatchResult): MatchResult {
  return result === "win" ? "lose" : "win";
}

// Deliberately copy only aggregation fields, never player identity or player metadata.
export function reverseMatchSides(match: MatchSides): MatchSides {
  return {
    my_deck_id: match.opponent_deck_id,
    opponent_deck_id: match.my_deck_id,
    my_archetype_id: match.opponent_archetype_id,
    opponent_archetype_id: match.my_archetype_id,
    result: reverseResult(match.result)
  };
}

export function emptyPerspectiveStats(): PerspectiveStats {
  return { matches: 0, wins: 0, losses: 0, winRate: null };
}

export function summarizeDeckPerspectives(matches: MatchSides[], deckIdField: "archetype" | "deck" = "archetype") {
  const rows = new Map<string, DeckPerspectives>();
  for (const match of matches) {
    for (const source of ["direct", "reversed"] as const) {
      const view = source === "direct" ? match : reverseMatchSides(match);
      const id = deckIdField === "archetype" ? view.my_archetype_id ?? view.my_deck_id : view.my_deck_id;
      const row = rows.get(id) ?? { direct: emptyPerspectiveStats(), reversed: emptyPerspectiveStats(), combined: emptyPerspectiveStats() };
      for (const stats of [row[source], row.combined]) {
        stats.matches += 1;
        stats.wins += view.result === "win" ? 1 : 0;
        stats.losses += view.result === "lose" ? 1 : 0;
        stats.winRate = calculateWinRate(stats.wins, stats.matches);
      }
      rows.set(id, row);
    }
  }
  return rows;
}

export type AnalysisPerspective = MatchSides & {
  id: string;
  turn_order: TurnOrder;
  source: "direct" | "reversed";
};

export function analysisPerspectives(matches: Match[], mode: WinRateMode): AnalysisPerspective[] {
  return matches.flatMap((match) => {
    const direct: AnalysisPerspective = {
      id: match.id,
      my_deck_id: match.my_deck_id,
      opponent_deck_id: match.opponent_deck_id,
      my_archetype_id: match.my_archetype_id,
      opponent_archetype_id: match.opponent_archetype_id,
      result: match.result,
      turn_order: match.turn_order,
      source: "direct"
    };
    return mode === "direct" ? [direct] : [direct, {
      ...reverseMatchSides(match),
      id: match.id,
      turn_order: match.turn_order === "first" ? "second" : "first",
      source: "reversed" as const
    }];
  });
}

export function filterAnalysisPerspectives(views: AnalysisPerspective[], filters: {
  myDeckId?: string; opponentDeckId?: string; turnOrder?: string; result?: string; deckIdField: "archetype" | "deck";
}) {
  // Apply directional filters AFTER reversing, so an opponent-only deck remains discoverable.
  return views.filter((view) => {
    const myId = filters.deckIdField === "archetype" ? view.my_archetype_id : view.my_deck_id;
    const opponentId = filters.deckIdField === "archetype" ? view.opponent_archetype_id : view.opponent_deck_id;
    return (!filters.myDeckId || myId === filters.myDeckId)
      && (!filters.opponentDeckId || opponentId === filters.opponentDeckId)
      && (!filters.turnOrder || view.turn_order === filters.turnOrder)
      && (!filters.result || view.result === filters.result);
  });
}
