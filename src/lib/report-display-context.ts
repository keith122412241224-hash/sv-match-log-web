import type { WeeklyReportAiJson } from "@/lib/weekly-report";

export function reportDisplayContext(report: WeeklyReportAiJson, rankLabel?: string): string {
  const { period, summary } = report;
  return `環境: ${report.environmentFilter?.name ?? "すべて（全環境）"} / ${period.startDate} ～ ${period.endDate} / 前期間: ${period.previousStartDate} ～ ${period.previousEndDate} / ${period.timeZone}（JST・各日終日） / 全ユーザー / ランク: ${rankLabel ?? "すべて（未登録含む）"} / 登録試合数${summary.totalMatches}件（前期間${summary.previousTotalMatches}件）。${summary.comparisonStatus === "no_previous" ? "比較対象なし。" : ""}ランクは登録者本人の対戦時点の値です。`;
}

export function reportMarkdown(markdown: string, contextLabel: string): string {
  return markdown ? `${contextLabel}\n\n${markdown}` : "";
}
