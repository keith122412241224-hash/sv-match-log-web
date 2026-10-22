"use client";

import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent, type SyntheticEvent } from "react";
import { createPortal } from "react-dom";
import { Check, ChevronDown, X } from "lucide-react";
import { ClassIcon } from "@/components/ClassIcon";
import { SHADOWVERSE_CLASSES } from "@/lib/constants";
import { cn } from "@/lib/utils";

export type SelectableDeck = { id: string; name: string; class_name: string };

export const deckDialogClassName = "fixed bottom-3 left-1/2 top-auto m-0 max-h-[85dvh] w-[calc(100%-1rem)] max-w-xl -translate-x-1/2 flex-col overflow-hidden rounded-lg border border-slate-300 bg-white p-0 text-sm text-ink shadow-xl backdrop:bg-slate-900/40 open:flex sm:bottom-auto sm:top-1/2 sm:-translate-y-1/2";
export function groupDecks(decks: readonly SelectableDeck[]) {
  const unique = [...new Map(decks.map(deck => [deck.id, deck])).values()];
  const classes = [...new Set<string>([...SHADOWVERSE_CLASSES, ...unique.map(deck => deck.class_name)])];
  return classes.map(className => ({ className, decks: unique.filter(deck => deck.class_name === className) })).filter(group => group.decks.length);
}
export function useDeckDialog() {
  const id = useId(), trigger = useRef<HTMLButtonElement>(null), dialog = useRef<HTMLDialogElement>(null);
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (!open) return;
    dialog.current?.showModal();
    // Native modal provides focus containment/inert background; prevent background scrolling too.
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = overflow; };
  }, [open]);
  function close() {
    dialog.current?.close();
    setOpen(false);
    trigger.current?.focus({ preventScroll: true });
  }
  const dialogEvents = {
    onCancel: (event: SyntheticEvent<HTMLDialogElement>) => { event.preventDefault(); event.stopPropagation(); close(); },
      onKeyDown: (event: KeyboardEvent<HTMLDialogElement>) => {
        event.stopPropagation();
        if (event.key !== "Tab") return;
        const buttons = [...event.currentTarget.querySelectorAll<HTMLElement>("button:not(:disabled), input:not(:disabled)")].filter(button => button.getClientRects().length > 0);
        const first = buttons[0], last = buttons.at(-1);
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
      }
  };
  return { id, trigger, dialog, open, setOpen, close, dialogEvents };
}

// Form-local draft: selecting a deck must neither request data nor render the analysis results.
export function DeckSelectDialogField({ value, selectionRevision, ...props }: Omit<Parameters<typeof DeckSelectDialog>[0], "onChange"> & { selectionRevision?: object }) {
  const [draft, setDraft] = useState(value);
  useLayoutEffect(() => { setDraft(value); }, [value, selectionRevision]);
  return <DeckSelectDialog {...props} value={draft} onChange={setDraft} />;
}

