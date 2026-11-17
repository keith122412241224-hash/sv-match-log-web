"use client";

import { useEffect, useMemo, useState } from "react";
import { DeckMultiSelectDialog } from "@/components/DeckMultiSelectDialog";
import { EnvironmentTrendChart, trendChartColor } from "@/components/environment/EnvironmentTrendChart";
import { parseEnvironmentTrends, type EnvironmentTrends as TrendData, type TrendCatalogDeck, type TrendMetric, type TrendSelection } from "@/lib/environment-trends";

export function EnvironmentTrends({ selection, catalog, active }: { selection: Omit<TrendSelection, "decks">; catalog: TrendCatalogDeck[]; active: boolean }) {
  const [selected, setSelected] = useState<string[]>([]), [metric, setMetric] = useState<TrendMetric>("encounter");
  const [result, setResult] = useState<{ key: string; data: TrendData | null; failed: boolean } | null>(null);
  const [retry, setRetry] = useState(0);
  const decks = useMemo(() => catalog.filter(d => !d.environment_id || d.environment_id === selection.environment), [catalog, selection.environment]);
  const ids = useMemo(() => selected.filter(id => decks.some(d => d.id === id)), [selected, decks]);
  const requestKey = JSON.stringify({ ...selection, decks: [...ids].sort() });
  useEffect(() => {
    if (!active || !ids.length || result?.key === requestKey) return;
    const controller = new AbortController();
    void (async () => {
      try {
        const response = await fetch("/api/environment/trends", { method: "POST", headers: { "Content-Type": "application/json" }, body: requestKey, cache: "no-store", signal: controller.signal });
        if (!response.ok) throw new Error("Request failed");
        const data = parseEnvironmentTrends(await response.json(), JSON.parse(requestKey) as TrendSelection);
        if (!controller.signal.aborted) setResult({ key: requestKey, data, failed: false });
      } catch { if (!controller.signal.aborted) setResult({ key: requestKey, data: null, failed: true }); }
    })();
    return () => controller.abort();
  }, [active, ids.length, requestKey, result?.key, retry]);
  const current = result?.key === requestKey ? result : null;
  return <section className="min-w-0 space-y-4 rounded-md border border-slate-200 bg-white p-4" aria-label="推移分析">
    <h2 className="text-lg font-bold">推移分析</h2>
    <DeckMultiSelectDialog decks={decks} value={ids} onApply={setSelected} label="デッキ選択" disabled={!selection.environment} />
    {ids.length > 0 && <ul aria-label="選択済みデッキ・凡例" className="flex flex-wrap gap-2">{decks.filter(d => ids.includes(d.id)).map(d => <li key={d.id} className="max-w-full break-words rounded border border-slate-200 px-2 py-1 text-sm"><span className="mr-2 inline-block h-2.5 w-2.5 rounded-full" style={{ backgroundColor: trendChartColor(d.id, catalog) }} />{d.name}</li>)}</ul>}
    <div className="flex flex-wrap gap-2" role="group" aria-label="推移の指標">{([ ["encounter", "遭遇率の推移"], ["winrate", "勝率の推移"] ] as const).map(([value, label]) => <button key={value} type="button" aria-pressed={metric === value} onClick={() => setMetric(value)} className="min-h-11 rounded-md border border-slate-300 px-3 text-sm font-semibold aria-pressed:border-ink aria-pressed:bg-ink aria-pressed:text-white">{label}</button>)}</div>
    {!ids.length ? <p role="status" className="rounded bg-slate-50 p-5 text-sm">デッキ選択から比較したいデッキを選んでください。</p>
      : !current ? <p role="status">推移データを読み込み中…</p>
      : current.failed ? <div role="alert"><p>推移データを取得できませんでした。時間をおいて再度お試しください。</p><button type="button" onClick={() => { setResult(null); setRetry(n => n + 1); }} className="mt-3 min-h-11 rounded-md border border-slate-300 px-4">再試行</button></div>
      : current.data && <EnvironmentTrendChart key={requestKey} data={current.data} metric={metric} catalog={catalog} />}
  </section>;
}
