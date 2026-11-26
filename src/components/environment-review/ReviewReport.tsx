"use client";
import { useId, useMemo, useState, type ReactNode } from "react";
import { ClassIcon } from "@/components/ClassIcon";
import { getRankSelectionLabel } from "@/lib/rank-selection";
import type { Divergence } from "@/lib/environment-review/evaluation";
import { changeLabel, jst, matchupLabel, percent, tierLabel, type Publication } from "@/lib/environment-review/publication";


const panel = "min-w-0 rounded-md border border-slate-200 bg-white p-4 sm:p-5";
const title = "mb-3 text-lg font-bold";
const badge = "inline-block rounded border border-slate-200 bg-slate-50 px-2 py-1 text-xs font-semibold";
const tierNames = ["環境トップ", "環境上位", "環境中堅", "環境下位", "環境下位・評価材料不足"];
type Deck = Publication["payload"]["snapshot"]["decks"][number];

// Two catalog IDs for the same display name coexist in the saved report.
// Hide only this known legacy row in the Tier table, without combining results.
const CURRENT_RALLY_SWORD_ID = "45ac59ea-037c-4b2f-8334-9bdd3839f4c3";
const LEGACY_RALLY_SWORD_ID = "5fa97cd2-2607-4d66-bfb2-d8db0cd85914";
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
  const decks = useMemo(() => [...snapshot.decks].sort(byEncounter), [snapshot]);
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
    return {
      judgment: rating === null ? undefined : judgmentByRating.get(rating),
      rate: data?.winRate == null ? null : forward ? data.winRate : 100 - data.winRate,
      count: data?.count ?? 0, pair, forward
    };
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
            const label = row.name + " 対 " + col.name + " " + (value.judgment?.label ?? "判定なし");
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
    {active && selected && <article className="mt-2 grid gap-2 rounded-md bg-slate-50 p-3 text-sm" aria-live="polite">
      <h4 className="font-bold">{selected[0].name} 対 {selected[1].name}</h4>
      <dl className="grid grid-cols-3 gap-2">
        <div><dt className="text-xs text-muted">判定</dt><dd className="mt-1 font-semibold">
          {active.judgment ? <span className={"inline-block rounded px-1.5 " + active.judgment.color}>{active.judgment.mark} {active.judgment.label}</span> : "判定なし"}
        </dd></div>
        <div><dt className="text-xs text-muted">実測勝率</dt><dd className="mt-1 font-semibold">{percent(active.rate)}</dd></div>
        <div><dt className="text-xs text-muted">対戦数</dt><dd className="mt-1 font-semibold">{active.count}戦</dd></div>
      </dl>
      <p className="leading-relaxed">{active.pair && !active.forward && <span className="text-muted">{selected[1].name}側の理由　</span>}{brief(active.pair?.reason ?? "", 2, 130) || "この対面の理由は記録されていません。"}</p>
    </article>}
  </section>;
}

// Stored assessments can begin with a version-specific label. Keep the substantive sentences.
function brief(text: string, maxSentences: number, limit: number) {
  const body = text.trim().replace(/^(?:実測を中心とした(?:暫定)?評価|外部情報を中心とした暫定評価|総合判断による暫定評価|外部情報も考慮した評価)。\s*/u, "");
  const sentences = body.match(/[^。！？!?\n]+[。！？!?]?/gu) ?? [];
  return excerpt(sentences.slice(0, maxSentences).map(s => s.trim()).join(""), limit);
}

function byEncounter(a: Deck, b: Deck) {
  return (b.encounterRate ?? -1) - (a.encounterRate ?? -1) || a.deckId.localeCompare(b.deckId);
}

