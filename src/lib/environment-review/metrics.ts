import { calculateWinRate } from "@/lib/analytics";
import { periodDeckPerspectives, periodOpponentCounts, periodUnifiedCounts } from "@/lib/period-report-aggregates";
import type { DeckPerspectives } from "@/lib/match-perspectives";
import { RANK_ATOMS, type RankAtomicFilter } from "@/lib/rank-selection";
import { WEEKLY_REPORT_CONFIG } from "@/lib/weekly-report-config";
import type { DeckModel, PairModel } from "./data-model";

export const REVIEW_RULE_VERSION = "environment-review-v1";
export type Rating = -2 | -1 | 0 | 1 | 2;
export type Tier = 1 | 2 | 3 | 4 | 5;
export type Rate = { count: number; wins: number; winRate: number | null };
type DeckRate = Rate & { registrations: number; encounters: number; encounterRate: number | null; useCount: number; useWinRate: number | null };
type Master = { deckId: string; name: string; className: string; isOther: boolean; contributors: number; pilots: number; topContributorShare: number | null; userEqualWinRate: number | null };
type Cell = { my: string | null; opp: string | null; wins: number; total: number; day: string; recent: boolean; rank: RankAtomicFilter; turn: "first" | "second" };
type PairBias = { a: string; b: string; contributors: number; topContributorShare: number; userEqualWinRate: number };
export type ReviewSource = {
  environmentId: string; environmentName: string; asOf: string; periodStart: string; shortPeriodStart: string;
  contributors: number; decks: Master[]; cells: Cell[]; pairBias: PairBias[];
};
export type ReviewDeck = Master & DeckRate & {
  model?: DeckModel;
  dataTier: Tier | null; eligibleCount: number; eligibleWinRate: number | null; interval95: [number, number] | null;
  short: DeckRate; byRank: Record<string, DeckRate>; byDay: Record<string, DeckRate>; byTurn: { first: Rate; second: Rate };
};
export type ReviewPair = Rate & PairBias & {
  model?: PairModel;
  a: string; b: string; dataRating: Rating | null; short: Rate; byRank: Record<string, Rate>;
  byTurn: { first: Rate; second: Rate }; interval95: [number, number] | null;
};
export type ReviewSnapshot = Omit<ReviewSource, "cells" | "decks" | "pairBias"> & {
  schemaVersion: 1 | 2; ruleVersion: string; confidenceRuleVersion: string; snapshotId: string; ranks: RankAtomicFilter[];
  environmentStart?: string; promptVersion?: string;
  weekly?: {
    start: string; matchCount: number;
    decks: Pick<ReviewDeck, "deckId" | "encounters" | "encounterRate" | "count" | "winRate" | "eligibleCount" | "eligibleWinRate">[];
    pairs: (Rate & {a: string; b: string})[];
  };
  matchCount: number; shortMatchCount: number; decks: ReviewDeck[]; pairs: ReviewPair[];
};

function rate(wins = 0, count = 0): Rate {
  return { count, wins, winRate: calculateWinRate(wins, count) };
}

// Two-sided 95% Wilson score interval. The estimate describes sampling variation;
// registrations from the same contributor are not independent observations.
export function interval95(wins: number, count: number): [number, number] | null {
  if (!count) return null;
  const p = wins / count, z = 1.96, denominator = 1 + z ** 2 / count;
  const middle = (p + z ** 2 / (2 * count)) / denominator;
  const width = z * Math.sqrt(p * (1 - p) / count + z ** 2 / (4 * count ** 2)) / denominator;
  return [Math.max(0, (middle - width) * 100), Math.min(100, (middle + width) * 100)];
}

function groupBy<T, K extends string>(values: T[], getKey: (value: T) => K) {
  const result = new Map<K,T[]>();
  for (const value of values) {
    const key = getKey(value);
    const group = result.get(key);
    if (group) group.push(value);
    else result.set(key, [value]);
  }
  return result;
}

function slice(cells: Cell[]) {
  const period = {
    totalMatches: cells.reduce((n,c) => n + c.total, 0),
    groups: cells.map((c,i) => ({ myDeckId: c.my, opponentDeckId: c.opp, total: c.total, wins: c.wins, firstOrdinal: i + 1 }))
  };
  const decks = periodDeckPerspectives(period, false);
  const encounters = periodOpponentCounts(period);
  const mirrors = new Map<string,number>();
  for (const c of cells) if (c.my && c.my === c.opp) mirrors.set(c.my,(mirrors.get(c.my) ?? 0) + c.total);
  function deck(id: string): DeckRate {
    const d = decks.get(id), count = encounters.get(id) ?? 0;
    return { ...rate(d?.combined.wins, d?.combined.matches), registrations: (d?.combined.matches ?? 0) - (mirrors.get(id) ?? 0),
      encounters: count, encounterRate: calculateWinRate(count,period.totalMatches),
      useCount: d?.direct.matches ?? 0, useWinRate: d?.direct.winRate ?? null };
  }
  const pairs = periodUnifiedCounts(period);
  function pair(key: string) {
    const p = pairs.get(key);
    return rate(p?.deckAWins, p?.totalMatches);
  }
  return { period, deck, pair, pairs };
}

