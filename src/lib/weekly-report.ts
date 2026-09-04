import {
  WEEKLY_REPORT_CONFIG,
  getComparisonConfidence,
  getDataConfidence,
  getMetaPresence,
  type ComparisonConfidence,
  type DataConfidence,
  type MetaPresence,
  type TierCandidate
} from "@/lib/weekly-report-config";
import { calculateWinRate } from "@/lib/analytics";
import type { DeckArchetype, Match } from "@/types/database";

export type WeeklyReportPeriod = {
  startDate: string;
  endDate: string;
  startIso: string;
  endIso: string;
};

export type OpponentDeckRankingRow = {
  deckId: string;
  deckName: string;
  className: string;
  matches: number;
  share: number;
  rank: number;
  previousMatches: number;
  previousShare: number;
  previousRank: number | null;
  shareChange: number;
  rankChange: number | null;
  confidence: DataConfidence;
  comparisonNote: string | null;
};

export type MyDeckWinRateRow = {
  deckId: string;
  deckName: string;
  className: string;
  matches: number;
  wins: number;
  losses: number;
  winRate: number | null;
  previousMatches: number;
  previousWinRate: number | null;
  winRateChange: number | null;
  isWinRateComparisonReliable: boolean;
  comparisonNote: string | null;
  rank: number;
  confidence: DataConfidence;
  isRankingEligible: boolean;
};

export type UnifiedMatchupRow = {
  deckAId: string;
  deckA: string;
  deckAClassName: string;
  deckBId: string;
  deckB: string;
  deckBClassName: string;
  totalMatches: number;
  deckAWins: number;
  deckBWins: number;
  deckAWinRate: number | null;
  deckBWinRate: number | null;
  previousTotalMatches: number;
  previousDeckAWinRate: number | null;
  deckAWinRateChange: number | null;
  isComparisonReliable: boolean;
  comparisonNote: string | null;
  confidence: DataConfidence;
};

export type TierCandidateRow = {
  deckId: string;
  deckName: string;
  className: string;
  suggestedTier: TierCandidate;
  finalTier: TierCandidate;
  matches: number;
  winRate: number | null;
  opponentMatches: number;
  encounterShare: number;
  majorMatchupWinRate: number | null;
  weightedMajorMatchupWinRate: number | null;
  strengthScore: number;
  metaPresence: MetaPresence;
  confidence: DataConfidence;
  warnings: string[];
  reasons: string[];
};

export type CorrelationEdge = {
  advantagedDeck: string;
  disadvantagedDeck: string;
  winRate: number;
  matches: number;
  confidence: DataConfidence;
  isReferenceValue: boolean;
};

export type WeeklyReportChanges = {
  encounterShareUp: OpponentDeckRankingRow[];
  encounterShareDown: OpponentDeckRankingRow[];
  winRateUp: MyDeckWinRateRow[];
  winRateDown: MyDeckWinRateRow[];
  newDecks: OpponentDeckRankingRow[];
  matchupChanges: UnifiedMatchupRow[];
};

export type WeeklyReportData = {
  period: WeeklyReportPeriod;
  previousPeriod: WeeklyReportPeriod;
  totalMatches: number;
  previousTotalMatches: number;
  comparisonConfidence: ComparisonConfidence;
  dataQualityWarnings: string[];
  opponentDeckRanking: OpponentDeckRankingRow[];
  myDeckWinRates: MyDeckWinRateRow[];
  unifiedMatchups: UnifiedMatchupRow[];
  changes: WeeklyReportChanges;
  tierCandidates: TierCandidateRow[];
  correlation: CorrelationEdge[];
  aiJson: WeeklyReportAiJson;
  aiPrompt: string;
};

export type WeeklyReportAiJson = {
  period: {
    timeZone: string;
    startDate: string;
    endDate: string;
    previousStartDate: string;
    previousEndDate: string;
  };
  summary: {
    totalMatches: number;
    previousTotalMatches: number;
    matchDelta: number;
    comparisonConfidence: ComparisonConfidence;
    dataQualityWarnings: string[];
  };
  opponentDeckRanking: Omit<OpponentDeckRankingRow, "deckId">[];
  myDeckWinRates: Omit<MyDeckWinRateRow, "deckId">[];
  changes: {
    encounterShareUp: Pick<OpponentDeckRankingRow, "deckName" | "matches" | "share" | "shareChange" | "confidence">[];
    encounterShareDown: Pick<OpponentDeckRankingRow, "deckName" | "matches" | "share" | "shareChange" | "confidence">[];
    winRateUp: Pick<MyDeckWinRateRow, "deckName" | "matches" | "winRate" | "winRateChange" | "confidence">[];
    winRateDown: Pick<MyDeckWinRateRow, "deckName" | "matches" | "winRate" | "winRateChange" | "confidence">[];
    newDecks: Pick<OpponentDeckRankingRow, "deckName" | "matches" | "share" | "confidence">[];
    matchupChanges: Pick<UnifiedMatchupRow, "deckA" | "deckB" | "totalMatches" | "deckAWinRate" | "deckAWinRateChange" | "confidence">[];
  };
  tierCandidates: Array<
    Omit<
      TierCandidateRow,
      "deckId" | "strengthScore" | "metaPresence" | "reasons"
    >
  >;
  matchups: Omit<UnifiedMatchupRow, "deckAId" | "deckBId">[];
  correlation: CorrelationEdge[];
  notes: string[];
};

