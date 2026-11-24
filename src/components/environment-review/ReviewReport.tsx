"use client";
import { useMemo, useState, type ReactNode } from "react";
import { ClassIcon } from "@/components/ClassIcon";
import { ATOMIC_RANK_GROUPS, getRankSelectionLabel } from "@/lib/rank-selection";
import type { Divergence } from "@/lib/environment-review/evaluation";
import { changeLabel, jst, matchupLabel, percent, tierLabel, type Publication } from "@/lib/environment-review/publication";

const panel = "min-w-0 rounded-md border border-slate-200 bg-white p-4 sm:p-5";
const title = "mb-3 text-lg font-bold";
const badge = "inline-block rounded border border-slate-200 bg-slate-50 px-2 py-1 text-xs font-semibold";
const tierNames = ["環境トップ", "環境上位", "環境中堅", "環境下位", "現環境では厳しい", "判断材料不足"];
type Deck = Publication["payload"]["snapshot"]["decks"][number];
type GapRow = { id: string; name: string; gap: Divergence; metrics: string; reason: string; confidence: string };

function DeckName({ deck }: { deck: Deck }) {
  return <span className="inline-flex min-w-0 items-center gap-2"><ClassIcon className={deck.className} size={24} /><span className="break-words font-semibold">{deck.name}</span></span>;
}

function Gaps({ heading, rows, comparison }: { heading: string; rows: GapRow[]; comparison: string }) {
  const ordered = [...rows].sort((a,b) => b.gap.importance - a.gap.importance || a.id.localeCompare(b.id));
  function item(row: GapRow) {
    return <article key={row.id} className="grid gap-1 border-t border-slate-200 py-3">
      <h4 className="font-bold">{row.name}</h4>
      <div className="flex flex-wrap items-center gap-2"><span className={badge}>{row.gap.status}</span><strong className="text-sky-800">{row.gap.direction}</strong><span className="text-sm">信頼度 {row.confidence}</span></div>
      <p className="text-sm text-muted">{row.metrics}</p>
      <p><b>確認できた事実　</b>{row.gap.facts}</p>
      {row.gap.hypothesis && <p><b>要因の仮説　</b>{row.gap.hypothesis}</p>}
      <p><b>評価理由　</b>{row.reason}</p>
    </article>;
  }
  return <section className={panel}><h3 className={title}>{heading}</h3>
    {rows.length > 0 && <p className="mb-2 text-sm text-muted">確認済みは資料との評価差を示します。原因は仮説として表示します。</p>}
    {comparison !== "available" && <p className="mb-2 text-sm text-amber-900">{comparison === "unavailable" ? "外部情報が不足しており、比較できません。" : "一部の対象は外部情報が不足しており、比較できません。"}</p>}
    {!rows.length && comparison !== "unavailable" && <p>大きな評価の乖離は確認されていません。</p>}
    {ordered.slice(0,5).map(item)}{ordered.length > 5 && <details><summary className="cursor-pointer py-2">残り{ordered.length - 5}件を表示</summary>{ordered.slice(5).map(item)}</details>}
  </section>;
}

