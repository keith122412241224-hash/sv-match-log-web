"use client";

import { Fragment, useId, useMemo, useState } from "react";
import { ChevronDown } from "lucide-react";
import { DeckWithClassIcon } from "@/components/ClassIcon";
import { ExportableAnalysisBlock } from "@/components/analysis/ExportableAnalysisBlock";
import { selectAnalysisMatchups, type AnalysisMatrix, type MatchupSort } from "@/lib/analysis-matchups";
import type { DeckLike } from "@/lib/analytics";
import { formatPercent } from "@/lib/utils";

export function AnalysisMatchups({ matrix, decks, selectedDeckId, combined }: {
  matrix: AnalysisMatrix; decks: DeckLike[]; selectedDeckId: string; combined: boolean;
}) {
  const [sort, setSort] = useState<MatchupSort>("count");
  const [minimum, setMinimum] = useState(0);
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());
  const id = useId();
  const groups = useMemo(() => selectAnalysisMatchups(matrix, sort, minimum, selectedDeckId), [matrix, sort, minimum, selectedDeckId]);
  const opponents = useMemo(() => new Map(decks.map(deck => [deck.id, deck])), [decks]);
  const countLabel = combined ? "対象件数" : "対戦数";
  const empty = minimum ? `${combined ? "対象件数が5件" : "5戦"}以上の対面はありません。` : "表示できるデータがありません。";
  function toggle(deckId: string) {
    setExpanded(previous => {
      const next = new Set(previous);
      if (next.has(deckId)) next.delete(deckId); else next.add(deckId);
      return next;
    });
  }
  return <ExportableAnalysisBlock title="デッキ別対面分析" filename="matchup-winrate">
    <div data-png-exclude className="flex flex-wrap gap-3 p-4 text-sm">
      <label className="grid gap-1 font-semibold">並び替え
        <select aria-label="並び替え" className="min-h-10 max-w-full rounded border border-slate-300 bg-white px-3" value={sort} onChange={event => setSort(event.target.value as MatchupSort)}>
          <option value="count">{combined ? "対象件数" : "対戦数"}が多い順</option>
          <option value="win-desc">勝率が高い順</option><option value="win-asc">勝率が低い順</option>
        </select>
      </label>
      <label className="grid gap-1 font-semibold">件数フィルター
        <select aria-label="件数フィルター" className="min-h-10 rounded border border-slate-300 bg-white px-3" value={minimum} onChange={event => setMinimum(Number(event.target.value))}>
          <option value={0}>全件</option><option value={5}>{combined ? "5件" : "5戦"}以上のみ</option>
        </select>
      </label>
    </div>
    {groups.length === 0 ? <p className="p-4 text-sm text-muted">表示できるデータがありません。</p> :
      <table data-analysis-matchups className="w-full table-fixed text-left text-sm">
        <thead className="bg-slate-50 text-xs text-muted"><tr>
          <th scope="col" className="px-3 py-3">相手デッキ</th>
          <th scope="col" className="w-16 px-1 py-3 text-right sm:w-24">勝率</th>
          <th scope="col" className="w-12 px-1 py-3 text-right sm:w-20">勝利数</th>
          <th scope="col" className="w-16 px-3 py-3 text-right sm:w-24">{countLabel}</th>
        </tr></thead>
        <tbody>{groups.map(group => {
          const open = Boolean(selectedDeckId) || expanded.has(group.myDeck.id);
          const rowIds = (group.cells.length ? group.cells.map(cell => cell.opponentDeckId) : ["empty"]).map(opponentId => `${id}-${group.myDeck.id}-${opponentId}`);
          const heading = <span className="flex min-w-0 flex-1 flex-wrap items-center justify-between gap-2 [&_span[title]]:shrink-0 [&_.truncate]:whitespace-normal [&_.truncate]:break-words [&_.truncate]:[overflow-wrap:anywhere]">
            <DeckWithClassIcon className={group.myDeck.class_name} name={group.myDeck.name} />
            <span className="shrink-0 text-xs font-normal tabular-nums text-muted">{combined ? "対象件数 " : "総対戦数 "}{group.total.toLocaleString("ja-JP")}{combined ? "件" : "戦"}</span>
          </span>;
          return <Fragment key={group.myDeck.id}>
            <tr data-matchup-heading={group.myDeck.id} className="border-t border-slate-200 bg-slate-50">
              <th colSpan={4} scope="rowgroup" className="p-3">
                {selectedDeckId ? heading : <>
                  <button type="button" data-png-exclude aria-expanded={open} aria-controls={rowIds.join(" ")}
                    onClick={() => toggle(group.myDeck.id)} className="flex min-h-11 w-full items-center gap-2 text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-emerald-700">
                    {heading}<ChevronDown size={16} aria-hidden="true" className={`shrink-0 ${open ? "rotate-180" : ""}`} />
                  </button>
                  <div hidden data-png-expand>{heading}</div>
                </>}
              </th>
            </tr>
            {group.cells.length === 0 ? <tr id={rowIds[0]} hidden={!open} data-png-expand><td colSpan={4} className="p-4 text-muted">{empty}</td></tr> : group.cells.map((cell, index) => {
              const opponent = opponents.get(cell.opponentDeckId);
              return <tr key={cell.opponentDeckId} id={rowIds[index]} hidden={!open} data-png-expand data-matchup-cell={`${group.myDeck.id}/${cell.opponentDeckId}`} className="border-t border-slate-100">
                <th scope="row" className="px-3 py-3 [&_span[title]]:shrink-0 [&_.truncate]:whitespace-normal [&_.truncate]:break-words [&_.truncate]:[overflow-wrap:anywhere]">
                  {opponent ? <DeckWithClassIcon className={opponent.class_name} name={opponent.name} /> : "不明"}
                </th>
                <td className="px-1 py-3 text-right font-semibold tabular-nums">{formatPercent(cell.winRate)}</td>
                <td className="px-1 py-3 text-right tabular-nums">{cell.wins.toLocaleString("ja-JP")}</td>
                <td className="px-3 py-3 text-right tabular-nums">{cell.total.toLocaleString("ja-JP")}</td>
              </tr>;
            })}
          </Fragment>;
        })}</tbody>
      </table>}
  </ExportableAnalysisBlock>;
}