type WeeklyMatch = Pick<Match, "id" | "my_deck_id" | "opponent_deck_id" | "my_archetype_id" | "opponent_archetype_id" | "result" | "played_at">;

type DeckInfo = {
  id: string;
  name: string;
  className: string;
};

type CountStats = {
  matches: number;
  wins: number;
};

const DAY_MS = 24 * 60 * 60 * 1000;

export function getDefaultWeeklyReportStartDate(now = new Date()) {
  const parts = getJstParts(now);
  const todayStartUtc = Date.UTC(parts.year, parts.month - 1, parts.day) - 9 * 60 * 60 * 1000;
  const yesterdayStartJstAsUtc = todayStartUtc - DAY_MS;
  return toJstDateInput(new Date(yesterdayStartJstAsUtc - 6 * DAY_MS));
}

export function buildWeeklyPeriod(startDate: string, endDate?: string): WeeklyReportPeriod {
  const normalized = /^\d{4}-\d{2}-\d{2}$/.test(startDate) ? startDate : getDefaultWeeklyReportStartDate();
  const start = new Date(`${normalized}T00:00:00+09:00`);
  const normalizedEnd = /^\d{4}-\d{2}-\d{2}$/.test(endDate ?? "")
    ? endDate!
    : toJstDateInput(new Date(start.getTime() + 6 * DAY_MS));
  const endStart = new Date(`${normalizedEnd}T00:00:00+09:00`);
  const effectiveEndStart = endStart.getTime() >= start.getTime() ? endStart : start;
  const end = new Date(effectiveEndStart.getTime() + DAY_MS - 1);

  return {
    startDate: normalized,
    endDate: toJstDateInput(end),
    startIso: start.toISOString(),
    endIso: end.toISOString()
  };
}

export function shiftWeeklyPeriod(period: WeeklyReportPeriod, days: number): WeeklyReportPeriod {
  const start = new Date(new Date(`${period.startDate}T00:00:00+09:00`).getTime() + days * DAY_MS);
  const end = new Date(new Date(`${period.endDate}T00:00:00+09:00`).getTime() + days * DAY_MS);
  return buildWeeklyPeriod(toJstDateInput(start), toJstDateInput(end));
}

export function getWeeklyReportPeriodDayCount(period: WeeklyReportPeriod) {
  const start = new Date(`${period.startDate}T00:00:00+09:00`);
  const end = new Date(`${period.endDate}T00:00:00+09:00`);
  return Math.max(1, Math.round((end.getTime() - start.getTime()) / DAY_MS) + 1);
}

export function getPreviousWeeklyReportPeriod(period: WeeklyReportPeriod) {
  return shiftWeeklyPeriod(period, -getWeeklyReportPeriodDayCount(period));
}

export function buildWeeklyReport(matches: WeeklyMatch[], previousMatches: WeeklyMatch[], archetypes: DeckArchetype[], period: WeeklyReportPeriod): WeeklyReportData {
  const previousPeriod = getPreviousWeeklyReportPeriod(period);
  const comparisonConfidence = getComparisonConfidence(matches.length, previousMatches.length);
  const dataQualityWarnings = buildDataQualityWarnings(matches.length, previousMatches.length, comparisonConfidence);
  const deckInfo = buildDeckInfo(archetypes);
  const opponentDeckRanking = buildOpponentDeckRanking(matches, previousMatches, deckInfo, comparisonConfidence);
  const myDeckWinRates = buildMyDeckWinRates(matches, previousMatches, deckInfo);
  const unifiedMatchups = buildUnifiedMatchups(matches, previousMatches, deckInfo);
  const tierCandidates = buildTierCandidates(myDeckWinRates, opponentDeckRanking, unifiedMatchups);
  const correlation = buildCorrelation(unifiedMatchups);
  const changes = buildChanges(opponentDeckRanking, myDeckWinRates, unifiedMatchups, comparisonConfidence);
  const aiJson = buildAiJson({
    period,
    previousPeriod,
    totalMatches: matches.length,
    previousTotalMatches: previousMatches.length,
    comparisonConfidence,
    dataQualityWarnings,
    opponentDeckRanking,
    myDeckWinRates,
    changes,
    tierCandidates,
    unifiedMatchups,
    correlation
  });

  return {
    period,
    previousPeriod,
    totalMatches: matches.length,
    previousTotalMatches: previousMatches.length,
    comparisonConfidence,
    dataQualityWarnings,
    opponentDeckRanking,
    myDeckWinRates,
    unifiedMatchups,
    changes,
    tierCandidates,
    correlation,
    aiJson,
    aiPrompt: buildWeeklyReportPrompt(aiJson)
  };
}