export function DeckSelectDialog({ decks, value, onChange, label, name, allowAll = false, disabled = false }: {
  decks: readonly SelectableDeck[];
  value: string;
  onChange: (id: string) => void;
  label: string;
  name?: string;
  allowAll?: boolean;
  disabled?: boolean;
}) {
  const { id, trigger, dialog, open, setOpen, close, dialogEvents } = useDeckDialog();
  const [expanded, setExpanded] = useState<string[]>([]);
  const groups = useMemo(() => groupDecks(decks), [decks]);
  const selected = decks.find(deck => deck.id === value);
  const selectedName = selected?.name ?? (value ? "元のデッキ（現在選択肢なし）" : allowAll ? "すべて" : "デッキを選択");
  function choose(next: string) {
    if (disabled) return;
    onChange(next);
    close();
  }
  return <div className="grid min-w-0 gap-1.5 text-sm font-semibold">
    <label id={`${id}-label`} htmlFor={`${id}-trigger`}>{label}</label>
    <button ref={trigger} id={`${id}-trigger`} type="button" disabled={disabled} aria-haspopup="dialog" aria-expanded={open}
      aria-controls={open ? `${id}-dialog` : undefined} aria-labelledby={`${id}-label ${id}-value`}
      onClick={() => { setExpanded(selected ? [selected.class_name] : []); setOpen(true); }}
      className="flex min-h-11 w-full min-w-0 items-center gap-2 rounded-md border border-slate-300 bg-white px-3 py-2 text-left font-normal focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 disabled:opacity-60">
      {selected && <span aria-hidden="true" className="shrink-0"><ClassIcon className={selected.class_name} size={24} /></span>}
      <span id={`${id}-value`} className="min-w-0 flex-1 break-words [overflow-wrap:anywhere]">{selectedName}</span>
      <ChevronDown aria-hidden="true" className="size-4 shrink-0" />
    </button>
    {name && <input type="hidden" name={name} value={value} />}
    {open && createPortal(<dialog ref={dialog} id={`${id}-dialog`} aria-labelledby={`${id}-title`}
      {...dialogEvents} className={deckDialogClassName}>
      <div className="flex shrink-0 items-center justify-between gap-2 border-b border-slate-200 p-3">
        <h2 id={`${id}-title`} className="text-lg font-bold">{label}を選択</h2>
        <button type="button" aria-label="閉じる" onClick={close} className="flex size-11 shrink-0 items-center justify-center rounded hover:bg-slate-100 focus-visible:ring-2"><X aria-hidden="true" size={20} /></button>
      </div>
      <div className="min-h-0 overflow-y-auto overscroll-contain p-3" data-deck-options>
        {allowAll && <button type="button" aria-pressed={value === ""} onClick={() => choose("")} className="mb-3 min-h-11 w-full rounded-md border border-slate-300 px-3 text-left font-semibold aria-pressed:border-sky-700 aria-pressed:bg-sky-50">すべて</button>}
        {value && !selected && <p role="status" className="mb-3 rounded bg-amber-50 p-3">元のデッキ（現在選択肢なし）。別のデッキを選ぶまで現在の値を保持します。</p>}
        {!groups.length && <p className="p-3 text-muted">選択できるデッキがありません。</p>}
        {groups.map((group, index) => {
          const isExpanded = expanded.includes(group.className), groupId = `${id}-group-${index}`;
          return <section key={group.className} className="border-b border-slate-100 last:border-0">
            <h3><button type="button" aria-expanded={isExpanded} aria-controls={groupId}
              onClick={() => setExpanded(current => isExpanded ? current.filter(name => name !== group.className) : [...current, group.className])}
              className="flex min-h-12 w-full items-center gap-2 rounded px-2 py-2 text-left font-bold hover:bg-slate-50 focus-visible:ring-2">
              <ChevronDown aria-hidden="true" className={cn("size-4 shrink-0", !isExpanded && "-rotate-90")} />
              <span aria-hidden="true" className="shrink-0"><ClassIcon className={group.className} size={28} loading="eager" /></span>
              <span className="min-w-0 break-words [overflow-wrap:anywhere]">{group.className || "クラス未設定"}（{group.decks.length}デッキ）</span>
            </button></h3>
            <div id={groupId} hidden={!isExpanded}>
              <div className="grid gap-2 pb-3 sm:grid-cols-2">
                {group.decks.map(deck => <button key={deck.id} type="button" aria-pressed={value === deck.id} onClick={() => choose(deck.id)}
                  className="flex min-h-12 min-w-0 items-center gap-2 rounded-md border border-slate-300 px-3 py-2 text-left font-semibold hover:bg-slate-50 focus-visible:ring-2 aria-pressed:border-sky-700 aria-pressed:bg-sky-50 aria-pressed:text-sky-950">
                  <Check aria-hidden="true" className={cn("size-4 shrink-0", value !== deck.id && "invisible")} />
                  <span className="min-w-0 break-words [overflow-wrap:anywhere]">{deck.name}</span>
                </button>)}
              </div>
            </div>
          </section>;
        })}
      </div>
      <div className="flex shrink-0 justify-end border-t border-slate-200 p-3"><button type="button" onClick={close} className="min-h-11 rounded-md border border-slate-300 px-4 focus-visible:ring-2">キャンセル</button></div>
    </dialog>, document.body)}
  </div>;
}
