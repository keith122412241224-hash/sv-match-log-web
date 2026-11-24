import { buildReviewSnapshot, interval95, type Rate, type Rating, type ReviewSource, type Tier } from "./metrics";
import { WEEKLY_REPORT_CONFIG } from "@/lib/weekly-report-config";

export const DATA_RULE_VERSION = "environment-review-v2";
type Confidence = "高" | "中" | "低" | "判断保留";
export type Signal = {
  kind: "rank" | "trend" | "concentration" | "equalWeight" | "perspective" | "smallSample" | "matchup" | "turn";
  direction: -1 | 0 | 1; detail: string;
};
export type PopulationBias = {
  contributors: number | null; pilots: number | null; topContributorShare: number | null;
  userEqualWinRate: number | null; withoutLargestWinRate: number | null;
  upperContributors: number | null; upperPilots: number | null;
  otherRankContributors?: number | null;
};
export type ReviewSourceV2 = ReviewSource & { environmentStart?: string; eligibleBias?: (PopulationBias & { key: string })[] };
type Upper = { all: Rate; combined: Rate; other: Rate; unranked: Rate; direct: Rate; directAll: Rate;
  contributors: number | null; pilots: number | null; otherContributors: number | null; direction: -1 | 0 | 1 };
type CommonModel = {
  direct: Rate; reversed: Rate; short: Rate; upper: Upper; estimatedRate: number | null; bias: PopulationBias;
  measuredConfidence: Confidence; signals: Signal[];
};
type MajorMatchup = { opponentId: string; encounters: number; weight: number; count: number; wins: number;
  estimatedRate: number | null; interval95: [number, number] | null; used: boolean };
export type DeckModel = CommonModel & { eligibleWinRate: number | null; effectiveRate: number | null; coverage: number;
  majorMatchups: MajorMatchup[]; fitConfidence: Confidence; legacyTier: Tier | null; candidateTier: Tier | null };
export type PairModel = CommonModel & { legacyRating: Rating | null; candidateRating: Rating | null;
  assessment: "有利傾向" | "不利傾向" | "五分圏" | "判断材料不足" };

const emptyBias: PopulationBias = { contributors: null, pilots: null, topContributorShare: null, userEqualWinRate: null,
  withoutLargestWinRate: null, upperContributors: null, upperPilots: null };
