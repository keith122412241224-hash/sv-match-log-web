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
    <h2 className="text-lg font-bold">環境データOBS表示</h2>
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
    <details className="mt-3 rounded-md bg-slate-50 text-sm text-muted">
      <summary className="min-h-11 cursor-pointer rounded-md px-3 py-3 font-semibold text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-700">OBSの設定・使い方</summary>
      <div className="space-y-2 px-3 pb-3 leading-relaxed">
        <p>Masterのグループ・GrandMasterのレート帯もランク選択から指定できます。</p>
        <p>開いたページのURLに表示条件が保存されます。OBSブラウザソースは幅1152 × 高さ1080を目安に設定し、1920 × 1080の左側に等倍で配置してください。</p>
        <p>OBSのブラウザソースは通常ブラウザとログイン状態を共有しません。OBS側にも管理者ログインが必要です。ログインが難しい場合は、ログイン済みブラウザのウィンドウキャプチャをご利用ください。</p>
        <p>データはページを開いた時点の集計です。最新の集計にするにはページを再読み込みしてください。</p>
      </div>
    </details>
  </section>;
}
