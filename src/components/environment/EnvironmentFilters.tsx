"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState, type SyntheticEvent } from "react";
import { EnvironmentData } from "@/components/environment/EnvironmentData";
import { EnvironmentTrends } from "@/components/environment/EnvironmentTrends";
import { ReviewTab } from "@/components/environment-review/ReviewTab";
import { TREND_PERIODS, type TrendPeriod, type TrendCatalogDeck } from "@/lib/environment-trends";
import { RankMultiSelect } from "@/components/RankMultiSelect";
import { parseRankSelection, serializeRankSelection } from "@/lib/rank-selection";
import { DASHBOARD_PERIODS, normalizeDashboardPeriod } from "@/lib/environment-dashboard-period";
import { environmentHrefV4 as environmentHref, type DashboardSelectionV4 as DashboardSelection } from "@/lib/environment-dashboard-period";

import { parseEnvironmentDashboardV4 as parseEnvironmentDashboard, type EnvironmentDashboardV4 as EnvironmentDashboard } from "@/lib/environment-dashboard-v4";

const environmentTabs = [
  ["summary", "環境サマリー"],
  ["trends", "推移分析"],
  ["review", "総合環境評価"],
] as const;
type EnvironmentTab = typeof environmentTabs[number][0];

export function EnvironmentFilters({ canViewReview, environments, activeDeckIds, trendCatalog = [], initialSelection, initialData, initialFailed }: {
  canViewReview: boolean;
  environments: { id: string; name: string }[]; activeDeckIds: string[]; initialSelection: DashboardSelection; initialData: EnvironmentDashboard | null; initialFailed: boolean;
  trendCatalog?: TrendCatalogDeck[];
}) {
  const tabs = environmentTabs.filter(([value]) => value !== "review" || canViewReview);
  const [selectedTab, setTab] = useState<EnvironmentTab>("summary");
  const tab = selectedTab === "review" && !canViewReview ? "summary" : selectedTab;
  const [trendPeriod, setTrendPeriod] = useState<TrendPeriod>("30d");
  const controller = useRef<AbortController | null>(null);
  const currentSelection = useRef(initialSelection);
  const [selection, setSelection] = useState(initialSelection);
  const [data, setData] = useState(initialData), [failed, setFailed] = useState(initialFailed);
  const [pending, setPending] = useState(false);
  const load = useCallback(async (next: DashboardSelection) => {
    controller.current?.abort();
    const request = new AbortController(); controller.current = request;
    currentSelection.current = next;
    setSelection(next); setData(null); setFailed(false); setPending(true);
    try {
      const response = await fetch(`/api/environment${environmentHref(next).slice("/environment".length)}`, { cache: "no-store", signal: request.signal });
      if (!response.ok) throw new Error("Request failed");
      const result = parseEnvironmentDashboard(await response.json(), next);
      if (!request.signal.aborted) setData(result);
    } catch { if (!request.signal.aborted) setFailed(true); }
    finally { if (!request.signal.aborted) setPending(false); }
  }, []);
  useEffect(() => {
    // A cached page restored by Next may have older initial props. Reconcile its URL once;
    // ordinary SSR/reload already matches and must not issue a second RPC.
    const q = new URLSearchParams(window.location.search);
    const environment = environments.some(e => e.id === q.get("environment")) ? q.get("environment")! : initialSelection.environment;
    const next = { environment, period: q.has("period") ? normalizeDashboardPeriod(q.get("period")) : initialSelection.period, ranks: parseRankSelection({ ranks: q.get("ranks") ?? undefined, rank: q.get("rank") ?? undefined }) };
    if (environmentHref(next) !== environmentHref(currentSelection.current)) void load(next);
    return () => { controller.current?.abort(); };
  }, [environments, initialSelection.environment, initialSelection.period, load]);
  function update(next: DashboardSelection) {
    if (pending) return;
    if (environmentHref(next) === environmentHref(selection)) return;
    window.history.replaceState(null, "", environmentHref(next));
    if (tab === "summary") void load(next);
    else { currentSelection.current = next; setSelection(next); setData(null); setFailed(false); }
  }
  function blockPendingInteraction(e: SyntheticEvent) {
    if (pending) { e.preventDefault(); e.stopPropagation(); }
  }
  const ownQuery = new URLSearchParams({ environment: selection.environment, ranks: serializeRankSelection(selection.ranks), scope: "mine" });
  function switchTab(next: EnvironmentTab) {
    setTab(next);
    if (next === "summary" && !data && !pending && !failed && selection.environment) void load(selection);
  }
  return <>
    <div role="tablist" aria-label="環境データの表示" className="flex gap-2 border-b border-slate-200">
      {tabs.map(([value, label], index) => <button key={value} type="button" role="tab" id={`environment-tab-${value}`} aria-controls={`environment-panel-${value}`} aria-selected={tab === value} tabIndex={tab === value ? 0 : -1}
        onClick={() => switchTab(value)} onKeyDown={event => {
          let nextIndex;
          switch (event.key) {
            case "Home": nextIndex = 0; break;
            case "End": nextIndex = tabs.length - 1; break;
            case "ArrowLeft": nextIndex = (index + tabs.length - 1) % tabs.length; break;
            case "ArrowRight": nextIndex = (index + 1) % tabs.length; break;
            default: return;
          }
          event.preventDefault();
          const next = tabs[nextIndex][0];
          switchTab(next);
          document.getElementById(`environment-tab-${next}`)?.focus();
        }}
        className="min-h-11 border-b-2 border-transparent px-2 text-sm font-semibold aria-selected:border-sky-700 aria-selected:text-sky-800 sm:px-4">{label}</button>)}
    </div>
    <form onSubmit={e => e.preventDefault()} className="rounded-md border border-slate-200 bg-white p-4">
      {/* Keep the native Tab sequence intact while a selection starts loading. */}
      <fieldset disabled={environments.length === 0} aria-disabled={pending || undefined}
        onPointerDownCapture={blockPendingInteraction} onClickCapture={blockPendingInteraction}
        onKeyDownCapture={e => { if (e.key !== "Tab") blockPendingInteraction(e); }}
        className="grid min-w-0 gap-4 md:grid-cols-3">
        <legend className="sr-only">環境データの条件</legend>
        <label className="grid min-w-0 gap-2 text-sm font-semibold">環境
          <select name="environment" value={selection.environment} onChange={e => update({ ...selection, environment: e.target.value })} className="min-h-11 w-full min-w-0 rounded-md border border-slate-300 bg-white px-2 text-sm">
            {environments.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
          </select>
        </label>
        {tab !== "review" && <><fieldset className="min-w-0">
          <legend className="mb-2 text-sm font-semibold">期間</legend>
          <div className={`grid ${tab === "summary" ? "grid-cols-5" : "grid-cols-4"} gap-1`}>
            {(tab === "summary" ? DASHBOARD_PERIODS : TREND_PERIODS).map(p => <label key={p.value} className="cursor-pointer">
              <input className="peer sr-only" type="radio" name="period" value={p.value} checked={(tab === "summary" ? selection.period : trendPeriod) === p.value} onChange={() => tab === "summary" ? update({ ...selection, period: normalizeDashboardPeriod(p.value) }) : setTrendPeriod(p.value as TrendPeriod)} />
              <span className="flex min-h-11 items-center justify-center rounded-md border border-slate-300 px-1 text-sm peer-checked:border-slate-700 peer-checked:bg-slate-800 peer-checked:text-white peer-focus-visible:ring-2 peer-focus-visible:ring-blue-600 peer-disabled:opacity-60">{p.label}</span>
            </label>)}
          </div>
        </fieldset>
        <RankMultiSelect value={selection.ranks} disabled={pending || environments.length === 0} onApply={ranks => update({ ...selection, ranks })} />
        </>}
      </fieldset>
    </form>
    <div id="environment-panel-summary" role="tabpanel" aria-labelledby="environment-tab-summary" hidden={tab !== "summary"} className="space-y-5">
    {pending && <p role="status" className="rounded-md border border-slate-200 bg-white p-6">環境データを読み込み中…</p>}
    {!pending && (failed ? <div role="alert" className="rounded-md border border-red-200 bg-white p-5 text-sm"><p>環境データを取得できませんでした。時間をおいて再度お試しください。</p>{selection.environment && <button type="button" onClick={() => void load(selection)} className="mt-3 min-h-11 rounded-md border border-slate-300 px-4">再試行</button>}</div>
      : data ? <EnvironmentData data={data} activeDeckIds={activeDeckIds} /> : <p className="rounded-md border border-slate-200 bg-white p-5">選択できる環境がありません。</p>)}
    </div>
    <div id="environment-panel-trends" role="tabpanel" aria-labelledby="environment-tab-trends" hidden={tab !== "trends"}>
      <EnvironmentTrends selection={{ environment: selection.environment, period: trendPeriod, ranks: selection.ranks }} catalog={trendCatalog} active={tab === "trends"} />
    </div>
    {canViewReview && <div id="environment-panel-review" role="tabpanel" aria-labelledby="environment-tab-review" hidden={tab !== "review"}>
      {tab === "review" && <ReviewTab key={selection.environment} environment={selection.environment} />}
    </div>}
    <section className="rounded-md border border-slate-200 bg-white p-4"><h2 className="font-semibold">自分の登録データを見る</h2><p className="mt-2 text-sm text-muted">環境とランクを引き継ぎます。期間の指定は引き継ぎません。</p>
      <div className="mt-3 flex flex-wrap gap-3">{([ ["analysis", "分析"], ["matrix", "相性表"] ] as const).map(([target, label]) => <div key={target}>
        <Link prefetch={false} href={`/${target}?${ownQuery}`} className="inline-flex min-h-11 items-center rounded-md border border-slate-300 px-3 text-sm font-semibold">自分の{label}を見る</Link>
      </div>)}</div>
    </section>
  </>;
}