function buildDeckInfo(archetypes: DeckArchetype[]) {
  return new Map<string, DeckInfo>(
    archetypes.map((deck) => [
      deck.id,
      {
        id: deck.id,
        name: deck.name || "不明",
        className: deck.class_name || "不明"
      }
    ])
  );
}

function getDeckInfo(deckInfo: Map<string, DeckInfo>, id: string | null) {
  if (id && deckInfo.has(id)) {
    return deckInfo.get(id)!;
  }

  return {
    id: id ?? "unknown",
    name: "不明",
    className: "不明"
  };
}

function getMyDeckId(match: WeeklyMatch) {
  return match.my_archetype_id ?? match.my_deck_id;
}

function getOpponentDeckId(match: WeeklyMatch) {
  return match.opponent_archetype_id ?? match.opponent_deck_id;
}

function buildOpponentDeckRanking(
  matches: WeeklyMatch[],
  previousMatches: WeeklyMatch[],
  deckInfo: Map<string, DeckInfo>,
  comparisonConfidence: ComparisonConfidence
): OpponentDeckRankingRow[] {
  const current = countBy(matches, getOpponentDeckId);
  const previous = countBy(previousMatches, getOpponentDeckId);
  const previousRows = rankedCountRows(previous, previousMatches.length, deckInfo);
  const previousRank = new Map(previousRows.map((row) => [row.deckId, row.rank]));
  const previousShare = new Map(previousRows.map((row) => [row.deckId, row.share]));
  const previousCount = new Map(previousRows.map((row) => [row.deckId, row.matches]));

  return rankedCountRows(current, matches.length, deckInfo).map((row) => ({
    ...row,
    previousMatches: previousCount.get(row.deckId) ?? 0,
    previousShare: previousShare.get(row.deckId) ?? 0,
    previousRank: previousRank.get(row.deckId) ?? null,
    shareChange: row.share - (previousShare.get(row.deckId) ?? 0),
    rankChange: previousRank.has(row.deckId) ? previousRank.get(row.deckId)! - row.rank : null,
    confidence: getDataConfidence(row.matches),
    comparisonNote: comparisonConfidence === "low" ? "前期間比較は参考値" : null
  }));
}

function rankedCountRows(counts: Map<string, number>, totalMatches: number, deckInfo: Map<string, DeckInfo>) {
  return [...counts.entries()]
    .map(([deckId, matches]) => {
      const deck = getDeckInfo(deckInfo, deckId);
      return {
        deckId: deck.id,
        deckName: deck.name,
        className: deck.className,
        matches,
        share: totalMatches > 0 ? (matches / totalMatches) * 100 : 0
      };
    })
    .sort((a, b) => b.matches - a.matches || b.share - a.share || a.deckName.localeCompare(b.deckName, "ja"))
    .map((row, index) => ({ ...row, rank: index + 1 }));
}

function buildMyDeckWinRates(matches: WeeklyMatch[], previousMatches: WeeklyMatch[], deckInfo: Map<string, DeckInfo>): MyDeckWinRateRow[] {
  const current = countWinsBy(matches, getMyDeckId);
  const previous = countWinsBy(previousMatches, getMyDeckId);
  const previousWinRate = new Map([...previous.entries()].map(([deckId, value]) => [deckId, calculateWinRate(value.wins, value.matches)]));

  return [...current.entries()]
    .map(([deckId, value]) => {
      const deck = getDeckInfo(deckInfo, deckId);
      const winRate = calculateWinRate(value.wins, value.matches);
      const prevRate = previousWinRate.get(deckId) ?? null;
      return {
        deckId: deck.id,
        deckName: deck.name,
        className: deck.className,
        matches: value.matches,
        wins: value.wins,
        losses: value.matches - value.wins,
        winRate,
        previousMatches: previous.get(deckId)?.matches ?? 0,
        previousWinRate: prevRate,
        winRateChange: winRate !== null && prevRate !== null ? winRate - prevRate : null,
        isWinRateComparisonReliable:
          value.matches >= WEEKLY_REPORT_CONFIG.comparison.minWinRateComparisonMatches &&
          (previous.get(deckId)?.matches ?? 0) >= WEEKLY_REPORT_CONFIG.comparison.minWinRateComparisonMatches,
        comparisonNote:
          prevRate !== null && (previous.get(deckId)?.matches ?? 0) < WEEKLY_REPORT_CONFIG.comparison.minWinRateComparisonMatches
            ? `前期間${previous.get(deckId)?.matches ?? 0}戦のため参考値`
            : null,
        rank: 0,
        confidence: getDataConfidence(value.matches),
        isRankingEligible: value.matches >= WEEKLY_REPORT_CONFIG.winRateRankingMinMatches
      };
    })
    .sort((a, b) => {
      const eligible = Number(b.isRankingEligible) - Number(a.isRankingEligible);
      return eligible || (b.winRate ?? 0) - (a.winRate ?? 0) || b.matches - a.matches || a.deckName.localeCompare(b.deckName, "ja");
    })
    .map((row, index) => ({ ...row, rank: index + 1 }));
}

