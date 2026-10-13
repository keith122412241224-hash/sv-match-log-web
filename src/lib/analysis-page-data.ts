import { selectInitialEnvironmentId } from '@/lib/environment-selection';
import { parseRankSelection } from '@/lib/rank-selection';
import { isMatchResult, isTurnOrder } from '@/components/analysis/AnalysisFilters';
import { getAnalysisAggregates } from '@/lib/analysis-data';
import { getActiveArchetypes, getDecks, getEnvironments, getIsAdmin } from '@/lib/data';
import { resolveWinRateMode } from '@/lib/match-perspectives';
import { validateAnalysisDates } from '@/lib/analysis-date-query';
export type AnalysisSearchParams = {
  environment?: string;
  myDeck?: string;
  opponentDeck?: string;
  turnOrder?: string;
  result?: string;
  playedFrom?: string | string[];
  playedTo?: string | string[];
  scope?: string;
  winRateMode?: string;
  rank?: string;
  ranks?: string;
};

export async function getAnalysisPageData(params: AnalysisSearchParams) {
  const selectedRanks = parseRankSelection(params);
  const dates = validateAnalysisDates(params);
  if (!dates.ok) throw new Error(dates.error.message);
  const [environments, isAdmin] = await Promise.all([getEnvironments(), getIsAdmin()]);
  const selectedScope = isAdmin && params.scope === "all" ? "all" : "mine";
  const winRateMode = resolveWinRateMode(params.winRateMode, selectedScope);
  const selectedEnvironmentId = selectInitialEnvironmentId(environments, params.environment);
  const [decks, archetypes] = await Promise.all([getDecks(), getActiveArchetypes()]);
  const selectedEnvironmentName = environments.find((environment) => environment.id === selectedEnvironmentId)?.name;
  const matrixDecks = archetypes.length > 0 ? archetypes : decks;
  const filterDeckIds = new Set(matrixDecks.map((deck) => deck.id));
  const selectedMyDeckId = params.myDeck && filterDeckIds.has(params.myDeck) ? params.myDeck : "";
  const selectedOpponentDeckId = params.opponentDeck && filterDeckIds.has(params.opponentDeck) ? params.opponentDeck : "";
  const selectedTurnOrder = params.turnOrder && isTurnOrder(params.turnOrder) ? params.turnOrder : "";
  const selectedResult = params.result && isMatchResult(params.result) ? params.result : "";
  const { playedFrom: selectedPlayedFrom, playedTo: selectedPlayedTo } = dates.value;
  const deckIdField = archetypes.length > 0 ? "archetype" : "deck";
  const directionalFilters = {
    myDeckId: selectedMyDeckId,
    opponentDeckId: selectedOpponentDeckId,
    turnOrder: selectedTurnOrder || undefined,
    result: selectedResult || undefined,
    deckIdField
  } as const;
  const aggregates = await getAnalysisAggregates(selectedEnvironmentId, winRateMode, {
    ...directionalFilters,
    playedAtFrom: dates.value.playedAtFrom,
    playedAtTo: dates.value.playedAtTo,
    deckIdField,
    includeAllUsers: selectedScope === "all"
  }, matrixDecks.map(deck => deck.id), selectedRanks);

  const deckLabels = (items: typeof matrixDecks) => items.map(({ id, name, class_name }) => ({ id, name, class_name }));
  return { environments: environments.map(({ id, name }) => ({ id, name })), isAdmin, selectedRanks, selectedScope, winRateMode, selectedEnvironmentId,
    decks: deckLabels(decks), archetypes: deckLabels(archetypes), selectedEnvironmentName, matrixDecks: deckLabels(matrixDecks),
    selectedMyDeckId, selectedOpponentDeckId, selectedTurnOrder, selectedResult, selectedPlayedFrom, selectedPlayedTo, aggregates };
}
export type AnalysisPageData = Awaited<ReturnType<typeof getAnalysisPageData>>;
