"use client";
import { useId, useMemo, useState, type ReactNode } from "react";
import { ClassIcon } from "@/components/ClassIcon";
import { ATOMIC_RANK_GROUPS, getRankSelectionLabel } from "@/lib/rank-selection";
import type { Divergence } from "@/lib/environment-review/evaluation";
import { changeLabel, jst, matchupLabel, percent, tierLabel, type Publication } from "@/lib/environment-review/publication";

import { cellLabel, encounterTier, priority } from "@/lib/environment-review/assessment-v3";

const panel = "min-w-0 rounded-md border border-slate-200 bg-white p-4 sm:p-5";
const title = "mb-3 text-lg font-bold";
const badge = "inline-block rounded border border-slate-200 bg-slate-50 px-2 py-1 text-xs font-semibold";
const tierNames = ["環境トップ", "環境上位", "環境中堅", "環境下位", "環境下位・評価材料不足"];
type Deck = Publication["payload"]["snapshot"]["decks"][number];
type GapRow = { id: string; name: string; gap: Divergence; metrics: string; reason: string; confidence: string };

function ReviewIcon({ deck }: { deck: Deck }) {
  // The 160px class art includes wide margins around the centered emblem.
  return <span aria-hidden="true" className="inline-flex h-7 w-7 shrink-0 items-center justify-center overflow-hidden rounded-full bg-slate-900">
    <ClassIcon className={deck.className} size={28} imageClassName="scale-[2.15] brightness-125" />
  </span>;
}

function DeckName({ deck }: { deck: Deck }) {
  return <span className="inline-flex min-w-0 items-center gap-2"><ReviewIcon deck={deck} /><span className="break-words font-semibold">{deck.name}</span></span>;
}

