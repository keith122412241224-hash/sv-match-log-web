import { buildWeeklyReportPrompt, type WeeklyReportData } from "@/lib/weekly-report";

export function parsePeriodReportEnvironment(value?: unknown): string | null {
  if (value === undefined || value === null || value === "all") return null;
  if (typeof value !== "string" || !/^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i.test(value)) {
    throw new Error("環境の絞り込み条件が不正です。");
  }
  return value.toLowerCase();
}

export function resolvePeriodReportEnvironment(value: unknown, environments: readonly { id: string; name: string }[]) {
  const id = parsePeriodReportEnvironment(value);
  if (id === null) return null;
  const environment = environments.find(environment => environment.id === id);
  if (!environment) throw new Error("指定された環境を確認できません。環境の選択を確認してください。");
  return { id: environment.id, name: environment.name };
}

// Filtering happens in SQL before metrics are calculated. All retains exact compatibility.
export function withPeriodReportEnvironment(report: WeeklyReportData, environment: { id: string; name: string } | null): WeeklyReportData {
  if (!environment) return report;
  const noPrevious = report.previousTotalMatches === 0;
  const note = "比較対象なし（選択環境の前期間の戦績が0件）";
  const changes = noPrevious ? {
    encounterShareUp: [], encounterShareDown: [], winRateUp: [], winRateDown: [], newDecks: [], matchupChanges: []
  } : report.changes;
  const opponentDeckRanking = noPrevious ? report.opponentDeckRanking.map(row => ({
    ...row, previousShare: null, shareChange: null, comparisonNote: note
  })) : report.opponentDeckRanking;
  const aiJson = {
    ...report.aiJson,
    environmentFilter: { id: environment.id, name: environment.name, description: "今期間・前期間とも同じ環境IDで絞り込み。指定期間はJSTの各日終日で、環境の入力受付日時による補正は行いません。" },
    ...(noPrevious ? {
      summary: { ...report.aiJson.summary, matchDelta: null, comparisonStatus: "no_previous" as const },
      opponentDeckRanking: report.aiJson.opponentDeckRanking.map(row => ({ ...row, previousShare: null, comparisonNote: note })),
      changes: { encounterShareUp: [], encounterShareDown: [], winRateUp: [], winRateDown: [], newDecks: [], matchupChanges: [] },
      notes: [...report.aiJson.notes, note + "。増減・増加率は算出しません。"]
    } : {})
  };
  return { ...report, changes, opponentDeckRanking, aiJson, aiPrompt: buildWeeklyReportPrompt(aiJson) };
}
