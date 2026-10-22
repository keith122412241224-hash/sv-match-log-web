"use client";

import { useId, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { ChevronDown } from "lucide-react";
import type { summarizeAnalysisFilters } from "./AnalysisFilters";

export function AnalysisFilterPanel({ summary, canUseAllUsers, pending, selectionRevision, onApply, children }: {
  summary: ReturnType<typeof summarizeAnalysisFilters>;
  canUseAllUsers?: boolean;
  pending: boolean;
  selectionRevision?: object;
  onApply?: (form: HTMLFormElement) => void;
  children: ReactNode;
}) {
  const [expanded, setExpanded] = useState(false);
  const detailsId = useId(), toggle = useRef<HTMLButtonElement>(null), form = useRef<HTMLFormElement>(null);
  const acceptedRevision = useRef(selectionRevision);
  useLayoutEffect(() => {
    if (acceptedRevision.current === selectionRevision) return;
    acceptedRevision.current = selectionRevision;
    // Collapse only when a successful response/navigation installs new accepted data.
    if (form.current?.contains(document.activeElement)) toggle.current?.focus();
    setExpanded(false);
  }, [selectionRevision]);
  return (
    <section aria-label="分析条件" className="min-w-0 rounded-md border border-slate-200 bg-white p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-bold text-ink">分析条件</h2>
        {canUseAllUsers && <span className="rounded bg-slate-100 px-2 py-1 text-xs font-semibold text-muted">{summary.scope === "全ユーザー" ? "全ユーザー戦績" : "自分の戦績"}</span>}
      </div>
      <div data-analysis-conditions aria-live="polite" className="mt-2 grid gap-1 break-words text-sm text-muted [overflow-wrap:anywhere]">
        <p>{summary.scope} ／ {summary.mode} ／ {summary.ranks} ／ {summary.period}</p>
        <p className="flex flex-wrap gap-x-4 gap-y-1"><span>使用デッキ：{summary.myDeck}</span><span>相手デッキ：{summary.opponentDeck}</span></p>
        <p className="text-xs">環境：{summary.environment}{summary.turn && ` ／ ${summary.turn}`}{summary.result && ` ／ ${summary.result}`}</p>
      </div>
      <button ref={toggle} type="button" aria-expanded={expanded} aria-controls={detailsId}
        onClick={() => setExpanded(current => !current)}
        className="mt-2 flex min-h-11 w-full items-center justify-center gap-2 rounded-md border border-slate-300 px-3 py-2 text-sm font-semibold text-ink hover:bg-slate-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-700 sm:w-auto">
        分析条件を変更<ChevronDown aria-hidden="true" className={`size-4 ${expanded ? "rotate-180" : ""}`} />
      </button>
      <div id={detailsId} hidden={!expanded}>
    <form ref={form} action="/analysis" aria-busy={pending || undefined}
      onSubmit={e => { if (pending || onApply) e.preventDefault(); if (!pending) onApply?.(e.currentTarget); }}
      onPointerDownCapture={e => { if (pending) { e.preventDefault(); e.stopPropagation(); } }}
      onClickCapture={e => { if (pending) { e.preventDefault(); e.stopPropagation(); } }}
      onChangeCapture={e => { if (pending) { e.preventDefault(); e.stopPropagation(); } }}
      onKeyDownCapture={e => { if (pending && e.key !== "Tab") { e.preventDefault(); e.stopPropagation(); } }}
      className="mt-3 border-t border-slate-200 pt-3">
      {children}
    </form>
      </div>
    </section>
  );
}
