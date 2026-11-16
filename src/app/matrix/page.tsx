import { selectInitialEnvironmentId } from "@/lib/environment-selection";
import { AppShell } from "@/components/AppShell";
import { EmptyState } from "@/components/EmptyState";
import { MatrixFilters } from "@/components/matrix/MatrixFilters";
import { parseRankSelection, serializeRankSelection } from "@/lib/rank-selection";
import { MatchupMatrix } from "@/components/MatchupMatrix";
import { buildWinRateMatrixFromAggregates } from "@/lib/matchup-aggregates";
import { buildEnvironmentMatrix } from "@/lib/environment-matrix";
import { getMatchupAggregates, getMemberMatchupAggregates } from "@/lib/matchup-data";
import { getActiveArchetypes, getCurrentUser, getDecks, getEnvironments } from "@/lib/data";

export default async function MatrixPage({
  searchParams
}: {
  searchParams: Promise<{ environment?: string | string[]; scope?: string | string[]; rank?: string | string[]; ranks?: string | string[] }>;
}) {
  const [params, environments, user] = await Promise.all([searchParams, getEnvironments(), getCurrentUser()]);
  const canUseAllUsers = user?.is_anonymous === false;
  let selectedRanks;
  try { selectedRanks = parseRankSelection(params); }
  catch { return <AppShell><p role="alert">ランクの絞り込み条件が不正です。最低1区分を選択してください。</p></AppShell>; }
  if (params.environment !== undefined && (typeof params.environment !== "string" || !environments.some(e => e.id === params.environment))) {
    return <AppShell><p role="alert">環境の指定が不正です。</p></AppShell>;
  }
  const selectedScope = canUseAllUsers && (params.scope === undefined || params.scope === "all") ? "all" : "mine";
  const selectedEnvironmentId = selectInitialEnvironmentId(environments, typeof params.environment === "string" ? params.environment : undefined);
  const [decks, archetypes, aggregates] = await Promise.all([
    getDecks(),
    getActiveArchetypes(),
    selectedEnvironmentId
      ? selectedScope === "all"
        ? getMemberMatchupAggregates(selectedEnvironmentId, selectedRanks)
        : getMatchupAggregates(selectedEnvironmentId, false, selectedRanks)
      : { version: 1 as const, totalMatches: 0, groups: [] }
  ]);
  // Only display metadata crosses the server/client boundary.
  const matrixDecks = (archetypes.length > 0 ? archetypes : decks).map(({ id, name, class_name }) => ({ id, name, class_name }));
  const rows = selectedScope === "all"
    ? buildEnvironmentMatrix(aggregates, matrixDecks)
    : buildWinRateMatrixFromAggregates(aggregates, matrixDecks, matrixDecks);

  return (
    <AppShell>
      <div className="grid gap-6">
        <section>
          <h1 className="text-2xl font-bold text-ink">相性表</h1>
          <p className="mt-1 text-sm text-muted">環境全体のデッキ相性を確認できます。自分の戦績にも切り替えられます。</p>
        </section>

        <section className="rounded-md border border-slate-200 bg-white p-4">
          <div className="text-xs font-bold text-muted">集計対象</div>
          <div className="mt-1 text-lg font-bold text-ink">
            {selectedScope === "all" ? "環境全体" : "自分の戦績"}
          </div>
          <p className="mt-1 text-sm text-muted">
            {selectedScope === "all"
              ? "SV Match Logに登録された全ユーザーの戦績を集計して表示しています。"
              : "自分が登録した戦績だけを集計しています。"}
          </p>
          {!canUseAllUsers && params.scope === "all" ? <p className="mt-1 text-sm text-muted">全ユーザーの相性表には会員ログインが必要です。</p> : null}
        </section>

        <MatrixFilters
          key={`${selectedEnvironmentId}/${selectedScope}/${serializeRankSelection(selectedRanks)}`}
          ranks={selectedRanks}
          canUseAllUsers={canUseAllUsers}
          environments={environments.map(({ id, name }) => ({ id, name }))}
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
          <MatchupMatrix rows={rows} opponentDecks={matrixDecks} environmentMode={selectedScope === "all"} showSupplementaryInfo={false} />
        )}
      </div>
    </AppShell>
  );
}
