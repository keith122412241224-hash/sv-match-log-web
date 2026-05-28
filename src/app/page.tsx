import Link from "next/link";
import { BarChart3, Grid3X3, ListPlus, LogIn, Swords, Trophy } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { BrandMark } from "@/components/BrandMark";
import { DeckWithClassIcon } from "@/components/ClassIcon";
import { EnvironmentFilter } from "@/components/EnvironmentFilter";
import { GuestImportPrompt } from "@/components/guest/GuestImportPrompt";
import { OnboardingPanel } from "@/components/onboarding/OnboardingPanel";
import { StatCard } from "@/components/StatCard";
import { RESULT_LABELS, TURN_ORDER_LABELS } from "@/lib/constants";
import { getEnvironments, getMatches } from "@/lib/data";
import { summarizeMatches } from "@/lib/analytics";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { formatPercent } from "@/lib/utils";

export default async function HomePage({
  searchParams
}: {
  searchParams: Promise<{ environment?: string; guest_imported?: string; guest_error?: string }>;
}) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) {
    return <LandingPage />;
  }

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

        <GuestImportPrompt
          importCount={params.guest_imported ? Number(params.guest_imported) : null}
          importError={params.guest_error}
        />

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

function LandingPage() {
  const features = [
    {
      icon: ListPlus,
      title: "戦績入力",
      description: "使用デッキ、相手デッキ、先攻/後攻、勝敗、対戦日時、メモをスマホから素早く記録できます。"
    },
    {
      icon: BarChart3,
      title: "勝率分析",
      description: "総試合数、勝率、先攻勝率、後攻勝率、デッキ別勝率を自動で集計します。"
    },
    {
      icon: Trophy,
      title: "対面勝率",
      description: "自分の実戦データから、得意対面・苦手対面・参考値を確認できます。"
    },
    {
      icon: Grid3X3,
      title: "相性表",
      description: "使用デッキ × 相手デッキの勝率表を自動生成し、有利不利を色で見やすく表示します。"
    }
  ];

  return (
    <main className="min-h-screen bg-surface text-ink">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-3">
          <Link className="flex items-center gap-2 font-bold" href="/">
            <BrandMark className="size-10" />
            <span>SV Match Log Web</span>
          </Link>
          <div className="flex items-center gap-2">
            <Link className="rounded-md px-3 py-2 text-sm font-semibold text-muted hover:bg-slate-100 hover:text-ink" href="/guest">
              ゲストで試す
            </Link>
            <Link className="inline-flex items-center gap-2 rounded-md bg-ink px-4 py-2 text-sm font-bold text-white" href="/login">
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
            戦績を入れるだけで、勝率分析と相性表を自動作成。
          </h1>
          <p className="mt-5 max-w-2xl text-base leading-8 text-muted">
            SV Match Log Webは、シャドバWBの対戦結果をブラウザで記録し、勝率、先攻/後攻勝率、対面勝率、相性表を確認できる無料の戦績管理ツールです。
            公式カード画像や公式素材は使わず、テキストと色だけでシンプルに整理します。
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

        <div className="rounded-md border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-center gap-3 border-b border-slate-100 pb-4">
            <BrandMark className="size-12" />
            <div>
              <h2 className="font-bold">できること</h2>
              <p className="text-sm text-muted">入力した戦績から自動で集計します。</p>
            </div>
          </div>
          <div className="mt-4 grid gap-3">
            {["戦績入力", "勝率分析", "対面勝率", "相性表PNG保存"].map((item) => (
              <div className="flex items-center justify-between rounded-md bg-slate-50 px-3 py-2 text-sm" key={item}>
                <span className="font-semibold">{item}</span>
                <span className="rounded-md bg-emerald-100 px-2 py-1 text-xs font-bold text-emerald-800">無料</span>
              </div>
            ))}
          </div>
        </div>
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

      <section className="mx-auto max-w-6xl px-4 py-10">
        <div className="rounded-md border border-slate-200 bg-white p-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <div className="flex items-center gap-2 text-sm font-bold text-muted">
                <Swords size={16} aria-hidden="true" />
                SV Match Log Web
              </div>
              <h2 className="mt-2 text-2xl font-black">まずは戦績入力から始められます</h2>
              <p className="mt-2 text-sm leading-6 text-muted">
                アカウント登録後、管理された環境と標準デッキを選んで戦績を保存できます。ゲストモードでは保存なしで入力体験を試せます。
              </p>
            </div>
            <Link className="inline-flex min-h-11 shrink-0 items-center justify-center rounded-md bg-ink px-5 text-sm font-bold text-white" href="/login">
              ログイン / 新規登録
            </Link>
          </div>
        </div>
      </section>
    </main>
  );
}