function tier(row: DeckPerspectives | undefined,
  interval: [number,number] | null, isOther: boolean): Tier | null {
  if (!row || !interval || isOther || row.combined.matches < WEEKLY_REPORT_CONFIG.tier.minMatches) return null;
  const { direct, reversed, combined } = row;
  const config = WEEKLY_REPORT_CONFIG.tier;
  if (direct.matches >= config.divergenceMinMatchesPerSide && reversed.matches >= config.divergenceMinMatchesPerSide
    && Math.abs(direct.wins * reversed.matches - reversed.wins * direct.matches) * 100 >=
      config.holdDivergencePoints * direct.matches * reversed.matches) return null;
  const winRate = combined.winRate!;
  if (combined.matches >= 40 && interval[0] > 50 && winRate >= config.tier1WinRate) return 1;
  if (combined.matches >= 20 && interval[0] > 50 && winRate >= config.tier2WinRate) return 2;
  if (winRate >= config.tier3WinRate) return 3;
  if (combined.matches >= 40 && interval[1] < 45) return 5;
  return 4;
}

export function matchupRating(wins: number, count: number): Rating | null {
  if (count < WEEKLY_REPORT_CONFIG.majorMatchupMinMatches) return null;
  const numerator = wins * 100;
  if (numerator > count * 60) return 2;
  if (numerator > count * 55) return 1;
  if (numerator >= count * 45) return 0;
  if (numerator >= count * 40) return -1;
  return -2;
}

function turnRates(cells: Cell[]) {
  const totals = new Map<string,{ first: Rate; second: Rate }>();
  function add(key: string, turn: Cell["turn"], wins: number, count: number) {
    const row = totals.get(key) ?? { first: rate(), second: rate() };
    row[turn] = rate(row[turn].wins + wins, row[turn].count + count);
    totals.set(key,row);
  }
  for (const c of cells) {
    const reverse = c.turn === "first" ? "second" : "first";
    if (c.my) add(c.my,c.turn,c.wins,c.total);
    if (c.opp) add(c.opp,reverse,c.total - c.wins,c.total);
    if (!c.my || !c.opp || c.my === c.opp) continue;
    const [a,b] = [c.my,c.opp].sort();
    add(a + "::" + b, a === c.my ? c.turn : reverse, a === c.my ? c.wins : c.total - c.wins, c.total);
  }
  return (key: string) => totals.get(key) ?? { first: rate(), second: rate() };
}

export function buildReviewSnapshot(source: ReviewSource, snapshotId: string): ReviewSnapshot {
  const { cells, decks: catalog, pairBias, ...period } = source;
  const ids = new Set(catalog.map(d => d.deckId));
  if (ids.size !== catalog.length || cells.some(c =>
    !Number.isSafeInteger(c.total) || c.total <= 0 || !Number.isSafeInteger(c.wins) || c.wins < 0 || c.wins > c.total ||
    (c.my !== null && !ids.has(c.my)) || (c.opp !== null && !ids.has(c.opp)) || !RANK_ATOMS.includes(c.rank)
    || !["first","second"].includes(c.turn))) throw new Error("スナップショットの集計値が不正です。");
  const full = slice(cells), short = slice(cells.filter(c => c.recent));
  const ranked = Array.from(groupBy(cells,c => c.rank), ([key,rows]) => [key,slice(rows)] as const);
  const daily = Array.from(groupBy(cells,c => c.day), ([key,rows]) => [key,slice(rows)] as const);
  const byTurn = turnRates(cells);
  const others = new Set(catalog.filter(d => d.isOther).map(d => d.deckId));
  const eligible = periodDeckPerspectives({
    ...full.period, groups: full.period.groups.filter(g =>
      !(g.myDeckId && others.has(g.myDeckId)) && !(g.opponentDeckId && others.has(g.opponentDeckId)))
  }, true);
  const decks = catalog.map(d => {
    const r = eligible.get(d.deckId), e = r?.combined, interval = interval95(e?.wins ?? 0,e?.matches ?? 0);
    return { ...d, ...full.deck(d.deckId), short: short.deck(d.deckId), dataTier: tier(r,interval,d.isOther),
      eligibleCount: e?.matches ?? 0, eligibleWinRate: e?.winRate ?? null, interval95: interval,
      byDay: Object.fromEntries(daily.map(([day,s]) => [day,s.deck(d.deckId)])),
      byRank: Object.fromEntries(ranked.map(([key,s]) => [key,s.deck(d.deckId)])), byTurn: byTurn(d.deckId) };
  });
  const biasForPair = new Map(pairBias.map(p => [p.a + "::" + p.b,p]));
  const pairs = Array.from(full.pairs.keys()).sort().map(key => {
    const [a,b] = key.split("::"), row = full.pair(key);
    const bias = biasForPair.get(key);
    if (!bias) throw new Error("対面別の集計対象者数を取得できませんでした。");
    return { ...bias,...row, dataRating: others.has(a) || others.has(b) ? null : matchupRating(row.wins,row.count),
      interval95: interval95(row.wins,row.count), short: short.pair(key),
      byRank: Object.fromEntries(ranked.map(([keyRank,s]) => [keyRank,s.pair(key)])), byTurn: byTurn(key) };
  });
  return { ...period, snapshotId, schemaVersion: 1, ruleVersion: REVIEW_RULE_VERSION, confidenceRuleVersion: "review-confidence-v1", ranks: [...RANK_ATOMS],
    matchCount: full.period.totalMatches, shortMatchCount: short.period.totalMatches, decks, pairs };
}
