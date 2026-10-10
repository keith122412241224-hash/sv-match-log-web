import { dashboardPeriodLabel } from "@/lib/environment-dashboard-period";
import { buildEnvironmentViewV4, type EnvironmentDashboardV4 } from "@/lib/environment-dashboard-v4";
import { formatEnvironmentPercent as percent } from "@/lib/environment-dashboard";
import { ATOMIC_RANK_GROUPS, getRankSelectionLabel } from "@/lib/rank-selection";
import { formatJstDateTime } from "@/lib/utils";
import styles from "./ObsEnvironmentView.module.css";
import { ObsMatchupMatrix } from "./ObsMatchupMatrix";
import type { ObsMatchups } from "@/lib/obs-environment-matchups";

type Row = ReturnType<typeof buildEnvironmentViewV4>["rows"][number];

function Ranking({ title, rows, metric, total }: { title: string; rows: Row[]; metric: "encounterRate" | "winRate"; total: number | null }) {
  return <section className={styles.ranking} aria-label={title}>
    <h2>{title}</h2>
    {rows.length ? <ol>{rows.map((row, index) => <li key={row.key}>
      <div className={styles.rankLine}><span className={styles.position}>{index + 1}</span><span className={styles.deck}>{row.name}</span><strong className={styles.value}>{percent(row[metric]!)}</strong></div>
      <div className={styles.support}>
        <div className={styles.track} aria-hidden="true"><div className={metric === "winRate" ? styles.winBar : styles.encounterBar} style={{ width: `${row[metric]}%` }} /></div>
        <p className={styles.count}>{metric === "encounterRate"
          ? `${row.current.encounter.count!.toLocaleString("ja-JP")}戦 / 全${total!.toLocaleString("ja-JP")}戦`
          : `対象戦績 ${row.current.winrate.evaluationCount!.toLocaleString("ja-JP")}戦`}</p>
      </div>
    </li>)}</ol> : <p className={styles.empty}>表示できるデータがありません。</p>}
  </section>;
}

export function ObsEnvironmentView({ data, environmentName, matchups }: { data: EnvironmentDashboardV4; environmentName: string; matchups?: ObsMatchups | null }) {
  const view = buildEnvironmentViewV4(data);
  const rankLabel = getRankSelectionLabel(data.rankFilters);
  const ranks = rankLabel.startsWith("カスタム")
    ? ATOMIC_RANK_GROUPS.flatMap(g => g.options).filter(o => data.rankFilters.includes(o.value)).map(o => o.fullLabel).join(" / ") : rankLabel;
  return <main className={styles.canvas}>
    <div className={styles.panel}>
      <header className={styles.header}>
        <div><p className={styles.brand}>SV MATCH LOG</p><h1>環境データ</h1></div>
        <div className={styles.total}><span>総対戦数</span><strong>{data.current.total.status === "available" ? <>{data.current.total.totalMatches.toLocaleString("ja-JP")}<small>戦</small></> : "データなし"}</strong></div>
        <p className={styles.conditions}>{dashboardPeriodLabel(data.period)}<span>｜</span>{ranks}</p>
        <p className={styles.environment}>{environmentName}</p>
      </header>
      <Ranking title="遭遇率TOP5" rows={view.encounters} metric="encounterRate" total={data.current.total.totalMatches} />
      <Ranking title="勝率TOP5" rows={view.wins} metric="winRate" total={data.current.total.totalMatches} />
      {data.previous && <div className={styles.trends}>
        {([["増加TOP3", view.increases, "increase"], ["減少TOP3", view.decreases, "decrease"]] as const).map(([title, rows, direction]) => <section key={title} aria-label={title} className={styles[direction]}>
          <h2>{title}<span>遭遇率・前期間比</span></h2>
          {rows.length ? <ol>{rows.map(row => <li key={row.key}><span className={styles.trendDeck}>{row.name}</span><strong>{row.trend!.delta! > 0 ? "+" : ""}{row.trend!.delta!.toFixed(1)}<small>pt</small></strong></li>)}</ol>
            : <p className={styles.empty}>{data.previous?.total.status === "no_data" ? "前の期間のデータがありません。" : data.current.total.status === "no_data" ? "今の期間のデータがありません。" : `比較できる${direction === "increase" ? "増加" : "減少"}データがありません。`}</p>}
        </section>)}
      </div>}
      <footer className={styles.footer}>
        <span>{formatJstDateTime(data.dataThrough)}まで（JST）</span>
        <span>勝率TOP5：対象登録戦績10件以上</span>
      </footer>
    </div>
    {matchups !== undefined && <ObsMatchupMatrix rows={matchups} />}
  </main>;
}
