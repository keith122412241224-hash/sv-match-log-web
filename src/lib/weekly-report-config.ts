export const WEEKLY_REPORT_CONFIG = {
  timeZone: "Asia/Tokyo",
  winRateRankingMinMatches: 10,
  majorMatchupMinMatches: 10,
  correlationMinMatches: 10,
  correlationAdvantageWinRate: 55,
  comparison: {
    highMinMatches: 300,
    highMinSmallerToLargerRatio: 0.5,
    mediumMinMatches: 150,
    minWinRateComparisonMatches: 10,
    minMatchupComparisonMatches: 10
  },
  confidence: {
    insufficientMaxMatches: 9,
    referenceMaxMatches: 19
  },
  tier: {
    minMatches: 10,
    tier1WinRate: 56,
    tier15WinRate: 53,
    tier2WinRate: 50,
    holdDivergencePoints: 25,
    strengthWeights: {
      winRate: 0.45,
      majorMatchup: 0.35,
      sampleConfidence: 0.15,
      trend: 0.05
    },
    strengthScore: {
      tier1: 78,
      tier15: 66,
      tier2: 54
    },
    metaPresence: {
      highShare: 10,
      mediumShare: 5
    }
  },
  change: {
    minShareChangePoints: 1,
    minWinRateChangePoints: 5,
    minNewDeckMatches: 10,
    minMatchupWinRateChangePoints: 15
  }
} as const;

export type DataConfidence = "sufficient" | "reference" | "insufficient";
export type ComparisonConfidence = "high" | "medium" | "low";
export type MetaPresence = "High" | "Medium" | "Low";
export type TierCandidate = "Tier1" | "Tier1.5" | "Tier2" | "Tier3" | "評価保留";

export function getDataConfidence(matches: number): DataConfidence {
  if (matches <= WEEKLY_REPORT_CONFIG.confidence.insufficientMaxMatches) {
    return "insufficient";
  }

  if (matches <= WEEKLY_REPORT_CONFIG.confidence.referenceMaxMatches) {
    return "reference";
  }

  return "sufficient";
}

export function getComparisonConfidence(currentMatches: number, previousMatches: number): ComparisonConfidence {
  const smaller = Math.min(currentMatches, previousMatches);
  const larger = Math.max(currentMatches, previousMatches);
  const ratio = larger > 0 ? smaller / larger : 0;

  if (
    currentMatches >= WEEKLY_REPORT_CONFIG.comparison.highMinMatches &&
    previousMatches >= WEEKLY_REPORT_CONFIG.comparison.highMinMatches &&
    ratio >= WEEKLY_REPORT_CONFIG.comparison.highMinSmallerToLargerRatio
  ) {
    return "high";
  }

  if (
    currentMatches >= WEEKLY_REPORT_CONFIG.comparison.mediumMinMatches &&
    previousMatches >= WEEKLY_REPORT_CONFIG.comparison.mediumMinMatches
  ) {
    return "medium";
  }

  return "low";
}

export function getMetaPresence(share: number): MetaPresence {
  if (share >= WEEKLY_REPORT_CONFIG.tier.metaPresence.highShare) {
    return "High";
  }

  if (share >= WEEKLY_REPORT_CONFIG.tier.metaPresence.mediumShare) {
    return "Medium";
  }

  return "Low";
}
