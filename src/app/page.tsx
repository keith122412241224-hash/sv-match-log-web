import { ThemeSelect } from "@/components/ThemeProvider";
import { RankBadge } from "@/components/RankBadge";
import { MatchActions, MatchActionsProvider } from "@/components/matches/MatchActions";
import { selectInitialEnvironmentId } from "@/lib/environment-selection";
import Link from "next/link";
import { BarChart3, BookOpen, Grid3X3, ListPlus, LogIn, Swords, TrendingUp } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { BrandMark } from "@/components/BrandMark";
import { DeckWithClassIcon } from "@/components/ClassIcon";
import { EnvironmentFilter } from "@/components/EnvironmentFilter";
import { GuestImportPrompt } from "@/components/guest/GuestImportPrompt";
import { OnboardingPanel } from "@/components/onboarding/OnboardingPanel";
import { StatCard } from "@/components/StatCard";
import { RESULT_LABELS, TURN_ORDER_LABELS } from "@/lib/constants";
import { getCurrentUser, getEnvironments, getHomeDashboard } from "@/lib/data";
import { formatJstDateTime, formatPercent } from "@/lib/utils";

export default async function HomePage({
  searchParams
}: {
  searchParams: Promise<{ environment?: string }>;
}) {
  const user = await getCurrentUser();

  if (!user) {
    return <LandingPage />;
  }

  const [params, environments] = await Promise.all([searchParams, getEnvironments()]);
  const selectedEnvironmentId = selectInitialEnvironmentId(environments, params.environment);
  let dashboard;
  try {
    dashboard = await getHomeDashboard(selectedEnvironmentId);
  } catch {
    return (
      <AppShell>
        <div className="grid gap-4">
          <h1 className="text-2xl font-bold text-ink">ホーム</h1>
          <p role="alert" className="rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-800">戦績データを取得できませんでした。再度お試しください。</p>
          <a className="font-semibold text-ink underline" href={selectedEnvironmentId ? `/?environment=${encodeURIComponent(selectedEnvironmentId)}` : "/"}>再読み込み</a>
        </div>
      </AppShell>
    );
  }
  const { summary, recent } = dashboard;
  const selectedEnvironmentName = environments.find((environment) => environment.id === selectedEnvironmentId)?.name;

  return (
    <AppShell>
      <div className="grid gap-6">
        <section>
          <h1 className="text-2xl font-bold text-ink">ホーム</h1>
          <p className="mt-1 text-sm text-muted">
            {selectedEnvironmentName ? `${selectedEnvironmentName} の戦績を表示しています。` : "環境を作成すると戦績を表示できます。"}
          </p>
        </section>

        <EnvironmentFilter basePath="/" environments={environments} selectedEnvironmentId={selectedEnvironmentId} />

        <GuestImportPrompt />

        {summary.total === 0 ? <OnboardingPanel /> : null}

        <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <StatCard label="総試合数" value={`${summary.total}`} />
          <StatCard label="勝利数" value={`${summary.wins}`} />
          <StatCard label="勝率" value={formatPercent(summary.winRate)} />
          <StatCard label="先攻勝率" value={formatPercent(summary.firstWinRate)} />
          <StatCard label="後攻勝率" value={formatPercent(summary.secondWinRate)} />
        </section>

        <MatchActionsProvider><section className="rounded-md border border-slate-200 bg-white">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-4 py-3">
            <h2 className="font-bold text-ink">最近10戦</h2>
            <Link className="text-sm font-semibold text-muted hover:text-ink" href="/matches">
              入力する
            </Link>
          </div>
          {recent.length === 0 ? (
            <div className="p-4 text-sm text-muted">この環境の戦績はまだありません。</div>
          ) : (
            <>
              <div className="grid gap-2 p-3 md:hidden">
                {recent.map((match) => (
                  <article className="rounded-md border border-slate-200 bg-slate-50 p-3" key={match.id}>
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="text-xs font-semibold text-muted">{formatJstDateTime(match.played_at)}</div>
                        <div className="mt-1 truncate text-xs text-muted">{match.environment?.name ?? "環境なし"}</div>
                      </div>
                      <span className={match.result === "win" ? "shrink-0 font-bold text-emerald-700" : "shrink-0 font-bold text-red-700"}>
                        {RESULT_LABELS[match.result]}
                      </span>
                    </div>
                    <div className="mt-3 grid gap-2 text-sm">
                      <div className="min-w-0 [&>span]:max-w-full [&>span>span:last-child]:break-words [&>span>span:last-child]:whitespace-normal">
                        <div className="mb-1 text-xs font-semibold text-muted">使用デッキ</div>
                        {match.my_deck ? <DeckWithClassIcon className={match.my_deck.class_name} name={match.my_deck.name} /> : "-"}
                      </div>
                      <div className="min-w-0 [&>span]:max-w-full [&>span>span:last-child]:break-words [&>span>span:last-child]:whitespace-normal">
                        <div className="mb-1 text-xs font-semibold text-muted">相手デッキ</div>
                        {match.opponent_deck ? <DeckWithClassIcon className={match.opponent_deck.class_name} name={match.opponent_deck.name} /> : "-"}
                      </div>
                    </div>
                    <div className="mt-2"><RankBadge rank={match} /></div>
                    <div className="mt-2 flex items-center justify-between text-xs font-semibold text-muted">{TURN_ORDER_LABELS[match.turn_order]}<MatchActions matchId={match.id} /></div>
                  </article>
                ))}
              </div>
              <div className="hidden overflow-x-auto md:block">
                <table className="w-full min-w-[820px] text-left text-sm">
                  <thead className="bg-slate-50 text-muted">
                    <tr>
                      <th className="px-4 py-3">日時</th>
                      <th className="px-4 py-3">環境</th>
                      <th className="px-4 py-3">使用デッキ</th>
                      <th className="px-4 py-3">相手デッキ</th>
                      <th className="px-4 py-3">自分のランク</th>
                      <th className="px-4 py-3">先後</th>
                      <th className="px-4 py-3">結果</th>
                      <th className="relative px-2 py-3"><span className="sr-only">操作</span></th>
                    </tr>
                  </thead>
                  <tbody>
                    {recent.map((match) => (
                      <tr className="border-t border-slate-100" key={match.id}>
                        <td className="px-4 py-3">{formatJstDateTime(match.played_at)}</td>
                        <td className="px-4 py-3">{match.environment?.name ?? "環境なし"}</td>
                        <td className="px-4 py-3 font-semibold">
                          {match.my_deck ? <DeckWithClassIcon className={match.my_deck.class_name} name={match.my_deck.name} /> : "-"}
                        </td>
                        <td className="px-4 py-3">
                          {match.opponent_deck ? <DeckWithClassIcon className={match.opponent_deck.class_name} name={match.opponent_deck.name} /> : "-"}
                        </td>
                        <td className="px-4 py-3"><RankBadge rank={match} /></td>
                        <td className="px-4 py-3">{TURN_ORDER_LABELS[match.turn_order]}</td>
                        <td className="px-4 py-3">
                          <span className={match.result === "win" ? "font-bold text-emerald-700" : "font-bold text-red-700"}>
                            {RESULT_LABELS[match.result]}
                          </span>
                        </td>
                        <td className="px-2 py-3"><MatchActions matchId={match.id} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </section></MatchActionsProvider>

        <GuideLinkCard />
      </div>
    </AppShell>
  );
}

async function LandingPage() {
  const { PublicEncounterCard } = await import("@/components/environment/PublicEncounterCard");
  const features = [
    {
      icon: ListPlus,
      title: "戦績入力",
      description: "使用デッキや対戦結果を簡単に記録できます。"
    },
    {
      icon: BarChart3,
      title: "勝率分析",
      description: "自分の勝率や先攻・後攻別の成績を自動集計できます。"
    },
    {
      icon: Grid3X3,
      title: "相性表",
      description: "デッキ別の対面勝率を集計し、得意・苦手な相手を可視化できます。"
    },
    {
      icon: TrendingUp,
      title: "環境分析",
      description: "利用者全体の対戦データから、デッキの遭遇率・勝率・環境の変化を把握できます。"
    }
  ];

  return (
    <main className="min-h-screen bg-surface text-ink">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-3">
          <Link className="flex items-center gap-2 font-bold" href="/">
            <BrandMark className="size-10" />
            <span className="hidden sm:inline">SV Match Log Web</span>
          </Link>
          <div className="flex flex-wrap items-center gap-1 sm:gap-2">
            <ThemeSelect />
            <Link className="rounded-md px-2 py-2 text-sm font-semibold text-muted hover:bg-slate-100 hover:text-ink sm:px-3" href="/guest">
              ゲストで試す
            </Link>
            <Link className="rounded-md px-2 py-2 text-sm font-semibold text-muted hover:bg-slate-100 hover:text-ink sm:px-3" href="/guide">
              使い方
            </Link>
            <Link className="inline-flex items-center gap-2 rounded-md bg-ink px-3 py-2 text-sm font-bold text-white sm:px-4" href="/login">
              <LogIn size={16} aria-hidden="true" />
              ログイン
            </Link>
          </div>
        </div>
      </header>

      <section className="mx-auto grid max-w-6xl gap-8 px-4 py-10 lg:grid-cols-[1.1fr_0.9fr] lg:items-center lg:py-16">
        <div>
          <p className="text-sm font-bold text-emerald-700">Shadowverse: Worlds Beyond 向け</p>
          <h1 className="mt-3 max-w-3xl text-4xl font-black leading-tight sm:text-5xl">
            戦績を記録するだけで、自分の勝率も、環境の動きも見える。
          </h1>
          <p className="mt-5 max-w-2xl text-base leading-8 text-muted">
            SV Match Log Webは、シャドバWBの対戦結果を記録・分析できる無料の戦績管理ツールです。自分の勝率やデッキ相性だけでなく、利用者全体の対戦データから、デッキの遭遇率・勝率・環境の変化を確認できます。
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <Link className="inline-flex min-h-11 items-center gap-2 rounded-md bg-ink px-5 text-sm font-bold text-white" href="/login">
              無料で始める
            </Link>
            <Link className="inline-flex min-h-11 items-center rounded-md border border-slate-300 bg-white px-5 text-sm font-bold text-ink" href="/guest">
              ログインせず試す
            </Link>
          </div>
        </div>

        <PublicEncounterCard />
      </section>

      <section className="border-y border-slate-200 bg-white">
        <div className="mx-auto grid max-w-6xl gap-3 px-4 py-8 sm:grid-cols-2 lg:grid-cols-4">
          {features.map((feature) => {
            const Icon = feature.icon;
            return (
              <article className="rounded-md border border-slate-200 p-4" key={feature.title}>
                <Icon className="text-emerald-700" size={24} aria-hidden="true" />
                <h2 className="mt-3 font-bold">{feature.title}</h2>
                <p className="mt-2 text-sm leading-6 text-muted">{feature.description}</p>
              </article>
            );
          })}
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 pt-10">
        <GuideLinkCard />
      </section>

      <section className="mx-auto max-w-6xl px-4 py-10">
        <div className="rounded-md border border-slate-200 bg-white p-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <div className="flex items-center gap-2 text-sm font-bold text-muted">
                <Swords size={16} aria-hidden="true" />
                SV Match Log Web
              </div>
              <h2 className="mt-2 text-2xl font-black">自分の戦績と環境の動きを確認しよう</h2>
              <p className="mt-2 text-sm leading-6 text-muted">
                無料のアカウント登録で、戦績の記録・分析と環境分析を利用できます。ゲストモードでは、戦績入力や自分の戦績分析を試せます。
              </p>
            </div>
            <Link className="inline-flex min-h-11 shrink-0 items-center justify-center rounded-md bg-ink px-5 text-sm font-bold text-white" href="/login">
              ログイン / 新規登録
            </Link>
          </div>
        </div>
      </section>
      <footer className="border-t border-slate-200 bg-white">
        <div className="mx-auto flex max-w-6xl justify-end px-4 py-4">
          <Link className="text-xs font-semibold text-muted hover:text-ink" href="/privacy">
            プライバシーポリシー
          </Link>
        </div>
      </footer>
    </main>
  );
}

function GuideLinkCard() {
  return (
    <section className="rounded-md border border-slate-200 bg-white p-5">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2 text-sm font-bold text-muted">
            <BookOpen size={16} aria-hidden="true" />
            初めての方へ
          </div>
          <h2 className="mt-2 text-xl font-bold text-ink">使い方を画像付きで確認できます</h2>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-muted">
            戦績入力から勝率分析、相性表の保存まで、画像付きで基本的な使い方を紹介しています。
          </p>
        </div>
        <Link className="inline-flex min-h-11 shrink-0 items-center justify-center rounded-md border border-slate-300 bg-white px-5 text-sm font-bold text-ink hover:bg-slate-50" href="/guide">
          使い方を見る
        </Link>
      </div>
    </section>
  );
}
