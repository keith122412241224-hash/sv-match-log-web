"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState, type SyntheticEvent } from "react";
import { EnvironmentData } from "@/components/environment/EnvironmentData";
import { RankFilterSelect } from "@/components/RankFilterSelect";
import { rankDestinationSupport } from "@/lib/rank-filter";
import { ENVIRONMENT_PERIODS, environmentHref, normalizeEnvironmentPeriod, normalizeEnvironmentRank, parseEnvironmentDashboard, type DashboardSelection, type EnvironmentDashboard } from "@/lib/environment-dashboard";

export function EnvironmentFilters({ environments, activeDeckIds, initialSelection, initialData, initialFailed }: {
  environments: { id: string; name: string }[]; activeDeckIds: string[]; initialSelection: DashboardSelection; initialData: EnvironmentDashboard | null; initialFailed: boolean;
}) {
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
    const next = { environment, period: normalizeEnvironmentPeriod(q.get("period")), rank: normalizeEnvironmentRank(q.get("rank")) };
    if (environmentHref(next) !== environmentHref(currentSelection.current)) void load(next);
    return () => { controller.current?.abort(); };
  }, [environments, initialSelection.environment, load]);
  function update(next: DashboardSelection) {
    if (pending) return;
    if (environmentHref(next) === environmentHref(selection)) return;
    window.history.replaceState(null, "", environmentHref(next));
    void load(next);
  }
  function blockPendingInteraction(e: SyntheticEvent) {
    if (pending) { e.preventDefault(); e.stopPropagation(); }
  }
  const ownQuery = new URLSearchParams({ environment: selection.environment, rank: selection.rank, scope: "mine" });
  const destinations = rankDestinationSupport(selection.rank);
  return <>
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
        <fieldset className="min-w-0">
          <legend className="mb-2 text-sm font-semibold">期間</legend>
          <div className="grid grid-cols-4 gap-1">
            {ENVIRONMENT_PERIODS.map(p => <label key={p.value} className="cursor-pointer">
              <input className="peer sr-only" type="radio" name="period" value={p.value} checked={selection.period === p.value} onChange={() => update({ ...selection, period: p.value })} />
              <span className="flex min-h-11 items-center justify-center rounded-md border border-slate-300 px-1 text-sm peer-checked:border-slate-700 peer-checked:bg-slate-800 peer-checked:text-white peer-focus-visible:ring-2 peer-focus-visible:ring-blue-600 peer-disabled:opacity-60">{p.label}</span>
            </label>)}
          </div>
        </fieldset>
        <RankFilterSelect value={selection.rank} disabled={pending || environments.length === 0} onChange={rank => update({ ...selection, rank })} />
      </fieldset>
    </form>
    {pending && <p role="status" className="rounded-md border border-slate-200 bg-white p-6">環境データを読み込み中…</p>}
    {!pending && (failed ? <div role="alert" className="rounded-md border border-red-200 bg-white p-5 text-sm"><p>環境データを取得できませんでした。時間をおいて再度お試しください。</p>{selection.environment && <button type="button" onClick={() => void load(selection)} className="mt-3 min-h-11 rounded-md border border-slate-300 px-4">再試行</button>}</div>
      : data ? <EnvironmentData data={data} activeDeckIds={activeDeckIds} /> : <p className="rounded-md border border-slate-200 bg-white p-5">選択できる環境がありません。</p>)}
    <section className="rounded-md border border-slate-200 bg-white p-4"><h2 className="font-semibold">自分の登録データを見る</h2><p className="mt-2 text-sm text-muted">環境とランクを引き継ぎます。期間の指定は引き継ぎません。</p>
      <div className="mt-3 flex flex-wrap gap-3">{([ ["analysis", "分析"], ["matrix", "相性表"] ] as const).map(([target, label]) => <div key={target}>
        {destinations[target] ? <Link prefetch={false} href={`/${target}?${ownQuery}`} className="inline-flex min-h-11 items-center rounded-md border border-slate-300 px-3 text-sm font-semibold">自分の{label}を見る</Link>
          : <><span role="link" aria-disabled="true" className="inline-flex min-h-11 items-center rounded-md border border-slate-200 px-3 text-sm text-muted">自分の{label}を見る</span><p className="mt-1 text-xs text-muted">{label}はこのランク条件に未対応です。</p></>}
      </div>)}</div>
    </section>
  </>;
}
