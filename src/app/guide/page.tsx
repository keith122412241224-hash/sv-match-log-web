import { ThemeSelect } from "@/components/ThemeProvider";
import type { Metadata } from "next";
import { existsSync } from "node:fs";
import { join } from "node:path";
import Link from "next/link";
import { FirstUseTerms, LegalLinks } from "@/components/LegalLinks";
import { ArrowRight, BarChart3, FileText, Grid3X3, ListPlus, LogIn, PlayCircle, Swords, TrendingUp, Trophy } from "lucide-react";
import { signOut } from "@/app/actions";
import { BrandMark } from "@/components/BrandMark";
import { GuideScreenshot } from "@/components/guide/GuideScreenshot";
import { SubmitButton } from "@/components/SubmitButton";
import { getCurrentUser } from "@/lib/data";

const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL ?? "https://sv-match-log-web.vercel.app").replace(/\/$/, "");
const title = "SV Match Log Webの使い方｜シャドバWBの戦績分析・環境分析ガイド";
const description =
  "シャドバWB向け無料戦績管理ツール「SV Match Log Web」の使い方を解説します。戦績入力、自分の勝率・対面分析、相性表のPNG保存、利用者全体のデータによる環境分析まで画像付きで確認できます。";

function existingPublicPath(path: string) {
  return existsSync(join(process.cwd(), "public", path.replace(/^\//, ""))) ? path : undefined;
}

export const metadata: Metadata = {
  title,
  description,
  alternates: {
    canonical: "/guide"
  },
  openGraph: {
    title,
    description,
    url: `${SITE_URL}/guide`,
    siteName: "SV Match Log Web",
    locale: "ja_JP",
    type: "article",
    images: [
      {
        url: "/icon/sv-match-log-icon.png",
        width: 512,
        height: 512,
        alt: "SV Match Log Web"
      }
    ]
  },
  twitter: {
    card: "summary",
    title,
    description,
    images: ["/icon/sv-match-log-icon.png"]
  }
};

const steps = [
  {
    id: "start",
    icon: PlayCircle,
    title: "利用を開始する",
    screenshot: {
      src: "/guide/ゲストモード画面.png",
      width: 1100,
      height: 429,
      alt: "SV Match Log Webのゲストモード画面",
      label: "ゲストモード画面のイメージ"
    },
    body: [
      "「ログインせず試す」からゲストモードを開き、まずは「戦績入力」で1試合入力してみましょう。入力した戦績はこの端末に一時保存され、分析や相性表も試せます。",
      "継続して戦績を管理する場合は、メールアドレスとパスワードで無料のアカウント登録・ログインをしてください。ゲスト戦績を取り込めるほか、環境分析や環境全体の相性表も利用できます。"
    ]
  },
  {
    id: "decks",
    icon: Swords,
    title: "標準デッキを確認する",
    screenshot: {
      src: "/guide/デッキ管理画面.png",
      width: 1100,
      height: 1023,
      alt: "SV Match Log Webのデッキ管理画面",
      label: "デッキ管理画面のイメージ"
    },
    body: [
      "会員ログイン後、「デッキ管理」でクラスを開くと標準デッキの一覧を確認できます。戦績入力ではこの一覧から選ぶため、自分でデッキを作成する必要はありません。",
      "使いたいデッキが見つからない場合は、「デッキ候補を申請」を開き、クラスとデッキ名を入力して申請できます。管理者に承認されると標準デッキとして選べるようになります。"
    ]
  },
  {
    id: "input",
    icon: ListPlus,
    title: "戦績を入力する",
    screenshot: {
      src: "/guide/戦績入力画面.png",
      width: 1100,
      height: 777,
      alt: "SV Match Log Webの戦績入力画面",
      label: "戦績入力画面のイメージ"
    },
    body: [
      "「戦績入力」で表示中の環境を確認し、使用デッキ・相手デッキ・先攻／後攻・勝敗を選びます。自分のランクは任意で入力でき、対戦日時は保存時に自動で記録されます。",
      "会員は「保存して続ける」で連続入力でき、「保存してホームへ」で記録後にホームへ戻れます。ゲストは「入力を試す」でこの端末に一時保存できます。"
    ]
  },
  {
    id: "analysis",
    icon: BarChart3,
    title: "勝率を分析する",
    screenshot: {
      src: "/guide/分析画面.png",
      width: 1068,
      height: 555,
      alt: "SV Match Log Webの分析画面",
      label: "分析画面のイメージ"
    },
    body: [
      "「分析」では、自分が使ったデッキごとの試合数・勝率・先攻／後攻別の勝率・直近の成績を確認できます。まずは「使用デッキ別サマリー」で全体を振り返りましょう。",
      "「分析条件を変更」で環境や期間、ランク、使用デッキ・相手デッキなどを絞り込めます。表示したサマリーは「PNG保存」から画像として残せます。"
    ]
  },
  {
    id: "matchups",
    icon: Trophy,
    title: "対面別勝率を確認する",
    screenshot: {
      src: "/guide/対面勝率画面.png",
      width: 1068,
      height: 627,
      alt: "SV Match Log Webの対面別勝率画面",
      label: "対面勝率画面のイメージ"
    },
    body: [
      "同じ分析画面の「デッキ別対面分析」で使用デッキの行を開くと、相手デッキごとの勝率・勝利数・対戦数を確認できます。",
      "対戦数や勝率で並び替えたり、最低対戦数を指定したりして、得意・苦手な対面を探せます。少数の対戦だけで判断せず、件数とあわせて振り返りましょう。"
    ]
  },
  {
    id: "matrix",
    icon: Grid3X3,
    title: "相性表を確認・保存する",
    screenshot: {
      src: "/guide/相性表画面.png",
      width: 1100,
      height: 1048,
      alt: "SV Match Log Webの相性表画面",
      label: "相性表画面のイメージ"
    },
    body: [
      "会員の「相性表」は環境全体が初期表示です。利用者全体の戦績からデッキ同士の対面勝率を確認でき、「集計範囲」を「自分の戦績」に切り替えることもできます。環境全体の同じデッキ同士の対面は「—」で表示します。",
      "表示デッキを選んで見やすく整理し、「PNG保存」から画像にできます。スマートフォンではプレビューから共有・保存できます。ゲストの相性表は、この端末に入力した戦績が対象です。"
    ]
  },
  {
    id: "environment",
    icon: TrendingUp,
    title: "環境を確認する",
    screenshot: {
      src: "/guide/環境分析画面.png",
      width: 1068,
      height: 798,
      alt: "環境サマリーの遭遇率・勝率ランキングと増減傾向",
      label: "環境サマリー画面のイメージ"
    },
    secondaryScreenshot: {
      src: "/guide/推移分析画面.png",
      width: 1068,
      height: 731,
      alt: "推移分析でデッキごとの遭遇率の変化を確認する画面",
      label: "推移分析画面のイメージ"
    },
    body: [
      "無料の会員ログイン後、メニューの「環境」を開きます。「環境サマリー」では利用者全体の戦績をもとに、デッキの遭遇率・勝率を確認できます。期間を指定すると、前の期間からの増減も確認できます。",
      "「推移分析」に切り替え、気になるデッキを選ぶと、遭遇率や勝率の変化をグラフで見られます。集計件数も確認しながら、STEP 6の環境全体の相性表とあわせてデッキ選びに活用しましょう。個別ユーザーの戦績や識別情報は表示されません。"
    ]
  }
];

export default async function GuidePage() {
  const user = await getCurrentUser();
  const signedIn = Boolean(user);

  return (
    <main className="min-h-screen bg-surface text-ink">
      <GuideHeader signedIn={signedIn} />

      <section className="border-b border-slate-200 bg-white">
        <div className="mx-auto grid max-w-6xl gap-8 px-4 py-10 lg:grid-cols-[1.1fr_0.9fr] lg:items-center lg:py-14">
          <div>
            <p className="text-sm font-bold text-emerald-700">Shadowverse: Worlds Beyond向け戦績管理ガイド</p>
            <h1 className="mt-3 max-w-3xl text-4xl font-black leading-tight sm:text-5xl">SV Match Log Webの使い方</h1>
            <p className="mt-5 max-w-2xl text-base leading-8 text-muted">
              戦績の記録から自分の勝率・対面分析、利用者全体のデータによる環境分析まで、基本的な使い方を紹介します。まずはゲストモードで試すこともできます。
            </p>
            {!signedIn && <div className="mt-4"><FirstUseTerms /></div>}
            {signedIn ? <SignedInHeroActions /> : <SignedOutHeroActions />}
          </div>

          <div className="rounded-md border border-slate-200 bg-slate-50 p-4">
            <div className="rounded-md border border-slate-200 bg-white p-4">
              <div className="flex items-center gap-3">
                <BrandMark className="size-12" />
                <div>
                  <h2 className="font-bold">できること</h2>
                  <p className="text-sm text-muted">自分の戦績と環境の動きを確認できます。</p>
                </div>
              </div>
              <ol className="mt-4 grid gap-2 text-sm font-semibold">
                {["戦績を入力する", "自分の勝率・対面を分析する", "相性表を確認・PNG保存する", "環境の遭遇率・勝率・推移を確認する"].map((item, index) => (
                  <li className="flex items-center gap-2 rounded-md bg-slate-50 px-3 py-2" key={item}>
                    <span className="grid size-6 shrink-0 place-items-center rounded-full bg-emerald-100 text-xs font-bold text-emerald-800">{index + 1}</span>
                    {item}
                  </li>
                ))}
              </ol>
            </div>
          </div>
        </div>
      </section>

      <div className="mx-auto grid max-w-6xl gap-8 px-4 py-10">
        <p className="text-xs leading-6 text-muted">画面は操作説明用のサンプルデータです。デッキ名や集計値は実際の環境と異なります。画像を選ぶと拡大できます。</p>
        {steps.map((step, index) => {
          const Icon = step.icon;
          return (
            <section className="grid gap-5 rounded-md border border-slate-200 bg-white p-4 sm:p-5 lg:grid-cols-[minmax(0,0.9fr)_minmax(360px,1fr)] lg:items-start" id={step.id} key={step.id}>
              <div>
                <div className="flex items-center gap-3">
                  <span className="grid size-10 shrink-0 place-items-center rounded-md bg-emerald-50 text-emerald-700">
                    <Icon size={22} aria-hidden="true" />
                  </span>
                  <div>
                    <p className="text-xs font-bold text-muted">STEP {index + 1}</p>
                    <h2 className="text-xl font-bold text-ink">{step.title}</h2>
                  </div>
                </div>
                <div className="mt-4 grid max-w-2xl gap-3 text-sm leading-7 text-muted">
                  {step.body.map((paragraph) => (
                    <p key={paragraph}>{paragraph}</p>
                  ))}
                </div>
              </div>
              <div className="grid min-w-0 gap-3">
                {[step.screenshot, step.secondaryScreenshot].filter((screenshot) => screenshot !== undefined).map((screenshot) => (
                  <a key={screenshot.src} href={screenshot.src} target="_blank" rel="noreferrer" className="block rounded-md focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-700" aria-label={`${screenshot.alt}を拡大（新しいタブ）`}>
                    <GuideScreenshot
                      {...screenshot}
                      src={existingPublicPath(screenshot.src)}
                    />
                  </a>
                ))}
              </div>
            </section>
          );
        })}

        <section className="rounded-md border border-emerald-200 bg-emerald-50 p-5 sm:p-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <div className="flex items-center gap-2 text-sm font-bold text-emerald-800">
                <FileText size={17} aria-hidden="true" />
                SV Match Log Web
              </div>
              <h2 className="mt-2 text-2xl font-black text-ink">まずは戦績入力から始めてみましょう</h2>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-emerald-950">
                {signedIn
                  ? "ログイン中のアカウントで、戦績入力・分析や環境の確認を利用できます。"
                  : "ゲストモードで試してから、無料のアカウント登録で戦績の管理と環境分析を始められます。"}
              </p>
            </div>
            {signedIn ? <SignedInFooterActions /> : <SignedOutFooterActions />}
          </div>
        </section>
      </div>
      <footer className="px-4 py-4"><LegalLinks /></footer>
    </main>
  );
}

function SignedInHeroActions() {
  return (
    <div className="mt-6 flex flex-wrap gap-3">
      <Link className="inline-flex min-h-11 items-center gap-2 rounded-md bg-ink px-5 text-sm font-bold text-white hover:bg-slate-700" href="/matches">
        <ListPlus size={17} aria-hidden="true" />
        戦績入力へ
      </Link>
      <Link className="inline-flex min-h-11 items-center gap-2 rounded-md border border-slate-300 bg-white px-5 text-sm font-bold text-ink hover:bg-slate-50" href="/analysis" prefetch={false}>
        <BarChart3 size={17} aria-hidden="true" />
        分析を見る
      </Link>
    </div>
  );
}

function SignedOutHeroActions() {
  return (
    <div className="mt-6 flex flex-wrap gap-3">
      <Link className="inline-flex min-h-11 items-center gap-2 rounded-md border border-slate-300 bg-white px-5 text-sm font-bold text-ink hover:bg-slate-50" href="/guest">
        <PlayCircle size={17} aria-hidden="true" />
        ログインせず試す
      </Link>
      <Link className="inline-flex min-h-11 items-center gap-2 rounded-md bg-ink px-5 text-sm font-bold text-white hover:bg-slate-700" href="/login">
        <LogIn size={17} aria-hidden="true" />
        無料で始める
      </Link>
    </div>
  );
}

function SignedInFooterActions() {
  return (
    <div className="flex flex-col gap-2 sm:flex-row">
      <Link className="inline-flex min-h-11 items-center justify-center gap-2 rounded-md bg-ink px-5 text-sm font-bold text-white hover:bg-slate-700" href="/matches">
        戦績入力へ
        <ArrowRight size={16} aria-hidden="true" />
      </Link>
      <Link className="inline-flex min-h-11 items-center justify-center gap-2 rounded-md border border-emerald-300 bg-white px-5 text-sm font-bold text-ink hover:bg-emerald-50" href="/matrix" prefetch={false}>
        相性表を見る
      </Link>
    </div>
  );
}

function SignedOutFooterActions() {
  return (
    <div className="flex flex-col gap-2 sm:flex-row">
      <Link className="inline-flex min-h-11 items-center justify-center gap-2 rounded-md border border-emerald-300 bg-white px-5 text-sm font-bold text-ink hover:bg-emerald-50" href="/guest">
        ログインせず試す
      </Link>
      <Link className="inline-flex min-h-11 items-center justify-center gap-2 rounded-md bg-ink px-5 text-sm font-bold text-white hover:bg-slate-700" href="/login">
        ログイン／新規登録
        <ArrowRight size={16} aria-hidden="true" />
      </Link>
    </div>
  );
}

function GuideHeader({ signedIn }: { signedIn: boolean }) {
  return (
    <header className="border-b border-slate-200 bg-white">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-2 px-3 py-3 sm:px-4">
        <Link className="flex min-w-0 items-center gap-2 font-bold text-ink" href="/">
          <BrandMark className="size-9 shrink-0" />
          <span className="hidden truncate sm:inline">SV Match Log Web</span>
        </Link>
        <ThemeSelect />
        {signedIn ? (
          <div className="flex flex-wrap items-center gap-1 sm:gap-2">
            <Link className="rounded-md px-2 py-2 text-sm font-semibold text-muted hover:bg-slate-100 hover:text-ink sm:px-3" href="/guide">
              使い方
            </Link>
            <form action={signOut}>
              <SubmitButton className="inline-flex min-h-10 items-center rounded-md px-2 text-sm font-semibold text-muted hover:bg-slate-100 sm:px-3" pendingLabel="ログアウト中..." type="submit" variant="ghost">
                ログアウト
              </SubmitButton>
            </form>
          </div>
        ) : (
          <nav className="flex flex-wrap items-center gap-1 sm:gap-2" aria-label="公開ページ">
            <Link className="rounded-md px-2 py-2 text-sm font-semibold text-muted hover:bg-slate-100 hover:text-ink sm:px-3" href="/guest">
              ゲストで試す
            </Link>
            <Link className="rounded-md px-2 py-2 text-sm font-semibold text-muted hover:bg-slate-100 hover:text-ink sm:px-3" href="/guide">
              使い方
            </Link>
            <Link className="inline-flex items-center gap-2 rounded-md bg-ink px-3 py-2 text-sm font-bold text-white hover:bg-slate-700 sm:px-4" href="/login">
              ログイン
            </Link>
          </nav>
        )}
      </div>
    </header>
  );
}
