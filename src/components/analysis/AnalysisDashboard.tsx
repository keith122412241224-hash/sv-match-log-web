"use client";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { DeckAnalysisCards } from "@/components/analysis/DeckAnalysisCards";
import { ExportableAnalysisBlock } from "@/components/analysis/ExportableAnalysisBlock";
import { AnalysisFilters } from "@/components/analysis/AnalysisFilters";
import { DeckWithClassIcon } from "@/components/ClassIcon";
import { SummaryTable } from "@/components/SummaryTable";
import { buildAnalysisFromAggregates, parseAnalysisAggregates } from "@/lib/analysis-aggregates";
import { parseRankSelection, serializeRankSelection, type RankSelection } from "@/lib/rank-selection";
import { formatPercent } from "@/lib/utils";
import type { AnalysisPageData } from "@/lib/analysis-page-data";

function queryKey(value: string) {
  const query = new URLSearchParams(value);
  query.sort();
  return query.toString();
}

export function AnalysisDashboard({ initialData, initialQuery }: { initialData: AnalysisPageData; initialQuery: string }) {
  const container = useRef<HTMLDivElement>(null), controller = useRef<AbortController | null>(null);
  const [data, setData] = useState(initialData), [pending, setPending] = useState(false), [failed, setFailed] = useState(false);
  const currentQuery = useRef(initialQuery), serverData = useRef(initialData);
  const load = useCallback(async (query: URLSearchParams, updateUrl: boolean) => {
    controller.current?.abort();
    const request = new AbortController(); controller.current = request;
    currentQuery.current = query.toString();
    setPending(true); setFailed(false);
    try {
      const ranks = parseRankSelection(Object.fromEntries(query));
      const response = await fetch('/api/analysis?' + query, { signal: request.signal, cache: 'no-store' });
      if (!response.ok) throw new Error();
      const next = await response.json() as AnalysisPageData;
      if (serializeRankSelection(next.selectedRanks) !== serializeRankSelection(ranks)) throw new Error();
      next.aggregates = parseAnalysisAggregates(next.aggregates, next.matrixDecks.map(d => d.id));
      if (!request.signal.aborted) {
        setData(next); currentQuery.current = query.toString();
        if (updateUrl) window.history.replaceState(window.history.state, '', '/analysis?' + query);
      }
    } catch { if (!request.signal.aborted) setFailed(true); }
    finally { if (!request.signal.aborted) setPending(false); }
  }, []);
  useLayoutEffect(() => {
    const query = new URLSearchParams(window.location.search);
    // A history entry changed by client Apply can retain an older RSC payload.
    // Never install that payload over the selection named by the restored URL.
    if (queryKey(initialQuery) !== queryKey(query.toString())) {
      if (queryKey(currentQuery.current) !== queryKey(query.toString())) void load(query, false);
      return;
    }
    if (serverData.current === initialData) return;
    serverData.current = initialData;
    controller.current?.abort();
    currentQuery.current = query.toString();
    setData(initialData); setPending(false); setFailed(false);
  }, [initialData, initialQuery, load]);
  useLayoutEffect(() => {
    // Uncontrolled selects keep their DOM/focus, but must follow accepted navigation data.
    const values = { environment: data.selectedEnvironmentId, scope: data.selectedScope,
      winRateMode: data.winRateMode, myDeck: data.selectedMyDeckId, opponentDeck: data.selectedOpponentDeckId,
      result: data.selectedResult, turnOrder: data.selectedTurnOrder };
    for (const [name, value] of Object.entries(values)) {
      const control = container.current?.querySelector('form')?.elements.namedItem(name);
      if (control instanceof HTMLSelectElement) control.value = value;
    }
  }, [data]);
  useEffect(() => {
    const restore = () => {
      const query = new URLSearchParams(window.location.search);
      if (query.toString() !== currentQuery.current) void load(query, false);
    };
    window.addEventListener('popstate', restore);
    return () => { window.removeEventListener('popstate', restore); controller.current?.abort(); };
  }, [load]);
  function applyRanks(ranks: RankSelection) {
    const form = container.current?.querySelector('form');
    if (pending || !form || !form.reportValidity()) return;
    const query = new URLSearchParams();
    new FormData(form).forEach((value, key) => { if (typeof value === 'string') query.set(key, value); });
    query.delete('rank'); query.set('ranks', serializeRankSelection(ranks));
    void load(query, true);
  }
  const { environments, isAdmin, selectedRanks, selectedScope, winRateMode, selectedEnvironmentId, decks, archetypes, selectedEnvironmentName, matrixDecks, selectedMyDeckId, selectedOpponentDeckId, selectedTurnOrder, selectedResult, selectedPlayedFrom, selectedPlayedTo, aggregates } = data;
  const { registeredMatches, byMyDeck, byOpponentDeck, byTurn, matrix, summaries } = buildAnalysisFromAggregates(aggregates, decks, archetypes);
  return (
      <div ref={container} className="grid gap-6">
        <section>
          <h1 className="text-2xl font-bold text-ink">分析</h1>
          <p className="mt-1 text-sm text-muted">
            {selectedEnvironmentName ? `${selectedEnvironmentName} の戦績を分析しています。` : "環境を作成すると戦績を分析できます。"}
          </p>
        </section>

        {isAdmin ? (
          <section className="rounded-md border border-slate-200 bg-white p-4">
            <div className="text-xs font-bold text-muted">管理者分析</div>
            <div className="mt-1 text-lg font-bold text-ink">
              {selectedScope === "all" ? "全ユーザー戦績" : "自分の戦績"}
            </div>
            <p className="mt-1 text-sm text-muted">
              全ユーザー戦績は、管理者だけが閲覧できる総合集計です。通常ユーザーには表示されません。
            </p>
          </section>
        ) : null}

        <AnalysisFilters
          decks={matrixDecks}
          environments={environments}
          canUseAllUsers={isAdmin}
          pending={pending}
          onRankApply={applyRanks}
          values={{
            environmentId: selectedEnvironmentId,
            myDeckId: selectedMyDeckId,
            opponentDeckId: selectedOpponentDeckId,
            turnOrder: selectedTurnOrder,
            result: selectedResult,
            playedFrom: selectedPlayedFrom,
            playedTo: selectedPlayedTo,
            scope: selectedScope,
            winRateMode,
            rankSelection: selectedRanks
          }}
        />

        {pending && <p role="status" className="text-sm text-muted">ランク条件を適用中…</p>}
        {failed && <p role="alert" className="text-sm text-red-700">分析データを取得できませんでした。もう一度ランク条件を適用してください。</p>}
        <p className="text-sm text-muted">
          勝率集計: {winRateMode === "combined" ? "対戦相手反転込み" : "使用者側のみ"} / 対象登録戦績: {registeredMatches}件。
          {winRateMode === "combined" ? "デッキ・先後・勝敗の条件は集計する側の視点に適用します。各デッキの対象件数は視点数で、同デッキ対戦は両側を含みます。" : ""}
        </p>
        <ExportableAnalysisBlock title={winRateMode === "combined" ? "デッキ別サマリー（反転込み）" : "使用デッキ別サマリー"} filename="usage-summary">
          <div className="p-4">
            <DeckAnalysisCards summaries={summaries} combined={winRateMode === "combined"} showTitle={false} />
          </div>
        </ExportableAnalysisBlock>

        <ExportableAnalysisBlock title={winRateMode === "combined" ? "デッキ別の環境勝率" : "使用デッキ別の勝率"} filename="deck-winrate">
          <SummaryTable countLabel={winRateMode === "combined" ? "対象件数" : "試合数"} rows={byMyDeck} />
        </ExportableAnalysisBlock>

        <ExportableAnalysisBlock title="相手デッキ別の勝率" filename="opponent-winrate">
          <SummaryTable countLabel={winRateMode === "combined" ? "対象件数" : "試合数"} rows={byOpponentDeck} />
        </ExportableAnalysisBlock>

        <ExportableAnalysisBlock title="先攻/後攻別の勝率" filename="turn-order-winrate">
          <SummaryTable countLabel={winRateMode === "combined" ? "対象件数" : "試合数"} rows={byTurn} />
        </ExportableAnalysisBlock>

        <ExportableAnalysisBlock title="対面別勝率" filename="matchup-winrate">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-left text-sm">
              <thead className="bg-slate-50 text-muted">
                <tr>
                  <th className="px-4 py-3">使用デッキ</th>
                  <th className="px-4 py-3">相手デッキ</th>
                  <th className="px-4 py-3">{winRateMode === "combined" ? "対象件数" : "試合数"}</th>
                  <th className="px-4 py-3">勝率</th>
                </tr>
              </thead>
              <tbody>
                {matrix.flatMap((row) =>
                  row.cells
                    .filter((cell) => cell.total > 0)
                    .map((cell) => {
                      const opponent = matrixDecks.find((deck) => deck.id === cell.opponentDeckId);
                      return (
                        <tr className="border-t border-slate-100" key={`${row.myDeck.id}-${cell.opponentDeckId}`}>
                          <td className="px-4 py-3 font-semibold">
                            <DeckWithClassIcon className={row.myDeck.class_name} name={row.myDeck.name} />
                          </td>
                          <td className="px-4 py-3">
                            {opponent ? <DeckWithClassIcon className={opponent.class_name} name={opponent.name} /> : "-"}
                          </td>
                          <td className="px-4 py-3">{cell.total}</td>
                          <td className="px-4 py-3">{formatPercent(cell.winRate)}</td>
                        </tr>
                      );
                    })
                )}
              </tbody>
            </table>
          </div>
        </ExportableAnalysisBlock>
      </div>
  );
}
