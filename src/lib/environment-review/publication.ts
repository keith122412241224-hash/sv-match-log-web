import type { EvaluationDocument } from "./evaluation";
import type { ReviewSnapshot } from "./metrics";

type Breakdown = ReviewSnapshot["decks"][number]["short"];
function memberBreakdown(row: Breakdown) {
  const {count, wins, winRate, registrations, encounters, encounterRate, useCount, useWinRate} = row;
  return {count, wins, winRate, registrations, encounters, encounterRate, useCount, useWinRate};
}
function memberGroups(rows: Record<string, Breakdown>) {
  return Object.fromEntries(Object.entries(rows).map(([key, value]) => [key, memberBreakdown(value)]));
}
export function memberSnapshot(source: ReviewSnapshot) {
  const { snapshotId, environmentId, environmentName, asOf, periodStart, shortPeriodStart, ranks, matchCount, shortMatchCount } = source;
  return {
    snapshotId, environmentId, environmentName, asOf, periodStart, shortPeriodStart, ranks, matchCount, shortMatchCount,
    ...(source.schemaVersion === 2 ? { ruleVersion: source.ruleVersion, schemaVersion: 2 } : {}),
    decks: source.decks.map(row => {
      const { deckId, name, className, count, winRate, encounterRate, useWinRate, dataTier, short, byRank, byDay } = row;
      const details = source.schemaVersion === 2 && row.model ? {
        eligibleCount: row.eligibleCount, eligibleWinRate: row.eligibleWinRate, interval95: row.interval95,
        measuredConfidence: row.model.measuredConfidence
      } : undefined;
      const periods = source.schemaVersion === 2
        ? {short: memberBreakdown(short), byRank: memberGroups(byRank), byDay: memberGroups(byDay)}
        : {short, byRank, byDay};
      return { deckId, name, className, count, winRate, encounterRate, useWinRate, dataTier, ...periods, ...(details && { details }) };
    }),
    pairs: source.pairs.map(row => {
      const { a, b, count, winRate, dataRating } = row;
      const details = source.schemaVersion === 2 && row.model ? {
        interval95: row.interval95, measuredConfidence: row.model.measuredConfidence, assessment: row.model.assessment
      } : undefined;
      return { a, b, count, winRate, dataRating, ...(details && { details }) };
    })
  };
}

export type MemberPayload = {
  snapshot: ReturnType<typeof memberSnapshot>;
  evaluation: EvaluationDocument["public"];
  previousTiers: Record<string, number | null>;
};
export type Publication = { run_id: string; as_of: string; published_at: string; payload: MemberPayload };
export const tierLabel = (value: number | null) => value === null ? "評価保留" : `Tier ${value}`;
export function matchupLabel(value: number | null) {
  return value === null ? "評価保留" : ["かなり不利", "やや不利", "五分", "やや有利", "かなり有利"][value + 2];
}
export function changeLabel(prior: number | null | undefined, current: number | null) {
  if (prior === undefined) return "初回";
  if (prior === current) return "変更なし";
  return `${tierLabel(prior)} → ${tierLabel(current)}`;
}
export const jst = (value: string) => new Intl.DateTimeFormat("ja-JP", { timeZone: "Asia/Tokyo", dateStyle: "short", timeStyle: "short" }).format(new Date(value));
export const percent = (value: number | null) => value === null ? "観測なし" : `${value.toFixed(1)}%`;
export function previousTiers(publication: Publication | null, runId: string) {
  if (!publication) return {};
  if (publication.run_id === runId) return publication.payload.previousTiers;
  return Object.fromEntries(publication.payload.evaluation.decks.map(deck => [deck.deckId, deck.tier])) as Record<string, number | null>;
}
