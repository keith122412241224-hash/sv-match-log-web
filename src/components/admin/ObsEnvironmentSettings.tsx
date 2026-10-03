"use client";

import { useState } from "react";
import { RankMultiSelect } from "@/components/RankMultiSelect";
import { FieldLabel, Select } from "@/components/Field";
import { ENVIRONMENT_PERIODS, normalizeEnvironmentPeriod } from "@/lib/environment-dashboard";
import { environmentHrefV2, type DashboardSelectionV2 } from "@/lib/environment-dashboard-v2";
import { RANK_ATOMS } from "@/lib/rank-selection";

export function ObsEnvironmentSettings({ environments, initialEnvironment }: {
  environments: { id: string; name: string }[]; initialEnvironment: string;
}) {
  const [selection, setSelection] = useState<DashboardSelectionV2>({ environment: initialEnvironment, period: "7d", ranks: RANK_ATOMS });
  const href = `/admin/obs${environmentHrefV2(selection)}`;
  return <section className="rounded-md border border-slate-200 bg-white p-5">
    <h2 className="text-lg font-bold">OBS表示</h2>
    <p className="mt-2 text-sm text-muted">環境データを動画・配信用の読み取り専用パネルで表示します。</p>
    <div className="mt-5 grid gap-4 md:grid-cols-3">
      <FieldLabel>環境<Select value={selection.environment} disabled={!environments.length} onChange={e => setSelection({ ...selection, environment: e.target.value })}>
        {environments.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
      </Select></FieldLabel>
      <FieldLabel>期間<Select value={selection.period} onChange={e => setSelection({ ...selection, period: normalizeEnvironmentPeriod(e.target.value) })}>
        {ENVIRONMENT_PERIODS.map(p => <option key={p.value} value={p.value}>直近{p.label}</option>)}
      </Select></FieldLabel>
      <RankMultiSelect label="ランク・レート帯" value={selection.ranks} onApply={ranks => setSelection({ ...selection, ranks })} />
    </div>
    <p className="mt-3 text-xs text-muted">Masterのグループ・GrandMasterのレート帯もランク選択から指定できます。</p>
    {environments.length ? <a href={href} target="_blank" rel="noopener noreferrer" className="mt-5 inline-flex min-h-11 items-center rounded-md bg-ink px-5 py-2 text-sm font-bold text-white">OBSビューを開く（別タブ）</a>
      : <p className="mt-5 text-sm">選択できる環境がありません。</p>}
    <div className="mt-5 space-y-2 rounded-md bg-slate-50 p-4 text-sm leading-relaxed text-muted">
      <p>開いたページのURLに表示条件が保存されます。OBSブラウザソースは幅1152 × 高さ1080を目安に設定し、1920 × 1080の左側に等倍で配置してください。</p>
      <p>OBSのブラウザソースは通常ブラウザとログイン状態を共有しません。OBS側にも管理者ログインが必要です。ログインが難しい場合は、ログイン済みブラウザのウィンドウキャプチャをご利用ください。</p>
      <p>データはページを開いた時点の集計です。最新の集計にするにはページを再読み込みしてください。</p>
    </div>
  </section>;
}
