"use client";

import { useState } from "react";
import { Button } from "@/components/Button";
import { FieldLabel, Input } from "@/components/Field";
import { analysisDatesFromQuery, validateAnalysisDates } from "@/lib/analysis-date-query";

/** Only an explicit form submission replaces invalid dates; all other query values survive. */
export function AnalysisDateQueryError({ query }: { query: string }) {
  const params = new URLSearchParams(query);
  const validation = validateAnalysisDates(analysisDatesFromQuery(params));
  const [from, setFrom] = useState(params.get("playedFrom") ?? "");
  const [to, setTo] = useState(params.get("playedTo") ?? "");
  return <section className="grid min-w-0 gap-4">
    <h1 className="text-2xl font-bold text-ink">分析</h1>
    <p role="alert" className="text-sm text-red-700">{!validation.ok ? validation.error.message : "期間の条件を確認してください。"}</p>
    <form action="/analysis" className="grid min-w-0 gap-4 rounded-md border border-slate-200 bg-white p-4">
      {[...params].filter(([key]) => key !== "playedFrom" && key !== "playedTo").map(([key, value], i) => <input key={i} type="hidden" name={key} value={value} />)}
      <p className="text-sm text-muted">日時は「2026-10-13T09:00」の形式で入力してください。空欄で表示すると、その日時の指定を解除します。他の絞り込み条件は保持されます。</p>
      <div className="grid min-w-0 gap-3 md:grid-cols-2">
        <FieldLabel>開始日時（日本時間）<Input aria-label="開始日時（日本時間）" value={from} onChange={e => setFrom(e.target.value)} /></FieldLabel>
        <FieldLabel>終了日時（日本時間）<Input aria-label="終了日時（日本時間）" value={to} onChange={e => setTo(e.target.value)} /></FieldLabel>
      </div>
      <input type="hidden" name="playedFrom" value={from} disabled={from === ""} />
      <input type="hidden" name="playedTo" value={to} disabled={to === ""} />
      {params.getAll("playedFrom").length > 1 || params.getAll("playedTo").length > 1 ? <p className="text-sm text-muted">日時が重複指定されています。表示ボタンで、それぞれ1つの値に設定し直してください。</p> : null}
      <Button type="submit" className="justify-self-start">表示</Button>
    </form>
  </section>;
}