function buildUnifiedMatchups(matches: WeeklyMatch[], previousMatches: WeeklyMatch[], deckInfo: Map<string, DeckInfo>) {
  const current = countUnifiedMatchups(matches);
  const previous = countUnifiedMatchups(previousMatches);

  return [...current.entries()]
    .map(([key, value]) => {
      const [deckAId, deckBId] = key.split("::");
      const deckA = getDeckInfo(deckInfo, deckAId);
      const deckB = getDeckInfo(deckInfo, deckBId);
      const previousValue = previous.get(key);
      const deckAWinRate = calculateWinRate(value.deckAWins, value.totalMatches);
      const previousDeckAWinRate = previousValue ? calculateWinRate(previousValue.deckAWins, previousValue.totalMatches) : null;
      return {
        deckAId,
        deckA: deckA.name,
        deckAClassName: deckA.className,
        deckBId,
        deckB: deckB.name,
        deckBClassName: deckB.className,
        totalMatches: value.totalMatches,
        deckAWins: value.deckAWins,
        deckBWins: value.totalMatches - value.deckAWins,
        deckAWinRate,
        deckBWinRate: calculateWinRate(value.totalMatches - value.deckAWins, value.totalMatches),
        previousTotalMatches: previousValue?.totalMatches ?? 0,
        previousDeckAWinRate,
        deckAWinRateChange: deckAWinRate !== null && previousDeckAWinRate !== null ? deckAWinRate - previousDeckAWinRate : null,
        isComparisonReliable:
          value.totalMatches >= WEEKLY_REPORT_CONFIG.comparison.minMatchupComparisonMatches &&
          (previousValue?.totalMatches ?? 0) >= WEEKLY_REPORT_CONFIG.comparison.minMatchupComparisonMatches,
        comparisonNote:
          previousValue && previousValue.totalMatches < WEEKLY_REPORT_CONFIG.comparison.minMatchupComparisonMatches
            ? `前期間${previousValue.totalMatches}戦のため参考値`
            : null,
        confidence: getDataConfidence(value.totalMatches)
      };
    })
    .sort((a, b) => b.totalMatches - a.totalMatches || a.deckA.localeCompare(b.deckA, "ja") || a.deckB.localeCompare(b.deckB, "ja"));
}

function countUnifiedMatchups(matches: WeeklyMatch[]) {
  const grouped = new Map<string, { totalMatches: number; deckAWins: number }>();

  for (const match of matches) {
    const myDeckId = getMyDeckId(match);
    const opponentDeckId = getOpponentDeckId(match);

    if (!myDeckId || !opponentDeckId || myDeckId === opponentDeckId) {
      continue;
    }

    const [deckAId, deckBId] = [myDeckId, opponentDeckId].sort((a, b) => a.localeCompare(b));
    const key = `${deckAId}::${deckBId}`;
    const current = grouped.get(key) ?? { totalMatches: 0, deckAWins: 0 };
    const myDeckIsA = myDeckId === deckAId;
    const deckAWon = myDeckIsA ? match.result === "win" : match.result === "lose";

    current.totalMatches += 1;
    current.deckAWins += deckAWon ? 1 : 0;
    grouped.set(key, current);
  }

  return grouped;
}

function buildTierCandidates(
  winRates: MyDeckWinRateRow[],
  opponentRanking: OpponentDeckRankingRow[],
  matchups: UnifiedMatchupRow[]
): TierCandidateRow[] {
  const encounterByDeck = new Map(opponentRanking.map((row) => [row.deckId, row]));

  return winRates.map((row) => {
    const encounter = encounterByDeck.get(row.deckId);
    const weightedMajorMatchupWinRate = weightedMajorMatchupWinRateFor(row.deckId, matchups);
    const majorMatchupWinRate = weightedMajorMatchupWinRate;
    const warnings: string[] = [];
    const reasons: string[] = [];

    if (row.confidence === "insufficient") {
      warnings.push("サンプル不足");
    } else if (row.confidence === "reference") {
      warnings.push("参考値");
    }

    const opponentSideWinRate = estimateOpponentSideDeckWinRate(row.deckId, matchups);
    if (row.winRate !== null && opponentSideWinRate !== null && Math.abs(row.winRate - opponentSideWinRate) >= WEEKLY_REPORT_CONFIG.tier.holdDivergencePoints) {
      warnings.push("データ乖離あり");
    }

    const strengthScore = calculateStrengthScore(row, majorMatchupWinRate);
    const metaPresence = getMetaPresence(encounter?.share ?? 0);
    const suggestedTier = suggestTier(row, strengthScore, warnings);
    reasons.push(`${row.matches}戦で勝率${formatNumber(row.winRate)}%`);
    reasons.push(`遭遇率${formatNumber(encounter?.share ?? 0)}%（${encounter?.matches ?? 0}戦）`);

    if (majorMatchupWinRate !== null) {
      reasons.push(`主要対面勝率${formatNumber(majorMatchupWinRate)}%`);
    }

    if (row.isWinRateComparisonReliable && row.winRateChange !== null) {
      reasons.push(`前期間比${formatNumber(row.winRateChange)}pt`);
    }

    return {
      deckId: row.deckId,
      deckName: row.deckName,
      className: row.className,
      suggestedTier,
      finalTier: suggestedTier,
      matches: row.matches,
      winRate: row.winRate,
      opponentMatches: encounter?.matches ?? 0,
      encounterShare: encounter?.share ?? 0,
      majorMatchupWinRate,
      weightedMajorMatchupWinRate,
      strengthScore,
      metaPresence,
      confidence: row.confidence,
      warnings,
      reasons
    };
  });
}

