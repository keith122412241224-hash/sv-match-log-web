"use client";

import { dashboardPeriodLabel } from "@/lib/environment-dashboard-period";
import { useState, type ReactNode } from "react";
import { SHADOWVERSE_CLASSES } from "@/lib/constants";
import { buildEnvironmentViewV4, type EnvironmentDashboardV4 } from "@/lib/environment-dashboard-v4";
import { getRankSelectionLabel } from "@/lib/rank-selection";
import { formatEnvironmentPercent as percent, sampleLabel, type Trend } from "@/lib/environment-dashboard";
import { formatJstDateTime } from "@/lib/utils";

const integer = (n: number) => n.toLocaleString("ja-JP");
type Row = ReturnType<typeof buildEnvironmentViewV4>["rows"][number];
const unsetClass = "クラス未設定";
const classNames: readonly string[] = [...SHADOWVERSE_CLASSES, unsetClass];
const deckClass = (row: Row) => classNames.includes(row.className ?? "") ? row.className! : unsetClass;
type DeckOptions = { className: string; trend: "all" | "increase" | "decrease" | "flat"; sort: "encounter" | "win" | "delta" | "count"; grouped: boolean };
const defaultOptions: DeckOptions = { className: "all", trend: "all", sort: "encounter", grouped: false };
const sortOptions = [ ["encounter", "遭遇率が高い順"], ["win", "勝率が高い順"], ["delta", "増減幅が大きい順"], ["count", "対象戦績数が多い順"] ] as const;
const trendOptions = [ ["all", "すべて"], ["increase", "増加"], ["decrease", "減少"], ["flat", "横ばい"] ] as const;
export function filterEnvironmentDeckRows(rows: Row[], options: DeckOptions): Row[] {
  const value = (row: Row) => options.sort === "win" ? row.winRate : options.sort === "count" ? row.current.winrate.evaluationCount
    : options.sort === "delta" ? row.trend?.delta == null ? null : Math.abs(row.trend.delta) : row.encounterRate;
  const descending = (a: number | null, b: number | null) => a === null ? b === null ? 0 : 1 : b === null ? -1 : b - a;
  return rows.filter(row => (options.className === "all" || deckClass(row) === options.className)
    && (options.trend === "all" || row.trend?.state === options.trend))
    .sort((a, b) => descending(value(a), value(b)) || descending(a.encounterRate, b.encounterRate) || (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
}
function Panel({ title, children }: { title: string; children: ReactNode }) {
  return <section className="min-w-0 rounded-md border border-slate-200 bg-white p-4"><h2 className="mb-4 text-lg font-bold">{title}</h2>{children}</section>;
}
export function TrendText({ trend, detailed = false }: { trend: Trend; detailed?: boolean }) {
  const labels = { increase: "↑ 増加", decrease: "↓ 減少", flat: "→ 横ばい", no_comparison: "比較データなし", insufficient: "比較できるデータがまだありません",
    privacy_suppressed: "比較データなし", no_previous: "前期間の観測なし", no_current: "今期の観測なし", unclassified: "比較対象外" };
  return <div className="text-sm"><span className={trend.state === "increase" ? "font-semibold text-emerald-800" : trend.state === "decrease" ? "font-semibold text-blue-800" : "text-muted"}>{labels[trend.state]}</span>
    {trend.current !== null && trend.previous !== null && <div className="mt-1 text-xs text-muted">前期間 {percent(trend.previous)} → 今期 {percent(trend.current)}</div>}
    {detailed && trend.delta !== null && <div className="mt-1 text-xs font-semibold">{trend.delta > 0 ? "+" : trend.delta < 0 ? "−" : "±"}{Math.abs(trend.delta).toFixed(2)}ポイント</div>}
  </div>;
}
function EncounterText({ row, total }: { row: Row; total: number | null }) {
  return row.encounterRate === null ? <span className="text-sm text-muted">観測なし</span>
    : <span className="text-sm"><strong>{percent(row.encounterRate)}</strong><span className="block text-xs text-muted">{integer(row.current.encounter.status === "no_data" ? 0 : row.current.encounter.count)}件 / 登録{integer(total!)}件</span></span>;
}
function WinText({ row, detailed = false }: { row: Row; detailed?: boolean }) {
  return row.winRate === null ? <span className="text-sm text-muted">観測なし</span>
    : <span className="text-sm"><strong>{percent(row.winRate)}</strong>{detailed && sampleLabel(row.current.winrate) && <span className="mt-1 block text-xs text-muted">{sampleLabel(row.current.winrate)}：登場した登録戦績{integer(row.current.winrate.targetRegistrations!)}件</span>}</span>;
}
function DeckRows({ rows, total, comparison, grouped }: { rows: Row[]; total: number | null; comparison: boolean; grouped: boolean }) {
  const Heading = grouped ? "h4" : "h3";
  const name = (row: Row) => <><Heading className="break-words font-semibold">{row.name}</Heading><p className="mt-1 text-xs font-normal text-muted">{deckClass(row)}</p></>;
  const trend = (row: Row) => row.trend && <><TrendText trend={row.trend} detailed />
    <p className="mt-1 text-xs text-muted">相手としての観測：前期{integer(row.previous?.encounter.count ?? 0)}件 → 今期{integer(row.current.encounter.count ?? 0)}件</p></>;
  return <>
    <table aria-describedby="environment-count-help environment-deck-help" className="hidden w-full table-fixed text-left text-sm lg:table">
      <caption className="sr-only">{grouped ? deckClass(rows[0]) + "の" : ""}デッキ別データ</caption>
      <thead className="bg-slate-50"><tr>{["デッキ", "遭遇率", "勝率", "対象戦績数", ...(comparison ? ["前期間比較"] : [])].map(h => <th scope="col" key={h} className="p-3">{h}</th>)}</tr></thead>
      <tbody>{rows.map(row => <tr key={row.key} data-deck-id={row.key} className="border-t border-slate-100">
        <th scope="row" className="break-words p-3"><span>{row.name}</span><span className="mt-1 block text-xs font-normal text-muted">{deckClass(row)}</span></th>
        <td className="p-3"><EncounterText row={row} total={total} /></td><td className="p-3"><WinText row={row} detailed /></td>
        <td className="p-3">{row.current.winrate.status === "available" ? `${integer(row.current.winrate.evaluationCount!)}件` : "—"}</td>
        {comparison && <td className="p-3">{trend(row)}</td>}
      </tr>)}</tbody>
    </table>
    <div className="divide-y divide-slate-200 lg:hidden">{rows.map(row => <article key={row.key} data-deck-id={row.key} className="space-y-3 py-4 first:pt-0">
      <div>{name(row)}</div>
      <div className="flex flex-wrap items-start gap-x-3 gap-y-1"><span className="text-sm">遭遇率</span><EncounterText row={row} total={total} /></div>
      <div className="flex flex-wrap items-start gap-x-3 gap-y-1"><span className="text-sm">勝率</span><div><WinText row={row} detailed />{row.current.winrate.status === "available" && <p className="mt-1 text-sm text-muted">対象戦績数{integer(row.current.winrate.evaluationCount)}件</p>}</div></div>
      {comparison && <div>{trend(row)}</div>}
    </article>)}</div>
  </>;
}
export function EnvironmentData({ data, activeDeckIds }: { data: EnvironmentDashboardV4; activeDeckIds: string[] }) {
  const [options, setOptions] = useState<DeckOptions>(defaultOptions);
  const view = buildEnvironmentViewV4(data), total = data.current.total;
  // Filter the displayed catalog only; registration totals and rates keep their original population.
  const activeDecks = new Set(activeDeckIds);
  const visibleRows = view.rows.filter(d => d.key !== "unclassified" && activeDecks.has(d.key));
  const filteredRows = filterEnvironmentDeckRows(visibleRows, options);
  const groups = options.grouped ? classNames.map(name => ({ name, rows: filteredRows.filter(row => deckClass(row) === name) })).filter(group => group.rows.length) : [{ name: "", rows: filteredRows }];
  const noRanking = "表示できるデータがありません。";
  return <>
    <section aria-label="集計条件" className="rounded-md border border-slate-200 bg-white p-4 text-sm">
      <p className="mb-2 text-muted">{dashboardPeriodLabel(data.period)} / {getRankSelectionLabel(data.rankFilters)}</p>
      <p className="font-semibold">登録戦績：{total.status === "available" ? `${integer(total.totalMatches)}件` : "データなし"}</p>
      <p className="mt-2">集計対象：{formatJstDateTime(data.dataThrough)}まで（JST）</p>
      {data.current.start !== null && <p className="mt-1 text-xs text-muted">今期：{formatJstDateTime(data.current.start)} ～ {formatJstDateTime(data.current.end)}（終了時刻は含みません）</p>}
      {data.previous && <p className="mt-1 text-xs text-muted">前期間：{formatJstDateTime(data.previous.start)} ～ {formatJstDateTime(data.previous.end)}（JST）</p>}
      {data.endSource === "configured" && <p className="mt-1 text-xs text-muted">集計基準：設定した集計終了時点（{formatJstDateTime(data.dataThrough)} JST）</p>}
      {data.period === "all" && <p className="mt-1 text-xs text-muted">全期間では前期間比較を行いません。終了時刻は含みません。</p>}
      <p className="mt-2 text-xs text-muted">{data.endSource !== "configured" && "30分単位の集計対象時刻です。"}ランクは登録者の対戦時点の条件で、「すべて」は未登録も含みます。</p>
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
        <p className="mb-4 text-xs text-muted">登場した登録戦績が10件以上のデッキを表示します。</p>
        {view.wins.length ? <ol className="space-y-4">{view.wins.map((d, i) => <li key={d.key} className="flex flex-wrap items-start justify-between gap-2 border-b border-slate-100 pb-3">
          <span className="min-w-0 break-words text-sm font-semibold">{i + 1}. {d.name}</span><div><WinText row={d} /><p className="mt-1 text-sm text-muted">対象戦績数{integer(d.current.winrate.evaluationCount!)}件</p></div>
        </li>)}</ol> : <p className="text-sm text-muted">{noRanking}</p>}
      </Panel>
      {data.previous && ([ ["増加TOP3", view.increases], ["減少TOP3", view.decreases] ] as const).map(([title, rows]) => <Panel key={title} title={title}>
        <p className="mb-4 text-xs text-muted">前の期間より遭遇率が{title === "増加TOP3" ? "増えた" : "減った"}デッキを表示します。</p>
        {rows.length ? <ol className="space-y-4">{rows.map(d => <li key={d.key}><p className="mb-1 break-words text-sm font-semibold">{d.name}</p>{d.trend && <TrendText trend={d.trend} />}</li>)}</ol>
          : <p className="text-sm text-muted">{data.previous?.total.status === "no_data" ? "前の期間のデータがありません。" : total.status === "no_data" ? "今の期間のデータがありません。" : `比較できる${title === "増加TOP3" ? "増加" : "減少"}データがありません。`}</p>}
      </Panel>)}
    </div>
    <Panel title="デッキ別データ">
      <div className="mb-4 grid min-w-0 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <label className="grid min-w-0 gap-2 text-sm font-semibold">クラス
          <select value={options.className} onChange={e => setOptions({ ...options, className: e.target.value })} className="min-h-11 w-full min-w-0 rounded-md border border-slate-300 bg-white px-2 text-base">
            <option value="all">すべて</option>{classNames.filter(name => name !== unsetClass || visibleRows.some(row => deckClass(row) === unsetClass)).map(name => <option key={name}>{name}</option>)}
          </select>
        </label>
        <label className="grid min-w-0 gap-2 text-sm font-semibold">前期間比較
          <select value={options.trend} disabled={!data.previous} onChange={e => setOptions({ ...options, trend: e.target.value as DeckOptions["trend"] })} className="min-h-11 w-full min-w-0 rounded-md border border-slate-300 bg-white px-2 text-base disabled:bg-slate-100">
            {trendOptions.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
        </label>
        <label className="grid min-w-0 gap-2 text-sm font-semibold">並び替え
          <select value={options.sort} onChange={e => setOptions({ ...options, sort: e.target.value as DeckOptions["sort"] })} className="min-h-11 w-full min-w-0 rounded-md border border-slate-300 bg-white px-2 text-base">
            {sortOptions.map(([value, label]) => <option key={value} value={value} disabled={value === "delta" && !data.previous}>{label}</option>)}
          </select>
        </label>
        <fieldset className="min-w-0"><legend className="mb-2 text-sm font-semibold">表示形式</legend><div className="flex flex-wrap gap-1">
          {([false, true] as const).map(grouped => <button key={String(grouped)} type="button" aria-pressed={options.grouped === grouped} onClick={() => setOptions({ ...options, grouped })} className="min-h-11 rounded-md border border-slate-300 px-3 text-sm font-semibold aria-pressed:border-ink aria-pressed:bg-ink aria-pressed:text-white">{grouped ? "クラス別" : "一覧"}</button>)}
        </div></fieldset>
      </div>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2"><p role="status" className="text-sm">{filteredRows.length}件表示 / 全{visibleRows.length}件</p>
        <button type="button" onClick={() => setOptions(defaultOptions)} className="min-h-11 rounded-md border border-slate-300 px-3 text-sm font-semibold">表示条件をリセット</button>
      </div>
      <p id="environment-deck-help" className="mb-3 text-xs leading-relaxed text-muted">表示条件はこの一覧だけに適用され、集計値やTOPランキングは変わりません。{data.previous ? "増減幅は遭遇率の差（パーセンテージポイント）の絶対値で並べます。比較できないデッキは末尾に表示し、横ばいには含めません。" : "全期間では前期間比較と増減幅の並び替えを利用できません。"}少数データの数値は変動しやすいため、件数もあわせて確認してください。</p>
      <p id="environment-count-help" className="mb-4 text-xs leading-relaxed text-muted">対象戦績数は勝率計算に使った件数です。</p>
      <details className="mb-4 text-xs leading-relaxed text-muted">
        <summary className="w-fit cursor-pointer rounded py-2 font-semibold focus-visible:outline focus-visible:outline-2">集計について</summary>
        <dl className="mt-2 space-y-2">
          <div><dt className="font-semibold">対象戦績数</dt><dd>勝率計算に使った件数です。自分側と相手側を反転して集計するため、ミラーマッチは1戦から2件として集計されます。</dd></div>
          {data.previous && <div><dt className="font-semibold">前期間との比較</dt><dd>両期間の登録戦績がそれぞれ30件以上あり、両期間で相手として観測されたデッキを比較します。遭遇率の変化が±0.5ポイント未満なら横ばいです。増減幅は小数第2位に丸めて表示し、判定には丸め前の値を使います。</dd></div>}
        </dl>
      </details>
      {filteredRows.length === 0 && <p className="mb-4 text-sm text-muted">{visibleRows.length === 0 ? "この期間に対象戦績のあるデッキがありません。" : "条件に一致するデッキがありません。表示条件を変更するか、リセットしてください。"}</p>}
      {groups.map(group => <div key={group.name} className="mb-5 last:mb-0">
        {options.grouped && <h3 className="mb-3 rounded-md bg-slate-100 px-3 py-2 font-bold">{group.name}（{group.rows.length}件）</h3>}
        <DeckRows rows={group.rows} total={total.totalMatches} comparison={Boolean(data.previous)} grouped={options.grouped} />
      </div>)}
    </Panel>
  </>;
}
