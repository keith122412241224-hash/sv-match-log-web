"use client";

import { Download } from "lucide-react";
import { toPng } from "html-to-image";
import { useMemo, useRef, useState } from "react";
import { Button } from "@/components/Button";
import { ClassIcon, DeckWithClassIcon } from "@/components/ClassIcon";
import { LOW_SAMPLE_THRESHOLD } from "@/lib/constants";
import { cn, formatPercent } from "@/lib/utils";
import type { DeckLike, MatrixCell } from "@/lib/analytics";

type MatrixRow = {
  myDeck: DeckLike;
  cells: MatrixCell[];
};

type ExportLayout = "table" | "x" | "short";

const bandClasses: Record<MatrixCell["band"], string> = {
  favored: "bg-emerald-700 text-white",
  slightly_favored: "bg-emerald-100 text-emerald-950",
  even: "bg-slate-100 text-slate-900",
  slightly_unfavored: "bg-amber-100 text-amber-950",
  unfavored: "bg-red-700 text-white",
  empty: "bg-white text-slate-400"
};

export function MatchupMatrix({
  rows,
  opponentDecks,
  title = "対面勝率表",
  environmentName = "現在の環境"
}: {
  rows: MatrixRow[];
  opponentDecks: DeckLike[];
  title?: string;
  environmentName?: string;
}) {
  const [layout, setLayout] = useState<ExportLayout>("table");
  const ref = useRef<HTMLDivElement>(null);
  const createdAt = useMemo(() => new Date().toLocaleDateString("ja-JP"), []);

  async function saveImage() {
    if (!ref.current) {
      return;
    }

    const dataUrl = await toPng(ref.current, {
      cacheBust: true,
      backgroundColor: "#ffffff",
      pixelRatio: 2
    });
    const link = document.createElement("a");
    link.download = `sv-matchup-${layout}-${new Date().toISOString().slice(0, 10)}.png`;
    link.href = dataUrl;
    link.click();
  }

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="grid grid-cols-3 gap-1 rounded-md border border-slate-300 bg-white p-1 text-xs font-bold">
          {([
            ["table", "通常"],
            ["x", "X横長"],
            ["short", "Short縦長"]
          ] as const).map(([value, label]) => (
            <button className={cn("rounded px-3 py-2", layout === value ? "bg-ink text-white" : "text-muted")} key={value} onClick={() => setLayout(value)} type="button">
              {label}
            </button>
          ))}
        </div>
        <Button type="button" variant="secondary" onClick={saveImage}>
          <Download size={17} aria-hidden="true" />
          PNG保存
        </Button>
      </div>

      <div className="flex flex-wrap gap-2 text-xs font-semibold">
        <span className="rounded bg-emerald-700 px-2 py-1 text-white">60%以上 有利</span>
        <span className="rounded bg-emerald-100 px-2 py-1 text-emerald-950">50-59% 微有利</span>
        <span className="rounded bg-slate-100 px-2 py-1 text-slate-900">45-49% 五分</span>
        <span className="rounded bg-amber-100 px-2 py-1 text-amber-950">40-44% 微不利</span>
        <span className="rounded bg-red-700 px-2 py-1 text-white">39%以下 不利</span>
      </div>

      <div className="matrix-scrollbar overflow-x-auto rounded-md border border-slate-200 bg-white">
        <div
          ref={ref}
          className={cn(
            "inline-block bg-white p-4",
            layout === "table" && "min-w-full",
            layout === "x" && "w-[1200px]",
            layout === "short" && "w-[720px]"
          )}
        >
          <header className="mb-3 flex items-end justify-between gap-4">
            <div>
              <h2 className={cn("font-bold text-ink", layout === "short" ? "text-2xl" : "text-xl")}>{title}</h2>
              <p className="text-xs text-muted">{environmentName} / 作成日 {createdAt} / 参考値: {LOW_SAMPLE_THRESHOLD - 1}戦以下</p>
            </div>
            <div className="text-right text-xs font-bold text-muted">SV Match Log Web</div>
          </header>
          <table className={cn("border-collapse text-center text-sm", layout === "short" ? "min-w-[680px]" : "min-w-[760px]")}>
            <thead>
              <tr>
                <th className="sticky left-0 z-10 border border-slate-200 bg-slate-50 px-3 py-2 text-left text-muted">使用＼相手</th>
                {opponentDecks.map((deck) => (
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
              {rows.map((row) => (
                <tr key={row.myDeck.id}>
                  <th className="sticky left-0 z-10 border border-slate-200 bg-slate-50 px-3 py-2 text-left">
                    <DeckWithClassIcon className={row.myDeck.class_name} name={row.myDeck.name} />
                  </th>
                  {row.cells.map((cell) => (
                    <td className={cn("h-24 min-w-32 border border-slate-200 px-2 py-2", bandClasses[cell.band])} key={cell.opponentDeckId}>
                      {cell.total === 0 ? (
                        <span className="text-xs">未対戦</span>
                      ) : (
                        <div className="grid gap-1">
                          <span className="text-lg font-bold">{formatPercent(cell.winRate)}</span>
                          <span className="text-xs">{cell.wins}勝 / {cell.total}戦</span>
                          {cell.isLowSample ? <span className="text-[11px] font-bold">参考値</span> : null}
                          <span className="text-[11px]">指数 {cell.environmentIndex}</span>
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
    </div>
  );
}
