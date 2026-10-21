import { selectInitialEnvironmentId } from "@/lib/environment-selection";
import { AppShell } from "@/components/AppShell";
import { EmptyState } from "@/components/EmptyState";
import { MatrixFilters } from "@/components/matrix/MatrixFilters";
import { getRankSelectionLabel, parseRankSelection, serializeRankSelection } from "@/lib/rank-selection";
import { MatchupMatrix } from "@/components/MatchupMatrix";
import { buildWinRateMatrixFromAggregates } from "@/lib/matchup-aggregates";
import { getMatchupAggregates } from "@/lib/matchup-data";
import { getActiveArchetypes, getDecks, getEnvironments, getIsAdmin } from "@/lib/data";

export default async function MatrixPage({
  searchParams
}: {
  searchParams: Promise<{ environment?: string | string[]; scope?: string | string[]; rank?: string | string[]; ranks?: string | string[] }>;
}) {
  const [params, environments, isAdmin] = await Promise.all([searchParams, getEnvironments(), getIsAdmin()]);
  let selectedRanks;
  try { selectedRanks = parseRankSelection(params); }
  catch { return <AppShell><p role="alert">ランクの絞り込み条件が不正です。最低1区分を選択してください。</p></AppShell>; }
  if (params.environment !== undefined && (typeof params.environment !== "string" || !environments.some(e => e.id === params.environment))) {
    return <AppShell><p role="alert">環境の指定が不正です。</p></AppShell>;
  }
  const selectedScope = isAdmin && params.scope === "all" ? "all" : "mine";
  const selectedEnvironmentId = selectInitialEnvironmentId(environments, typeof params.environment === "string" ? params.environment : undefined);
  const [decks, archetypes, aggregates] = await Promise.all([
    getDecks(),
    getActiveArchetypes(),
    selectedEnvironmentId ? getMatchupAggregates(selectedEnvironmentId, selectedScope === "all", selectedRanks) : { version: 1 as const, totalMatches: 0, groups: [] }
  ]);
  const selectedEnvironmentName = environments.find((environment) => environment.id === selectedEnvironmentId)?.name ?? "環境なし";
  const matrixDecks = archetypes.length > 0 ? archetypes : decks;
  const rows = buildWinRateMatrixFromAggregates(aggregates, matrixDecks, matrixDecks);

  const rankLabel = getRankSelectionLabel(selectedRanks);
  const populationLabel = `${selectedScope === "all" ? "全ユーザー" : "自分のみ"} / ランク: ${rankLabel} / 対象登録戦績: ${aggregates.totalMatches}件（表示デッキの選択前）。ランクは登録者本人の対戦時点の値です。`;
  const createdAtLabel = new Date().toLocaleDateString("ja-JP", { timeZone: "Asia/Tokyo" });

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

        <MatrixFilters
          key={`${selectedEnvironmentId}/${selectedScope}/${serializeRankSelection(selectedRanks)}`}
          ranks={selectedRanks}
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
          <MatchupMatrix rows={rows} opponentDecks={matrixDecks} environmentName={selectedEnvironmentName} createdAtLabel={createdAtLabel} populationLabel={populationLabel} />
        )}
      </div>
    </AppShell>
  );
}
