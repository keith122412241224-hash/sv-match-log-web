"use client";

import { useRef, useState, type FormEvent } from "react";
import { approveSuggestionAsArchetype, updateSuggestionStatus } from "@/app/admin/actions";
import { ClassIcon } from "@/components/ClassIcon";
import { Input } from "@/components/Field";
import { Button } from "@/components/Button";
import { suggestionMessages, type SuggestionDecision } from "@/lib/suggestion-decision";
import type { DeckSuggestion } from "@/types/database";

export function SuggestionDecisionForm({ suggestion, paused }: { suggestion: DeckSuggestion; paused: boolean }) {
  const [pending, setPending] = useState(false), [result, setResult] = useState<SuggestionDecision>();
  const busy = useRef(false), summary = useRef<HTMLParagraphElement>(null);
  const retry = useRef<{ operation: "approve" | "reject"; form: FormData } | null>(null);
  const complete = !!result && ["approved", "already_approved", "rejected", "already_rejected"].includes(result.status);
  const unknown = result?.status === "unknown";
  const terminal = !!result && ["conflict", "legacy", "inconsistent", "missing"].includes(result.status);
  async function execute(operation: "approve" | "reject", form: FormData) {
    if (busy.current || paused || complete || terminal) return;
    busy.current = true; setPending(true); retry.current = { operation, form };
    try {
      const value = await (operation === "approve" ? approveSuggestionAsArchetype(form, true) : updateSuggestionStatus(form, true));
      setResult(value ?? { status: "unknown", message: suggestionMessages.unknown });
    } catch { setResult({ status: "unknown", message: suggestionMessages.unknown }); }
    finally { busy.current = false; setPending(false); requestAnimationFrame(() => summary.current?.focus()); }
  }
  function submit(event: FormEvent<HTMLFormElement>, operation: "approve" | "reject") {
    event.preventDefault();
    if (!unknown) void execute(operation, new FormData(event.currentTarget));
  }
  return <article className="grid min-w-0 gap-3 rounded-md border border-slate-200 p-3" aria-busy={pending}>
    <form onSubmit={event => submit(event, "approve")}>
      <fieldset disabled={paused || pending || complete || unknown || terminal} className="grid min-w-0 gap-3 lg:grid-cols-[160px_minmax(0,1fr)_auto] lg:items-end">
        <input name="suggestion_id" type="hidden" value={suggestion.id} />
        <input name="class_name" type="hidden" value={suggestion.class_name} />
        <div><div className="mb-1 text-xs font-bold text-muted">クラス</div><ClassIcon className={suggestion.class_name} size={34} /></div>
        <label className="grid min-w-0 gap-1.5 text-sm font-semibold text-ink">標準デッキ名<Input name="name" required defaultValue={suggestion.suggested_name} /></label>
        <Button type="submit">{pending ? "処理中..." : "採用"}</Button>
      </fieldset>
    </form>
    <div className="flex min-w-0 flex-wrap items-center justify-between gap-3">
      {suggestion.memo ? <p className="min-w-0 break-words text-sm text-muted">メモ: {suggestion.memo}</p> : <span />}
      <form onSubmit={event => submit(event, "reject")}>
        <input name="id" type="hidden" value={suggestion.id} /><input name="status" type="hidden" value="rejected" />
        <Button type="submit" variant="secondary" disabled={paused || pending || complete || unknown || terminal}>却下</Button>
      </form>
    </div>
    <p ref={summary} tabIndex={-1} role="status" aria-live="polite" className="min-w-0 break-words text-sm font-semibold">
      {pending ? "処理結果を確認しています。画面を移動せずにお待ちください。" : result?.message}
      {result?.archetypeId && <span className="mt-1 block break-all text-xs">標準デッキID: {result.archetypeId}</span>}
    </p>
    {unknown && <Button type="button" disabled={pending || paused} onClick={() => { if (retry.current) void execute(retry.current.operation, retry.current.form); }}>同じ内容で結果を確認・再試行</Button>}
    {result && <p className="text-xs text-muted">一覧を読み直す場合は、未保存の入力を先に控えてください。</p>}
    <noscript>採用・却下にはJavaScriptが必要です。</noscript>
  </article>;
}
