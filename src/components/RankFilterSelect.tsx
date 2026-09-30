"use client";

import { useEffect, useId, useLayoutEffect, useRef, useState, type KeyboardEvent } from "react";
import { createPortal } from "react-dom";
import { ChevronDown } from "lucide-react";
import { RankOptionLabel } from "@/components/RankBadge";
import { RANK_FILTER_GROUPS, RANK_FILTER_OPTIONS, type RankFilter } from "@/lib/rank-filter";

export function RankFilterSelect({ value, onChange, disabled = false }: { value: RankFilter; onChange: (value: RankFilter) => void; disabled?: boolean }) {
  const id = useId(), trigger = useRef<HTMLButtonElement>(null), list = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false), [active, setActive] = useState(0);
  const [position, setPosition] = useState({ top: 0, left: 0, width: 0, maxHeight: 320 });
  const restoreFocus = useRef(false), typed = useRef({ text: "", at: 0 });
  const selected = RANK_FILTER_OPTIONS.find(r => r.value === value)!;
  const activeId = `${id}-option-${RANK_FILTER_OPTIONS[active].value}`;

  useLayoutEffect(() => {
    if (!open) return;
    const place = () => {
      const rect = trigger.current!.getBoundingClientRect(), margin = 8;
      if (rect.bottom < 0 || rect.top > window.innerHeight) { setOpen(false); return; }
      const below = window.innerHeight - rect.bottom - margin, above = rect.top - margin;
      const upwards = below < Math.min(320, above), maxHeight = Math.max(0, Math.min(320, (upwards ? above : below) - 4));
      const width = Math.min(rect.width, window.innerWidth - 2 * margin);
      setPosition({ top: upwards ? rect.top - maxHeight - 4 : rect.bottom + 4,
        left: Math.max(margin, Math.min(rect.left, window.innerWidth - width - margin)), width, maxHeight });
    };
    const outside = (e: PointerEvent) => {
      if (!trigger.current?.contains(e.target as Node) && !list.current?.contains(e.target as Node)) setOpen(false);
    };
    place(); window.addEventListener("resize", place); window.addEventListener("scroll", place, true);
    document.addEventListener("pointerdown", outside);
    return () => { window.removeEventListener("resize", place); window.removeEventListener("scroll", place, true); document.removeEventListener("pointerdown", outside); };
  }, [open]);
  useEffect(() => {
    if (open) document.getElementById(activeId)?.scrollIntoView({ block: "nearest" });
  }, [open, activeId]);
  useEffect(() => {
    if (!disabled && restoreFocus.current) {
      if (document.activeElement === document.body || document.activeElement === trigger.current) trigger.current?.focus({ preventScroll: true });
      restoreFocus.current = false;
    }
  }, [disabled]);

  function show(index = RANK_FILTER_OPTIONS.indexOf(selected)) { if (!disabled) { setActive(index); setOpen(true); } }
  function choose(index: number, focus = true) {
    setOpen(false); restoreFocus.current = focus && RANK_FILTER_OPTIONS[index].value !== value;
    if (focus) trigger.current?.focus({ preventScroll: true });
    onChange(RANK_FILTER_OPTIONS[index].value);
  }
  function keyDown(e: KeyboardEvent<HTMLButtonElement>) {
    if (disabled) return;
    if (e.key === "Tab") { if (open) choose(active, false); return; }
    if (e.key === "Escape") { if (open) { e.preventDefault(); setOpen(false); } return; }
    if (["Enter", " ", "ArrowDown", "ArrowUp", "Home", "End"].includes(e.key)) {
      e.preventDefault();
      if (e.key === "Enter" || e.key === " ") { if (open) choose(active); else show(); }
      else if (e.key === "Home" || e.key === "End") show(e.key === "Home" ? 0 : RANK_FILTER_OPTIONS.length - 1);
      else if (!open) show();
      else setActive(i => Math.max(0, Math.min(RANK_FILTER_OPTIONS.length - 1, i + (e.key === "ArrowDown" ? 1 : -1))));
    } else if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
      const now = Date.now(), letter = e.key.toLocaleLowerCase();
      const text = now - typed.current.at < 700 ? typed.current.text + letter : letter;
      typed.current = { text, at: now };
      const prefix = [...text].every(c => c === letter) ? letter : text;
      const start = prefix.length === 1 ? active + 1 : active;
      for (let n = 0; n < RANK_FILTER_OPTIONS.length; n++) {
        const i = (start + n) % RANK_FILTER_OPTIONS.length;
        if (RANK_FILTER_OPTIONS[i].label.toLocaleLowerCase().startsWith(prefix)) { e.preventDefault(); show(i); break; }
      }
    }
  }
  return <div className="grid min-w-0 gap-2 text-sm font-semibold">
    <label id={`${id}-label`} htmlFor={`${id}-trigger`}>ランク</label>
    <button ref={trigger} id={`${id}-trigger`} type="button" role="combobox" aria-haspopup="listbox" aria-expanded={open}
      aria-controls={open ? `${id}-list` : undefined} aria-activedescendant={open ? activeId : undefined}
      aria-labelledby={`${id}-label ${id}-value`} disabled={disabled} onKeyDown={keyDown}
      onBlur={e => { if (!list.current?.contains(e.relatedTarget as Node)) setOpen(false); }} onClick={() => open ? setOpen(false) : show()}
      className="flex min-h-11 w-full min-w-0 items-center justify-between gap-2 rounded-md border border-slate-300 bg-white px-2 text-left font-normal focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 disabled:opacity-60">
      <span id={`${id}-value`}><span className="sr-only">{selected.fullLabel !== selected.label ? `${selected.fullLabel.split(" / ")[0]} / ` : ""}</span><RankOptionLabel option={selected} /></span><ChevronDown aria-hidden="true" className="h-4 w-4 shrink-0" />
    </button>
    <input type="hidden" name="rank" value={value} />
    {open && createPortal(<div ref={list} id={`${id}-list`} role="listbox" aria-labelledby={`${id}-label`} style={position}
      className="fixed z-50 overflow-y-auto overscroll-contain rounded-md border border-slate-300 bg-white py-1 text-sm shadow-lg">
      {RANK_FILTER_GROUPS.map((group, g) => <div key={group.label} role="group" aria-labelledby={`${id}-group-${g}`}>
        <div id={`${id}-group-${g}`} className={g === 0 ? "sr-only" : "border-t border-slate-100 px-3 py-2 text-xs font-bold text-muted"}>{group.label}</div>
        {group.options.map(option => <div key={option.value} id={`${id}-option-${option.value}`} role="option" aria-selected={option.value === value} aria-label={option.fullLabel}
          onPointerDown={e => e.preventDefault()}
          onClick={() => choose(RANK_FILTER_OPTIONS.indexOf(option))}
          className={`flex min-h-11 cursor-pointer items-center justify-between gap-2 px-3 py-2 ${RANK_FILTER_OPTIONS[active].value === option.value ? "bg-sky-100 outline outline-2 -outline-offset-2 outline-sky-700" : "hover:bg-slate-50"}`}>
          <RankOptionLabel option={option} /><span aria-hidden="true">{option.value === value ? "✓" : ""}</span>
        </div>)}
      </div>)}
    </div>, document.body)}
  </div>;
}
