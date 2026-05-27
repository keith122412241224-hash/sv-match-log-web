import { LOW_SAMPLE_THRESHOLD } from "@/lib/constants";
import { formatPercent } from "@/lib/utils";
import { DeckWithClassIcon } from "@/components/ClassIcon";
import type { DeckAnalysisSummary } from "@/lib/analytics";

export function DeckAnalysisCards({ summaries }: { summaries: DeckAnalysisSummary[] }) {
  const visible = summaries.filter((summary) => summary.total > 0);

  if (visible.length === 0) {
    return <p className="rounded-md border border-slate-200 bg-white p-4 text-sm text-muted">デッキ別サマリーは、戦績を入力すると表示されます。</p>;
  }

  return (
    <section className="grid gap-3">
      <h2 className="text-lg font-bold text-ink">使用デッキ別サマリー</h2>
      <div className="grid gap-3 lg:grid-cols-2">
        {visible.map((summary) => (
          <article className="rounded-md border border-slate-200 bg-white p-4" key={summary.deck.id}>
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <h3 className="font-bold text-ink">
                  <DeckWithClassIcon className={summary.deck.class_name} iconSize={28} name={summary.deck.name} />
                </h3>
              </div>
              {summary.isLowSample ? <span className="rounded bg-amber-100 px-2 py-1 text-xs font-bold text-amber-950">参考値: {LOW_SAMPLE_THRESHOLD - 1}戦以下</span> : null}
            </div>
            <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
              <MiniStat label="総試合数" value={`${summary.total}`} />
              <MiniStat label="勝率" value={formatPercent(summary.winRate)} />
              <MiniStat label="先攻" value={formatPercent(summary.firstWinRate)} />
              <MiniStat label="後攻" value={formatPercent(summary.secondWinRate)} />
            </div>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <MatchupList title="得意対面TOP3" rows={summary.goodMatchups} />
              <MatchupList title="苦手対面TOP3" rows={summary.badMatchups} />
            </div>
            <div className="mt-4">
              <div className="mb-2 text-xs font-bold text-muted">直近10戦</div>
              <div className="flex flex-wrap gap-1">
                {summary.recentResults.map((result, index) => (
                  <span className={result === "win" ? "grid size-7 place-items-center rounded bg-emerald-700 text-xs font-bold text-white" : "grid size-7 place-items-center rounded bg-red-700 text-xs font-bold text-white"} key={`${summary.deck.id}-${index}`}>
                    {result === "win" ? "W" : "L"}
                  </span>
                ))}
              </div>
            </div>
          </article>
        ))}
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
  return (
    <div>
      <div className="mb-2 text-xs font-bold text-muted">{title}</div>
      <div className="grid gap-1">
        {rows.length === 0 ? (
          <p className="text-xs text-muted">データなし</p>
        ) : (
          rows.map((row, index) => (
            <div className="flex items-center justify-between gap-2 rounded bg-slate-50 px-2 py-1 text-xs" key={`${title}-${row.label}-${row.total}-${index}`}>
              <span className="truncate font-semibold text-ink">{row.label}</span>
              <span className="shrink-0 text-muted">{formatPercent(row.winRate)} / {row.total}戦</span>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
