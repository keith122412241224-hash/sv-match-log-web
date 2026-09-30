import type { ReactNode } from "react";
import { ENVIRONMENT_PERIODS, ENVIRONMENT_RANKS, buildEnvironmentView, formatEnvironmentPercent as percent, publicStatusLabel, type EnvironmentDashboard, type Trend } from "@/lib/environment-dashboard";
import { formatJstDateTime } from "@/lib/utils";

const integer = (n: number) => n.toLocaleString("ja-JP");
type Row = ReturnType<typeof buildEnvironmentView>["rows"][number];
function Panel({ title, children }: { title: string; children: ReactNode }) {
  return <section className="min-w-0 rounded-md border border-slate-200 bg-white p-4"><h2 className="mb-4 text-lg font-bold">{title}</h2>{children}</section>;
}
export function TrendText({ trend }: { trend: Trend }) {
  const labels = { increase: "↑ 増加", decrease: "↓ 減少", flat: "→ 横ばい", no_comparison: "比較データなし", insufficient: "比較サンプル不足",
    privacy_suppressed: "データ量が少ないため非表示", no_previous: "前期間の観測なし", no_current: "今期の観測なし", unclassified: "比較対象外" };
  return <div className="text-sm"><span className={trend.state === "increase" ? "font-semibold text-emerald-800" : trend.state === "decrease" ? "font-semibold text-blue-800" : "text-muted"}>{labels[trend.state]}</span>
    {trend.current !== null && trend.previous !== null && <div className="mt-1 text-xs text-muted">前期間 {percent(trend.previous)} → 今期 {percent(trend.current)}</div>}
  </div>;
}
function EncounterText({ row, total }: { row: Row; total: number | null }) {
  return row.encounterRate === null ? <span className="text-sm text-muted">{publicStatusLabel(row.current.encounter.status)}</span>
    : <span className="text-sm"><strong>{percent(row.encounterRate)}</strong><span className="block text-xs text-muted">{integer(row.current.encounter.count!)}件 / 登録{integer(total!)}件</span></span>;
}
function WinText({ row }: { row: Row }) {
  return row.winRate === null ? <span className="text-sm text-muted">{publicStatusLabel(row.current.winrate.status)}</span>
    : <span className="text-sm"><strong>{percent(row.winRate)}</strong>{row.sample && <span className="ml-2 inline-block rounded bg-amber-50 px-2 py-1 text-xs text-amber-900">{row.sample}</span>}</span>;
}
export function EnvironmentData({ data }: { data: EnvironmentDashboard }) {
  const view = buildEnvironmentView(data), total = data.current.total;
  const noRanking = total.status === "available" ? "公開条件を満たすデータがありません。" : publicStatusLabel(total.status);
  return <>
    <section aria-label="集計条件" className="rounded-md border border-slate-200 bg-white p-4 text-sm">
      <p className="mb-2 text-muted">直近{ENVIRONMENT_PERIODS.find(p => p.value === data.period)!.label} / {ENVIRONMENT_RANKS.find(r => r.value === data.rankFilter)!.label}</p>
      <p className="font-semibold">登録戦績：{total.status === "available" ? `${integer(total.totalMatches!)}件` : total.status === "no_data" ? "データなし" : publicStatusLabel(total.status)}</p>
      <p className="mt-2">集計対象：{formatJstDateTime(data.dataThrough)}まで（JST）</p>
      <p className="mt-1 text-xs text-muted">今期：{formatJstDateTime(data.current.start)} ～ {formatJstDateTime(data.current.end)}（終了時刻は含みません）</p>
      <p className="mt-1 text-xs text-muted">前期間：{formatJstDateTime(data.previous.start)} ～ {formatJstDateTime(data.previous.end)}（JST）</p>
      <p className="mt-2 text-xs text-muted">30分単位の集計対象時刻です。ランクは登録者の対戦時点の条件で、「すべて」は未登録も含みます。</p>
    </section>
    <div className="grid gap-4 lg:grid-cols-2">
      <Panel title="遭遇率TOP5">
        <p className="mb-4 text-xs text-muted">相手として観測された登録件数 ÷ 同条件の総登録件数</p>
        {view.encounters.length ? <ol className="space-y-4">{view.encounters.map((d, i) => <li key={d.key}>
          <div className="mb-1 flex flex-wrap items-start justify-between gap-2"><span className="min-w-0 break-words text-sm font-semibold">{i + 1}. {d.name}</span><EncounterText row={d} total={total.totalMatches} /></div>
          <div aria-hidden="true" className="h-2 rounded bg-slate-100"><div className="h-2 rounded bg-sky-600" style={{ width: `${d.encounterRate}%` }} /></div>
        </li>)}</ol> : <p className="text-sm text-muted">{noRanking}</p>}
      </Panel>
      <Panel title="勝率TOP5">
        <p className="mb-4 text-xs text-muted">直接＋相手側反転（mirror込み）。対象10登録以上。10〜29登録は参考値です。</p>
        {view.wins.length ? <ol className="space-y-4">{view.wins.map((d, i) => <li key={d.key} className="flex flex-wrap items-start justify-between gap-2 border-b border-slate-100 pb-3">
          <span className="min-w-0 break-words text-sm font-semibold">{i + 1}. {d.name}</span><div><WinText row={d} /><p className="mt-1 text-sm text-muted">評価{integer(d.current.winrate.evaluationCount!)}件・対象{integer(d.current.winrate.targetRegistrations!)}登録</p></div>
        </li>)}</ol> : <p className="text-sm text-muted">{noRanking}</p>}
      </Panel>
      {([ ["増加TOP3", view.increases], ["減少TOP3", view.decreases] ] as const).map(([title, rows]) => <Panel key={title} title={title}>
        {rows.length ? <ol className="space-y-4">{rows.map(d => <li key={d.key}><p className="mb-1 break-words text-sm font-semibold">{d.name}</p><TrendText trend={d.trend} /></li>)}</ol>
          : <p className="text-sm text-muted">比較条件を満たす{title === "増加TOP3" ? "増加" : "減少"}データがありません。</p>}
        <p className="mt-4 text-xs text-muted">両期間30登録以上で比較。遭遇率の変化が±0.5ポイント未満なら横ばいです。比較できない理由はデッキ別データに表示します。</p>
      </Panel>)}
    </div>
    <Panel title="デッキ別データ">
      <p id="environment-count-help" className="mb-4 text-xs leading-relaxed text-muted">対象登録件数は、そのデッキが自分または相手に登場した登録数です。評価件数は直接＋反転の件数で、mirrorの1登録は2評価になります。勝率の対象1〜9登録はサンプル不足、10〜29登録は参考値です。未分類はランキングと比較の対象外です。</p>
      <table aria-describedby="environment-count-help" className="hidden w-full table-fixed text-left text-sm lg:table">
        <thead className="bg-slate-50"><tr>{["デッキ", "遭遇率", "勝率", "評価件数", "対象登録件数", "前期間比較"].map(h => <th scope="col" key={h} className="p-3">{h}</th>)}</tr></thead>
        <tbody>{view.rows.map(d => <tr key={d.key} className="border-t border-slate-100">
          <th scope="row" className="break-words p-3">{d.name}</th><td className="p-3"><EncounterText row={d} total={total.totalMatches} /></td><td className="p-3"><WinText row={d} /></td>
          <td className="p-3">{d.current.winrate.status === "available" ? `${integer(d.current.winrate.evaluationCount!)}件` : "—"}</td>
          <td className="p-3">{d.current.winrate.status === "available" ? `${integer(d.current.winrate.targetRegistrations!)}登録` : "—"}</td><td className="p-3"><TrendText trend={d.trend} /></td>
        </tr>)}</tbody>
      </table>
      <div className="divide-y divide-slate-200 lg:hidden">{view.rows.map(d => <article key={d.key} className="space-y-3 py-4 first:pt-0">
        <h3 className="break-words font-semibold">{d.name}</h3>
        <div className="flex flex-wrap items-start gap-x-3 gap-y-1"><span className="text-sm">遭遇率</span><EncounterText row={d} total={total.totalMatches} /></div>
        <div className="flex flex-wrap items-start gap-x-3 gap-y-1"><span className="text-sm">勝率</span><div><WinText row={d} />{d.current.winrate.status === "available" && <p className="mt-1 text-sm text-muted">評価{integer(d.current.winrate.evaluationCount!)}件・対象{integer(d.current.winrate.targetRegistrations!)}登録</p>}</div></div>
        <TrendText trend={d.trend} />
      </article>)}</div>
    </Panel>
  </>;
}
