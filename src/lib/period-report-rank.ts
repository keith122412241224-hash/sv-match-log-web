import { ANALYSIS_RANK_FILTERS, parseAnalysisRankFilter } from "@/lib/analysis-rank-filter";
import { buildWeeklyReportPrompt, type WeeklyReportData } from "@/lib/weekly-report";

export function getPeriodReportRankLabel(value?: string | null) {
  const rank = parseAnalysisRankFilter(value);
  return rank === "all" ? undefined : ANALYSIS_RANK_FILTERS.find(option => option.value === rank)!.label;
}

// Evaluation stays unchanged. Only selected-rank reports carry population metadata.
// All returns the original object, including the original AI JSON and prompt.
export function withPeriodReportRank(report: WeeklyReportData, value?: string | null): WeeklyReportData {
  const rank = parseAnalysisRankFilter(value);
  if (rank === "all") return report;
  const aiJson = {
    ...report.aiJson,
    rankFilter: {
      value: rank,
      label: getPeriodReportRankLabel(rank),
      description: "当期間・前期間とも登録者本人の対戦時点のランクで原本戦績を絞り込み。反転時もランクは変換しません。"
    }
  };
  return { ...report, aiJson, aiPrompt: buildWeeklyReportPrompt(aiJson) };
}
