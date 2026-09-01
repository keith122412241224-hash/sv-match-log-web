import { AppShell } from "@/components/AppShell";
import { EmptyState } from "@/components/EmptyState";
import { EnvironmentFilter } from "@/components/EnvironmentFilter";
import { MatchupMatrix } from "@/components/MatchupMatrix";
import { buildWinRateMatrix } from "@/lib/analytics";
import { getActiveArchetypes, getDecks, getEnvironments, getIsAdmin, getMatches } from "@/lib/data";
import { getMostRecentlyCreatedId } from "@/lib/utils";

export default async function MatrixPage({
  searchParams
}: {
  searchParams: Promise<{ environment?: string; scope?: string }>;
}) {
  const [params, environments, isAdmin] = await Promise.all([searchParams, getEnvironments(), getIsAdmin()]);
  const selectedScope = isAdmin && params.scope === "all" ? "all" : "mine";
  const selectedEnvironmentId = environments.some((environment) => environment.id === params.environment)
    ? params.environment ?? ""
    : getMostRecentlyCreatedId(environments);
  const [decks, archetypes, matches] = await Promise.all([
    getDecks(),
    getActiveArchetypes(),
    getMatches(selectedEnvironmentId, { includeAllUsers: selectedScope === "all" })
  ]);
  const selectedEnvironmentName = environments.find((environment) => environment.id === selectedEnvironmentId)?.name ?? "環境なし";
  const matrixDecks = archetypes.length > 0 ? archetypes : decks;
  const rows = buildWinRateMatrix(matches, matrixDecks, matrixDecks);

  return (
    <AppShell>
      <div className="grid gap-6">
        <section>
          <h1 className="text-2xl font-bold text-ink">相性表</h1>
          <p className="mt-1 text-sm text-muted">環境ごとに、表示したいデッキを選んで対面勝率表を生成します。</p>
        </section>

        {isAdmin ? (
          <section className="rounded-md border border-slate-200 bg-white p-4">
            <div className="text-xs font-bold text-muted">管理者相性表</div>
            <div className="mt-1 text-lg font-bold text-ink">
              {selectedScope === "all" ? "全ユーザー戦績" : "自分の戦績"}
            </div>
            <p className="mt-1 text-sm text-muted">
              全ユーザー戦績は、管理者だけが閲覧できる総合相性表です。通常ユーザーには表示されません。
            </p>
          </section>
        ) : null}

        <EnvironmentFilter
          basePath="/matrix"
          canUseAllUsers={isAdmin}
          environments={environments}
          scope={selectedScope}
          selectedEnvironmentId={selectedEnvironmentId}
        />

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
