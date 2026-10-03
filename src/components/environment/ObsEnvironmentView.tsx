import { buildEnvironmentViewV3, type EnvironmentDashboardV3 } from "@/lib/environment-dashboard-v3";
import { ENVIRONMENT_PERIODS, formatEnvironmentPercent as percent } from "@/lib/environment-dashboard";
import { ATOMIC_RANK_GROUPS, getRankSelectionLabel } from "@/lib/rank-selection";
import { formatJstDateTime } from "@/lib/utils";
import styles from "./ObsEnvironmentView.module.css";

type Row = ReturnType<typeof buildEnvironmentViewV3>["rows"][number];

function Ranking({ title, rows, metric }: { title: string; rows: Row[]; metric: "encounterRate" | "winRate" }) {
  return <section className={styles.ranking} aria-label={title}>
    <h2>{title}</h2>
    {rows.length ? <ol>{rows.map((row, index) => <li key={row.key}>
      <div className={styles.rankLine}><span className={styles.position}>{index + 1}</span><span className={styles.deck}>{row.name}</span><strong className={styles.value}>{percent(row[metric]!)}</strong></div>
      <div className={styles.track} aria-hidden="true"><div className={metric === "winRate" ? styles.winBar : styles.encounterBar} style={{ width: `${row[metric]}%` }} /></div>
    </li>)}</ol> : <p className={styles.empty}>表示できるデータがありません。</p>}
  </section>;
}

export function ObsEnvironmentView({ data, environmentName }: { data: EnvironmentDashboardV3; environmentName: string }) {
  const view = buildEnvironmentViewV3(data);
  const rankLabel = getRankSelectionLabel(data.rankFilters);
  const ranks = rankLabel.startsWith("カスタム")
    ? ATOMIC_RANK_GROUPS.flatMap(g => g.options).filter(o => data.rankFilters.includes(o.value)).map(o => o.fullLabel).join(" / ") : rankLabel;
  return <main className={styles.canvas}>
    <div className={styles.panel}>
      <header className={styles.header}>
        <div><p className={styles.brand}>SV MATCH LOG</p><h1>環境データ</h1></div>
        <div className={styles.total}><span>総対戦数</span><strong>{data.current.total.status === "available" ? <>{data.current.total.totalMatches.toLocaleString("ja-JP")}<small>戦</small></> : "データなし"}</strong></div>
        <p className={styles.conditions}>直近{ENVIRONMENT_PERIODS.find(p => p.value === data.period)!.label}<span>｜</span>{ranks}</p>
        <p className={styles.environment}>{environmentName}</p>
      </header>
      <Ranking title="遭遇率TOP5" rows={view.encounters} metric="encounterRate" />
      <Ranking title="勝率TOP5" rows={view.wins} metric="winRate" />
      <div className={styles.trends}>
        {([["増加TOP3", view.increases, "increase"], ["減少TOP3", view.decreases, "decrease"]] as const).map(([title, rows, direction]) => <section key={title} aria-label={title} className={styles[direction]}>
          <h2>{title}<span>遭遇率・前期間比</span></h2>
          {rows.length ? <ol>{rows.map(row => <li key={row.key}><span className={styles.trendDeck}>{row.name}</span><strong>{row.trend.delta! > 0 ? "+" : ""}{row.trend.delta!.toFixed(1)}<small>pt</small></strong></li>)}</ol>
            : <p className={styles.empty}>{data.previous.total.status === "no_data" ? "前の期間のデータがありません。" : data.current.total.status === "no_data" ? "今の期間のデータがありません。" : `比較できる${direction === "increase" ? "増加" : "減少"}データがありません。`}</p>}
        </section>)}
      </div>
      <footer className={styles.footer}>
        <span>{formatJstDateTime(data.dataThrough)}まで（JST）</span>
        <span>勝率TOP5：対象登録戦績10件以上</span>
      </footer>
    </div>
  </main>;
}