function suggestTier(row: MyDeckWinRateRow, strengthScore: number, warnings: string[]): TierCandidate {
  if (row.matches < WEEKLY_REPORT_CONFIG.tier.minMatches || warnings.includes("データ乖離あり")) {
    return "評価保留";
  }

  if ((row.winRate ?? 0) >= WEEKLY_REPORT_CONFIG.tier.tier1WinRate && strengthScore >= WEEKLY_REPORT_CONFIG.tier.strengthScore.tier1) {
    return "Tier1";
  }

  if ((row.winRate ?? 0) >= WEEKLY_REPORT_CONFIG.tier.tier15WinRate && strengthScore >= WEEKLY_REPORT_CONFIG.tier.strengthScore.tier15) {
    return "Tier1.5";
  }

  if ((row.winRate ?? 0) >= WEEKLY_REPORT_CONFIG.tier.tier2WinRate && strengthScore >= WEEKLY_REPORT_CONFIG.tier.strengthScore.tier2) {
    return "Tier2";
  }

  return "Tier3";
}

function weightedMajorMatchupWinRateFor(deckId: string, matchups: UnifiedMatchupRow[]) {
  const values = matchups.flatMap((matchup) => {
    if (matchup.totalMatches < WEEKLY_REPORT_CONFIG.majorMatchupMinMatches) {
      return [];
    }

    if (matchup.deckAId === deckId && matchup.deckAWinRate !== null) {
      return [{ winRate: matchup.deckAWinRate, matches: matchup.totalMatches }];
    }

    if (matchup.deckBId === deckId && matchup.deckBWinRate !== null) {
      return [{ winRate: matchup.deckBWinRate, matches: matchup.totalMatches }];
    }

    return [];
  });

  if (values.length === 0) {
    return null;
  }

  const totalMatches = values.reduce((sum, value) => sum + value.matches, 0);
  return values.reduce((sum, value) => sum + value.winRate * value.matches, 0) / totalMatches;
}

function calculateStrengthScore(row: MyDeckWinRateRow, majorMatchupWinRate: number | null) {
  const weights = WEEKLY_REPORT_CONFIG.tier.strengthWeights;
  const winRateScore = clampScore((((row.winRate ?? 50) - 40) / 25) * 100);
  const matchupScore = clampScore(((((majorMatchupWinRate ?? row.winRate ?? 50) - 40) / 25) * 100));
  const confidenceScore = row.confidence === "sufficient" ? 100 : row.confidence === "reference" ? 65 : 25;
  const trendScore = row.isWinRateComparisonReliable && row.winRateChange !== null ? clampScore(50 + row.winRateChange * 3) : 50;

  return (
    winRateScore * weights.winRate +
    matchupScore * weights.majorMatchup +
    confidenceScore * weights.sampleConfidence +
    trendScore * weights.trend
  );
}

function estimateOpponentSideDeckWinRate(deckId: string, matchups: UnifiedMatchupRow[]) {
  let wins = 0;
  let total = 0;

  for (const matchup of matchups) {
    if (matchup.deckAId === deckId) {
      wins += matchup.deckAWins;
      total += matchup.totalMatches;
    } else if (matchup.deckBId === deckId) {
      wins += matchup.deckBWins;
      total += matchup.totalMatches;
    }
  }

  return calculateWinRate(wins, total);
}

