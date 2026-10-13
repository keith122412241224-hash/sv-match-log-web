"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { Button } from "@/components/Button";
import { checkArchetypesBatch, updateArchetypesBatch } from "@/app/admin/actions";
import { batchFields, batchLabels, batchResult, batchSnapshot, batchSummary, type BatchKind, type BatchResult, type BatchRow } from "@/lib/admin-batch";

export function useBatchUpdate<T extends { id: string }>(kind: BatchKind, initial: T[]) {
  // Keep the original rows/baselines and unsaved inputs across action revalidation.
  const [records] = useState(initial);
  const [ready, setReady] = useState(false);
  const [pending, setPending] = useState(false);
  const [result, setResult] = useState<BatchResult>();
  const busy = useRef(false), dirty = useRef(false), sent = useRef(new FormData());
  const summary = useRef<HTMLDivElement>(null);
  useEffect(() => {
    setReady(true);
    const unload = (event: BeforeUnloadEvent) => { if (dirty.current || busy.current) event.preventDefault(); };
    const navigate = (event: MouseEvent) => {
      if ((dirty.current || busy.current) && (event.target as Element).closest?.("a[href]") && !window.confirm("未保存または未確認の入力があります。画面を移動しますか？")) event.preventDefault();
    };
    window.addEventListener("beforeunload", unload);
    document.addEventListener("click", navigate, true);
    return () => { window.removeEventListener("beforeunload", unload); document.removeEventListener("click", navigate, true); };
  }, []);
  const status = (id: string) => result?.rows.find(row => row.id === id);
  const retryable = (row?: BatchRow) => !row || row.status === "validation" || row.status === "database";
  const locked = (id: string) => pending || !retryable(status(id));
  function selectRows(form: FormData, ids: string[]) {
    const selected = new FormData();
    for (const id of ids) {
      selected.append(`${kind}_ids`, id);
      for (const key of [...batchFields[kind], "baseline"]) {
        const value = form.get(`${key}_${id}`);
        if (value !== null) selected.set(`${key}_${id}`, value);
      }
    }
    return selected;
  }
  async function execute(form: FormData, check: boolean) {
    if (busy.current) return;
    busy.current = true; setPending(true);
    const ids = form.getAll(`${kind}_ids`).map(String);
    for (const [key, value] of form) if (key !== `${kind}_ids`) sent.current.set(key, value);
    // Unchecked checkboxes must also replace the previous submitted snapshot.
    for (const id of ids) for (const key of batchFields[kind]) if (!form.has(`${key}_${id}`)) sent.current.delete(`${key}_${id}`);
    let received: BatchResult;
    try {
      if (kind === "environment") {
        form.set("operation", check ? "check" : "update");
        const response = await fetch("/admin/environments", { method: "POST", headers: { Accept: "application/json" }, body: form });
        if (!response.ok) throw Error();
        received = await response.json();
      } else received = check ? await checkArchetypesBatch(form) : await updateArchetypesBatch(form, true);
      if (!received || !Array.isArray(received.rows) || received.rows.length !== ids.length || ids.some(id => received.rows.filter(row => row.id === id).length !== 1)) throw Error();
    } catch {
      received = batchResult(kind, ids.map(id => ({ id, label: String(form.get(`name_${id}`) ?? ""), status: "unknown", message: "応答を確認できません。接続・管理者ログインを確認し、再送前に保存状態を確認してください。" })));
    }
    const merged = batchResult(kind, [...(result?.rows.filter(row => !ids.includes(row.id)) ?? []), ...received.rows]);
    dirty.current = merged.succeeded !== merged.total;
    setResult(merged); busy.current = false; setPending(false);
    requestAnimationFrame(() => summary.current?.focus());
  }
  function submit(event: FormEvent<HTMLFormElement>) {
    if ((event.nativeEvent as SubmitEvent).submitter?.hasAttribute("data-batch-delete")) return;
    event.preventDefault();
    if (busy.current || !ready) return;
    const ids = records.filter(row => retryable(status(row.id))).map(row => row.id);
    void execute(selectRows(new FormData(event.currentTarget), ids), false);
  }
  const check = () => execute(selectRows(sent.current, result?.rows.filter(row => row.status === "unknown").map(row => row.id) ?? []), true);
  return { records, ready, pending, result, summary, status, locked, submit, check,
    changed: () => { dirty.current = true; },
    baseline: (row: T) => JSON.stringify(batchSnapshot(kind, row)),
    canSubmit: ready && !pending && records.some(row => retryable(status(row.id))),
    label: pending ? "処理中..." : result ? "未保存の行だけ再試行" : kind === "environment" ? "環境を一括更新" : "一括更新",
    reload: () => { if (!dirty.current || window.confirm("未保存の入力を控えましたか？画面を読み直すと入力は破棄されます。")) { dirty.current = false; window.location.reload(); } }
  };
}

export function BatchRowResult({ row }: { row?: BatchRow }) {
  return row ? <p id={`batch-result-${row.id}`} className={`mt-3 break-words text-sm font-semibold ${row.status === "success" ? "text-emerald-800" : "text-rose-700"}`}>
    {row.label}：{batchLabels[row.status]} — {row.message}
  </p> : null;
}

export function BatchSummary({ batch, kind }: { batch: Pick<ReturnType<typeof useBatchUpdate>, "summary" | "pending" | "result" | "check" | "reload">; kind: BatchKind }) {
  return <>
    <noscript><p>入力を保持して結果を確認するため、一括更新にはJavaScriptが必要です。</p></noscript>
    <div ref={batch.summary} tabIndex={-1} role="status" aria-live="polite" className="min-w-0 rounded-md bg-slate-50 p-3 text-sm">
      {batch.pending ? "保存結果を確認しています。画面を移動せずにお待ちください。" : batch.result ? batchSummary(batch.result, kind) : "編集後、一括更新してください。行ごとに保存結果を表示します。"}
      {batch.result && <div className="mt-2 flex flex-wrap gap-2">
        {!!batch.result.unknown && <Button type="button" disabled={batch.pending} onClick={() => void batch.check()}>未確認の保存状態を確認</Button>}
        <Button type="button" disabled={batch.pending} onClick={batch.reload}>保存値を読み直す</Button>
      </div>}
      {batch.result && batch.result.succeeded < batch.result.total && <p className="mt-2">未保存の入力はこの画面に残っています。画面を離れる前に必要な入力を控えてください。</p>}
    </div>
  </>;
}