const judgments = [
  { rating: 2, label: "有利", mark: "◎", color: "bg-emerald-700 text-white" },
  { rating: 1, label: "微有利", mark: "○", color: "bg-emerald-50 text-emerald-900" },
  { rating: 0, label: "五分", mark: "△", color: "bg-slate-100 text-ink" },
  { rating: -1, label: "微不利", mark: "▲", color: "bg-red-50 text-red-800" },
  { rating: -2, label: "不利", mark: "×", color: "bg-red-700 text-white" },
];
const judgmentByRating = new Map(judgments.map(item => [item.rating, item]));

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
  const [showAll, setShowAll] = useState(false);
  const [selected, select] = useState<[Deck, Deck] | null>(null);
  const ratings = useMemo(() => new Map(evaluation.pairs.map(p => [p.a + "/" + p.b,p])), [evaluation]);
  const measured = useMemo(() => new Map(snapshot.pairs.map(p => [p.a + "/" + p.b,p])), [snapshot]);
  const decks = useMemo(() => [...snapshot.decks].sort((a, b) =>
    (b.encounterRate ?? -1) - (a.encounterRate ?? -1) || a.deckId.localeCompare(b.deckId)), [snapshot]);
  const visible = showAll ? decks : decks.slice(0, 8);
  const shortNames = useMemo(() => {
    const labels = decks.map(d => d.className && d.name.endsWith(d.className) ? d.name.slice(0, -d.className.length) || d.name : d.name);
    return new Map(decks.map((d, i) => [d.deckId, labels.indexOf(labels[i]) === labels.lastIndexOf(labels[i]) ? labels[i] : d.name]));
  }, [decks]);
  function detail(row: Deck, col: Deck) {
    const forward = row.deckId < col.deckId;
    const key = forward ? row.deckId + "/" + col.deckId : col.deckId + "/" + row.deckId;
    const pair = ratings.get(key), data = measured.get(key);
    const rating=pair?.rating == null ? null : pair.rating*(forward ? 1 : -1);
    const count=data?.count ?? 0, canonicalWins=Math.round((data?.winRate ?? 0)*count/100);
    const wins=forward ? canonicalWins : count-canonicalWins;
    const provisional = rating !== null && (pair?.confidence === "低" || pair?.reason.includes("暫定評価"));
    const judgment = rating === null ? undefined : judgmentByRating.get(rating);
    return { judgment, provisional, wins,
      rate: data?.winRate == null ? null : forward ? data.winRate : 100 - data.winRate,
      count: data?.count ?? 0, pair, data, forward };
  }
  const active = selected && detail(...selected);
  return <section className={panel}><h3 className={title}>総合対面相性表</h3>
    <div className="mb-2 flex flex-wrap items-center justify-between gap-2 text-sm">
      <p className="text-muted">{showAll ? "全デッキ" : "遭遇率上位" + visible.length + "デッキ"}。縦が使用デッキ、横が対面です。</p>
      {decks.length > 8 && <button type="button" aria-pressed={showAll} className="min-h-10 rounded-md border px-3 font-semibold"
        onClick={() => { setShowAll(!showAll); select(null); }}>{showAll ? "主要8デッキに戻す" : "全" + decks.length + "デッキを表示"}</button>}
    </div>
    <ul aria-label="総合判定の凡例" className="mb-3 flex flex-wrap gap-x-3 gap-y-1 text-xs">
      {judgments.map(item => <li key={item.rating} className="inline-flex items-center gap-1">
        <b className={item.color + " inline-block min-w-5 rounded text-center"}>{item.mark}</b>{item.label}
      </li>)}
    </ul>
    {decks.length > 0 ? <div className="matrix-scrollbar my-2 max-h-[65vh] overflow-auto">
      <table className="w-full table-fixed border-collapse text-sm" style={{ minWidth: 96 + visible.length * 48 }}>
        <colgroup><col className="w-24 sm:w-32" />{visible.map(deck => <col key={deck.deckId} />)}</colgroup>
        <thead className="sticky top-0 z-10 bg-white"><tr>
          <th className="sticky left-0 bg-white p-1 text-left text-xs">使用 ＼ 対面</th>
          {visible.map(deck => <th key={deck.deckId} scope="col" aria-label={deck.name} title={deck.name} className="p-1 align-bottom">
            <span className="flex flex-col items-center gap-1"><ReviewIcon deck={deck} /><span className="break-all text-xs">{shortNames.get(deck.deckId)}</span></span>
          </th>)}
        </tr></thead>
        <tbody>{visible.map(row => <tr key={row.deckId}>
          <th scope="row" aria-label={row.name} title={row.name} className="sticky left-0 border border-slate-200 bg-white p-1 text-left">
            <span className="flex items-center gap-1"><ReviewIcon deck={row} /><span className="break-all text-xs">{shortNames.get(row.deckId)}</span></span>
          </th>
          {visible.map(col => {
            if (row.deckId === col.deckId) return <td key={col.deckId} className="border border-slate-200 text-center text-muted" aria-label="ミラー・評価対象外" title="ミラー・評価対象外">－</td>;
            const value = detail(row, col);
            const label = row.name + " 対 " + col.name + " " + (value.judgment?.label ?? "総合判定なし");
            return <td key={col.deckId} className="border border-slate-200 p-0.5 text-center">
              <button type="button" aria-label={label} title={label} aria-pressed={selected?.[0].deckId === row.deckId && selected[1].deckId === col.deckId}
                className={"block min-h-9 w-full rounded text-lg font-bold focus-visible:outline aria-pressed:ring-2 aria-pressed:ring-inset aria-pressed:ring-sky-700 " + (value.judgment?.color ?? "hover:bg-slate-50")}
                onClick={() => select([row, col])}>
                {value.judgment?.mark}
              </button>
            </td>;
          })}
        </tr>)}</tbody>
      </table></div> : <p>評価対象のデッキがありません。</p>}
    {active && selected && <div className="rounded-md bg-slate-50 p-3" aria-live="polite"><b>{selected[0].name} 対 {selected[1].name}</b><p>総合判定　{active.judgment?.label ?? "判定なし"}{active.provisional && "（暫定評価）"}</p>
      <p>実測勝率　{percent(active.rate)}（{active.count}戦）{!active.judgment && " ／ " + cellLabel(null, active.wins, active.count)}</p>
      {active.data?.details && <div className="mt-1 text-sm">
        <p>データ相性　{matchupLabel(active.data.dataRating === null ? null : active.data.dataRating * (active.forward ? 1 : -1))} ／ 実測の信頼度　{active.data.details.measuredConfidence}</p>
        <p>{active.wins}勝 {active.count-active.wins}敗 ／ 勝率の95%区間　{intervalLabel(active.forward || !active.data.details.interval95 ? active.data.details.interval95 : [100-active.data.details.interval95[1],100-active.data.details.interval95[0]])}</p>
        <p>登録者や構築による偏りは区間に含まれません。異なる登録者・構築での再現を確認してください。</p>
      </div>}
      {active.pair && <p className="mt-1 text-sm">判断理由（{active.forward ? selected[0].name : selected[1].name}視点）　{active.pair.reason} ／ 信頼度 {active.pair.confidence}</p>}</div>}
  </section>;
}

// Keep the stored wording, including qualifiers. The full text stays available.
function excerpt(text: string, limit: number) {
  const chars = Array.from(text.trim());
  if (chars.length <= limit) return text.trim();
  const prefix = chars.slice(0, limit - 1).join("");
  const end = prefix.lastIndexOf("。");
  return end >= 0 ? prefix.slice(0, end + 1) : prefix + "…";
}