function buildCorrelation(matchups: UnifiedMatchupRow[]): CorrelationEdge[] {
  return matchups.flatMap((matchup) => {
    if (matchup.totalMatches < WEEKLY_REPORT_CONFIG.correlationMinMatches || matchup.deckAWinRate === null || matchup.deckBWinRate === null) {
      return [];
    }

    const deckAAdvantaged = matchup.deckAWinRate >= WEEKLY_REPORT_CONFIG.correlationAdvantageWinRate;
    const deckBAdvantaged = matchup.deckBWinRate >= WEEKLY_REPORT_CONFIG.correlationAdvantageWinRate;

    if (!deckAAdvantaged && !deckBAdvantaged) {
      return [];
    }

    const advantagedDeck = deckAAdvantaged ? matchup.deckA : matchup.deckB;
    const disadvantagedDeck = deckAAdvantaged ? matchup.deckB : matchup.deckA;
    const winRate = deckAAdvantaged ? matchup.deckAWinRate : matchup.deckBWinRate;

    return [
      {
        advantagedDeck,
        disadvantagedDeck,
        winRate,
        matches: matchup.totalMatches,
        confidence: matchup.confidence,
        isReferenceValue: matchup.confidence !== "sufficient"
      }
    ];
  });
}

function buildChanges(
  opponentDeckRanking: OpponentDeckRankingRow[],
  myDeckWinRates: MyDeckWinRateRow[],
  unifiedMatchups: UnifiedMatchupRow[],
  comparisonConfidence: ComparisonConfidence
): WeeklyReportChanges {
  return {
    encounterShareUp: opponentDeckRanking
      .filter((row) => row.shareChange >= WEEKLY_REPORT_CONFIG.change.minShareChangePoints)
      .sort((a, b) => b.shareChange - a.shareChange)
      .slice(0, 3),
    encounterShareDown: opponentDeckRanking
      .filter((row) => row.shareChange <= -WEEKLY_REPORT_CONFIG.change.minShareChangePoints)
      .sort((a, b) => a.shareChange - b.shareChange)
      .slice(0, 3),
    winRateUp: myDeckWinRates
      .filter((row) => row.isRankingEligible && row.isWinRateComparisonReliable && row.winRateChange !== null && row.winRateChange >= WEEKLY_REPORT_CONFIG.change.minWinRateChangePoints)
      .sort((a, b) => (b.winRateChange ?? 0) - (a.winRateChange ?? 0))
      .slice(0, 3),
    winRateDown: myDeckWinRates
      .filter((row) => row.isRankingEligible && row.isWinRateComparisonReliable && row.winRateChange !== null && row.winRateChange <= -WEEKLY_REPORT_CONFIG.change.minWinRateChangePoints)
      .sort((a, b) => (a.winRateChange ?? 0) - (b.winRateChange ?? 0))
      .slice(0, 3),
    newDecks: opponentDeckRanking
      .filter((row) => comparisonConfidence !== "low" && row.previousMatches === 0 && row.matches >= WEEKLY_REPORT_CONFIG.change.minNewDeckMatches)
      .slice(0, 3),
    matchupChanges: unifiedMatchups
      .filter(
        (row) =>
          row.totalMatches >= WEEKLY_REPORT_CONFIG.majorMatchupMinMatches &&
          row.isComparisonReliable &&
          row.deckAWinRateChange !== null &&
          Math.abs(row.deckAWinRateChange) >= WEEKLY_REPORT_CONFIG.change.minMatchupWinRateChangePoints
      )
      .sort((a, b) => Math.abs(b.deckAWinRateChange ?? 0) - Math.abs(a.deckAWinRateChange ?? 0))
      .slice(0, 5)
  };
}

