import { AppShell } from "@/components/AppShell";
import { EmptyState } from "@/components/EmptyState";
import { MatchupMatrix } from "@/components/MatchupMatrix";
import { buildWinRateMatrix } from "@/lib/analytics";
import { getActiveArchetypes, getDecks, getEnvironments, getMatches } from "@/lib/data";
import { getMostRecentlyCreatedId } from "@/lib/utils";

export default async function MatrixPage({
  searchParams
}: {
  searchParams: Promise<{ environment?: string; deck?: string }>;
}) {
  const [params, environments] = await Promise.all([searchParams, getEnvironments()]);
  const selectedEnvironmentId = environments.some((environment) => environment.id === params.environment)
    ? params.environment ?? ""
    : getMostRecentlyCreatedId(environments);
  const [decks, archetypes, matches] = await Promise.all([
    getDecks(),
    getActiveArchetypes(),
    getMatches(selectedEnvironmentId)
  ]);
  const selectedEnvironmentName = environments.find((environment) => environment.id === selectedEnvironmentId)?.name ?? "環境なし";
  const matrixDecks = archetypes.length > 0 ? archetypes : decks;
  const selectedDeckId = matrixDecks.some((deck) => deck.id === params.deck) ? params.deck ?? "" : matrixDecks[0]?.id ?? "";
  const selectedDeck = matrixDecks.find((deck) => deck.id === selectedDeckId);
  const rows = selectedDeck ? buildWinRateMatrix(matches, [selectedDeck], matrixDecks) : [];

  return (
    <AppShell>
      <div className="grid gap-6">
        <section>
          <h1 className="text-2xl font-bold text-ink">相性表</h1>
          <p className="mt-1 text-sm text-muted">環境ごとに、選択した使用デッキの対面勝率表を生成します。</p>
        </section>

        <form action="/matrix" className="grid gap-3 rounded-md border border-slate-200 bg-white p-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
          <label className="grid gap-1.5 text-sm font-semibold text-ink">
            表示する環境
            <select className="min-h-11 rounded-md border border-slate-300 bg-white px-3 py-2 text-base" name="environment" defaultValue={selectedEnvironmentId}>
              {environments.map((environment) => (
                <option key={environment.id} value={environment.id}>
                  {environment.name}
                </option>
              ))}
            </select>
          </label>
          <label className="grid gap-1.5 text-sm font-semibold text-ink">
            表示する使用デッキ
            <select className="min-h-11 rounded-md border border-slate-300 bg-white px-3 py-2 text-base" name="deck" defaultValue={selectedDeckId}>
              {matrixDecks.map((deck) => (
                <option key={deck.id} value={deck.id}>
                  {deck.name}
                </option>
              ))}
            </select>
          </label>
          <button className="min-h-11 rounded-md bg-ink px-4 text-sm font-bold text-white" type="submit">
            表示
          </button>
        </form>

        {matrixDecks.length === 0 ? (
          <EmptyState
            title="相性表を作るデッキがありません"
            description="標準デッキが登録されると、自動で対面勝率表を表示できます。"
            href="/decks"
            action="デッキ管理へ"
          />
        ) : (
          <MatchupMatrix
            rows={rows}
            opponentDecks={matrixDecks}
            title={selectedDeck ? `${selectedDeck.name} 対面勝率表` : "対面勝率表"}
            environmentName={selectedEnvironmentName}
          />
        )}
      </div>
    </AppShell>
  );
}
