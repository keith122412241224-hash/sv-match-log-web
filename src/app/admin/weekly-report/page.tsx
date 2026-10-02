import { reportDisplayContext } from "@/lib/report-display-context";
import { ANALYSIS_RANK_FILTERS, parseAnalysisRankFilter } from "@/lib/analysis-rank-filter";
import { getPeriodReportRankLabel } from "@/lib/period-report-rank";
import { parsePeriodReportEnvironment } from "@/lib/period-report-environment";
import { PeriodReportRankProvider } from "@/components/admin/PeriodReportRankContext";
import Link from "next/link";
import { redirect } from "next/navigation";
import { AlertTriangle } from "lucide-react";
import { WeeklyReportInteractiveSections } from "@/components/admin/WeeklyReportInteractiveSections";
import { ExportableReportBlock } from "@/components/admin/WeeklyReportClientTools";
import { WEEKLY_REPORT_CONFIG } from "@/lib/weekly-report-config";
import { getDefaultWeeklyReportStartDate, getWeeklyReportPeriodDayCount } from "@/lib/weekly-report";
import { getEnvironments, getIsAdmin, getWeeklyReport } from "@/lib/data";
import { formatPercent } from "@/lib/utils";

export default async function AdminWeeklyReportPage({
  searchParams
}: {
  searchParams: Promise<{ start?: string; end?: string; rank?: string; environment?: string | string[] }>;
}) {
  const isAdmin = await getIsAdmin();

  if (!isAdmin) {
    redirect("/");
  }

  const params = await searchParams;
  const environments = await getEnvironments();
  const selectedStartDate = /^\d{4}-\d{2}-\d{2}$/.test(params.start ?? "") ? params.start! : getDefaultWeeklyReportStartDate();
  const selectedEndDate = /^\d{4}-\d{2}-\d{2}$/.test(params.end ?? "") ? params.end! : undefined;
  let selectedRank: ReturnType<typeof parseAnalysisRankFilter> = "all";
  let selectedEnvironment: string | null = null;
  let report;
  let fetchError: string | null = null;

  try {
    selectedRank = parseAnalysisRankFilter(params.rank);
    selectedEnvironment = parsePeriodReportEnvironment(params.environment);
    report = await getWeeklyReport(selectedStartDate, selectedEndDate, selectedRank, selectedEnvironment);
  } catch (error) {
    fetchError = error instanceof Error ? error.message : "Supabaseから期間レポートを取得できませんでした。";
  }

  if (!report) {
    return (
      <main className="min-h-screen bg-surface px-4 py-6">
        <div className="mx-auto max-w-7xl">
          <p className="rounded-md border border-red-200 bg-red-50 p-4 text-sm font-semibold text-red-800">
            {fetchError ?? "期間レポートを表示できません。"}
          </p>
        </div>
      </main>
    );
  }

  const rankLabel = getPeriodReportRankLabel(selectedRank);
  const periodDayCount = getWeeklyReportPeriodDayCount(report.period);
  const isLowComparisonConfidence = report.comparisonConfidence === "low";
  const noPrevious = report.aiJson.summary.comparisonStatus === "no_previous";

  return (
    <PeriodReportRankProvider label={rankLabel} description={reportDisplayContext(report.aiJson, rankLabel)}>
    <main className="min-h-screen bg-surface px-4 py-6">
      <div className="mx-auto grid max-w-7xl gap-6">
        <header className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold text-ink">期間環境レポート</h1>
            <p className="mt-1 text-sm text-muted">
              {report.period.startDate} 00:00:00 ～ {report.period.endDate} 23:59:59 / {WEEKLY_REPORT_CONFIG.timeZone} / {periodDayCount}日間
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link className="rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-ink" href="/admin">
              管理画面へ
            </Link>
            <Link className="rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-ink" href="/">
              通常画面へ
            </Link>
          </div>
        </header>

        <section className="rounded-md border border-slate-200 bg-white p-4">
          <form className="grid min-w-0 gap-3 md:grid-cols-2 xl:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)_auto]" action="/admin/weekly-report">
            <label className="grid min-w-0 gap-1 text-sm font-semibold text-ink">
              環境
              <select key={selectedEnvironment ?? "all"} name="environment" defaultValue={selectedEnvironment ?? "all"} className="min-h-11 w-full min-w-0 rounded-md border border-slate-300 bg-white px-2 text-sm">
                <option value="all">すべて</option>
                {environments.map(environment => <option key={environment.id} value={environment.id}>{environment.name}</option>)}
              </select>
            </label>
            <label className="grid gap-1 text-sm font-semibold text-ink">
              開始日
              <input className="min-h-11 rounded-md border border-slate-300 px-3" type="date" name="start" defaultValue={report.period.startDate} />
            </label>
            <label className="grid gap-1 text-sm font-semibold text-ink">
              終了日
              <input className="min-h-11 rounded-md border border-slate-300 px-3" type="date" name="end" defaultValue={report.period.endDate} />
            </label>
            <label className="grid gap-1 text-sm font-semibold text-ink">
              ランク
              <select key={selectedRank} name="rank" defaultValue={selectedRank} className="min-h-11 rounded-md border border-slate-300 px-3">
                {ANALYSIS_RANK_FILTERS.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
              </select>
            </label>
            <button className="min-h-11 self-end rounded-md bg-ink px-4 text-sm font-bold text-white" type="submit">
              表示
            </button>
          </form>
        </section>

        <p className="min-w-0 break-words text-sm font-semibold text-ink">{reportDisplayContext(report.aiJson, rankLabel)}</p>

        <section className="grid gap-3 md:grid-cols-4">
          <MiniStat label="登録試合数" value={`${report.totalMatches}`} detail={`前期間 ${report.previousTotalMatches}戦`} />
          <MiniStat label="前期間比" value={noPrevious ? "比較対象なし" : `${report.totalMatches - report.previousTotalMatches > 0 ? "+" : ""}${report.totalMatches - report.previousTotalMatches}`} detail={noPrevious ? "選択環境の前期間は0件" : "試合数差分"} />
          <MiniStat label="期間比較信頼度" value={noPrevious ? "比較対象なし" : report.comparisonConfidence.toUpperCase()} detail={noPrevious ? "前期間の戦績がありません" : isLowComparisonConfidence ? "前期間比較は参考値" : "通常比較"} />
          <MiniStat label="主要対面" value={`${report.unifiedMatchups.filter((row) => row.totalMatches >= WEEKLY_REPORT_CONFIG.majorMatchupMinMatches).length}`} detail={`${WEEKLY_REPORT_CONFIG.majorMatchupMinMatches}戦以上`} />
        </section>

        <p className="text-sm text-muted">
          環境勝率は使用者側と対戦相手の勝敗反転を合算しています。総試合数・遭遇率は元の登録戦績で集計します。
          同デッキ対戦はデッキ別勝率に両視点を含みます。双方から登録された対戦はそれぞれ独立した観測データとして扱います。
          Tier評価ではミラーを除外し、今期・前期とも同じ両側統合基準で評価します。
        </p>

        {isLowComparisonConfidence ? (
          <section className="rounded-md border border-amber-300 bg-amber-50 p-4 text-amber-950">
            <div className="flex items-start gap-2">
              <AlertTriangle className="mt-0.5 shrink-0" size={20} aria-hidden="true" />
              <div>
                <h2 className="font-bold">{noPrevious ? "比較対象なし" : "前期間比較は参考値です"}</h2>
                <p className="mt-1 text-sm">
                  選択期間: {report.totalMatches}戦 / 前期間: {report.previousTotalMatches}戦。{noPrevious ? "選択環境の前期間に戦績がないため、増減の比較は行いません。" : "前期間のサンプル数が少ない、または母数差が大きいため、期間比を環境変化として断定しないでください。"}
                </p>
              </div>
            </div>
          </section>
        ) : null}

        <ExportableReportBlock title="前期間からの環境変化" fileName="period-environment-changes.png">
          <h3 className="mb-2 font-bold text-ink">前期間からの環境変化</h3>
          <p className="text-xs text-muted">
            {report.period.startDate} ～ {report.period.endDate} / 前期間: {report.previousPeriod.startDate} ～ {report.previousPeriod.endDate} / {WEEKLY_REPORT_CONFIG.timeZone} / 全ユーザー / 登録試合数{report.totalMatches}戦（前期間{report.previousTotalMatches}戦）
          </p>
          {noPrevious ? <p className="mt-3 text-sm text-muted">比較対象なし（選択環境の前期間の戦績が0件）</p> : <div className="mt-3 grid gap-3 lg:grid-cols-3">
            <ChangeList title={isLowComparisonConfidence ? "遭遇率上昇 参考値" : "遭遇率上昇"} rows={report.changes.encounterShareUp.map((row) => `${row.deckName} ${formatSignedPercent(row.shareChange)}${row.comparisonNote ? ` / ${row.comparisonNote}` : ""}`)} />
            <ChangeList title={isLowComparisonConfidence ? "遭遇率下降 参考値" : "遭遇率下降"} rows={report.changes.encounterShareDown.map((row) => `${row.deckName} ${formatSignedPercent(row.shareChange)}${row.comparisonNote ? ` / ${row.comparisonNote}` : ""}`)} />
            <ChangeList title={isLowComparisonConfidence ? "選択期間確認" : "新規確認"} rows={(isLowComparisonConfidence ? report.opponentDeckRanking.filter((row) => row.previousMatches === 0 && row.matches >= WEEKLY_REPORT_CONFIG.change.minNewDeckMatches).slice(0, 3) : report.changes.newDecks).map((row) => `${row.deckName} ${row.matches}戦 / ${formatPercent(row.share)}${isLowComparisonConfidence ? " / 前期間比較は参考値" : ""}`)} />
            <ChangeList title={isLowComparisonConfidence ? "勝率上昇 参考値" : "勝率上昇"} rows={report.changes.winRateUp.map((row) => `${row.deckName} ${formatSignedPercent(row.winRateChange)}${row.comparisonNote ? ` / ${row.comparisonNote}` : ""}`)} />
            <ChangeList title={isLowComparisonConfidence ? "勝率下降 参考値" : "勝率下降"} rows={report.changes.winRateDown.map((row) => `${row.deckName} ${formatSignedPercent(row.winRateChange)}${row.comparisonNote ? ` / ${row.comparisonNote}` : ""}`)} />
            <ChangeList title={isLowComparisonConfidence ? "対面変化 参考値" : "対面変化"} rows={report.changes.matchupChanges.map((row) => `${row.deckA} vs ${row.deckB} ${formatSignedPercent(row.deckAWinRateChange)}${row.comparisonNote ? ` / ${row.comparisonNote}` : ""}`)} />
          </div>}
        </ExportableReportBlock>

        <WeeklyReportInteractiveSections
          key={`${report.period.startDate}:${report.period.endDate}:${selectedRank}:${selectedEnvironment ?? "all"}`}
          opponentRows={report.opponentDeckRanking}
          winRateRows={report.myDeckWinRates}
          matchupRows={report.unifiedMatchups}
          tierRows={report.tierCandidates}
          correlationRows={report.correlation}
          aiJson={report.aiJson}
          startDate={report.period.startDate}
          endDate={report.period.endDate}
          hasApiKey={Boolean(process.env.OPENAI_API_KEY)}
        />
      </div>
    </main>
    </PeriodReportRankProvider>
  );
}

function MiniStat({ label, value, detail }: { label: string; value: string; detail: string }) {
  return (
    <div className="rounded-md border border-slate-200 bg-white p-4">
      <div className="text-xs font-bold text-muted">{label}</div>
      <div className="mt-1 text-2xl font-black text-ink">{value}</div>
      <div className="mt-1 text-sm text-muted">{detail}</div>
    </div>
  );
}

function ChangeList({ title, rows }: { title: string; rows: string[] }) {
  return (
    <div className="rounded-md bg-slate-50 p-3">
      <h3 className="text-sm font-bold text-ink">{title}</h3>
      {rows.length === 0 ? (
        <p className="mt-2 text-sm text-muted">該当なし</p>
      ) : (
        <ul className="mt-2 grid gap-1 text-sm text-muted">
          {rows.map((row) => (
            <li key={row}>{row}</li>
          ))}
        </ul>
      )}
    </div>
  );
}

function formatSignedPercent(value: number | null) {
  if (value === null || Number.isNaN(value)) {
    return "-";
  }

  const rounded = Math.round(value * 10) / 10;
  return `${rounded > 0 ? "+" : ""}${rounded}%`;
}
