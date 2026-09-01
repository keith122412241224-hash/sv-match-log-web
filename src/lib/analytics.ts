import { LOW_SAMPLE_THRESHOLD } from "@/lib/constants";
import type { Match, TurnOrder } from "@/types/database";

export type DeckLike = {
  id: string;
  name: string;
  class_name: string;
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
  deck: DeckLike;
  total: number;
  winRate: number | null;
  firstWinRate: number | null;
  secondWinRate: number | null;
  isLowSample: boolean;
  goodMatchups: WinRateSummary[];
  badMatchups: WinRateSummary[];
  recentResults: Match["result"][];
};

type DeckStats = {
  total: number;
  wins: number;
  firstTotal: number;
  firstWins: number;
  secondTotal: number;
  secondWins: number;
  recentResults: Match["result"][];
  matchups: Map<string, { total: number; wins: number }>;
};

export function calculateWinRate(wins: number, total: number) {
  if (total === 0) {
    return null;
  }

  return (wins / total) * 100;
}

export function summarizeMatches(matches: Match[]) {
  let wins = 0;
  let firstTotal = 0;
  let firstWins = 0;
  let secondTotal = 0;
  let secondWins = 0;

  for (const match of matches) {
    const won = match.result === "win";
    wins += won ? 1 : 0;

    if (match.turn_order === "first") {
      firstTotal += 1;
      firstWins += won ? 1 : 0;
    } else {
      secondTotal += 1;
      secondWins += won ? 1 : 0;
    }
  }

  return {
    total: matches.length,
    wins,
    winRate: calculateWinRate(wins, matches.length),
    firstWinRate: calculateWinRate(firstWins, firstTotal),
    secondWinRate: calculateWinRate(secondWins, secondTotal)
  };
}

export function winRateFor(matches: Match[]) {
  let wins = 0;

  for (const match of matches) {
    wins += match.result === "win" ? 1 : 0;
  }

  return calculateWinRate(wins, matches.length);
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

export function buildDeckAnalysisSummaries(
  matches: Match[],
  decks: DeckLike[],
  deckIdField: "archetype" | "deck" = "deck"
): DeckAnalysisSummary[] {
  const deckName = new Map(decks.map((deck) => [deck.id, deck.name]));
  const statsByDeckId = new Map<string, DeckStats>();

  for (const match of matches) {
    const myDeckId = deckIdField === "archetype" ? match.my_archetype_id ?? match.my_deck_id : match.my_deck_id;
    const opponentDeckId =
      deckIdField === "archetype" ? match.opponent_archetype_id ?? match.opponent_deck_id : match.opponent_deck_id;
    const stats =
      statsByDeckId.get(myDeckId) ??
      {
        total: 0,
        wins: 0,
        firstTotal: 0,
        firstWins: 0,
        secondTotal: 0,
        secondWins: 0,
        recentResults: [],
        matchups: new Map<string, { total: number; wins: number }>()
      };
    const won = match.result === "win";
    const matchup = stats.matchups.get(opponentDeckId) ?? { total: 0, wins: 0 };

    stats.total += 1;
    stats.wins += won ? 1 : 0;

    if (match.turn_order === "first") {
      stats.firstTotal += 1;
      stats.firstWins += won ? 1 : 0;
    } else {
      stats.secondTotal += 1;
      stats.secondWins += won ? 1 : 0;
    }

    if (stats.recentResults.length < 10) {
      stats.recentResults.push(match.result);
    }

    matchup.total += 1;
    matchup.wins += won ? 1 : 0;
    stats.matchups.set(opponentDeckId, matchup);
    statsByDeckId.set(myDeckId, stats);
  }

  return decks.map((deck) => {
    const stats = statsByDeckId.get(deck.id);
    const matchupRows = [...(stats?.matchups.entries() ?? [])]
      .map(([opponentDeckId, value]) => ({
        label: deckName.get(opponentDeckId) ?? "不明",
        total: value.total,
        wins: value.wins,
        winRate: calculateWinRate(value.wins, value.total)
      }))
      .filter((row) => row.total >= 5);

    return {
      deck,
      total: stats?.total ?? 0,
      winRate: calculateWinRate(stats?.wins ?? 0, stats?.total ?? 0),
      firstWinRate: calculateWinRate(stats?.firstWins ?? 0, stats?.firstTotal ?? 0),
      secondWinRate: calculateWinRate(stats?.secondWins ?? 0, stats?.secondTotal ?? 0),
      isLowSample: Boolean(stats && stats.total > 0 && stats.total < LOW_SAMPLE_THRESHOLD),
      goodMatchups: [...matchupRows]
        .sort((a, b) => (b.winRate ?? 0) - (a.winRate ?? 0) || b.total - a.total)
        .slice(0, 3),
      badMatchups: [...matchupRows]
        .sort((a, b) => (a.winRate ?? 0) - (b.winRate ?? 0) || b.total - a.total)
        .slice(0, 3),
      recentResults: stats?.recentResults ?? []
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