function Matrix({ publication }: { publication: Publication }) {
  const { snapshot, evaluation } = publication.payload;
  const [rowPage, setRowPage] = useState(0), [colPage, setColPage] = useState(0);
  const [selected, select] = useState<[Deck, Deck] | null>(null);
  const ratings = useMemo(() => new Map(evaluation.pairs.map(p => [p.a + "/" + p.b,p])), [evaluation]);
  const measured = useMemo(() => new Map(snapshot.pairs.map(p => [p.a + "/" + p.b,p])), [snapshot]);
  const size = 8, decks = snapshot.decks;
  function detail(row: Deck, col: Deck) {
    const forward = row.deckId < col.deckId;
    const key = forward ? row.deckId + "/" + col.deckId : col.deckId + "/" + row.deckId;
    const pair = ratings.get(key), data = measured.get(key);
    return { label: matchupLabel(pair?.rating == null ? null : pair.rating * (forward ? 1 : -1)),
      rate: data?.winRate == null ? null : forward ? data.winRate : 100 - data.winRate,
      count: data?.count ?? 0, pair, data, forward };
  }
  function pages(label: string, value: number, set: (n: number) => void) {
    if (decks.length <= size) return null;
    return <label className="grid gap-1 text-sm">{label}<select className="rounded border bg-white p-2" value={value} onChange={e => set(Number(e.target.value))}>{Array.from({length: Math.ceil(decks.length / size)}, (_, i) => <option key={i} value={i}>{i * size + 1}–{Math.min((i + 1) * size,decks.length)}　{decks[i*size].name} ほか</option>)}</select></label>;
  }
  const columns = decks.slice(colPage*size, (colPage+1)*size);
  const active = selected && detail(...selected);
  return <section className={panel}><h3 className={title}>総合対面相性表</h3>
    <p className="mb-3 text-sm text-muted">行のデッキから見た総合評価です。セルを選ぶと実測対面勝率と判断理由を確認できます。</p>
    <div className="flex flex-wrap gap-3">{pages("行の範囲", rowPage, setRowPage)}{pages("列の範囲", colPage, setColPage)}</div>
    {decks.length > 0 ? <div className="matrix-scrollbar my-2 overflow-x-auto"><table className="w-max min-w-full border-collapse text-sm"><thead><tr><th className="p-2 text-left">使用 ＼ 対面</th>{columns.map(d => <th className="max-w-36 break-words p-2" scope="col" key={d.deckId}>{d.name}</th>)}</tr></thead>
      <tbody>{decks.slice(rowPage*size,(rowPage+1)*size).map(row => <tr key={row.deckId}><th scope="row" className="sticky left-0 max-w-36 break-words border border-slate-200 bg-white p-2 text-left">{row.name}</th>
        {columns.map(col => { const mirror = row.deckId === col.deckId, value = detail(row,col);
          return <td key={col.deckId} className="border border-slate-200 p-1 text-center">{mirror ? <span className="text-muted">ミラー</span> :
            <button className={`min-h-10 rounded px-2 ${value.label.includes("有利") ? "bg-emerald-50 text-emerald-900" : value.label.includes("不利") ? "bg-amber-50 text-amber-900" : "bg-slate-50"}`} aria-label={row.name + " 対 " + col.name + " " + value.label} onClick={() => select([row,col])}>{value.label}</button>}</td>;
        })}</tr>)}</tbody></table></div> : <p>評価対象のデッキがありません。</p>}
    {active && selected && <div className="rounded-md bg-slate-50 p-3" aria-live="polite"><b>{selected[0].name} 対 {selected[1].name}</b><p>総合 {active.label} ／ 実測 {percent(active.rate)}（{active.count}件）</p>
      {active.data?.details && <div className="mt-1 text-sm">
        <p>データ相性　{matchupLabel(active.data.dataRating === null ? null : active.data.dataRating * (active.forward ? 1 : -1))} ／ 実測の信頼度　{active.data.details.measuredConfidence}</p>
        <p>判定材料（{active.forward ? selected[0].name : selected[1].name}視点）　{active.data.details.assessment} ／ 勝率の95%区間　{intervalLabel(active.data.details.interval95)}</p>
      </div>}
      {active.pair && <p className="mt-1 text-sm">判断理由（{active.forward ? selected[0].name : selected[1].name}視点）　{active.pair.reason} ／ 信頼度 {active.pair.confidence}</p>}</div>}
  </section>;
}

