import type { ObsMatchups } from "@/lib/obs-environment-matchups";
import { LOW_SAMPLE_THRESHOLD } from "@/lib/constants";
import styles from "./ObsMatchupMatrix.module.css";

export function ObsMatchupMatrix({ rows }: { rows: ObsMatchups | null }) {
  return <section className={styles.section} aria-labelledby="obs-matchups-heading">
    <h2 id="obs-matchups-heading">遭遇率TOP5｜相性関係</h2>
    <p className={styles.description}>上段と同じ集計条件 · 行のデッキから見た勝率・対戦数</p>
    {rows === null ? <p role="alert">相性データを取得できませんでした。時間をおいて再読み込みしてください。</p>
      : !rows.length ? <p>表示できるデータがありません。</p>
      : <>
        <table className={styles.table} aria-label="遭遇率TOP5の相性表">
          <thead><tr><th scope="col">使用デッキ<br />↓ ／ 対面 →</th>{rows.map(row => <th scope="col" key={row.myDeck.id}>{row.myDeck.name}</th>)}</tr></thead>
          <tbody>{rows.map(row => <tr key={row.myDeck.id}>
            <th scope="row">{row.myDeck.name}</th>
            {row.cells.map((cell, index) => <td key={cell.opponentDeckId} className={styles[cell.band]} data-row={cell.myDeckId} data-column={cell.opponentDeckId}>
              <span className={styles.mobileOpponent} aria-hidden="true">対 {rows[index].myDeck.name}</span>
              <span className={styles.values}>
                <strong>{cell.winRate === null ? "—" : `${cell.winRate.toFixed(1)}%`}</strong>
                <small>{cell.total.toLocaleString("ja-JP")}戦{cell.isLowSample ? " · 参考" : ""}</small>
              </span>
            </td>)}
          </tr>)}</tbody>
        </table>
        <p className={styles.description}>{LOW_SAMPLE_THRESHOLD}戦未満は参考表示 · ミラー対戦を含む</p>
      </>}
  </section>;
}