function movement(before: number | null | undefined, after: number | null) {
  if (before === after) return "";
  if (before === undefined) return "新規";
  if (after === null) return "保留へ";
  if (before === null) return "保留解除";
  return before > after ? "↑" + (before - after) : "↓" + (after - before);
}

export function ReviewReport({ publication, preview = false }: { publication: Publication; preview?: boolean }) {
  const { snapshot: s, evaluation: ev, previousTiers: prior } = publication.payload;
  const [selectedId, selectDeck] = useState<string | null>(null);
  const detailId = useId();
  const hasPrevious = Object.keys(prior).length > 0;
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
  const ranked = [...ev.decks].filter(d => names.has(d.deckId)).sort((a, b) =>
    (a.tier ?? 6) - (b.tier ?? 6) ||
    (names.get(b.deckId)?.encounterRate ?? 0) - (names.get(a.deckId)?.encounterRate ?? 0));
  const shiftSize = (id: string, tier: number | null) =>
    typeof prior[id] === "number" && tier !== null ? Math.abs(prior[id] - tier) : 0;
  const changed = hasPrevious ? ranked.filter(d => d.tier !== prior[d.deckId]).sort((a, b) =>
    shiftSize(b.deckId, b.tier) - shiftSize(a.deckId, a.tier)) : [];
  const facts = excerpt(ev.overview.facts, 86);
  const hasMore = facts !== ev.overview.facts.trim() || Boolean(ev.overview.hypothesis);
  const d = selectedId ? names.get(selectedId) : undefined;
  const e = selectedId ? assessments.get(selectedId) : undefined;
  const rival = d && s.pairs.filter(p => p.a === d.deckId || p.b === d.deckId).sort((a,b) => b.count - a.count)[0];
  return <div className="grid min-w-0 gap-4 break-words text-ink">
    <header className={panel + " grid items-start gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]"}>
      <div>
        <h2 className="text-xl font-bold">{s.environmentName}</h2>
        <p className="mt-1 text-xs text-muted">{state}{!preview && "　" + jst(publication.published_at) + " JST"}</p>
        <p className="mt-2 text-sm text-muted">集計 {jst(s.periodStart)} ～ {jst(s.asOf)} JST　<strong className="text-ink">{s.matchCount.toLocaleString("ja-JP")}戦</strong></p>
      </div>
      <div className="border-t border-slate-200 pt-3 lg:border-l lg:border-t-0 lg:pl-5 lg:pt-0"><h3 className="mb-1 font-bold">環境総評</h3>
        <p className="leading-relaxed">{facts}</p>
        {hasMore && <details className="mt-1 text-sm"><summary className="cursor-pointer text-muted">総評の全文</summary><p>{ev.overview.facts}</p>{ev.overview.hypothesis && <p>考察　{ev.overview.hypothesis}</p>}</details>}
        <p className="mt-2 text-xs text-muted">{ev.comparison === "unavailable" ? "実測のみ（外部資料不足）" : ev.comparison === "partial" ? "実測＋一部の外部資料" : "実測＋外部資料"}</p>
      </div>
    </header>
    <section className={panel}><h3 className={title}>Tier表</h3>
      {[1,2,3,4,5].map((tier, i) => {
        const group = ranked.filter(deck => (deck.tier ?? 5) === tier);
        return <div key={i} className="grid grid-cols-[4.3rem_1fr] items-start gap-2 border-t border-slate-200 py-2 sm:grid-cols-[7rem_1fr]">
          <div className="py-1"><strong className={tier === 1 ? "text-sky-800" : ""}>{tierLabel(tier)}</strong><p className="text-xs text-muted">{tierNames[i]}</p></div>
          <div className="flex flex-wrap items-center gap-1.5">{group.map(deck => {
            const mark = hasPrevious ? movement(prior[deck.deckId], deck.tier) : "";
            return <button key={deck.deckId} type="button" aria-expanded={selectedId === deck.deckId} aria-controls={detailId + i}
              className="inline-flex min-h-10 flex-wrap items-center gap-1 rounded-md border border-slate-200 bg-slate-50 px-2 py-1 text-left text-sm hover:border-sky-700 aria-expanded:border-sky-700"
              onClick={() => selectDeck(selectedId === deck.deckId ? null : deck.deckId)}>
              <DeckName deck={names.get(deck.deckId)!} />{mark && <small aria-label={changeLabel(prior[deck.deckId],deck.tier)}>{mark}</small>}
            </button>;
          })}{!group.length && <span className="py-2 text-sm text-muted">該当なし</span>}</div>
      <div id={detailId + i} className="col-span-full empty:hidden" aria-live="polite">{d && e && (e.tier ?? 5) === tier && <article className="mt-2 rounded-md bg-slate-50 p-3">
        <div className="flex items-center justify-between gap-2"><h4 className="font-bold">{d.name}の評価詳細</h4><button type="button" className="min-h-10 underline" onClick={() => selectDeck(null)}>閉じる</button></div>
        <dl className="my-3 grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">{fact("クラス",d.className)}{fact("遭遇率",percent(d.encounterRate))}{fact("実測勝率（集計期間）",percent(d.winRate))}{fact("評価件数",d.count + "件")}{fact("使用時勝率",percent(d.useWinRate))}{fact("データ評価",tierLabel(d.dataTier))}{fact("遭遇率だけの参考帯",tierLabel(encounterTier(d.encounterRate)))}{fact("前回との差",changeLabel(prior[d.deckId],e.tier))}</dl>
        {d.details && <div className="mb-3 rounded-md bg-slate-50 p-3 text-sm">
          <dl className="grid grid-cols-2 gap-2 sm:grid-cols-4">{fact("Tier判定対象の実測勝率",percent(d.details.eligibleWinRate))}
            {fact("Tier判定対象件数",d.details.eligibleCount+"件")}{fact("95% Wilson区間",intervalLabel(d.details.interval95))}
            {fact("実測の信頼度",d.details.measuredConfidence)}</dl>
          <p className="mt-2">Tier判定ではミラー、その他・未分類を含む対戦を除き、使用側と相手側の両視点を集計します。ランクは戦績登録者のものです。</p>
          <p>データ {tierLabel(d.dataTier)} → 総合 {tierLabel(e.tier)}</p>
        </div>}
        <p><b>評価理由　</b>{e.reason}</p>
        <p className="text-sm">総合の信頼度 {e.confidence} ／ 対策優先度 {priority(d.encounterRate)}</p>
        {rival && rival.count > 0 && <p className="text-sm">最多記録の対面　{names.get(rival.a === d.deckId ? rival.b : rival.a)?.name} ／ 実測 {percent(rival.winRate === null || rival.a === d.deckId ? rival.winRate : 100 - rival.winRate)}（{rival.count}戦）</p>}
        <DeckMetrics deck={d} />
      </article>}</div>
        </div>;
      })}
    </section>
    <Matrix publication={publication} />
    <section className={panel}><h3 className={title}>前回評価からの変更</h3>
      {changed.length ? <ul className="divide-y divide-slate-200">{changed.slice(0, 3).map(deck => <li key={deck.deckId} className="grid items-center gap-x-3 gap-y-1 py-2 sm:grid-cols-[minmax(10rem,1fr)_8rem_2fr]">
        <DeckName deck={names.get(deck.deckId)!} /><span className="text-sm font-semibold">{prior[deck.deckId] === undefined ? "新規 → " + tierLabel(deck.tier) : changeLabel(prior[deck.deckId],deck.tier)}</span>
        <p className="text-sm">{excerpt(deck.reason.split("。")[0] + (deck.reason.includes("。") ? "。" : ""), 76)}</p>
      </li>)}</ul> : <p className="text-sm">{hasPrevious ? "総合Tierの変更はありません。" : "前回の比較対象がありません。"}</p>}
      {(ev.changes || changed.length > 0) && <details className="mt-2 text-sm"><summary className="cursor-pointer font-semibold">変更の詳細{changed.length > 0 && "（全" + changed.length + "件）"}</summary>
        {ev.changes && <p className="my-2 whitespace-pre-line">{ev.changes}</p>}
        {changed.map(deck => <p className="mt-2" key={deck.deckId}><b>{names.get(deck.deckId)?.name}　{prior[deck.deckId] === undefined ? "新規 → " + tierLabel(deck.tier) : changeLabel(prior[deck.deckId], deck.tier)}</b>　{deck.reason}</p>)}
      </details>}
    </section>
    {preview && <details className={panel}><summary className="cursor-pointer font-bold">乖離分析・統計の詳細</summary>
      <p className="my-3 text-sm text-muted">対象ランク　{getRankSelectionLabel(s.ranks)} ／ 直近3日　{s.shortMatchCount.toLocaleString("ja-JP")}戦</p>
      <Gaps heading="実測データと評価の乖離分析" rows={deckGaps} comparison={ev.comparison} />
      <Gaps heading="対面相性の乖離分析" rows={pairGaps} comparison={ev.comparison} />
    </details>}
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
