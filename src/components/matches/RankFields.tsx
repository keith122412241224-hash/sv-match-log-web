"use client";

import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import { createPortal } from "react-dom";
import { ChevronDown } from "lucide-react";
import { RankOptionLabel } from "@/components/RankBadge";
import { ATOMIC_RANK_GROUPS } from "@/lib/rank-selection";
import { rankFromSelection, rankToSelection } from "@/lib/match-rank-preference";
import type { MatchRank } from "@/lib/match-rank";

const groups = ATOMIC_RANK_GROUPS.map(group => ({ ...group, options: group.options.map(option =>
  option.value === "unranked" ? { ...option, label: "未入力", fullLabel: "未入力" } : option) }));
const options = groups.flatMap(group => group.options);

export function RankFields({ value, onChange, disabled = false }: {
  value: MatchRank; onChange: (value: MatchRank) => void; disabled?: boolean;
}) {
  const id = useId(), trigger = useRef<HTMLButtonElement>(null), dialog = useRef<HTMLDialogElement>(null);
  const [open, setOpen] = useState(false);
  const selected = rankToSelection(value);
  useEffect(() => {
    if (open && dialog.current && !dialog.current.open) {
      dialog.current.showModal();
      dialog.current.querySelector<HTMLInputElement>("input:checked")?.focus({ preventScroll: true });
      dialog.current.querySelector<HTMLInputElement>("input:checked")?.scrollIntoView({ block: "nearest" });
    }
  }, [open]);
  function close() {
    dialog.current?.close();
    setOpen(false);
    trigger.current?.focus({ preventScroll: true });
  }
  function keys(event: KeyboardEvent<HTMLFieldSetElement>) {
    if (!(event.target instanceof HTMLInputElement)) return;
    if (event.key === "Enter") { event.preventDefault(); close(); return; }
    if (!["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
    event.preventDefault();
    const radios = [...event.currentTarget.querySelectorAll<HTMLInputElement>('input[type="radio"]')];
    const index = radios.indexOf(event.target), direction = ["ArrowUp", "ArrowLeft"].includes(event.key) ? -1 : 1;
    const next = radios[event.key === "Home" ? 0 : event.key === "End" ? radios.length - 1 : (index + direction + radios.length) % radios.length];
    next.focus();
    onChange(rankFromSelection(next.value));
  }
  return <fieldset className="grid min-w-0 gap-3 rounded-md border border-slate-200 p-3">
    <legend id={id + "-label"} className="px-1 text-sm font-semibold">対戦時点の自分のランク（任意）</legend>
    <p id={id + "-help"} className="text-xs text-muted">未入力でも保存できます。相手プレイヤーのランクではありません。</p>
    <button ref={trigger} type="button" aria-haspopup="dialog" aria-expanded={open} aria-controls={open ? id + "-dialog" : undefined}
      aria-labelledby={id + "-label " + id + "-value"} aria-describedby={id + "-help"} aria-disabled={disabled || undefined}
      onClick={() => { if (!disabled) setOpen(true); }}
      className="flex min-h-11 w-full items-center justify-between gap-2 rounded-md border border-slate-300 bg-white px-3 text-left text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 aria-disabled:opacity-60">
      <span id={id + "-value"}><RankOptionLabel option={options.find(option => option.value === selected)!} /></span>
      <ChevronDown aria-hidden="true" size={16} />
    </button>
    <input type="hidden" name="rank_tier" value={value.rank_tier ?? ""} />
    <input type="hidden" name="master_group" value={value.master_group ?? ""} />
    <input type="hidden" name="grandmaster_rating" value={value.grandmaster_rating ?? ""} />
    {open && createPortal(<dialog ref={dialog} id={id + "-dialog"} aria-labelledby={id + "-title"} onCancel={event => { event.preventDefault(); close(); }}
      onKeyDown={event => {
        if (event.key !== "Tab") return;
        const first = event.currentTarget.querySelector<HTMLInputElement>("input:checked");
        const last = event.currentTarget.querySelector<HTMLButtonElement>("button");
        if (event.shiftKey && event.target === first) { event.preventDefault(); last?.focus(); }
        else if (!event.shiftKey && event.target === last) { event.preventDefault(); first?.focus(); }
      }}
      className="fixed bottom-[max(0.75rem,env(safe-area-inset-bottom))] left-1/2 top-auto m-0 max-h-[85dvh] w-[calc(100%-1rem)] max-w-lg -translate-x-1/2 flex-col overflow-hidden rounded-lg border border-slate-300 bg-white p-0 text-sm shadow-xl backdrop:bg-slate-900/30 open:flex sm:bottom-auto sm:top-1/2 sm:-translate-y-1/2">
      <div className="shrink-0 border-b border-slate-200 p-4"><h2 id={id + "-title"} className="text-lg font-bold">ランクを選択</h2><p className="mt-1 text-xs text-muted">対戦時点の自分のランクを1つ選んでください。</p></div>
      <div data-rank-options className="min-h-0 overflow-y-auto overscroll-contain p-3">
      <fieldset aria-label="対戦時点の自分のランク" onKeyDown={keys}>
        {groups.map(group => <div key={group.label} className="mb-2">
          <p className="px-2 py-1 font-bold">{group.label}</p>
          <div className="grid grid-cols-1 sm:grid-cols-2">{group.options.map(option => <label key={option.value} className="flex min-h-11 cursor-pointer items-center gap-2 rounded px-2 has-[:checked]:bg-sky-50 hover:bg-slate-50">
            <input type="radio" name={id + "-rank"} value={option.value} checked={selected === option.value} aria-label={option.fullLabel}
              onChange={() => onChange(rankFromSelection(option.value))} onClick={close} className="size-4 shrink-0" />
            <RankOptionLabel option={option} />
          </label>)}</div>
        </div>)}
      </fieldset>
      </div>
      <div className="flex shrink-0 justify-end border-t border-slate-200 p-3"><button type="button" onClick={close} className="min-h-11 rounded-md border border-slate-300 px-4">閉じる</button></div>
    </dialog>, document.body)}
  </fieldset>;
}
