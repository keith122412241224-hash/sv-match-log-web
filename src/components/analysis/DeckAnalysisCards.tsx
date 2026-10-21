import { LOW_SAMPLE_THRESHOLD } from "@/lib/constants";
import { formatPercent } from "@/lib/utils";
import { DeckWithClassIcon } from "@/components/ClassIcon";
import type { DeckAnalysisSummary } from "@/lib/analytics";
import { recentAnalysisStats } from "@/lib/analysis-presentation";

export function DeckAnalysisCards({ summaries, combined = false, showTitle = true, recentDetails = false, showStreak = false }: { summaries: DeckAnalysisSummary[]; combined?: boolean; showTitle?: boolean; recentDetails?: boolean; showStreak?: boolean }) {
  const visible = summaries.filter((summary) => summary.total > 0);

  if (visible.length === 0) {
    return <p className="rounded-md border border-slate-200 bg-white p-4 text-sm text-muted">デッキ別サマリーは、戦績を入力すると表示されます。</p>;
  }

  return (
    <section className="grid gap-3">
      {showTitle ? <h2 className="text-lg font-bold text-ink">{combined ? "デッキ別サマリー（反転込み）" : "使用デッキ別サマリー"}</h2> : null}
      <div className="grid gap-3 lg:grid-cols-2">
        {visible.map((summary) => {
          const hasMatchups = summary.goodMatchups.length > 0 || summary.badMatchups.length > 0;
          const recent = recentAnalysisStats(summary.recentResults);

          return (
            <article className={`rounded-md border border-slate-200 bg-white p-4${recentDetails ? " min-w-0" : ""}`} key={summary.deck.id}>
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className={recentDetails ? "min-w-0 max-w-full" : undefined}>
                  <h3 className={`font-bold text-ink${recentDetails ? " [&_.truncate]:whitespace-normal [&_.truncate]:[overflow-wrap:anywhere]" : ""}`}>
                    <DeckWithClassIcon className={summary.deck.class_name} iconSize={28} name={summary.deck.name} />
                  </h3>
                </div>
                {summary.isLowSample ? <span className="rounded bg-amber-100 px-2 py-1 text-xs font-bold text-amber-950">参考値: {LOW_SAMPLE_THRESHOLD - 1}戦以下</span> : null}
              </div>
              <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
                <MiniStat label={combined ? "対象件数" : "総試合数"} value={`${summary.total}`} />
                <MiniStat label={combined ? "環境勝率" : "勝率"} value={formatPercent(summary.winRate)} />
                <MiniStat label="先攻" value={formatPercent(summary.firstWinRate)} />
                <MiniStat label="後攻" value={formatPercent(summary.secondWinRate)} />
              </div>
              {hasMatchups ? (
                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  <MatchupList title="得意対面TOP3" rows={summary.goodMatchups} />
                  <MatchupList title="苦手対面TOP3" rows={summary.badMatchups} />
                </div>
              ) : null}
              <div className="mt-4">
                <div className="mb-2 text-xs font-bold text-muted">{recentDetails ? `直近${recent.count}${combined ? "件（反転込み）" : "戦"}` : combined ? "直近10件（反転込み）" : "直近10戦"}</div>
                {recentDetails ? <>
                  <div className="mb-2 flex flex-wrap items-baseline gap-x-3 gap-y-1 tabular-nums">
                    <span className="font-bold text-ink">{recent.wins}勝{recent.losses}敗</span>
                    <span className="text-sm text-muted">勝率 <strong className="text-lg text-ink">{recent.winRate === null ? "—" : `${recent.winRate.toFixed(1)}%`}</strong></span>
                    {showStreak && !combined && recent.count > 0 ? <span className="text-sm font-semibold text-ink">{recent.streakLabel}</span> : null}
                  </div>
                  <p className="mb-2 text-xs text-muted">現在の分析条件に一致する結果を最新順で表示します。{showStreak && !combined ? "連勝・連敗もこの対象範囲内の成績です。" : "連勝・連敗は自分のみ／使用者側のみで表示します。"}</p>
                </> : null}
                <div className="flex flex-wrap gap-1">
                  {summary.recentResults.map((result, index) => (
                    <span className={result === "win" ? "grid size-7 place-items-center rounded bg-emerald-700 text-xs font-bold text-white" : "grid size-7 place-items-center rounded bg-red-700 text-xs font-bold text-white"} key={`${summary.deck.id}-${index}`}>
                      {result === "win" ? "W" : "L"}
                    </span>
                  ))}
                </div>
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md bg-slate-50 p-3">
      <div className="text-xs font-semibold text-muted">{label}</div>
      <div className="mt-1 text-lg font-bold text-ink">{value}</div>
    </div>
  );
}

function MatchupList({ title, rows }: { title: string; rows: { label: string; total: number; winRate: number | null }[] }) {
  if (rows.length === 0) {
    return null;
  }

  return (
    <div>
      <div className="mb-2 text-xs font-bold text-muted">{title}</div>
      <div className="grid gap-1">
        {rows.map((row, index) => (
          <div className="flex items-center justify-between gap-2 rounded bg-slate-50 px-2 py-1 text-xs" key={`${title}-${row.label}-${row.total}-${index}`}>
            <span className="truncate font-semibold text-ink">{row.label}</span>
            <span className="shrink-0 text-muted">{formatPercent(row.winRate)} / {row.total}戦</span>
          </div>
        ))}
      </div>
    </div>
  );
}
