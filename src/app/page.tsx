import Link from "next/link";
import { AppShell } from "@/components/AppShell";
import { DeckWithClassIcon } from "@/components/ClassIcon";
import { EnvironmentFilter } from "@/components/EnvironmentFilter";
import { OnboardingPanel } from "@/components/onboarding/OnboardingPanel";
import { StatCard } from "@/components/StatCard";
import { RESULT_LABELS, TURN_ORDER_LABELS } from "@/lib/constants";
import { getEnvironments, getMatches } from "@/lib/data";
import { summarizeMatches } from "@/lib/analytics";
import { formatPercent } from "@/lib/utils";

export default async function HomePage({
  searchParams
}: {
  searchParams: Promise<{ environment?: string }>;
}) {
  const params = await searchParams;
  const selectedEnvironmentId = params.environment ?? "";
  const [environments, matches] = await Promise.all([getEnvironments(), getMatches(selectedEnvironmentId)]);
  const selectedEnvironmentName = environments.find((environment) => environment.id === selectedEnvironmentId)?.name;
  const summary = summarizeMatches(matches);
  const recent = matches.slice(0, 10);

  return (
    <AppShell>
      <div className="grid gap-6">
        <section>
          <h1 className="text-2xl font-bold text-ink">ホーム</h1>
          <p className="mt-1 text-sm text-muted">
            {selectedEnvironmentName ? `${selectedEnvironmentName} の戦績を表示しています。` : "全環境の戦績を表示しています。"}
          </p>
        </section>

        <EnvironmentFilter basePath="/" environments={environments} selectedEnvironmentId={selectedEnvironmentId} />

        {matches.length === 0 ? <OnboardingPanel /> : null}

        <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <StatCard label="総試合数" value={`${summary.total}`} />
          <StatCard label="勝利数" value={`${summary.wins}`} />
          <StatCard label="勝率" value={formatPercent(summary.winRate)} />
          <StatCard label="先攻勝率" value={formatPercent(summary.firstWinRate)} />
          <StatCard label="後攻勝率" value={formatPercent(summary.secondWinRate)} />
        </section>

        <section className="rounded-md border border-slate-200 bg-white">
          <div className="flex items-center justify-between gap-3 border-b border-slate-200 px-4 py-3">
            <h2 className="font-bold text-ink">最近10戦</h2>
            <Link className="text-sm font-semibold text-muted hover:text-ink" href="/matches">
              入力する
            </Link>
          </div>
          {recent.length === 0 ? (
            <div className="p-4 text-sm text-muted">この環境の戦績はまだありません。</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[820px] text-left text-sm">
                <thead className="bg-slate-50 text-muted">
                  <tr>
                    <th className="px-4 py-3">日時</th>
                    <th className="px-4 py-3">環境</th>
                    <th className="px-4 py-3">使用デッキ</th>
                    <th className="px-4 py-3">相手デッキ</th>
                    <th className="px-4 py-3">先後</th>
                    <th className="px-4 py-3">結果</th>
                    <th className="px-4 py-3">メモ</th>
                  </tr>
                </thead>
                <tbody>
                  {recent.map((match) => (
                    <tr className="border-t border-slate-100" key={match.id}>
                      <td className="px-4 py-3">{new Date(match.played_at).toLocaleString("ja-JP")}</td>
                      <td className="px-4 py-3">{match.environment?.name ?? "環境なし"}</td>
                      <td className="px-4 py-3 font-semibold">
                        {match.my_deck ? <DeckWithClassIcon className={match.my_deck.class_name} name={match.my_deck.name} /> : "-"}
                      </td>
                      <td className="px-4 py-3">
                        {match.opponent_deck ? <DeckWithClassIcon className={match.opponent_deck.class_name} name={match.opponent_deck.name} /> : "-"}
                      </td>
                      <td className="px-4 py-3">{TURN_ORDER_LABELS[match.turn_order]}</td>
                      <td className="px-4 py-3">
                        <span className={match.result === "win" ? "font-bold text-emerald-700" : "font-bold text-red-700"}>
                          {RESULT_LABELS[match.result]}
                        </span>
                      </td>
                      <td className="max-w-[220px] truncate px-4 py-3 text-muted">{match.memo ?? ""}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </AppShell>
  );
}
