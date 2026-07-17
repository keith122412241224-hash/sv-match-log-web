import type { Metadata } from "next";
import { existsSync } from "node:fs";
import { join } from "node:path";
import Link from "next/link";
import { ArrowRight, BarChart3, FileText, Grid3X3, ListPlus, LogIn, PlayCircle, Swords, Trophy } from "lucide-react";
import { signOut } from "@/app/actions";
import { BrandMark } from "@/components/BrandMark";
import { GuideScreenshot } from "@/components/guide/GuideScreenshot";
import { SubmitButton } from "@/components/SubmitButton";
import { getCurrentUser } from "@/lib/data";

const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL ?? "https://sv-match-log-web.vercel.app").replace(/\/$/, "");
const title = "SV Match Log Webの使い方｜シャドバWBの戦績・勝率を記録する方法";
const description =
  "シャドバWB向け無料戦績管理ツール「SV Match Log Web」の使い方を解説します。戦績入力、勝率分析、対面別勝率、相性表の作成、PNG保存まで画像付きで確認できます。";

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
      alt: "SV Match Log Webのゲストモード画面",
      label: "ゲストモード画面のイメージ"
    },
    body: [
      "SV Match Log Webは、ログインせずにゲストモードで操作を試せます。まず入力の流れや分析画面を確認したい場合は、ゲストモードから始めるのが簡単です。",
      "戦績を継続して保存したい場合は、メールアドレスとパスワードでアカウント登録してください。登録後は入力した戦績を自分のデータとして管理できます。"
    ]
  },
  {
    id: "decks",
    icon: Swords,
    title: "デッキを設定する",
    screenshot: {
      src: "/guide/デッキ管理画面.png",
      alt: "SV Match Log Webのデッキ管理画面",
      label: "デッキ管理画面のイメージ"
    },
    body: [
      "戦績入力では、管理者が登録した標準デッキから使用デッキと相手デッキを選択できます。",
      "標準デッキに存在しないデッキは、デッキ管理画面の「一覧にないデッキを提案」からクラスとデッキ名を指定して提案できます。管理者に承認されると、標準デッキとして選択できるようになります。"
    ]
  },
  {
    id: "input",
    icon: ListPlus,
    title: "戦績を入力する",
    screenshot: {
      src: "/guide/戦績入力画面.png",
      alt: "SV Match Log Webの戦績入力画面",
      label: "戦績入力画面のイメージ"
    },
    body: [
      "戦績入力画面では、使用デッキ、相手デッキ、先攻・後攻、勝敗を選択して登録します。",
      "スマートフォンでも操作しやすいよう、選択肢をタップしながら素早く入力できる画面になっています。対戦後すぐに記録しておくと、後から勝率や相性を振り返りやすくなります。"
    ]
  },
  {
    id: "analysis",
    icon: BarChart3,
    title: "勝率を分析する",
    screenshot: {
      src: "/guide/分析画面.png",
      alt: "SV Match Log Webの分析画面",
      label: "分析画面のイメージ"
    },
    body: [
      "分析画面では、総合試合数、勝利数、勝率、先攻勝率、後攻勝率を確認できます。",
      "さらに、使用デッキ別の勝率、相手デッキ別の勝率、先攻・後攻別の勝率、対面別勝率も確認できます。環境、デッキ、先攻・後攻、勝敗、日時で絞り込めるため、特定期間や特定デッキの振り返りにも使えます。"
    ]
  },
  {
    id: "matchups",
    icon: Trophy,
    title: "対面別勝率を確認する",
    screenshot: {
      src: "/guide/対面勝率画面.png",
      alt: "SV Match Log Webの対面別勝率画面",
      label: "対面勝率画面のイメージ"
    },
    body: [
      "対面別勝率では、相手デッキごとの試合数と勝率を確認できます。",
      "得意対面や苦手対面を把握できるため、デッキ調整、プレイ方針の見直し、環境分析に活用できます。使用デッキ別サマリーでは、一定数以上対戦した得意対面・苦手対面も確認できます。"
    ]
  },
  {
    id: "matrix",
    icon: Grid3X3,
    title: "相性表を作成・保存する",
    screenshot: {
      src: "/guide/相性表画面.png",
      alt: "SV Match Log Webの相性表画面",
      label: "相性表画面のイメージ"
    },
    body: [
      "相性表では、自分の使用デッキと相手デッキの勝率を表形式で確認できます。表示したいデッキをボタンで切り替えると、使用デッキ側と相手デッキ側の両方に反映されます。",
      "作成した相性表はPNG形式で保存できます。XなどのSNS投稿や、自分の戦績振り返り用の画像として利用できます。"
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
              戦績入力から勝率分析、相性表のPNG保存まで、SV Match Log Webの基本的な使い方を紹介します。ログインせず、ゲストモードで操作を試すこともできます。
            </p>
            {signedIn ? <SignedInHeroActions /> : <SignedOutHeroActions />}
          </div>

          <div className="rounded-md border border-slate-200 bg-slate-50 p-4">
            <div className="rounded-md border border-slate-200 bg-white p-4">
              <div className="flex items-center gap-3">
                <BrandMark className="size-12" />
                <div>
                  <h2 className="font-bold">できること</h2>
                  <p className="text-sm text-muted">入力、分析、相性表保存までを一通り確認できます。</p>
                </div>
              </div>
              <ol className="mt-4 grid gap-2 text-sm font-semibold">
                {["ゲストモードで試す", "戦績を入力する", "勝率を分析する", "相性表をPNG保存する"].map((item, index) => (
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
              <GuideScreenshot
                {...step.screenshot}
                src={existingPublicPath(step.screenshot.src)}
              />
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
                  ? "ログイン中のアカウントで、そのまま戦績入力や分析を利用できます。"
                  : "ゲストモードで試してから、必要に応じてアカウント登録できます。継続して戦績を管理したい場合はログインして利用してください。"}
              </p>
            </div>
            {signedIn ? <SignedInFooterActions /> : <SignedOutFooterActions />}
          </div>
        </section>
      </div>
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
      <Link className="inline-flex min-h-11 items-center gap-2 rounded-md border border-slate-300 bg-white px-5 text-sm font-bold text-ink hover:bg-slate-50" href="/analysis">
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
      <Link className="inline-flex min-h-11 items-center justify-center gap-2 rounded-md border border-emerald-300 bg-white px-5 text-sm font-bold text-ink hover:bg-emerald-50" href="/matrix">
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
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-2 px-3 py-3 sm:px-4">
        <Link className="flex min-w-0 items-center gap-2 font-bold text-ink" href="/">
          <BrandMark className="size-9 shrink-0" />
          <span className="hidden truncate sm:inline">SV Match Log Web</span>
        </Link>
        {signedIn ? (
          <div className="flex shrink-0 items-center gap-1 sm:gap-2">
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
          <nav className="flex shrink-0 items-center gap-1 sm:gap-2" aria-label="公開ページ">
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
