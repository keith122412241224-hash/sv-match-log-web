import { DeckAnalysisCards } from "@/components/analysis/DeckAnalysisCards";
import { ExportableAnalysisBlock } from "@/components/analysis/ExportableAnalysisBlock";
import { AnalysisFilters, isMatchResult, isTurnOrder } from "@/components/analysis/AnalysisFilters";
import { AppShell } from "@/components/AppShell";
import { DeckWithClassIcon } from "@/components/ClassIcon";
import { SummaryTable } from "@/components/SummaryTable";
import { buildDeckAnalysisSummaries, buildWinRateMatrix, groupWinRates, turnOrderWinRates } from "@/lib/analytics";
import { getActiveArchetypes, getDecks, getEnvironments, getIsAdmin, getMatches } from "@/lib/data";
import { formatPercent, getMostRecentlyCreatedId } from "@/lib/utils";
import { analysisPerspectives, filterAnalysisPerspectives, resolveWinRateMode } from "@/lib/match-perspectives";

type AnalysisSearchParams = {
  environment?: string;
  myDeck?: string;
  opponentDeck?: string;
  turnOrder?: string;
  result?: string;
  playedFrom?: string;
  playedTo?: string;
  scope?: string;
  winRateMode?: string;
};

function normalizeDatetimeLocal(value?: string) {
  return value && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value) ? value : "";
}

function toJstIso(value: string, endOfMinute = false) {
  return new Date(`${value}:${endOfMinute ? "59.999" : "00"}+09:00`).toISOString();
}

export default async function AnalysisPage({
  searchParams
}: {
  searchParams: Promise<AnalysisSearchParams>;
}) {
  const [params, environments, isAdmin] = await Promise.all([searchParams, getEnvironments(), getIsAdmin()]);
  const selectedScope = isAdmin && params.scope === "all" ? "all" : "mine";
  const winRateMode = resolveWinRateMode(params.winRateMode, selectedScope);
  const selectedEnvironmentId = environments.some((environment) => environment.id === params.environment)
    ? params.environment ?? ""
    : getMostRecentlyCreatedId(environments);
  const [decks, archetypes] = await Promise.all([getDecks(), getActiveArchetypes()]);
  const selectedEnvironmentName = environments.find((environment) => environment.id === selectedEnvironmentId)?.name;
  const matrixDecks = archetypes.length > 0 ? archetypes : decks;
  const deckName = new Map([...decks, ...archetypes].map((deck) => [deck.id, deck.name]));
  const filterDeckIds = new Set(matrixDecks.map((deck) => deck.id));
  const selectedMyDeckId = params.myDeck && filterDeckIds.has(params.myDeck) ? params.myDeck : "";
  const selectedOpponentDeckId = params.opponentDeck && filterDeckIds.has(params.opponentDeck) ? params.opponentDeck : "";
  const selectedTurnOrder = params.turnOrder && isTurnOrder(params.turnOrder) ? params.turnOrder : "";
  const selectedResult = params.result && isMatchResult(params.result) ? params.result : "";
  const selectedPlayedFrom = normalizeDatetimeLocal(params.playedFrom);
  const selectedPlayedTo = normalizeDatetimeLocal(params.playedTo);
  const deckIdField = archetypes.length > 0 ? "archetype" : "deck";
  const directionalFilters = {
    myDeckId: selectedMyDeckId,
    opponentDeckId: selectedOpponentDeckId,
    turnOrder: selectedTurnOrder || undefined,
    result: selectedResult || undefined,
    deckIdField
  } as const;
  const sourceMatches = await getMatches(selectedEnvironmentId, {
    ...(winRateMode === "direct" ? directionalFilters : {}),
    playedAtFrom: selectedPlayedFrom ? toJstIso(selectedPlayedFrom) : undefined,
    playedAtTo: selectedPlayedTo ? toJstIso(selectedPlayedTo, true) : undefined,
    deckIdField,
    includeAllUsers: selectedScope === "all"
  });
  const filteredMatches = filterAnalysisPerspectives(analysisPerspectives(sourceMatches, winRateMode), directionalFilters);
  const registeredMatches = new Set(filteredMatches.map((match) => match.id)).size;

  const byMyDeck = groupWinRates(filteredMatches, (match) => match.my_archetype_id ?? match.my_deck_id, (id) => deckName.get(id) ?? "不明");
  const byOpponentDeck = groupWinRates(filteredMatches, (match) => match.opponent_archetype_id ?? match.opponent_deck_id, (id) => deckName.get(id) ?? "不明");
  const byTurn = turnOrderWinRates(filteredMatches);
  const matrix = buildWinRateMatrix(filteredMatches, matrixDecks, matrixDecks);
  const summaries = buildDeckAnalysisSummaries(filteredMatches, matrixDecks, deckIdField);

  return (
    <AppShell>
      <div className="grid gap-6">
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
          values={{
            environmentId: selectedEnvironmentId,
            myDeckId: selectedMyDeckId,
            opponentDeckId: selectedOpponentDeckId,
            turnOrder: selectedTurnOrder,
            result: selectedResult,
            playedFrom: selectedPlayedFrom,
            playedTo: selectedPlayedTo,
            scope: selectedScope,
            winRateMode
          }}
        />

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
                  <th className="px-4 py-3">環境指数</th>
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
                          <td className="px-4 py-3">{cell.environmentIndex ?? "-"}</td>
                        </tr>
                      );
                    })
                )}
              </tbody>
            </table>
          </div>
        </ExportableAnalysisBlock>
      </div>
    </AppShell>
  );
}