function notableMatchups(deckId: string, pairs: Publication["payload"]["evaluation"]["pairs"], decks: Map<string, Deck>) {
  const major = new Set([...decks.values()].sort(byEncounter).slice(0, 8).map(d => d.deckId));
  const opponents = pairs.flatMap(p => {
    if (p.rating == null || p.rating === 0 || (p.a !== deckId && p.b !== deckId)) return [];
    const forward = p.a === deckId;
    const opponent = decks.get(forward ? p.b : p.a);
    return opponent ? [{ deck: opponent, rating: forward ? p.rating : -p.rating }] : [];
  }).sort((a,b) => Number(major.has(b.deck.deckId)) - Number(major.has(a.deck.deckId)) ||
    Math.abs(b.rating) - Math.abs(a.rating) || byEncounter(a.deck, b.deck));
  return {
    favorable: opponents.filter(o => o.rating > 0).slice(0,2).map(o => o.deck.name),
    unfavorable: opponents.filter(o => o.rating < 0).slice(0,2).map(o => o.deck.name)
  };
}

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
  const currentRallySword = names.get(CURRENT_RALLY_SWORD_ID);
  const legacyRallySword = names.get(LEGACY_RALLY_SWORD_ID);
  const hideLegacyRallySword = currentRallySword !== undefined && legacyRallySword !== undefined &&
    currentRallySword.name === legacyRallySword.name && currentRallySword.className === legacyRallySword.className &&
    assessments.has(CURRENT_RALLY_SWORD_ID) && assessments.get(LEGACY_RALLY_SWORD_ID)?.tier === null;
  const tierRows = hideLegacyRallySword ? ranked.filter(d => d.deckId !== LEGACY_RALLY_SWORD_ID) : ranked;
  const shiftSize = (id: string, tier: number | null) =>
    typeof prior[id] === "number" && tier !== null ? Math.abs(prior[id] - tier) : 0;
  const changed = hasPrevious ? ranked.filter(d => d.tier !== prior[d.deckId]).sort((a, b) =>
    shiftSize(b.deckId, b.tier) - shiftSize(a.deckId, a.tier)) : [];
  const facts = brief(ev.overview.facts, 3, 150);
  const d = selectedId ? names.get(selectedId) : undefined;
  const e = selectedId ? assessments.get(selectedId) : undefined;
  const opponents = d ? notableMatchups(d.deckId, ev.pairs, names) : undefined;
  return <div className="grid min-w-0 gap-4 break-words text-ink">
    <header className={panel + " grid items-start gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]"}>
      <div>
        <h2 className="text-xl font-bold">{s.environmentName}</h2>
        <p className="mt-1 text-xs text-muted">{state}{!preview && "　" + jst(publication.published_at) + " JST"}</p>
        <p className="mt-2 text-sm text-muted">集計 {jst(s.periodStart)} ～ {jst(s.asOf)} JST　<strong className="text-ink">{s.matchCount.toLocaleString("ja-JP")}戦</strong></p>
      </div>
      <div className="border-t border-slate-200 pt-3 lg:border-l lg:border-t-0 lg:pl-5 lg:pt-0"><h3 className="mb-1 font-bold">環境総評</h3>
        <p className="leading-relaxed">{facts}</p>
      </div>
    </header>
    <section className={panel}><h3 className={title}>Tier表</h3>
      {[1,2,3,4,5].map((tier, i) => {
        const group = tierRows.filter(deck => (deck.tier ?? 5) === tier);
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
      <div id={detailId + i} className="col-span-full empty:hidden" aria-live="polite">{d && e && group.includes(e) && <article className="mt-2 rounded-md bg-slate-50 p-3">
        <div className="flex items-center justify-between gap-2">
          <h4 className="font-bold">{d.name}<span className="ml-2 whitespace-nowrap text-sm">{tierLabel(e.tier ?? 5)}</span></h4>
          <button type="button" className="min-h-9 shrink-0 text-sm underline" onClick={() => selectDeck(null)}>閉じる</button>
        </div>
        <p className="text-xs text-muted">{d.className}{e.tier === null && " ／ 評価材料不足"}</p>
        <p className="my-2 text-sm leading-relaxed">{brief(e.reason, 3, 150)}</p>
        <dl className="grid grid-cols-3 gap-2 border-t border-slate-200 pt-2 text-sm">
          {fact("遭遇率",percent(d.encounterRate))}{fact("実測勝率",percent(d.winRate))}
          {fact("前回との差",hasPrevious ? movement(prior[d.deckId], e.tier) || "変更なし" : "初回")}
        </dl>
        {opponents && (opponents.favorable.length > 0 || opponents.unfavorable.length > 0) &&
          <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-2 gap-y-1 border-t border-slate-200 pt-2 text-sm" aria-label="注目対面">
            {opponents.favorable.length > 0 && <><dt className="font-semibold">有利寄り</dt><dd>{opponents.favorable.join("、")}</dd></>}
            {opponents.unfavorable.length > 0 && <><dt className="font-semibold">苦手寄り</dt><dd>{opponents.unfavorable.join("、")}</dd></>}
          </dl>}
      </article>}</div>
        </div>;
      })}
    </section>
    <Matrix publication={publication} />
    <section className={panel}><h3 className={title}>前回評価からの変更</h3>
      {changed.length ? <ul className="divide-y divide-slate-200">{changed.slice(0, 3).map(deck => <li key={deck.deckId} className="grid items-center gap-x-3 gap-y-1 py-2 sm:grid-cols-[minmax(10rem,1fr)_8rem_2fr]">
        <DeckName deck={names.get(deck.deckId)!} /><span className="text-sm font-semibold">{prior[deck.deckId] === undefined ? "新規 → " + tierLabel(deck.tier) : changeLabel(prior[deck.deckId],deck.tier)}</span>
        <p className="text-sm">{brief(deck.reason, 1, 76)}</p>
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
