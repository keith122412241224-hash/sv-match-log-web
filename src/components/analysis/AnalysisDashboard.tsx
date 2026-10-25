"use client";
import { canonicalDeckQuery } from "@/lib/analysis-deck-selection";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { DeckAnalysisCards } from "@/components/analysis/DeckAnalysisCards";
import { ExportableAnalysisBlock } from "@/components/analysis/ExportableAnalysisBlock";
import { AnalysisFilters } from "@/components/analysis/AnalysisFilters";
import { AnalysisMatchups } from "@/components/analysis/AnalysisMatchups";
import { AnalysisWinRates } from "@/components/analysis/AnalysisWinRates";
import { buildAnalysisFromAggregates, parseAnalysisAggregates } from "@/lib/analysis-aggregates";
import { parseRankSelection, serializeRankSelection, type RankSelection } from "@/lib/rank-selection";
import type { AnalysisPageData } from "@/lib/analysis-page-data";
import { analysisDatesFromQuery, validateAnalysisDates } from "@/lib/analysis-date-query";
import { AnalysisDateQueryError } from "@/components/analysis/AnalysisDateQueryError";
import { selectAnalysisSummaries, type AnalysisPeriod, type SummarySort } from "@/lib/analysis-presentation";

function queryKey(value: string) {
  const query = new URLSearchParams(value);
  query.sort();
  return query.toString();
}

