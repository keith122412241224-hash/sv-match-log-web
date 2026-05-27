import { AppShell } from "@/components/AppShell";
import { EmptyState } from "@/components/EmptyState";
import { EnvironmentFilter } from "@/components/EnvironmentFilter";
import { MatchupMatrix } from "@/components/MatchupMatrix";
import { buildWinRateMatrix } from "@/lib/analytics";
import { getActiveArchetypes, getDecks, getEnvironments, getMatches } from "@/lib/data";

export default async function MatrixPage({
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
  const selectedEnvironmentName = environments.find((environment) => environment.id === selectedEnvironmentId)?.name ?? "全環境";
  const matrixDecks = archetypes.length > 0 ? archetypes : decks;
  const rows = buildWinRateMatrix(matches, matrixDecks, matrixDecks);

  return (
    <AppShell>
      <div className="grid gap-6">
        <section>
          <h1 className="text-2xl font-bold text-ink">相性表</h1>
          <p className="mt-1 text-sm text-muted">環境ごとに、使用デッキ × 相手デッキの勝率表を生成します。</p>
        </section>

        <EnvironmentFilter basePath="/matrix" environments={environments} selectedEnvironmentId={selectedEnvironmentId} />

        {matrixDecks.length === 0 ? (
          <EmptyState
            title="相性表を作るデッキがありません"
            description="標準デッキが登録されると、自動で対面勝率表を表示できます。"
            href="/decks"
            action="デッキ管理へ"
          />
        ) : (
          <MatchupMatrix rows={rows} opponentDecks={matrixDecks} environmentName={selectedEnvironmentName} />
        )}
      </div>
    </AppShell>
  );
}