const minCount = WEEKLY_REPORT_CONFIG.majorMatchupMinMatches;
type Counts = { wins: number; count: number };
function asRate({ wins, count }: Counts): Rate {
  return { wins, count, winRate: count ? 100 * wins / count : null };
}
function minus(full: Counts, part: Counts) {
  return asRate({ wins: full.wins - part.wins, count: full.count - part.count });
}
export function wilsonCenter(wins: number, count: number) {
  return count ? 100 * (wins + 1.96 ** 2 / 2) / (count + 1.96 ** 2) : null;
}
export function candidateMatchupRating(wins: number, count: number): Rating | null {
  if (count < minCount) return null;
  const [lower, upper] = interval95(wins, count)!;
  const center = wilsonCenter(wins, count)!;
  if (center > 60 && lower > 55) return 2;
  if (center > 55 && lower > 50) return 1;
  if (center < 40 && upper < 45) return -2;
  if (center < 45 && upper < 50) return -1;
  return lower >= 45 && upper <= 55 ? 0 : null;
}
function separate(left: Counts, right: Counts): -1 | 0 | 1 {
  if (Math.min(left.count, right.count) < minCount) return 0;
  const a = interval95(left.wins, left.count)!, b = interval95(right.wins, right.count)!;
  return a[0] > b[1] ? 1 : a[1] < b[0] ? -1 : 0;
}
function blank() {
  const zero = () => ({ wins: 0, count: 0 });
  return { all: zero(), direct: zero(), short: zero(), upper: zero(), upperDirect: zero(), unranked: zero(), first: zero() };
}
type Facets = ReturnType<typeof blank>;
function eligibleFacets(source: ReviewSource) {
  const table = new Map<string, Facets>();
  const eligible = new Set(source.decks.filter(d => !d.isOther).map(d => d.deckId));
  for (const cell of source.cells) {
    const { my, opp } = cell;
    if (!my || !opp || my === opp || !eligible.has(my) || !eligible.has(opp)) continue;
    const add = (key: string, direct: boolean) => {
      const row = table.get(key) ?? blank();
      const wins = direct ? cell.wins : cell.total - cell.wins;
      const inc = (v: Counts) => { v.count += cell.total; v.wins += wins; };
      inc(row.all);
      if (cell.recent) inc(row.short);
      if (direct) inc(row.direct);
      if ((cell.turn === "first") === direct) inc(row.first);
      if (cell.rank === "unranked") inc(row.unranked);
      if (cell.rank.startsWith("grandmaster:")) {
        inc(row.upper);
        if (direct) inc(row.upperDirect);
      }
      table.set(key, row);
    };
    add(my, true);
    add(opp, false);
    const [a, b] = [my, opp].sort();
    add(a + "::" + b, a === my);
  }
  return table;
}
function common(row: Facets, bias: PopulationBias, isDeck: boolean): CommonModel {
  const direct = asRate(row.direct), reversed = minus(row.all, row.direct), short = asRate(row.short);
  const eligibleRate = asRate(row.all), signals: Signal[] = [];
  const combined = asRate(row.upper), unranked = asRate(row.unranked);
  const other = minus(minus(row.all, row.upper), unranked);
  const rankDir = Math.min(bias.upperContributors ?? 0, bias.otherRankContributors ?? 0) >= 2 ? separate(combined, other) : 0;
  const upper: Upper = { all: eligibleRate, combined, other, unranked, direct: asRate(row.upperDirect), directAll: direct,
    contributors: bias.upperContributors, pilots: bias.upperPilots, otherContributors: bias.otherRankContributors ?? null, direction: rankDir };
  if (rankDir) signals.push({ kind: "rank", direction: rankDir, detail: "登録者GM帯とランク登録済みGM未満帯の95%区間が分離。反転側の使用者ランクは不明。" });
  const trendDir = separate(short, minus(row.all, short));
  if (trendDir) signals.push({ kind: "trend", direction: trendDir, detail: "直近72時間とそれ以前の評価対象戦績で95%区間が分離。" });
  const turnDir = separate(row.first, minus(row.all, row.first));
  if (turnDir) signals.push({ kind: "turn", direction: 0, detail: "デッキ視点の先後別95%区間が分離。先後構成の違いに注意。" });
  const cfg = WEEKLY_REPORT_CONFIG.tier;
  if (direct.count >= cfg.divergenceMinMatchesPerSide && reversed.count >= cfg.divergenceMinMatchesPerSide &&
      Math.abs(direct.wins * reversed.count - reversed.wins * direct.count) * 100 >= cfg.holdDivergencePoints * direct.count * reversed.count) {
    signals.push({ kind: "perspective", direction: 0, detail: "使用側・反転側が各20件以上かつ勝率差25pt以上。" });
  }
  if (row.all.count > 0 && (bias.contributors === null || bias.contributors < 3 || (bias.topContributorShare ?? 100) > 50)) {
    signals.push({ kind: "concentration", direction: 0, detail: bias.contributors === null ? "評価対象の登録者分布が不明。" : "登録者3人未満または最大登録者が過半を占める。" });
  }
  if (eligibleRate.winRate !== null && [bias.userEqualWinRate, bias.withoutLargestWinRate].some(v => v !== null && Math.abs(v - eligibleRate.winRate!) >= 10)) {
    signals.push({ kind: "equalWeight", direction: 0, detail: "登録者均等または最大登録者除外で件数ベース勝率との差が10pt以上。" });
  }
  if (row.all.count > 0 && row.all.count < 20) signals.push({ kind: "smallSample", direction: 0, detail: "評価対象が20件未満。極端な実測値も参考扱い。" });
  const ci = interval95(row.all.wins, row.all.count);
  const fragile = signals.some(s => ["concentration", "equalWeight", "perspective"].includes(s.kind));
  let measuredConfidence: Confidence = "判断保留";
  if (row.all.count >= minCount && ci) {
    if (fragile || row.all.count < 20 || (isDeck && (bias.pilots ?? 0) < 2)) measuredConfidence = "低";
    else measuredConfidence = ci[1] - ci[0] <= 20 ? "高" : "中";
  }
  return { direct, reversed, short, upper, bias, measuredConfidence, signals, estimatedRate: wilsonCenter(row.all.wins, row.all.count) };
}
function candidateDeckTier(legacy: Tier | null, count: number, effective: number | null, ci: [number, number] | null): Tier | null {
  if (!legacy || effective === null || !ci) return null;
  const cfg = WEEKLY_REPORT_CONFIG.tier;
  if (count >= 40 && ci[0] > 50 && effective >= cfg.tier1WinRate) return 1;
  if (count >= 20 && ci[0] > 50 && effective >= cfg.tier2WinRate) return 2;
  if (effective >= cfg.tier3WinRate) return 3;
  if (count >= 40 && ci[1] < 45) return 5;
  return 4;
}
export function buildReviewSnapshotV2(source: ReviewSourceV2, snapshotId: string) {
  const { eligibleBias = [], environmentStart, ...baseSource } = source;
  const base = buildReviewSnapshot(baseSource, snapshotId);
  const facets = eligibleFacets(source);
  const biases = new Map(eligibleBias.map(({ key, ...stats }) => [key, stats]));
  const meta = base.decks.filter(d => !d.isOther && d.encounters > 0)
    .sort((a, b) => b.encounters - a.encounters || a.deckId.localeCompare(b.deckId));
  const pairs = base.pairs.map(p => {
    const key = p.a + "::" + p.b, row = facets.get(key) ?? blank();
    const diagnostics = common(row, biases.get(key) ?? emptyBias, false);
    const candidateRating = candidateMatchupRating(row.all.wins, row.all.count);
    const center = diagnostics.estimatedRate;
    const assessment: PairModel["assessment"] = candidateRating === 0 ? "五分圏" :
      row.all.count < minCount || center === null ? "判断材料不足" :
      center > 55 ? "有利傾向" : center < 45 ? "不利傾向" : "判断材料不足";
    const model: PairModel = { ...diagnostics, legacyRating: p.dataRating, candidateRating, assessment };
    // Comparable historical calls agreed on direction; v2 uses C to abstain when
    // uncertainty is large. The raw v1 classification remains available for audit.
    return { ...p, dataRating: candidateRating, model };
  });
  const decks = base.decks.map(d => {
    const row = facets.get(d.deckId) ?? blank();
    const diagnostics = common(row, biases.get(d.deckId) ?? emptyBias, true);
    const rivals = meta.filter(o => o.deckId !== d.deckId);
    const denominator = rivals.reduce((n, o) => n + o.encounters, 0);
    let coverage = 0, effectiveRate = diagnostics.estimatedRate;
    const majorMatchups = rivals.slice(0, 5).map(o => {
      const [a, b] = [d.deckId, o.deckId].sort();
      const counts = facets.get(a + "::" + b)?.all;
      const count = counts?.count ?? 0, wins = a === d.deckId ? counts?.wins ?? 0 : count - (counts?.wins ?? 0);
      const weight = o.encounters / denominator, estimatedRate = wilsonCenter(wins, count);
      const used = count >= minCount && effectiveRate !== null && estimatedRate !== null;
      if (used && effectiveRate !== null && estimatedRate !== null && diagnostics.estimatedRate !== null) {
        coverage += weight * 100;
        effectiveRate += weight * (estimatedRate - diagnostics.estimatedRate);
      }
      return { opponentId: o.deckId, encounters: o.encounters, weight, count, wins, estimatedRate, interval95: interval95(wins, count), used };
    });
    const candidateTier = candidateDeckTier(d.dataTier, d.eligibleCount, effectiveRate, d.interval95);
    if (candidateTier !== null && d.dataTier !== null && candidateTier !== d.dataTier) {
      diagnostics.signals.push({ kind: "matchup", direction: candidateTier < d.dataTier ? 1 : -1, detail: "主要対面の遭遇構成で標準化すると実測基準とTierが異なる。" });
    }
    const model: DeckModel = { ...diagnostics, eligibleWinRate: d.eligibleWinRate, legacyTier: d.dataTier, candidateTier,
      coverage, effectiveRate, majorMatchups, fitConfidence: coverage === 0 ? "判断保留" :
        coverage < 50 || diagnostics.measuredConfidence === "低" ? "低" : diagnostics.measuredConfidence };
    return { ...d, model };
  });
  return { ...base, decks, pairs, environmentStart, schemaVersion: 2 as const, ruleVersion: DATA_RULE_VERSION,
    confidenceRuleVersion: "review-confidence-v2", promptVersion: "environment-review-prompt-v2" };
}