function buildAiJson(input: {
  period: WeeklyReportPeriod;
  previousPeriod: WeeklyReportPeriod;
  totalMatches: number;
  previousTotalMatches: number;
  comparisonConfidence: ComparisonConfidence;
  dataQualityWarnings: string[];
  opponentDeckRanking: OpponentDeckRankingRow[];
  myDeckWinRates: MyDeckWinRateRow[];
  changes: WeeklyReportChanges;
  tierCandidates: TierCandidateRow[];
  unifiedMatchups: UnifiedMatchupRow[];
  correlation: CorrelationEdge[];
}): WeeklyReportAiJson {
  return {
    period: {
      timeZone: WEEKLY_REPORT_CONFIG.timeZone,
      startDate: input.period.startDate,
      endDate: input.period.endDate,
      previousStartDate: input.previousPeriod.startDate,
      previousEndDate: input.previousPeriod.endDate
    },
    summary: {
      totalMatches: input.totalMatches,
      previousTotalMatches: input.previousTotalMatches,
      matchDelta: input.totalMatches - input.previousTotalMatches,
      comparisonConfidence: input.comparisonConfidence,
      dataQualityWarnings: input.dataQualityWarnings
    },
    opponentDeckRanking: input.opponentDeckRanking.slice(0, 12).map((row) => roundObject(omitOpponentDeckId(row))),
    myDeckWinRates: input.myDeckWinRates.filter((row) => row.isRankingEligible).map((row) => roundObject(omitMyDeckId(row))),
    changes: {
      encounterShareUp: input.changes.encounterShareUp.map(({ deckName, matches, share, shareChange, confidence }) => roundObject({ deckName, matches, share, shareChange, confidence })),
      encounterShareDown: input.changes.encounterShareDown.map(({ deckName, matches, share, shareChange, confidence }) => roundObject({ deckName, matches, share, shareChange, confidence })),
      winRateUp: input.changes.winRateUp.map(({ deckName, matches, winRate, winRateChange, confidence }) => roundObject({ deckName, matches, winRate, winRateChange, confidence })),
      winRateDown: input.changes.winRateDown.map(({ deckName, matches, winRate, winRateChange, confidence }) => roundObject({ deckName, matches, winRate, winRateChange, confidence })),
      newDecks: input.changes.newDecks.map(({ deckName, matches, share, confidence }) => roundObject({ deckName, matches, share, confidence })),
      matchupChanges: input.changes.matchupChanges.map(({ deckA, deckB, totalMatches, deckAWinRate, deckAWinRateChange, confidence }) => ({
        deckA,
        deckB,
        totalMatches,
        deckAWinRate: roundNumber(deckAWinRate),
        deckAWinRateChange: roundNumber(deckAWinRateChange),
        confidence
      }))
    },
    tierCandidates: input.tierCandidates.map((row) => roundObject(omitTierInternalFields(row))),
    matchups: input.unifiedMatchups
      .filter((row) => row.totalMatches >= WEEKLY_REPORT_CONFIG.majorMatchupMinMatches)
      .map((row) => roundObject(omitMatchupDeckIds(row))),
    correlation: input.correlation.map((row) => roundObject(row)),
    notes: [
      "環境分布は対戦相手デッキを基準に集計しています。",
      "使用デッキ別勝率は使用者側デッキを基準に集計しています。",
      "個人ユーザーを識別できる情報と生の戦績行は含めていません。",
      "同一試合が双方のユーザーから登録された場合の二重計上は、現在のDB構造だけでは自動判定できません。",
      "AI用JSONは記事生成用に軽量化しており、サンプル不足の大量デッキは除外しています。"
    ]
  };
}

function omitOpponentDeckId(row: OpponentDeckRankingRow): Omit<OpponentDeckRankingRow, "deckId"> {
  return {
    deckName: row.deckName,
    className: row.className,
    matches: row.matches,
    share: row.share,
    rank: row.rank,
    previousMatches: row.previousMatches,
    previousShare: row.previousShare,
    previousRank: row.previousRank,
    shareChange: row.shareChange,
    rankChange: row.rankChange,
    confidence: row.confidence,
    comparisonNote: row.comparisonNote
  };
}

function omitMyDeckId(row: MyDeckWinRateRow): Omit<MyDeckWinRateRow, "deckId"> {
  return {
    deckName: row.deckName,
    className: row.className,
    matches: row.matches,
    wins: row.wins,
    losses: row.losses,
    winRate: row.winRate,
    previousMatches: row.previousMatches,
    previousWinRate: row.previousWinRate,
    winRateChange: row.winRateChange,
    isWinRateComparisonReliable: row.isWinRateComparisonReliable,
    comparisonNote: row.comparisonNote,
    rank: row.rank,
    confidence: row.confidence,
    isRankingEligible: row.isRankingEligible
  };
}

function omitTierInternalFields(
  row: TierCandidateRow
): Omit<TierCandidateRow, "deckId" | "strengthScore" | "metaPresence" | "reasons"> {
  return {
    deckName: row.deckName,
    className: row.className,
    suggestedTier: row.suggestedTier,
    finalTier: row.finalTier,
    matches: row.matches,
    winRate: row.winRate,
    opponentMatches: row.opponentMatches,
    encounterShare: row.encounterShare,
    majorMatchupWinRate: row.majorMatchupWinRate,
    weightedMajorMatchupWinRate: row.weightedMajorMatchupWinRate,
    confidence: row.confidence,
    warnings: row.warnings
  };
}

function omitMatchupDeckIds(row: UnifiedMatchupRow): Omit<UnifiedMatchupRow, "deckAId" | "deckBId"> {
  return {
    deckA: row.deckA,
    deckAClassName: row.deckAClassName,
    deckB: row.deckB,
    deckBClassName: row.deckBClassName,
    totalMatches: row.totalMatches,
    deckAWins: row.deckAWins,
    deckBWins: row.deckBWins,
    deckAWinRate: row.deckAWinRate,
    deckBWinRate: row.deckBWinRate,
    previousTotalMatches: row.previousTotalMatches,
    previousDeckAWinRate: row.previousDeckAWinRate,
    deckAWinRateChange: row.deckAWinRateChange,
    isComparisonReliable: row.isComparisonReliable,
    comparisonNote: row.comparisonNote,
    confidence: row.confidence
  };
}