export function AnalysisDashboard({ initialData, initialQuery }: { initialData: AnalysisPageData; initialQuery: string }) {
  const container = useRef<HTMLDivElement>(null), controller = useRef<AbortController | null>(null);
  const [data, setData] = useState(initialData), [pending, setPending] = useState(false), [failed, setFailed] = useState(false);
  const [invalidDateQuery, setInvalidDateQuery] = useState<string | null>(null);
  const [inputError, setInputError] = useState<string | null>(null);
  const [summarySort, setSummarySort] = useState<SummarySort>("count");
  const [minimumCount, setMinimumCount] = useState(0);
  const [periodPreset, setPeriodPreset] = useState(new URLSearchParams(initialQuery).get('periodPreset') ?? undefined);
  const catalog = useRef(initialData.matrixDecks);
  const currentQuery = useRef(initialQuery), serverData = useRef(initialData);
  const load = useCallback(async (query: URLSearchParams, updateUrl: boolean) => {
    controller.current?.abort();
    const request = new AbortController(); controller.current = request;
    currentQuery.current = query.toString();
    setPending(true); setFailed(false); setInputError(null);
    const dates = validateAnalysisDates(analysisDatesFromQuery(query));
    if (!dates.ok) {
      if (updateUrl) setInputError(dates.error.message);
      else setInvalidDateQuery(query.toString());
      setPending(false); return;
    }
    try {
      query = canonicalDeckQuery(query, catalog.current);
      const ranks = parseRankSelection(Object.fromEntries(query));
      // The preset is presentation metadata in the URL; the existing API accepts dates only.
      const apiQuery = new URLSearchParams(query); apiQuery.delete('periodPreset');
      const response = await fetch('/api/analysis?' + apiQuery, { signal: request.signal, cache: 'no-store' });
      if (!response.ok) throw new Error();
      const next = await response.json() as AnalysisPageData;
      if (serializeRankSelection(next.selectedRanks) !== serializeRankSelection(ranks)) throw new Error();
      const accepted = new URLSearchParams();
      if (next.selectedMyDeckIds) accepted.set('myDeckIds', next.selectedMyDeckIds.join(','));
      if (next.selectedOpponentDeckIds) accepted.set('opponentDeckIds', next.selectedOpponentDeckIds.join(','));
      const expected = canonicalDeckQuery(accepted, next.matrixDecks);
      for (const key of ['myDeck', 'myDeckIds', 'opponentDeck', 'opponentDeckIds']) if (query.get(key) !== expected.get(key)) throw new Error();
      next.aggregates = parseAnalysisAggregates(next.aggregates, next.matrixDecks.map(d => d.id));
      if (!request.signal.aborted) {
        catalog.current = next.matrixDecks;
        setData(next); currentQuery.current = query.toString();
        setPeriodPreset(query.get('periodPreset') ?? undefined);
        setInvalidDateQuery(null);
        if (updateUrl || new URLSearchParams(window.location.search).toString() !== query.toString()) window.history.replaceState(window.history.state, '', '/analysis?' + query);
      }
    } catch { if (!request.signal.aborted) setFailed(true); }
    finally { if (!request.signal.aborted) setPending(false); }
  }, []);
  useLayoutEffect(() => {
    let query = new URLSearchParams(window.location.search);
    let canonicalInitial: string;
    try {
      query = canonicalDeckQuery(query, initialData.matrixDecks);
      canonicalInitial = canonicalDeckQuery(new URLSearchParams(initialQuery), initialData.matrixDecks).toString();
    } catch { void load(query, false); return; }
    if (query.toString() !== new URLSearchParams(window.location.search).toString()) window.history.replaceState(window.history.state, '', '/analysis?' + query);
    // A history entry changed by client Apply can retain an older RSC payload.
    // Never install that payload over the selection named by the restored URL.
    if (queryKey(canonicalInitial) !== queryKey(query.toString())) {
      if (queryKey(currentQuery.current) !== queryKey(query.toString())) void load(query, false);
      return;
    }
    if (serverData.current === initialData) { currentQuery.current = query.toString(); return; }
    serverData.current = initialData; catalog.current = initialData.matrixDecks;
    controller.current?.abort();
    currentQuery.current = query.toString();
    setData(initialData); setPending(false); setFailed(false);
    setPeriodPreset(query.get('periodPreset') ?? undefined);
    setInvalidDateQuery(null);
    setInputError(null);
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
  function applyForm(form: HTMLFormElement) {
    if (pending || !form.reportValidity()) return;
    const query = new URLSearchParams();
    new FormData(form).forEach((value, key) => { if (typeof value === 'string') query.set(key, value); });
    void load(query, true);
  }
  function applyPeriod(period: AnalysisPeriod, dates: { playedFrom: string; playedTo: string }) {
    const form = container.current?.querySelector('form');
    if (pending || !form) return;
    const query = new URLSearchParams();
    new FormData(form).forEach((value, key) => { if (typeof value === 'string') query.set(key, value); });
    query.delete('playedFrom'); query.delete('playedTo'); query.delete('periodPreset');
    if (period !== 'all') {
      query.set('playedFrom', dates.playedFrom); query.set('playedTo', dates.playedTo); query.set('periodPreset', period);
    }
    void load(query, true);
  }
  const { environments, isAdmin, selectedRanks, selectedScope, winRateMode, selectedEnvironmentId, decks, archetypes, selectedEnvironmentName, matrixDecks, selectedMyDeckId, selectedOpponentDeckId, selectedTurnOrder, selectedResult, selectedPlayedFrom, selectedPlayedTo, aggregates } = data;
  const { registeredMatches, byMyDeck, matrix, summaries } = useMemo(() => buildAnalysisFromAggregates(aggregates, decks, archetypes), [aggregates, decks, archetypes]);
  const visibleSummaries = useMemo(() => selectAnalysisSummaries(summaries, summarySort, minimumCount), [summaries, summarySort, minimumCount]);
  if (invalidDateQuery !== null) return <AnalysisDateQueryError key={invalidDateQuery} query={invalidDateQuery} />;
  return (
      <div ref={container} className="grid gap-6">
        <section>
          <h1 className="text-2xl font-bold text-ink">分析</h1>
          <p className="mt-1 break-words text-sm text-muted [overflow-wrap:anywhere]">
            {selectedEnvironmentName ? `${selectedEnvironmentName} の戦績を分析しています。` : "環境を作成すると戦績を分析できます。"}
          </p>
        </section>

        <AnalysisFilters
          decks={matrixDecks}
          environments={environments}
          canUseAllUsers={isAdmin}
          pending={pending}
          selectionRevision={data}
          onRankApply={applyRanks}
          onPeriodApply={applyPeriod}
          onApply={applyForm}
          periodPreset={periodPreset}
          values={{
            environmentId: selectedEnvironmentId,
            myDeckIds: data.selectedMyDeckIds,
            opponentDeckIds: data.selectedOpponentDeckIds,
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

        {pending && <p role="status" className="text-sm text-muted">分析条件を適用中…</p>}
        {inputError && <p role="alert" className="text-sm text-red-700">{inputError} 表示中の集計は前回の条件です。</p>}
        {failed && <p role="alert" className="text-sm text-red-700">分析データを取得できませんでした。表示中の集計は前回の条件です。もう一度条件を適用してください。</p>}
        <p className="text-sm text-muted">
          勝率集計: {winRateMode === "combined" ? "対戦相手反転込み" : "使用者側のみ"} / 対象登録戦績: {registeredMatches}件。
          {winRateMode === "combined" ? "デッキ・先後・勝敗の条件は集計する側の視点に適用します。各デッキの対象件数は視点数で、同デッキ対戦は両側を含みます。" : ""}
        </p>
        <ExportableAnalysisBlock title={winRateMode === "combined" ? "デッキ別サマリー（反転込み）" : "使用デッキ別サマリー"} filename="usage-summary">
          <div data-png-exclude className="flex flex-wrap items-center gap-3 px-4 pt-4 text-sm">
            <label className="grid gap-1 font-semibold">並び順
              <select aria-label="並び順" className="min-h-10 max-w-full rounded border border-slate-300 bg-white px-3" value={summarySort} onChange={e => setSummarySort(e.target.value as SummarySort)}>
                <option value="count">{winRateMode === "combined" ? "対象件数が多い順" : "試合数が多い順"}</option><option value="win-desc">勝率が高い順</option><option value="win-asc">勝率が低い順</option><option value="class">クラス順</option>
              </select>
            </label>
            <fieldset className="min-w-0"><legend className="mb-1 font-semibold">対象</legend><div className="flex flex-wrap gap-2">
              {[0, 10].map(n => <button key={n} type="button" aria-pressed={minimumCount === n} onClick={() => setMinimumCount(n)}
                className={`min-h-10 rounded border px-3 font-semibold ${minimumCount === n ? 'border-ink bg-ink text-white' : 'border-slate-300 bg-white text-ink'}`}>
                {n === 0 ? '全件表示' : winRateMode === 'combined' ? '10件以上のみ' : '10戦以上のみ'}
              </button>)}
            </div></fieldset>
          </div>
          <div className="p-4">
            {minimumCount > 0 && visibleSummaries.length === 0 ? <p className="text-sm text-muted">{winRateMode === "combined" ? "対象件数が10件" : "10戦"}以上のデッキはありません。</p>
              : <DeckAnalysisCards summaries={visibleSummaries} combined={winRateMode === "combined"} showTitle={false} recentDetails showStreak={selectedScope === "mine" && winRateMode === "direct"} />}
          </div>
        </ExportableAnalysisBlock>

        <ExportableAnalysisBlock title={winRateMode === "combined" ? "デッキ別の環境勝率" : "使用デッキ別の勝率"} filename="deck-winrate">
          <AnalysisWinRates combined={winRateMode === "combined"} rows={byMyDeck} />
        </ExportableAnalysisBlock>

        <AnalysisMatchups matrix={matrix} decks={matrixDecks} selectedDeckId={selectedMyDeckId} combined={winRateMode === "combined"} />
      </div>
  );
}
