"use client";

import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import { createPortal } from "react-dom";
import { ChevronDown } from "lucide-react";
import { RankOptionLabel } from "@/components/RankBadge";
import { RANKS } from "@/constants/ranks";
import { ATOMIC_RANK_GROUPS, MASTER_ATOMS, GRANDMASTER_ATOMS, RANK_ATOMS, RANK_PRESETS,
  getRankSelectionLabel, normalizeRankSelection, rankGroupState, serializeRankSelection, toggleRankGroup, type RankSelection } from "@/lib/rank-selection";

function ParentCheckbox({ label, draft, group, onChange }: { label: string; draft: RankSelection; group: RankSelection; onChange: () => void }) {
  const ref = useRef<HTMLInputElement>(null), state = rankGroupState(draft, group);
  useEffect(() => { if (ref.current) ref.current.indeterminate = state.indeterminate; }, [state.indeterminate]);
  const option = RANKS.find(r => r.label === label)!;
  return <label className="flex min-h-11 cursor-pointer items-center gap-2 px-2 font-semibold"><input ref={ref} type="checkbox" checked={state.checked} onChange={onChange} className="size-4 shrink-0" /><RankOptionLabel option={{ ...option, label: `${label}すべて` }} /></label>;
}

export function RankMultiSelect({ value, onApply, disabled = false, label = "ランク", name = "ranks" }: {
  value: RankSelection; onApply: (selection: RankSelection) => void; disabled?: boolean; label?: string; name?: string;
}) {
  const id = useId(), trigger = useRef<HTMLButtonElement>(null), dialog = useRef<HTMLDialogElement>(null);
  const [open, setOpen] = useState(false), [draft, setDraft] = useState<RankSelection>(value);
  useEffect(() => { if (open && !dialog.current?.open) dialog.current?.showModal(); }, [open]);
  function close() { dialog.current?.close(); setOpen(false); trigger.current?.focus({ preventScroll: true }); }
  function show() { if (!disabled) { setDraft([...value]); setOpen(true); } }
  function apply() {
    if (!draft.length || disabled) return;
    const next = normalizeRankSelection(draft);
    close();
    if (serializeRankSelection(next) !== serializeRankSelection(value)) onApply(next);
  }
  function keys(e: KeyboardEvent<HTMLDivElement>) {
    if (!(e.target instanceof HTMLInputElement) || e.target.type !== "checkbox") return;
    if (e.key === "Enter") { e.preventDefault(); e.target.click(); return; }
    if (!["ArrowUp", "ArrowDown", "Home", "End"].includes(e.key)) return;
    e.preventDefault();
    const boxes = [...e.currentTarget.querySelectorAll<HTMLInputElement>('input[type="checkbox"]')], index = boxes.indexOf(e.target);
    boxes[e.key === "Home" ? 0 : e.key === "End" ? boxes.length - 1 : Math.max(0, Math.min(boxes.length - 1, index + (e.key === "ArrowDown" ? 1 : -1)))]?.focus();
  }
  return <div className="grid min-w-0 gap-1.5 text-sm font-semibold">
    <label id={`${id}-label`} htmlFor={`${id}-trigger`}>{label}</label>
    <button ref={trigger} id={`${id}-trigger`} type="button" aria-haspopup="dialog" aria-expanded={open}
      aria-controls={open ? `${id}-dialog` : undefined} aria-labelledby={`${id}-label ${id}-value`} aria-disabled={disabled || undefined}
      onClick={show} className="flex min-h-11 w-full min-w-0 items-center justify-between gap-2 rounded-md border border-slate-300 bg-white px-2 text-left font-normal focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 aria-disabled:opacity-60">
      <span id={`${id}-value`}>{getRankSelectionLabel(value)}</span><ChevronDown aria-hidden="true" className="size-4 shrink-0" />
    </button>
    <input type="hidden" name={name} value={serializeRankSelection(value)} />
    {open && createPortal(<dialog ref={dialog} id={`${id}-dialog`} aria-labelledby={`${id}-title`} onCancel={e => { e.preventDefault(); close(); }}
      className="fixed bottom-3 left-1/2 top-auto m-0 max-h-[85dvh] w-[calc(100%-1rem)] max-w-xl -translate-x-1/2 flex-col overflow-hidden rounded-lg border border-slate-300 bg-white p-0 text-sm shadow-xl backdrop:bg-slate-900/30 open:flex sm:bottom-auto sm:top-1/2 sm:-translate-y-1/2">
      <div className="shrink-0 border-b border-slate-200 p-4"><h2 id={`${id}-title`} className="text-lg font-bold">ランクを選択</h2><p className="mt-1 text-xs text-muted">選んだ区分をまとめて集計します。「すべて」はランク未登録も含みます。</p></div>
      <div className="min-h-0 overflow-y-auto overscroll-contain p-3" onKeyDown={keys}>
        <fieldset className="mb-3"><legend className="mb-2 font-semibold">クイック選択</legend><div className="flex flex-wrap gap-2">{RANK_PRESETS.map(p => <button key={p.value} type="button"
          aria-pressed={draft.length > 0 && serializeRankSelection(draft) === serializeRankSelection(p.ranks)} onClick={() => setDraft([...p.ranks])}
          className="min-h-11 rounded-md border border-slate-300 px-3 aria-pressed:border-sky-700 aria-pressed:bg-sky-50">{p.label}</button>)}</div></fieldset>
        {ATOMIC_RANK_GROUPS.map((g, i) => <fieldset key={g.label} className="mb-3 border-t border-slate-100 pt-2"><legend className="px-1 font-bold">{g.label}</legend>
          {i >= 2 && <ParentCheckbox label={g.label} draft={draft} group={i === 2 ? MASTER_ATOMS : GRANDMASTER_ATOMS} onChange={() => setDraft(v => toggleRankGroup(v, i === 2 ? MASTER_ATOMS : GRANDMASTER_ATOMS))} />}
          <div className="grid grid-cols-1 sm:grid-cols-2">{g.options.map(option => <label key={option.value} className="flex min-h-11 cursor-pointer items-center gap-2 rounded px-2 hover:bg-slate-50">
            <input type="checkbox" aria-label={option.fullLabel} value={option.value} checked={draft.includes(option.value)} className="size-4 shrink-0"
              onChange={e => { const checked = e.target.checked; setDraft(v => RANK_ATOMS.filter(r => r === option.value ? checked : v.includes(r))); }} />
            <RankOptionLabel option={option} />
          </label>)}</div>
        </fieldset>)}
      </div>
      <div className="shrink-0 border-t border-slate-200 p-3"><p aria-live="polite" className={`mb-2 text-sm ${draft.length ? "text-muted" : "text-red-700"}`}>{draft.length ? `${draft.length}区分を選択中` : "最低1区分を選択してください"}</p>
        <div className="flex justify-end gap-2"><button type="button" onClick={close} className="min-h-11 rounded-md border border-slate-300 px-4">キャンセル</button>
          <button type="button" aria-disabled={!draft.length || disabled || undefined} onClick={apply} className="min-h-11 rounded-md bg-slate-800 px-5 text-white aria-disabled:opacity-50">適用</button></div>
      </div>
    </dialog>, document.body)}
  </div>;
}
