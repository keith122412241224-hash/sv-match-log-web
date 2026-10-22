"use client";

import { useLayoutEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { ChevronDown, X } from "lucide-react";
import { ClassIcon } from "@/components/ClassIcon";
import { deckDialogClassName, groupDecks, useDeckDialog, type SelectableDeck } from "@/components/DeckSelectDialog";
import { MAX_ANALYSIS_DECKS, normalizeDeckSelection, type DeckSelection } from "@/lib/analysis-deck-selection";

// Confirm changes only this form field. Applying the analysis form performs the request.
export function DeckMultiSelectDialog({ decks, value, label, name, disabled = false, selectionRevision }: {
  decks: readonly SelectableDeck[]; value: DeckSelection; label: string;
  name: "myDeck" | "opponentDeck"; disabled?: boolean; selectionRevision?: object;
}) {
  const { id, trigger, dialog, open, setOpen, close, dialogEvents } = useDeckDialog();
  const [confirmed, setConfirmed] = useState(value), [draft, setDraft] = useState(value);
  const [expanded, setExpanded] = useState<string[]>([]), [error, setError] = useState("");
  useLayoutEffect(() => { setConfirmed(value); setDraft(value); setError(""); }, [value, selectionRevision]);
  const groups = useMemo(() => groupDecks(decks), [decks]);
  const selected = confirmed?.length === 1 ? decks.find(deck => deck.id === confirmed[0]) : undefined;
  const title = confirmed === null ? "すべて" : confirmed.length === 1 ? selected?.name ?? "元のデッキ（現在選択肢なし）" : `${confirmed.length}デッキ選択中`;
  const selectedIds = new Set(draft ?? []);
  function change(ids: Set<string>) {
    setDraft(groups.flatMap(group => group.decks).filter(deck => ids.has(deck.id)).map(deck => deck.id));
    setError("");
  }
  function confirm() {
    if (disabled) return;
    try { setConfirmed(normalizeDeckSelection(draft, groups.flatMap(group => group.decks))); close(); }
    catch { setError(`1〜${MAX_ANALYSIS_DECKS}デッキを選ぶか、「すべて」を選択してください。`); }
  }
  return <div className="grid min-w-0 gap-1.5 text-sm font-semibold">
    <label id={`${id}-label`} htmlFor={`${id}-trigger`}>{label}</label>
    <button ref={trigger} id={`${id}-trigger`} type="button" disabled={disabled} aria-haspopup="dialog" aria-expanded={open}
      aria-controls={open ? `${id}-dialog` : undefined} aria-labelledby={`${id}-label ${id}-value`}
      onClick={() => { setDraft(confirmed); setError(""); setExpanded(selected ? [selected.class_name] : []); setOpen(true); }}
      className="flex min-h-11 w-full min-w-0 items-center gap-2 rounded-md border border-slate-300 bg-white px-3 py-2 text-left font-normal focus-visible:ring-2 disabled:opacity-60">
      {selected && <span aria-hidden="true"><ClassIcon className={selected.class_name} size={24} /></span>}
      <span id={`${id}-value`} className="min-w-0 flex-1 break-words [overflow-wrap:anywhere]">{title}</span>
      <ChevronDown aria-hidden="true" className="size-4 shrink-0" />
    </button>
    <input type="hidden" name={confirmed && confirmed.length > 1 ? `${name}Ids` : name} value={confirmed?.join(",") ?? ""} />
    {open && createPortal(<dialog ref={dialog} id={`${id}-dialog`} aria-labelledby={`${id}-title`} {...dialogEvents} className={deckDialogClassName}>
      <div className="flex shrink-0 items-center justify-between gap-2 border-b p-3">
        <h2 id={`${id}-title`} className="text-lg font-bold">{label}を選択</h2>
        <button type="button" aria-label="閉じる" onClick={close} className="flex size-11 shrink-0 items-center justify-center rounded focus-visible:ring-2"><X aria-hidden="true" size={20} /></button>
      </div>
      <div className="min-h-0 overflow-y-auto overscroll-contain p-3" data-deck-options>
        <div className="mb-3 flex flex-wrap gap-2">
          <button type="button" aria-pressed={draft === null} onClick={() => { setDraft(null); setError(""); }} className="min-h-11 rounded-md border px-3 aria-pressed:border-sky-700 aria-pressed:bg-sky-50">すべて</button>
          <button type="button" onClick={() => { setDraft([]); setError(""); }} className="min-h-11 rounded-md border px-3">選択をクリア</button>
        </div>
        <p role="status" className="mb-3 text-xs text-muted">{draft === null ? "絞り込みなし" : `${draft.length}デッキ選択中`}。決定後に「表示」で集計します。</p>
        {!groups.length && <p>選択できるデッキがありません。</p>}
        {groups.map((group, index) => {
          const count = group.decks.filter(deck => selectedIds.has(deck.id)).length;
          const isExpanded = expanded.includes(group.className), groupId = `${id}-group-${index}`;
          return <section key={group.className} className="border-b border-slate-100 last:border-0">
            <h3><button type="button" aria-expanded={isExpanded} aria-controls={groupId}
              onClick={() => setExpanded(current => isExpanded ? current.filter(name => name !== group.className) : [...current, group.className])}
              className="flex min-h-12 w-full items-center gap-2 rounded px-2 py-2 text-left font-bold focus-visible:ring-2">
              <ChevronDown aria-hidden="true" className={`size-4 shrink-0 ${isExpanded ? "" : "-rotate-90"}`} />
              <span aria-hidden="true"><ClassIcon className={group.className} size={28} loading="eager" /></span>
              <span className="min-w-0 break-words">{group.className || "クラス未設定"}（{group.decks.length}デッキ）{count > 0 && `・${count}選択`}</span>
            </button></h3>
            <div id={groupId} hidden={!isExpanded}>
              <button type="button" aria-label={`${group.className}を全選択・全解除`} aria-pressed={count === group.decks.length ? true : count ? "mixed" : false}
                onClick={() => { const next = new Set(selectedIds); for (const deck of group.decks) { if (count === group.decks.length) next.delete(deck.id); else next.add(deck.id); } change(next); }}
                className="mb-2 min-h-11 rounded border px-3 focus-visible:ring-2">{count === group.decks.length ? "クラスを全解除" : "クラスを全選択"}{count > 0 && count < group.decks.length ? "（一部選択）" : ""}</button>
              <div className="grid gap-2 pb-3 sm:grid-cols-2">
                {group.decks.map(deck => <label key={deck.id} className="flex min-h-12 min-w-0 cursor-pointer items-center gap-2 rounded-md border border-slate-300 px-3 py-2 has-[:checked]:border-sky-700 has-[:checked]:bg-sky-50">
                  <input type="checkbox" checked={selectedIds.has(deck.id)} onChange={() => { const next = new Set(selectedIds); if (next.has(deck.id)) next.delete(deck.id); else next.add(deck.id); change(next); }} className="size-4 shrink-0 accent-sky-700" />
                  <span className="min-w-0 break-words [overflow-wrap:anywhere]">{deck.name}</span>
                </label>)}
              </div>
            </div>
          </section>;
        })}
      </div>
      <div className="shrink-0 border-t bg-white p-3">
        {error && <p role="alert" className="mb-2 text-red-700">{error}</p>}
        <div className="flex justify-end gap-2">
          <button type="button" onClick={close} className="min-h-11 rounded-md border px-4 focus-visible:ring-2">キャンセル</button>
          <button type="button" onClick={confirm} className="min-h-11 rounded-md bg-ink px-4 text-white focus-visible:ring-2">決定</button>
        </div>
      </div>
    </dialog>, document.body)}
  </div>;
}
