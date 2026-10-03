import type { WeeklyReportAiJson } from "@/lib/weekly-report";

export function reportDisplayContext(report: WeeklyReportAiJson, rankLabel?: string): string {
  const { period } = report;
  const date = (value: string, includeYear: boolean) => {
    const [year, month, day] = value.split("-");
    return `${includeYear ? `${year}/` : ""}${Number(month)}/${Number(day)}`;
  };
  const year = period.startDate.slice(0, 4);
  const rank = !rankLabel || rankLabel === "すべて（未登録含む）" ? "すべて" : rankLabel;
  return `対象期間：${date(period.startDate, true)}〜${date(period.endDate, period.endDate.slice(0, 4) !== year)} ｜ 前期間：${date(period.previousStartDate, period.previousStartDate.slice(0, 4) !== year)}〜${date(period.previousEndDate, period.previousEndDate.slice(0, 4) !== period.previousStartDate.slice(0, 4))} ｜ 環境：${report.environmentFilter?.name ?? "すべて"} ｜ ランク：${rank}`;
}

export function reportMarkdown(markdown: string, contextLabel: string): string {
  return markdown ? `${contextLabel}\n\n${markdown}` : "";
}
