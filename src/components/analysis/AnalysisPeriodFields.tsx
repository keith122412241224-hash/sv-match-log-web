"use client";

import { useState } from "react";
import { Button } from "@/components/Button";
import { AnalysisDateTimeField } from "@/components/analysis/AnalysisDateTimeField";
import { analysisPeriodLabel, quickAnalysisDates, type AnalysisPeriod } from "@/lib/analysis-presentation";

export function AnalysisPeriodFields({ from, to, preset, pending, onApply }: {
  from: string; to: string; preset?: string; pending: boolean;
  onApply?: (period: AnalysisPeriod, dates: { playedFrom: string; playedTo: string }) => void;
}) {
  const [dates, setDates] = useState({ playedFrom: from, playedTo: to });
  const [selection, setSelection] = useState(preset ?? "");
  const [revision, setRevision] = useState(0);
  const label = selection === "custom" ? "カスタム期間" : analysisPeriodLabel(dates.playedFrom, dates.playedTo, selection);
  function choose(period: AnalysisPeriod) {
    if (pending) return;
    const next = quickAnalysisDates(period);
    setDates(next); setSelection(period); setRevision(r => r + 1);
    onApply?.(period, next);
  }
  return (
    <fieldset className="min-w-0 md:col-span-2 xl:col-span-1">
      <legend className="mb-1.5 text-sm font-semibold text-ink">期間（日本時間）</legend>
      <div className="mb-2 flex flex-wrap items-center gap-2">
        {(["7d", "30d", "all"] as const).map((period, i) => <Button key={period} type="button" variant="secondary" disabled={pending}
          aria-pressed={label === ["直近7日", "直近30日", "全期間"][i]} onClick={() => choose(period)} className="min-h-9 px-3 py-1.5 text-xs">
          {["直近7日", "直近30日", "全期間"][i]}
        </Button>)}
        <span className="text-xs text-muted" role="status">{label}</span>
      </div>
      {selection !== "custom" && selection !== "all" && selection ? <input type="hidden" name="periodPreset" value={selection} /> : null}
      <div className="flex flex-wrap items-center gap-2 [&_fieldset]:flex-[1_1_15.5rem] [&_fieldset>div]:grid-cols-[minmax(0,1fr)_6.5rem]">
        <AnalysisDateTimeField key={`from:${revision}`} name="playedFrom" label="開始日時" value={dates.playedFrom} defaultTime="00:00" onChange={() => setSelection("custom")} />
        <AnalysisDateTimeField key={`to:${revision}`} name="playedTo" label="終了日時" value={dates.playedTo} defaultTime="23:59" onChange={() => setSelection("custom")} />
      </div>
      <p className="mt-2 text-xs text-muted">分単位で指定し、終了した分の末尾まで含めます。</p>
    </fieldset>
  );
}
