import Link from "next/link";
import { redirect } from "next/navigation";
import { AlertTriangle } from "lucide-react";
import { WeeklyReportInteractiveSections } from "@/components/admin/WeeklyReportInteractiveSections";
import { WEEKLY_REPORT_CONFIG } from "@/lib/weekly-report-config";
import { getDefaultWeeklyReportStartDate, shiftWeeklyPeriod } from "@/lib/weekly-report";
import { getIsAdmin, getWeeklyReport } from "@/lib/data";
import { formatPercent } from "@/lib/utils";

export default async function AdminWeeklyReportPage({
  searchParams
}: {
  searchParams: Promise<{ start?: string }>;
}) {
  const isAdmin = await getIsAdmin();

  if (!isAdmin) {
    redirect("/");
  }

  const params = await searchParams;
  const selectedStartDate = /^\d{4}-\d{2}-\d{2}$/.test(params.start ?? "") ? params.start! : getDefaultWeeklyReportStartDate();
  let report;
  let fetchError: string | null = null;

  try {
    report = await getWeeklyReport(selectedStartDate);
  } catch (error) {
    fetchError = error instanceof Error ? error.message : "Supabaseから週次レポートを取得できませんでした。";
  }

  if (!report) {
    return (
      <main className="min-h-screen bg-surface px-4 py-6">
        <div className="mx-auto max-w-7xl">
          <p className="rounded-md border border-red-200 bg-red-50 p-4 text-sm font-semibold text-red-800">
            {fetchError ?? "週次レポートを表示できません。"}
          </p>
        </div>
      </main>
    );
  }

  const previousWeek = shiftWeeklyPeriod(report.period, -7).startDate;
  const nextWeek = shiftWeeklyPeriod(report.period, 7).startDate;
  const isLowComparisonConfidence = report.comparisonConfidence === "low";

  return (
    <main className="min-h-screen bg-surface px-4 py-6">
      <div className="mx-auto grid max-w-7xl gap-6">
        <header className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold text-ink">週次環境レポート</h1>
            <p className="mt-1 text-sm text-muted">
              {report.period.startDate} 00:00:00 ～ {report.period.endDate} 23:59:59 / {WEEKLY_REPORT_CONFIG.timeZone}
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
          <form className="grid gap-3 md:grid-cols-[1fr_auto_auto_auto]" action="/admin/weekly-report">
            <label className="grid gap-1 text-sm font-semibold text-ink">
              対象週の開始日
              <input className="min-h-11 rounded-md border border-slate-300 px-3" type="date" name="start" defaultValue={report.period.startDate} />
            </label>
            <Link className="inline-flex min-h-11 items-center justify-center rounded-md border border-slate-300 bg-white px-4 text-sm font-bold text-ink" href={`/admin/weekly-report?start=${previousWeek}`}>
              前週
            </Link>
            <button className="min-h-11 rounded-md bg-ink px-4 text-sm font-bold text-white" type="submit">
              表示
            </button>
            <Link className="inline-flex min-h-11 items-center justify-center rounded-md border border-slate-300 bg-white px-4 text-sm font-bold text-ink" href={`/admin/weekly-report?start=${nextWeek}`}>
              次週
            </Link>
          </form>
        </section>

        <section className="grid gap-3 md:grid-cols-4">
          <MiniStat label="総試合数" value={`${report.totalMatches}`} detail={`前週 ${report.previousTotalMatches}戦`} />
          <MiniStat label="前週比" value={`${report.totalMatches - report.previousTotalMatches > 0 ? "+" : ""}${report.totalMatches - report.previousTotalMatches}`} detail="試合数差分" />
          <MiniStat label="週比較信頼度" value={report.comparisonConfidence.toUpperCase()} detail={isLowComparisonConfidence ? "前週比較は参考値" : "通常比較"} />
          <MiniStat label="主要対面" value={`${report.unifiedMatchups.filter((row) => row.totalMatches >= WEEKLY_REPORT_CONFIG.majorMatchupMinMatches).length}`} detail={`${WEEKLY_REPORT_CONFIG.majorMatchupMinMatches}戦以上`} />
        </section>

        {isLowComparisonConfidence ? (
          <section className="rounded-md border border-amber-300 bg-amber-50 p-4 text-amber-950">
            <div className="flex items-start gap-2">
              <AlertTriangle className="mt-0.5 shrink-0" size={20} aria-hidden="true" />
              <div>
                <h2 className="font-bold">前週比較は参考値です</h2>
                <p className="mt-1 text-sm">
                  今週: {report.totalMatches}戦 / 前週: {report.previousTotalMatches}戦。前週のサンプル数が少ない、または母数差が大きいため、前週比を環境変化として断定しないでください。
                </p>
              </div>
            </div>
          </section>
        ) : null}

        <section className="rounded-md border border-slate-200 bg-white p-4">
          <h2 className="font-bold text-ink">前週からの変化</h2>
          <div className="mt-3 grid gap-3 lg:grid-cols-3">
            <ChangeList title={isLowComparisonConfidence ? "遭遇率上昇 参考値" : "遭遇率上昇"} rows={report.changes.encounterShareUp.map((row) => `${row.deckName} ${formatSigned(row.shareChange)}pt${row.comparisonNote ? ` / ${row.comparisonNote}` : ""}`)} />
            <ChangeList title={isLowComparisonConfidence ? "遭遇率下降 参考値" : "遭遇率下降"} rows={report.changes.encounterShareDown.map((row) => `${row.deckName} ${formatSigned(row.shareChange)}pt${row.comparisonNote ? ` / ${row.comparisonNote}` : ""}`)} />
            <ChangeList title={isLowComparisonConfidence ? "今週確認" : "新規確認"} rows={(isLowComparisonConfidence ? report.opponentDeckRanking.filter((row) => row.previousMatches === 0 && row.matches >= WEEKLY_REPORT_CONFIG.change.minNewDeckMatches).slice(0, 3) : report.changes.newDecks).map((row) => `${row.deckName} ${row.matches}戦 / ${formatPercent(row.share)}${isLowComparisonConfidence ? " / 前週比較は参考値" : ""}`)} />
            <ChangeList title={isLowComparisonConfidence ? "勝率上昇 参考値" : "勝率上昇"} rows={report.changes.winRateUp.map((row) => `${row.deckName} ${formatSigned(row.winRateChange)}pt${row.comparisonNote ? ` / ${row.comparisonNote}` : ""}`)} />
            <ChangeList title={isLowComparisonConfidence ? "勝率下降 参考値" : "勝率下降"} rows={report.changes.winRateDown.map((row) => `${row.deckName} ${formatSigned(row.winRateChange)}pt${row.comparisonNote ? ` / ${row.comparisonNote}` : ""}`)} />
            <ChangeList title={isLowComparisonConfidence ? "対面変化 参考値" : "対面変化"} rows={report.changes.matchupChanges.map((row) => `${row.deckA} vs ${row.deckB} ${formatSigned(row.deckAWinRateChange)}pt${row.comparisonNote ? ` / ${row.comparisonNote}` : ""}`)} />
          </div>
        </section>

        <WeeklyReportInteractiveSections
          opponentRows={report.opponentDeckRanking}
          winRateRows={report.myDeckWinRates}
          matchupRows={report.unifiedMatchups}
          tierRows={report.tierCandidates}
          correlationRows={report.correlation}
          aiJson={report.aiJson}
          startDate={report.period.startDate}
          hasApiKey={Boolean(process.env.OPENAI_API_KEY)}
        />
      </div>
    </main>
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

function formatSigned(value: number | null) {
  if (value === null || Number.isNaN(value)) {
    return "-";
  }

  const rounded = Math.round(value * 10) / 10;
  return `${rounded > 0 ? "+" : ""}${rounded}`;
}
