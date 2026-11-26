"use client";
import { useEffect, useState } from "react";
import type { DisplayPublication } from "@/lib/environment-review/publication";
import { ReviewReport } from "./ReviewReport";

export function ReviewTab({ environment }: { environment: string }) {
  const [result, setResult] = useState<DisplayPublication | null>();
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    if (!environment) return;
    const controller = new AbortController();
    async function read() {
      try {
        const response = await fetch(`/api/environment/review?environment=${encodeURIComponent(environment)}`, { signal: controller.signal, cache: "no-store" });
        if (!response.ok) throw new Error();
        const publication = await response.json();
        if (!controller.signal.aborted) setResult(publication);
      } catch { if (!controller.signal.aborted) setFailed(true); }
    }
    void read();
    return () => controller.abort();
  }, [environment, attempt]);
  if (failed) return <div role="alert" className="rounded-md border bg-white p-4">総合環境評価を取得できませんでした。 <button className="underline" onClick={() => { setFailed(false); setAttempt(attempt + 1); }}>再試行</button></div>;
  if (!environment || result === null) return <section className="rounded-md border border-slate-200 bg-white p-5"><h2 className="font-bold">評価準備中</h2><p className="mt-2 text-sm text-muted">この環境の総合評価はまだ公開されていません。</p></section>;
  if (!result) return <p role="status">総合環境評価を読み込み中…</p>;
  return <ReviewReport publication={result} />;
}
