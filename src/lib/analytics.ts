import { LOW_SAMPLE_THRESHOLD } from "@/lib/constants";
import type { Deck, Match, TurnOrder } from "@/types/database";

export type DeckLike = {
  id: string;
  name: string;
  class_name: string;
};

export type MatchWithDecks = Match & {
  my_deck: Deck | null;
  opponent_deck: Deck | null;
};

export type WinRateSummary = {
  label: string;
  total: number;
  wins: number;
  winRate: number | null;
};

export type MatrixCell = {
  myDeckId: string;
  opponentDeckId: string;
  total: number;
  wins: number;
  winRate: number | null;
  isLowSample: boolean;
  band: "favored" | "slightly_favored" | "even" | "slightly_unfavored" | "unfavored" | "empty";
  environmentIndex: number | null;
};

export type DeckAnalysisSummary = {
  deck: Deck;
  total: number;
  winRate: number | null;
  firstWinRate: number | null;
  secondWinRate: number | null;
  isLowSample: boolean;
  goodMatchups: WinRateSummary[];
  badMatchups: WinRateSummary[];
  recentResults: Match["result"][];
};

export function calculateWinRate(wins: number, total: number) {
  if (total === 0) {
    return null;
  }

  return (wins / total) * 100;
}

export function summarizeMatches(matches: Match[]) {
  const total = matches.length;
  const wins = matches.filter((match) => match.result === "win").length;
  const firstMatches = matches.filter((match) => match.turn_order === "first");
  const secondMatches = matches.filter((match) => match.turn_order === "second");

  return {
    total,
    wins,
    winRate: calculateWinRate(wins, total),
    firstWinRate: winRateFor(firstMatches),
    secondWinRate: winRateFor(secondMatches)
  };
}

export function winRateFor(matches: Match[]) {
  return calculateWinRate(
    matches.filter((match) => match.result === "win").length,
    matches.length
  );
}

export function groupWinRates<T extends Match>(
  matches: T[],
  getKey: (match: T) => string,
  getLabel: (key: string) => string
): WinRateSummary[] {
  const map = new Map<string, { total: number; wins: number }>();

  for (const match of matches) {
    const key = getKey(match);
    const current = map.get(key) ?? { total: 0, wins: 0 };
    current.total += 1;
    current.wins += match.result === "win" ? 1 : 0;
    map.set(key, current);
  }

  return [...map.entries()]
    .map(([key, value]) => ({
      label: getLabel(key),
      total: value.total,
      wins: value.wins,
      winRate: calculateWinRate(value.wins, value.total)
    }))
    .sort((a, b) => b.total - a.total || (b.winRate ?? 0) - (a.winRate ?? 0));
}

export function turnOrderWinRates(matches: Match[]): WinRateSummary[] {
  const labels: Record<TurnOrder, string> = {
    first: "先攻",
    second: "後攻"
  };

  return groupWinRates(
    matches,
    (match) => match.turn_order,
    (key) => labels[key as TurnOrder]
  );
}

export function buildDeckAnalysisSummaries(matches: Match[], decks: Deck[]): DeckAnalysisSummary[] {
  return decks.map((deck) => {
    const deckMatches = matches.filter((match) => match.my_deck_id === deck.id);
    const matchupRows = groupWinRates(
      deckMatches,
      (match) => match.opponent_deck_id,
      (id) => decks.find((item) => item.id === id)?.name ?? "不明"
    ).filter((row) => row.total > 0);

    return {
      deck,
      total: deckMatches.length,
      winRate: winRateFor(deckMatches),
      firstWinRate: winRateFor(deckMatches.filter((match) => match.turn_order === "first")),
      secondWinRate: winRateFor(deckMatches.filter((match) => match.turn_order === "second")),
      isLowSample: deckMatches.length > 0 && deckMatches.length < LOW_SAMPLE_THRESHOLD,
      goodMatchups: [...matchupRows]
        .sort((a, b) => (b.winRate ?? 0) - (a.winRate ?? 0) || b.total - a.total)
        .slice(0, 3),
      badMatchups: [...matchupRows]
        .sort((a, b) => (a.winRate ?? 0) - (b.winRate ?? 0) || b.total - a.total)
        .slice(0, 3),
      recentResults: deckMatches.slice(0, 10).map((match) => match.result)
    };
  });
}

export function matrixBand(winRate: number | null): MatrixCell["band"] {
  if (winRate === null) {
    return "empty";
  }

  if (winRate >= 60) {
    return "favored";
  }

  if (winRate >= 50) {
    return "slightly_favored";
  }

  if (winRate >= 45) {
    return "even";
  }

  if (winRate >= 40) {
    return "slightly_unfavored";
  }

  return "unfavored";
}

export function buildWinRateMatrix(matches: Match[], myDecks: DeckLike[], opponentDecks: DeckLike[]) {
  const grouped = new Map<string, { total: number; wins: number }>();

  for (const match of matches) {
    const myId = match.my_archetype_id ?? match.my_deck_id;
    const opponentId = match.opponent_archetype_id ?? match.opponent_deck_id;
    const key = matrixKey(myId, opponentId);
    const current = grouped.get(key) ?? { total: 0, wins: 0 };
    current.total += 1;
    current.wins += match.result === "win" ? 1 : 0;
    grouped.set(key, current);
  }

  return myDecks.map((myDeck) => ({
    myDeck,
    cells: opponentDecks.map((opponentDeck) => {
      const value = grouped.get(matrixKey(myDeck.id, opponentDeck.id)) ?? { total: 0, wins: 0 };
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

export function calculateEnvironmentIndex(winRate: number | null, total: number) {
  if (winRate === null || total === 0) {
    return null;
  }

  const sampleFactor = Math.min(1, total / 20);
  return Math.round((winRate - 50) * sampleFactor * 10) / 10;
}

function matrixKey(myDeckId: string, opponentDeckId: string) {
  return `${myDeckId}:${opponentDeckId}`;
}
