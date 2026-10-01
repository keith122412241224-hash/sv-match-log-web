import { AppShell } from "@/components/AppShell";
import { EmptyState } from "@/components/EmptyState";
import { ScheduledMatchForm } from "@/components/matches/ScheduledMatchForm";
import { getActiveArchetypes, getCurrentUser, getDecks, getEnvironments } from "@/lib/data";


export default async function MatchesPage({
  searchParams
}: {
  searchParams: Promise<{ saved?: string; error?: string }>;
}) {
  const [decks, archetypes, allEnvironments, params, user] = await Promise.all([
    getDecks(),
    getActiveArchetypes(),
    getEnvironments(),
    searchParams,
    getCurrentUser()
  ]);
  const serverNow = Date.now();
  const hasDecks = decks.length > 0 || archetypes.length > 0;
  const hasEnvironments = allEnvironments.length > 0;

  return (
    <AppShell>
      <div className="grid gap-6">
        <section>
          <h1 className="text-2xl font-bold text-ink">戦績入力</h1>
          <p className="mt-1 text-sm text-muted">管理者が作成した環境を選んで戦績を保存します。</p>
        </section>

        {!hasDecks ? (
          <EmptyState
            title="標準デッキがまだありません"
            description="管理者が標準デッキを登録すると、戦績入力を始められます。一覧にないデッキはデッキ管理から候補申請してください。"
            href="/decks"
            action="デッキ管理へ"
          />
        ) : !hasEnvironments ? (
          <EmptyState
            title="環境がまだありません"
            description="戦績を正しく集計するため、環境なしでは入力できません。管理者が管理画面から環境を作成してください。"
            href="/admin"
            action="管理画面へ"
          />
        ) : (
          <ScheduledMatchForm
            key={user?.id}
            userId={user?.id}
            archetypes={archetypes}
            decks={decks}
            environments={allEnvironments}
            serverNow={serverNow}
            error={params.error}
            saved={params.saved === "1"}
          />
        )}
      </div>
    </AppShell>
  );
}
