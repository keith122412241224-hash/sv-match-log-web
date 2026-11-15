"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { formatEnvironmentPercent, sampleLabel } from "@/lib/environment-dashboard";
import { trendDeckColor, trendLinePath, trendRate, type EnvironmentTrends, type TrendMetric } from "@/lib/environment-trends";

export function EnvironmentTrendChart({ data, metric, catalog }: { data: EnvironmentTrends; metric: TrendMetric; catalog: readonly { id: string }[] }) {
  const container = useRef<HTMLDivElement>(null), tooltipId = useId();
  const [width, setWidth] = useState(720), [active, setActive] = useState<number | null>(null);
  useEffect(() => {
    const observer = new ResizeObserver(entries => setWidth(Math.max(240, entries[0].contentRect.width)));
    if (container.current) observer.observe(container.current);
    return () => observer.disconnect();
  }, []);
  const dates = data.decks[0]?.points.map(p => p.date) ?? [];
  const index = Math.max(0, Math.min(active ?? dates.length - 1, dates.length - 1));
  const x = (i: number) => 42 + (dates.length < 2 ? (width - 58) / 2 : i / (dates.length - 1) * (width - 58));
  const y = (v: number) => 260 - v * 2.3;
  const paths = useMemo(() => data.decks.map(deck => ({ deck,
    path: trendLinePath(deck.points, metric, i => 42 + (deck.points.length < 2 ? (width - 58) / 2 : i / (deck.points.length - 1) * (width - 58)), y)
  })), [data, metric, width]);
  const available = data.decks.some(d => d.points.some(p => trendRate(p, metric) !== null));
  const ticks = [...new Set([0, Math.floor((dates.length - 1) / 2), dates.length - 1])].filter(i => i >= 0);
  return <div ref={container} className="min-w-0">
    {!available && <p role="status" className="my-4 rounded bg-slate-50 p-4 text-sm">選択した条件で表示できる{metric === "encounter" ? "遭遇" : "勝率"}データがありません。</p>}
    {dates.length > 0 && <>
      <svg viewBox={`0 0 ${width} 300`} className="w-full touch-pan-y rounded focus-visible:outline focus-visible:outline-2 focus-visible:outline-sky-700"
        role="group" tabIndex={0} aria-label={`${metric === "encounter" ? "遭遇率" : "勝率"}の推移グラフ。左右キーで日付を移動できます。`} aria-describedby={tooltipId}
        onKeyDown={event => { if (["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) {
          event.preventDefault(); setActive(event.key === "Home" ? 0 : event.key === "End" ? dates.length - 1 : Math.max(0, Math.min(dates.length - 1, index + (event.key === "ArrowLeft" ? -1 : 1))));
        } }}
        onPointerMove={event => { const rect = event.currentTarget.getBoundingClientRect(); setActive(Math.max(0, Math.min(dates.length - 1, Math.round(((event.clientX - rect.left) * width / rect.width - 42) / (width - 58) * (dates.length - 1))))); }}
        onPointerDown={event => { const rect = event.currentTarget.getBoundingClientRect(); setActive(Math.max(0, Math.min(dates.length - 1, Math.round(((event.clientX - rect.left) * width / rect.width - 42) / (width - 58) * (dates.length - 1))))); }}>
        <title>{metric === "encounter" ? "遭遇率" : "勝率"}の推移（直近7日間・JST）</title>
        {[0, 25, 50, 75, 100].map(v => <g key={v} aria-hidden="true"><line x1={42} x2={width - 16} y1={y(v)} y2={y(v)} stroke="#e2e8f0" /><text x={35} y={y(v) + 4} textAnchor="end" fontSize={12} fill="#475569">{v}%</text></g>)}
        {ticks.map(i => <text key={i} x={x(i)} y={285} textAnchor={dates.length === 1 ? "middle" : i === 0 ? "start" : i === dates.length - 1 ? "end" : "middle"} fontSize={12} fill="#475569">{dates[i].slice(5).replace("-", "/")}</text>)}
        {paths.map(({ deck, path }) => <g key={deck.id} aria-label={deck.name}>
          <path data-trend-deck={deck.id} d={path} fill="none" stroke={trendDeckColor(deck.id, catalog)} strokeWidth={2.5} strokeLinejoin="round" />
          {deck.points.map((p, i) => {
            const value = trendRate(p, metric);
            const isolated = (i === 0 || trendRate(deck.points[i - 1], metric) === null) && (i === deck.points.length - 1 || trendRate(deck.points[i + 1], metric) === null);
            return value !== null && (i === index || isolated) ? <circle key={p.date} cx={x(i)} cy={y(value)} r={i === index ? 4 : 3} fill={trendDeckColor(deck.id, catalog)} /> : null;
          })}
        </g>)}
        <line x1={x(index)} x2={x(index)} y1={30} y2={260} stroke="#64748b" strokeDasharray="4 4" pointerEvents="none" />
      </svg>
      <label className="my-3 flex flex-wrap items-center gap-2 text-sm">詳細を見る日付
        <input type="date" min={dates[0]} max={dates.at(-1)} value={dates[index]} onChange={e => { const i = dates.indexOf(e.target.value); if (i >= 0) setActive(i); }} className="min-h-11 min-w-0 rounded-md border border-slate-300 px-3" />
      </label>
      <div id={tooltipId} role="status" aria-live="polite" aria-atomic="true" className="rounded-md bg-slate-50 p-3 text-sm">
        <p className="mb-2 font-semibold">{dates[index]}（JST）までの直近7日間</p>
        <ul className="grid gap-3 sm:grid-cols-2">{data.decks.map(deck => {
          const point = deck.points[index], value = trendRate(point, metric);
          const sample = sampleLabel({ status: point.evaluations === null ? "no_data" : "available", targetRegistrations: point.registrations, evaluationCount: point.evaluations, wins: point.wins });
          return <li key={deck.id} className="min-w-0 break-words"><span className="mr-2 inline-block h-2.5 w-2.5 rounded-full" style={{ backgroundColor: trendDeckColor(deck.id, catalog) }} /><strong>{deck.name}</strong>：{value === null ? "観測なし" : formatEnvironmentPercent(value)}
            <span className="mt-1 block text-xs text-muted">{metric === "encounter"
              ? `遭遇 ${point.encounters === null ? "観測なし" : point.encounters + "件"} / 登録戦績 ${point.total === null ? "なし" : point.total + "件"}`
              : `勝利 ${point.wins ?? "—"}件 / 有効対戦 ${point.evaluations ?? "—"}件（対象登録戦績 ${point.registrations ?? "—"}件）`}</span>
            {metric === "winrate" && sample && <span className="mt-1 inline-block rounded bg-amber-100 px-2 py-1 text-xs text-amber-900">{sample}</span>}
          </li>;
        })}</ul>
      </div>
    </>}
  </div>;
}