export function ReviewReport({ publication, preview = false }: { publication: Publication; preview?: boolean }) {
  const { snapshot: s, evaluation: ev, previousTiers: prior } = publication.payload;
  const names = new Map(s.decks.map(d => [d.deckId,d]));
  const assessments = new Map(ev.decks.map(d => [d.deckId,d]));
  const pairs = new Map(s.pairs.map(p => [p.a + "/" + p.b,p]));
  const state = preview ? "公開前プレビュー" : Date.now() - Date.parse(s.asOf) > 36 * 3600000 ? "更新遅延" : !ev.decks.some(d => d.tier !== null) ? "評価保留" : "更新済み";
  const deckGaps: GapRow[] = ev.decks.flatMap(d => {
    const measured = names.get(d.deckId);
    if (!measured || !d.divergence) return [];
    return [{ id:d.deckId,name:measured.name,gap:d.divergence,reason:d.reason,confidence:d.confidence,metrics:
      `実測勝率 ${percent(measured.winRate)} ／ 遭遇率 ${percent(measured.encounterRate)} ／ 評価 ${measured.count}件 ／ データ ${tierLabel(measured.dataTier)} → 総合 ${tierLabel(d.tier)}` }];
  });
  const pairGaps: GapRow[] = ev.pairs.flatMap(p => {
    if (!p.divergence) return [];
    const id = p.a + "/" + p.b, m = pairs.get(id);
    return [{ id, name: `${names.get(p.a)?.name} 対 ${names.get(p.b)?.name}`, gap:p.divergence,reason:p.reason,confidence:p.confidence,
      metrics: `実測対面勝率 ${percent(m?.winRate ?? null)} ／ ${m?.count ?? 0}件 ／ データ ${matchupLabel(m?.dataRating ?? null)} → 総合 ${matchupLabel(p.rating)}` }];
  });
  const fact = (label: string, value: ReactNode) => <div key={label}><dt className="text-xs text-muted">{label}</dt><dd className="mt-1 font-semibold">{value}</dd></div>;
  return <div className="grid min-w-0 gap-4 break-words text-ink">
    <section className={panel}><div className="flex flex-wrap items-center justify-between gap-2"><h2 className="text-xl font-bold">総合環境評価</h2><span className={badge}>{state}</span></div>
      <p className="my-3 text-sm text-muted">SV Match Logの実戦データを主軸とし、外部情報も参考にした独自の評価です。総合評価と実測勝率は異なる指標です。</p>
      <dl className="grid grid-cols-2 gap-3 border-t border-slate-200 pt-3 text-sm md:grid-cols-3">
        {fact("対象環境",s.environmentName)}{fact("最終正常更新（JST）",preview ? "公開前" : jst(publication.published_at))}
        {fact("対象ランク",getRankSelectionLabel(s.ranks))}{fact("分析対象期間（JST）",jst(s.periodStart) + " ～ " + jst(s.asOf))}
        {fact("対象対戦データ",s.matchCount.toLocaleString("ja-JP") + "件")}{fact("うち直近3日",s.shortMatchCount.toLocaleString("ja-JP") + "件")}
      </dl></section>
    <section className={panel}><h3 className={title}>環境総評</h3><b className="text-sm text-sky-800">確認できた事実</b><p className="mb-3 whitespace-pre-line">{ev.overview.facts}</p>
      {ev.overview.hypothesis && <><b className="text-sm text-muted">AIによる考察</b><p className="whitespace-pre-line">{ev.overview.hypothesis}</p></>}</section>
    <section className={panel}><h3 className={title}>総合Tier表</h3>{[1,2,3,4,5,null].map((v,i) => <div key={i} className="grid grid-cols-[6.5rem_1fr] gap-3 border-t border-slate-200 py-2">
      <div><strong>{tierLabel(v)}</strong><p className="text-xs text-muted">{tierNames[i]}</p></div><div className="flex flex-wrap items-center gap-2">{ev.decks.filter(d => d.tier === v).map(d => <span key={d.deckId} className="grid rounded-md bg-slate-50 px-2 py-1"><DeckName deck={names.get(d.deckId)!} /><small className="text-muted">{changeLabel(prior[d.deckId],v)}</small></span>)}
      {!ev.decks.some(d => d.tier === v) && <span className="text-sm text-muted">該当なし</span>}</div></div>)}</section>
    <section className={panel}><h3 className={title}>デッキ別総合評価</h3>{s.decks.map(d => {
      const e = assessments.get(d.deckId);
      if (!e) return null;
      return <details key={d.deckId} className="border-t border-slate-200 py-2"><summary className="cursor-pointer"><DeckName deck={d} />　{tierLabel(e.tier)} <small className="text-muted">信頼度 {e.confidence}</small></summary>
        <dl className="my-3 grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">{fact("クラス",d.className)}{fact("遭遇率",percent(d.encounterRate))}{fact("実測勝率（7日）",percent(d.winRate))}{fact("評価件数",d.count + "件")}{fact("使用時勝率",percent(d.useWinRate))}{fact("データ評価",tierLabel(d.dataTier))}{fact("前回との差",changeLabel(prior[d.deckId],e.tier))}</dl>
        {d.details && <div className="mb-3 rounded-md bg-slate-50 p-3 text-sm">
          <dl className="grid grid-cols-2 gap-2 sm:grid-cols-4">{fact("Tier判定対象の実測勝率",percent(d.details.eligibleWinRate))}
            {fact("Tier判定対象件数",d.details.eligibleCount+"件")}{fact("95% Wilson区間",intervalLabel(d.details.interval95))}
            {fact("実測の信頼度",d.details.measuredConfidence)}</dl>
          <p className="mt-2">Tier判定ではミラー、その他・未分類を含む対戦を除き、使用側と相手側の両視点を集計します。ランクは戦績登録者のものです。</p>
          <p>データ {tierLabel(d.dataTier)} → 総合 {tierLabel(e.tier)} ／ 総合の信頼度 {e.confidence}</p>
        </div>}
        <p><b>評価理由　</b>{e.reason}</p><DeckMetrics deck={d} /></details>;
    })}</section>
    <Gaps heading="実測データと評価の乖離分析" rows={deckGaps} comparison={ev.comparison} />
    <Matrix publication={publication} /><Gaps heading="対面相性の乖離分析" rows={pairGaps} comparison={ev.comparison} />
    <section className={panel}><h3 className={title}>前回評価からの変更点</h3><p className="whitespace-pre-line">{ev.changes || "初回評価"}</p></section>
  </div>;
}
function intervalLabel(value: [number, number] | null) {
  return value ? percent(value[0]) + " ～ " + percent(value[1]) : "観測なし";
}
function DeckMetrics({ deck }: {deck: Deck}) {
  const rankLabels = new Map<string,string>(ATOMIC_RANK_GROUPS.flatMap(g => g.options.map(o => [o.value,o.fullLabel] as const)));
  function breakdown(label:string, rows:Deck["byDay"], names?:Map<string,string>) {
    return <details><summary className="cursor-pointer py-2">{label}</summary><div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead><tr>{["区分","遭遇率","実測勝率","評価件数"].map(s=><th key={s} scope="col" className="p-1">{s}</th>)}</tr></thead>
      <tbody>{Object.entries(rows).sort(([a],[b])=>a.localeCompare(b)).map(([key,r])=><tr className="border-t" key={key}><th scope="row" className="p-1">{names?.get(key)??key}</th><td>{percent(r.encounterRate)}</td><td>{percent(r.winRate)}</td><td>{r.count}件</td></tr>)}</tbody></table></div></details>;
  }
  return <div className="mt-2 text-sm"><p>直近3日　実測勝率 {percent(deck.short.winRate)} ／ 遭遇率 {percent(deck.short.encounterRate)} ／ 評価 {deck.short.count}件</p>
    {breakdown("ランク帯別成績",deck.byRank,rankLabels)}{breakdown("日別の遭遇率・勝率",deck.byDay)}</div>;
}
