"use client";

import { ChevronDown, Download } from "lucide-react";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { Button } from "@/components/Button";
import { ClassIcon, DeckWithClassIcon, isShadowverseClass } from "@/components/ClassIcon";
import { SHADOWVERSE_CLASSES } from "@/lib/constants";
import { cn, formatPercent } from "@/lib/utils";
import type { DeckLike, MatrixCell } from "@/lib/analytics";

type MatrixRow = {
  myDeck: DeckLike;
  cells: MatrixCell[];
};

const bandClasses: Record<MatrixCell["band"], string> = {
  favored: "bg-emerald-700 text-white",
  slightly_favored: "bg-emerald-100 text-emerald-950",
  even: "bg-slate-100 text-slate-900",
  slightly_unfavored: "bg-amber-100 text-amber-950",
  unfavored: "bg-red-700 text-white",
  empty: "bg-white text-slate-400"
};

export function MatchupMatrix({
  createdAtLabel,
  rows,
  opponentDecks,
  title = "対面勝率表",
  populationLabel,
  environmentName = "現在の環境"
}: {
  createdAtLabel?: string;
  rows: MatrixRow[];
  opponentDecks: DeckLike[];
  title?: string;
  populationLabel?: string;
  environmentName?: string;
}) {
  const deckIds = useMemo(() => opponentDecks.map((deck) => deck.id), [opponentDecks]);
  const deckIdsKey = deckIds.join(",");
  const [visibleDeckIds, setVisibleDeckIds] = useState<string[]>(deckIds);
  const [selectionOpen, setSelectionOpen] = useState(false);
  const [expandedClasses, setExpandedClasses] = useState<string[]>([]);
  const selectionId = useId();
  const deckGroups = useMemo(() => {
    const groups = new Map<string, DeckLike[]>();
    for (const deck of opponentDecks) {
      const className = isShadowverseClass(deck.class_name) ? deck.class_name : "その他";
      const decks = groups.get(className) ?? [];
      decks.push(deck);
      groups.set(className, decks);
    }
    return [...SHADOWVERSE_CLASSES, "その他"].flatMap((className) => {
      const decks = groups.get(className);
      return decks ? [{ className, decks }] : [];
    });
  }, [opponentDecks]);
  const ref = useRef<HTMLDivElement>(null);
  const createdAt = useMemo(
    () => createdAtLabel ?? new Date().toLocaleDateString("ja-JP"),
    [createdAtLabel]
  );

  useEffect(() => {
    setVisibleDeckIds((current) => {
      if (current.length === 0) {
        return deckIds;
      }

      const next = current.filter((id) => deckIds.includes(id));
      return next.length > 0 ? next : deckIds;
    });
  }, [deckIdsKey, deckIds]);

  const visibleDeckIdSet = useMemo(() => new Set(visibleDeckIds), [visibleDeckIds]);
  const visibleOpponentDecks = useMemo(
    () => opponentDecks.filter((deck) => visibleDeckIdSet.has(deck.id)),
    [opponentDecks, visibleDeckIdSet]
  );
  const visibleRows = useMemo(
    () =>
      rows
        .filter((row) => visibleDeckIdSet.has(row.myDeck.id))
        .map((row) => ({
          ...row,
          cells: row.cells.filter((cell) => visibleDeckIdSet.has(cell.opponentDeckId))
        })),
    [rows, visibleDeckIdSet]
  );

  function toggleDeck(deckId: string) {
    setVisibleDeckIds((current) =>
      current.includes(deckId) ? current.filter((id) => id !== deckId) : [...current, deckId]
    );
  }

  function toggleClass(decks: DeckLike[]) {
    const ids = new Set(decks.map((deck) => deck.id));
    setVisibleDeckIds((current) =>
      decks.every((deck) => current.includes(deck.id))
        ? current.filter((id) => !ids.has(id))
        : [...new Set([...current, ...ids])]
    );
  }

  async function saveImage() {
    if (!ref.current || visibleRows.length === 0) {
      return;
    }

    const { toPng } = await import("html-to-image");
    const dataUrl = await toPng(ref.current, {
      cacheBust: true,
      backgroundColor: "#ffffff",
      pixelRatio: 2
    });
    const link = document.createElement("a");
    link.download = `sv-matchup-${new Date().toISOString().slice(0, 10)}.png`;
    link.href = dataUrl;
    link.click();
  }

  return (
    <div className="grid gap-4">
      <section aria-label="表示するデッキ" className="min-w-0 rounded-md border border-slate-200 bg-white">
        <h2>
          <button
            aria-controls={selectionId}
            aria-expanded={selectionOpen}
            className="flex min-h-11 w-full items-center justify-between gap-3 rounded-md p-3 text-left text-sm text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
            onClick={() => setSelectionOpen((open) => !open)}
            type="button"
          >
            <span className="grid gap-1">
              <span className="font-bold">表示するデッキ</span>
              <span className="text-xs font-normal text-muted">{visibleOpponentDecks.length} / {opponentDecks.length}デッキを表示中</span>
            </span>
            <span className="flex shrink-0 items-center gap-1 text-xs font-semibold">
              <ChevronDown aria-hidden="true" className={cn("transition-transform", selectionOpen && "rotate-180")} size={16} />
              {selectionOpen ? "閉じる" : "展開"}
            </span>
          </button>
        </h2>
        <div className={selectionOpen ? "grid gap-3 border-t border-slate-200 p-3" : "hidden"} hidden={!selectionOpen} id={selectionId}>
          <p className="text-xs text-muted">選んだデッキを、使用デッキと相手デッキの両方に反映します。</p>
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="secondary" className="min-h-9 px-3 py-1.5 text-xs" onClick={() => setVisibleDeckIds(deckIds)}>
              全表示
            </Button>
            <Button type="button" variant="ghost" className="min-h-9 px-3 py-1.5 text-xs" onClick={() => setVisibleDeckIds([])}>
              全非表示
            </Button>
          </div>
          {deckGroups.map(({ className, decks }, index) => {
            const selectedCount = decks.filter((deck) => visibleDeckIdSet.has(deck.id)).length;
            const allSelected = selectedCount === decks.length;
            const expanded = expandedClasses.includes(className);
            const groupId = `${selectionId}-${index}`;
            return (
              <section aria-label={`${className}のデッキ`} className="min-w-0 rounded-md border border-slate-200" key={className}>
                <div className="flex items-center gap-2 p-2">
                  <h3 className="min-w-0 flex-1">
                    <button
                      aria-controls={groupId}
                      aria-expanded={expanded}
                      className="flex min-h-11 w-full items-center gap-2 rounded px-1 text-left text-sm font-bold text-ink hover:bg-slate-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
                      onClick={() => setExpandedClasses((current) => current.includes(className) ? current.filter((name) => name !== className) : [...current, className])}
                      type="button"
                    >
                      <ChevronDown aria-hidden="true" className={cn("shrink-0 transition-transform", !expanded && "-rotate-90")} size={16} />
                      <span aria-hidden="true" className="shrink-0"><ClassIcon className={className} size={22} /></span>
                      <span className="min-w-0 break-words">{className}<span className="ml-1 inline-block text-xs font-normal text-muted">（{selectedCount} / {decks.length}）</span></span>
                    </button>
                  </h3>
                  <Button aria-label={`${className}を${allSelected ? "全解除" : "全選択"}`} className="min-h-11 shrink-0 px-2 text-xs" onClick={() => toggleClass(decks)} type="button" variant="secondary">
                    {allSelected ? "全解除" : "全選択"}
                  </Button>
                </div>
                <div className={expanded ? "flex flex-wrap gap-2 border-t border-slate-200 p-3" : "hidden"} hidden={!expanded} id={groupId}>
                  {decks.map((deck) => {
                    const selected = visibleDeckIdSet.has(deck.id);
                    return (
                      <button
                        aria-pressed={selected}
                        className={cn(
                          "inline-flex min-h-10 min-w-0 max-w-full items-center gap-2 rounded-md border px-3 py-2 text-left text-sm font-semibold transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2",
                          selected
                            ? "border-ink bg-ink text-white"
                            : "border-slate-300 bg-white text-muted hover:border-slate-400 hover:bg-slate-50"
                        )}
                        key={deck.id}
                        onClick={() => toggleDeck(deck.id)}
                        type="button"
                      >
                        <span className="shrink-0"><ClassIcon className={deck.class_name} size={22} /></span>
                        <span className="min-w-0 break-words [overflow-wrap:anywhere]">{deck.name}</span>
                      </button>
                    );
                  })}
                </div>
              </section>
            );
          })}
        </div>
      </section>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-2 text-xs font-semibold">
          <span className="rounded bg-emerald-700 px-2 py-1 text-white">60%以上 有利</span>
          <span className="rounded bg-emerald-100 px-2 py-1 text-emerald-950">50-59% 微有利</span>
          <span className="rounded bg-slate-100 px-2 py-1 text-slate-900">45-49% 五分</span>
          <span className="rounded bg-amber-100 px-2 py-1 text-amber-950">40-44% 微不利</span>
          <span className="rounded bg-red-700 px-2 py-1 text-white">39%以下 不利</span>
        </div>
        <Button type="button" variant="secondary" onClick={saveImage} disabled={visibleRows.length === 0}>
          <Download size={17} aria-hidden="true" />
          PNG保存
        </Button>
      </div>

      {visibleRows.length === 0 ? (
        <p className="rounded-md border border-slate-200 bg-white p-4 text-sm text-muted">
          表示するデッキが選択されていません。
        </p>
      ) : (
        <div className="matrix-scrollbar overflow-x-auto rounded-md border border-slate-200 bg-white">
          <div ref={ref} className="inline-block min-w-full bg-white p-4">
            <header className="mb-3 flex items-end justify-between gap-4">
              <div>
                <h2 className="text-xl font-bold text-ink">{title}</h2>
                {populationLabel ? <p className="text-xs text-muted">{populationLabel}</p> : null}
                <p className="text-xs text-muted">
                  {environmentName} / 作成日 {createdAt}
                </p>
              </div>
              <div className="text-right text-xs font-bold text-muted">SV Match Log Web</div>
            </header>
            <table className="min-w-[760px] border-collapse text-center text-sm">
              <thead>
                <tr>
                  <th className="sticky left-0 z-10 border border-slate-200 bg-slate-50 px-3 py-2 text-left text-muted">使用＼相手</th>
                  {visibleOpponentDecks.map((deck) => (
                    <th className="border border-slate-200 bg-slate-50 px-3 py-2 text-muted" key={deck.id}>
                      <div className="grid justify-items-center gap-1 font-bold text-ink">
                        <ClassIcon className={deck.class_name} size={26} />
                        <span>{deck.name}</span>
                      </div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {visibleRows.map((row) => (
                  <tr key={row.myDeck.id}>
                    <th className="sticky left-0 z-10 border border-slate-200 bg-slate-50 px-3 py-2 text-left">
                      <DeckWithClassIcon className={row.myDeck.class_name} name={row.myDeck.name} />
                    </th>
                    {row.cells.map((cell) => (
                      <td className={cn("h-16 min-w-32 border border-slate-200 px-2 py-2", bandClasses[cell.band])} key={cell.opponentDeckId}>
                        {cell.total === 0 ? (
                          <span className="text-xs">未対戦</span>
                        ) : (
                          <div className="grid gap-1">
                            <span className="text-lg font-bold">{formatPercent(cell.winRate)}</span>
                            <span className="text-xs">
                              {cell.wins}勝 / {cell.total}戦
                            </span>
                          </div>
                        )}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
