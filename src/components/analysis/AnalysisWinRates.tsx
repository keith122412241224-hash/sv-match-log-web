import type { WinRateSummary } from "@/lib/analytics";
import { formatPercent } from "@/lib/utils";

/** Analysis-only presentation; the input order and aggregate values are preserved. */
export function AnalysisWinRates({ rows, combined = false, turns = false }: { rows: WinRateSummary[]; combined?: boolean; turns?: boolean }) {
  const visible = turns ? ["先攻", "後攻"].map(label => rows.find(row => row.label === label) ?? { label, total: 0, wins: 0, winRate: null }) : rows;
  if (!visible.length) return <p className="p-4 text-sm text-muted">表示できるデータがありません。</p>;
  return <div className={turns ? "grid gap-3 p-4 sm:grid-cols-2" : "grid gap-3 p-4"}>
    {visible.map((row, index) => {
      const available = row.total > 0 && row.winRate != null && Number.isFinite(row.winRate);
      const width = available ? Math.min(100, Math.max(0, row.winRate!)) : 0;
      return <article key={`${row.label}-${index}`} data-analysis-rate className="min-w-0 rounded-md bg-slate-50 p-4">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h3 className="min-w-0 break-words font-bold text-ink [overflow-wrap:anywhere]">{row.label}</h3>
          <span className="shrink-0 text-2xl font-bold tabular-nums text-ink">{available ? formatPercent(row.winRate) : "—"}</span>
        </div>
        <div className="my-3 h-2 overflow-hidden rounded-full bg-slate-200" role={available ? "meter" : undefined}
          aria-label={`${row.label}の勝率`} aria-valuemin={available ? 0 : undefined} aria-valuemax={available ? 100 : undefined} aria-valuenow={available ? width : undefined}>
          <div className="h-full rounded-full bg-emerald-700" style={{ width: `${width}%` }} />
        </div>
        <p className="text-sm tabular-nums text-muted">{row.wins.toLocaleString("ja-JP")}勝 / {row.total.toLocaleString("ja-JP")}{combined ? "件（対象件数）" : "戦"}{row.total === 0 ? " · データなし" : ""}</p>
      </article>;
    })}
  </div>;
}
