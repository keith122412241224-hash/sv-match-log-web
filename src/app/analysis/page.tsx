import { DeckAnalysisCards } from "@/components/analysis/DeckAnalysisCards";
import { AppShell } from "@/components/AppShell";
import { DeckWithClassIcon } from "@/components/ClassIcon";
import { EnvironmentFilter } from "@/components/EnvironmentFilter";
import { SummaryTable } from "@/components/SummaryTable";
import { buildDeckAnalysisSummaries, buildWinRateMatrix, groupWinRates, turnOrderWinRates } from "@/lib/analytics";
import { getActiveArchetypes, getDecks, getEnvironments, getMatches } from "@/lib/data";
import { formatPercent } from "@/lib/utils";

export default async function AnalysisPage({
  searchParams
}: {
  searchParams: Promise<{ environment?: string }>;
}) {
  const params = await searchParams;
  const selectedEnvironmentId = params.environment ?? "";
  const [decks, archetypes, environments, matches] = await Promise.all([
    getDecks(),
    getActiveArchetypes(),
    getEnvironments(),
    getMatches(selectedEnvironmentId)
  ]);
  const selectedEnvironmentName = environments.find((environment) => environment.id === selectedEnvironmentId)?.name;
  const matrixDecks = archetypes.length > 0 ? archetypes : decks;
  const deckName = new Map([...decks, ...archetypes].map((deck) => [deck.id, deck.name]));

  const byMyDeck = groupWinRates(matches, (match) => match.my_archetype_id ?? match.my_deck_id, (id) => deckName.get(id) ?? "不明");
  const byOpponentDeck = groupWinRates(matches, (match) => match.opponent_archetype_id ?? match.opponent_deck_id, (id) => deckName.get(id) ?? "不明");
  const byTurn = turnOrderWinRates(matches);
  const matrix = buildWinRateMatrix(matches, matrixDecks, matrixDecks);
  const summaries = buildDeckAnalysisSummaries(matches, decks);

  return (
    <AppShell>
      <div className="grid gap-6">
        <section>
          <h1 className="text-2xl font-bold text-ink">分析</h1>
          <p className="mt-1 text-sm text-muted">
            {selectedEnvironmentName ? `${selectedEnvironmentName} の戦績を分析しています。` : "全環境の戦績を分析しています。"}
          </p>
        </section>

        <EnvironmentFilter basePath="/analysis" environments={environments} selectedEnvironmentId={selectedEnvironmentId} />

        <DeckAnalysisCards summaries={summaries} />

        <section className="rounded-md border border-slate-200 bg-white">
          <h2 className="border-b border-slate-200 px-4 py-3 font-bold text-ink">使用デッキ別の勝率</h2>
          <SummaryTable rows={byMyDeck} />
        </section>

        <section className="rounded-md border border-slate-200 bg-white">
          <h2 className="border-b border-slate-200 px-4 py-3 font-bold text-ink">相手デッキ別の勝率</h2>
          <SummaryTable rows={byOpponentDeck} />
        </section>

        <section className="rounded-md border border-slate-200 bg-white">
          <h2 className="border-b border-slate-200 px-4 py-3 font-bold text-ink">先攻/後攻別の勝率</h2>
          <SummaryTable rows={byTurn} />
        </section>

        <section className="rounded-md border border-slate-200 bg-white">
          <h2 className="border-b border-slate-200 px-4 py-3 font-bold text-ink">対面別勝率</h2>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-left text-sm">
              <thead className="bg-slate-50 text-muted">
                <tr>
                  <th className="px-4 py-3">使用デッキ</th>
                  <th className="px-4 py-3">相手デッキ</th>
                  <th className="px-4 py-3">試合数</th>
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
        </section>
      </div>
    </AppShell>
  );
}
