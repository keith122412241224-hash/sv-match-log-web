"use client";

import { useState } from "react";
import { RankMultiSelect } from "@/components/RankMultiSelect";
import { FieldLabel, Select } from "@/components/Field";
import { DASHBOARD_PERIODS, normalizeDashboardPeriod, initialDashboardPeriod, dashboardPeriodLabel } from "@/lib/environment-dashboard-period";
import { environmentHrefV4, type DashboardSelectionV4 } from "@/lib/environment-dashboard-period";
import { RANK_ATOMS } from "@/lib/rank-selection";

export function ObsEnvironmentSettings({ environments, initialEnvironment }: {
  environments: { id: string; name: string; dashboard_end_at?: string | null }[]; initialEnvironment: string;
}) {
  const [selection, setSelection] = useState<DashboardSelectionV4>({ environment: initialEnvironment, period: initialDashboardPeriod(undefined, environments.find(e => e.id === initialEnvironment)?.dashboard_end_at), ranks: RANK_ATOMS });
  const href = `/admin/obs${environmentHrefV4(selection)}`;
  return <section className="rounded-md border border-slate-200 bg-white p-4">
    <h2 className="text-lg font-bold">環境データ</h2>
    <p className="mt-1 text-sm text-muted">遭遇率・勝率・相性関係を配信向けに表示します。</p>
    <div className="mt-3 grid gap-3 sm:grid-cols-2">
      <FieldLabel>環境<Select value={selection.environment} disabled={!environments.length} onChange={e => setSelection({ ...selection, environment: e.target.value })}>
        {environments.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
      </Select></FieldLabel>
      <FieldLabel>期間<Select value={selection.period} onChange={e => setSelection({ ...selection, period: normalizeDashboardPeriod(e.target.value) })}>
        {DASHBOARD_PERIODS.map(p => <option key={p.value} value={p.value}>{dashboardPeriodLabel(p.value)}</option>)}
      </Select></FieldLabel>
      <div className="sm:col-span-2">
        <RankMultiSelect label="ランク・レート帯" value={selection.ranks} onApply={ranks => setSelection({ ...selection, ranks })} />
      </div>
    </div>
    {environments.length ? <a href={href} target="_blank" rel="noopener noreferrer" className="mt-3 inline-flex min-h-11 max-w-full items-center justify-center rounded-md bg-ink px-4 py-2 text-sm font-bold text-white">OBSビューを開く（別タブ）</a>
      : <p className="mt-3 text-sm">選択できる環境がありません。</p>}
  </section>;
}