export function buildWeeklyReportPrompt(aiJson: WeeklyReportAiJson, operatorMemo = "") {
  return `あなたは
Shadowverse: Worlds Beyond の
データ分析レポート編集者です。

以下はSV Match Log Webに集まった
集計済みランクマ戦績です。

数値を変更・推測せず、
選択期間の環境レポートを作成してください。

【ルール】

・存在しない数値を作らない
・勝率には可能な範囲で試合数を併記する
・少数試合は断定しない
・必要に応じて「有利傾向」と表現する
・データと考察を区別する
・過度に煽らない
・個人ユーザーには言及しない
・自然で読みやすい日本語
・note向けの記事として作成する

【期間比較】

・選択期間と前期間のサンプル数に大きな差がある場合、期間比を環境変化として断定しない
・comparisonConfidence が low の場合、「参考値」と明記する
・前期間0件でも、前期間全体のサンプルが不足している場合は「新規デッキ」と断定しない

【Tier】

・Tierは自動集計・管理者調整による暫定評価である
・遭遇率が高いことだけをデッキの強さの根拠にしない
・Tierと環境存在感を区別する
・Tierと環境での多さを区別する

【対面】

・20戦以上は比較的重視する
・10～19戦は参考値として扱う
・少数対面では「有利」ではなく「有利傾向」「注目したい」と表現する

【文章】

・存在しない原因を推測しない
・データから言えることと編集者の考察を分ける
・将来予測は断定しない
・数値は小数1桁程度に丸める
・選択期間の重要ポイントを3点程度に絞る
・同じ数字を何度も繰り返さない
・表で見せた方が良い部分はMarkdown表にする
・重要な対面は3～5個程度に絞る
・Tier表を全文で読み上げるだけの記事にしない
・「なぜこの数字が重要なのか」を説明する

【内部指標について】

・Strength Score や Meta Presence は内部のTier候補判定用指標です
・note記事本文には「Strength 84」「Presence Medium」などの内部指標名・内部スコアを記載しないでください
・読者へ説明する場合は、勝率、試合数、遭遇率、対面勝率など実際の戦績データを使ってください

【運営者の所感】

${operatorMemo.trim() || "未入力"}

運営者の所感は統計データではありません。「データ上」と「運営者の所感」を混同しないでください。

構成：

# SV Match Log 環境レポート

【無料部分】

## 選択期間の環境まとめ

## ランクマで多く当たったデッキ TOP5

## 選択期間の重要ポイント

ここまでで記事の価値が分かる内容にしてください。

--- ここから有料 ---

【有料部分】

## 使用デッキ別勝率

## 前期間から増えた・減ったデッキ

## 選択期間のTier表

## 注目対面

## 環境相関図から見るメタ

## 選択期間で注目したいデッキ

## 次に注目したいポイント

## データについて

集計済みJSON：

${JSON.stringify(aiJson, null, 2)}`;
}

function buildDataQualityWarnings(
  currentMatches: number,
  previousMatches: number,
  comparisonConfidence: ComparisonConfidence
) {
  const warnings: string[] = [];

  if (comparisonConfidence === "low") {
    warnings.push(`前期間比較は参考値です。選択期間${currentMatches}戦 / 前期間${previousMatches}戦。`);
  }

  if (currentMatches === 0) {
    warnings.push("対象期間の戦績が0件です。");
  }

  if (previousMatches === 0) {
    warnings.push("前期間の戦績が0件です。新規デッキとは断定しません。");
  }

  return warnings;
}

function countBy(matches: WeeklyMatch[], getKey: (match: WeeklyMatch) => string | null) {
  const map = new Map<string, number>();

  for (const match of matches) {
    const key = getKey(match) ?? "unknown";
    map.set(key, (map.get(key) ?? 0) + 1);
  }

  return map;
}

function countWinsBy(matches: WeeklyMatch[], getKey: (match: WeeklyMatch) => string | null) {
  const map = new Map<string, CountStats>();

  for (const match of matches) {
    const key = getKey(match) ?? "unknown";
    const current = map.get(key) ?? { matches: 0, wins: 0 };
    current.matches += 1;
    current.wins += match.result === "win" ? 1 : 0;
    map.set(key, current);
  }

  return map;
}

function getJstParts(date: Date) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: WEEKLY_REPORT_CONFIG.timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(date);

  return {
    year: Number(parts.find((part) => part.type === "year")?.value ?? "1970"),
    month: Number(parts.find((part) => part.type === "month")?.value ?? "1"),
    day: Number(parts.find((part) => part.type === "day")?.value ?? "1")
  };
}

function toJstDateInput(date: Date) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: WEEKLY_REPORT_CONFIG.timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(date);
}

function formatNumber(value: number | null) {
  if (value === null || Number.isNaN(value)) {
    return "-";
  }

  return String(Math.round(value * 10) / 10);
}

function roundNumber(value: number | null) {
  if (value === null || Number.isNaN(value)) {
    return value;
  }

  return Math.round(value * 10) / 10;
}

function roundObject<T extends Record<string, unknown>>(value: T): T {
  return Object.fromEntries(
    Object.entries(value).map(([key, item]) => [key, typeof item === "number" ? roundNumber(item) : item])
  ) as T;
}

function clampScore(value: number) {
  return Math.max(0, Math.min(100, value));
}
