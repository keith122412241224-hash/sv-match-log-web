import Link from "next/link";
import type { Metadata } from "next";
import { ShieldCheck } from "lucide-react";
import { BrandMark } from "@/components/BrandMark";

export const metadata: Metadata = {
  title: "プライバシーポリシー",
  description: "SV Match Log Web のプライバシーポリシーです。",
  alternates: {
    canonical: "/privacy"
  }
};

const policySections = [
  {
    title: "1. 取得する情報",
    body: (
      <>
        <p>本サービスでは、サービスの提供・運営に必要な範囲で、以下の情報を取得する場合があります。</p>
        <ul>
          <li>アカウント登録・ログインに必要なメールアドレス等のアカウント情報</li>
          <li>使用デッキ</li>
          <li>対戦相手のデッキ</li>
          <li>先攻・後攻</li>
          <li>勝敗</li>
          <li>対戦日時、メモその他ユーザーが登録した戦績情報</li>
          <li>デッキ候補の提案内容</li>
          <li>本サービスの利用状況に関する情報</li>
          <li>ゲストモード利用時にユーザーの端末内へ保存される戦績情報</li>
        </ul>
      </>
    )
  },
  {
    title: "2. 情報の利用目的",
    body: (
      <>
        <p>取得した情報は、以下の目的で利用します。</p>
        <ol>
          <li>本サービスの提供、運営および機能改善のため</li>
          <li>ユーザーの戦績の保存、集計および表示のため</li>
          <li>不具合調査、セキュリティ対策および不正利用防止のため</li>
          <li>本サービス全体の利用状況やゲーム環境の分析のため</li>
          <li>
            個人を特定できない形で戦績データを集計・統計化し、本サービス上での情報提供、YouTube、Xその他SNS、ブログ等での環境分析・情報発信に利用するため
          </li>
          <li>お問い合わせへの対応のため</li>
          <li>その他、本サービスの提供に付随する目的のため</li>
        </ol>
      </>
    )
  },
  {
    title: "3. 戦績データの集計・公開について",
    body: (
      <>
        <p>
          本サービスに登録された戦績データは、ゲーム環境の分析等を目的として、複数ユーザーのデータと合わせて集計・統計化する場合があります。
        </p>
        <p>公開する情報の例は以下のとおりです。</p>
        <ul>
          <li>デッキ別の試合数</li>
          <li>デッキ別の勝率</li>
          <li>対戦相手別の使用状況</li>
          <li>デッキ同士の対面勝率</li>
          <li>Tier表</li>
          <li>環境相関図</li>
          <li>その他、ゲーム環境を分析するための統計情報</li>
        </ul>
        <p>これらを公開する場合、個々のユーザーを特定できる情報と結び付けた状態では公開しません。</p>
        <p>集計した統計情報については、本サービス内のほか、YouTube、Xその他SNS、ブログ等で公開・利用する場合があります。</p>
      </>
    )
  },
  {
    title: "4. 個人情報の第三者提供",
    body: (
      <>
        <p>本サービスは、次の場合を除き、ユーザー本人の同意なく個人情報を第三者へ提供しません。</p>
        <ul>
          <li>法令に基づく場合</li>
          <li>人の生命、身体または財産の保護のために必要な場合</li>
          <li>本サービスの運営に必要な範囲で業務を委託する場合</li>
          <li>その他、法令により認められている場合</li>
        </ul>
        <p>
          なお、複数ユーザーのデータを集計し、特定の個人との対応関係が排除された統計情報については、個人情報とは区別して取り扱います。
        </p>
      </>
    )
  },
  {
    title: "5. 外部サービスの利用",
    body: (
      <>
        <p>本サービスでは、サービス提供、認証、データ保存、ホスティング等のために、以下の外部サービスを利用します。</p>
        <ul>
          <li>Supabase</li>
          <li>Vercel</li>
        </ul>
        <p>これらの外部サービスにおける情報の取り扱いについては、各サービス提供者のプライバシーポリシー等が適用される場合があります。</p>
      </>
    )
  },
  {
    title: "6. 情報の管理",
    body: (
      <>
        <p>本サービスは、取得した情報について、不正アクセス、漏えい、改ざん、紛失等を防止するため、合理的な安全管理措置を講じるよう努めます。</p>
        <p>また、本サービスの運営に不要となった情報については、必要に応じて適切な方法で削除します。</p>
      </>
    )
  },
  {
    title: "7. ユーザーによる登録情報の削除等",
    body: (
      <>
        <p>ユーザーは、本サービスが提供する機能またはお問い合わせを通じて、自身の登録情報の確認、修正または削除を依頼できる場合があります。</p>
        <p>法令上対応が必要な場合には、本人確認を行ったうえで適切に対応します。</p>
      </>
    )
  },
  {
    title: "8. Cookie等について",
    body: (
      <>
        <p>本サービスでは、ログイン状態の維持、利便性向上、利用状況の分析等を目的としてCookie、localStorageその他類似の技術を使用する場合があります。</p>
        <p>ブラウザの設定によりCookieを無効にすることもできますが、その場合、本サービスの一部機能が正常に利用できなくなる場合があります。</p>
      </>
    )
  },
  {
    title: "9. 本ポリシーの変更",
    body: (
      <>
        <p>本サービスは、法令の変更、本サービスの機能変更その他必要に応じて、本プライバシーポリシーを変更することがあります。</p>
        <p>重要な変更を行う場合は、本サービス上その他適切な方法でお知らせします。</p>
      </>
    )
  },
  {
    title: "10. お問い合わせ",
    body: (
      <>
        <p>本プライバシーポリシーまたは本サービスにおける情報の取り扱いに関するお問い合わせは、以下のXアカウントのDMまでお願いいたします。</p>
        <dl>
          <div>
            <dt>運営者</dt>
            <dd>ゆっきーずんだch</dd>
          </div>
          <div>
            <dt>お問い合わせ先</dt>
            <dd>
              <a className="font-bold text-emerald-700 hover:text-emerald-800" href="https://x.com/yuki_swb" rel="noreferrer" target="_blank">
                @yuki_swb
              </a>
              のDM
            </dd>
          </div>
        </dl>
      </>
    )
  }
];

export default function PrivacyPage() {
  return (
    <main className="min-h-screen bg-surface text-ink">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-3 px-4 py-3">
          <Link className="flex items-center gap-2 font-bold" href="/">
            <BrandMark className="size-10" />
            <span>SV Match Log Web</span>
          </Link>
          <Link className="rounded-md px-3 py-2 text-sm font-semibold text-muted hover:bg-slate-100 hover:text-ink" href="/">
            トップへ
          </Link>
        </div>
      </header>

      <div className="mx-auto grid max-w-5xl gap-6 px-4 py-8 sm:py-10">
        <section className="border-b border-slate-200 pb-6">
          <div className="flex items-center gap-2 text-sm font-bold text-emerald-700">
            <ShieldCheck size={18} aria-hidden="true" />
            SV Match Log Web
          </div>
          <h1 className="mt-3 text-3xl font-black sm:text-4xl">プライバシーポリシー</h1>
          <p className="mt-4 max-w-3xl text-sm leading-7 text-muted">
            SV Match Log Web（以下「本サービス」といいます。）は、本サービスを利用するユーザーの情報を適切に取り扱うため、以下のとおりプライバシーポリシーを定めます。
          </p>
        </section>

        <div className="grid gap-5">
          {policySections.map((section) => (
            <section className="rounded-md border border-slate-200 bg-white p-5 shadow-sm" key={section.title}>
              <h2 className="text-lg font-bold text-ink">{section.title}</h2>
              <div className="mt-3 grid gap-3 text-sm leading-7 text-muted [&_dd]:mt-1 [&_dd]:font-semibold [&_dd]:text-ink [&_dt]:font-bold [&_dt]:text-ink [&_li]:my-1 [&_ol]:list-decimal [&_ol]:pl-5 [&_ul]:list-disc [&_ul]:pl-5">
                {section.body}
              </div>
            </section>
          ))}
        </div>

        <p className="text-sm font-semibold text-muted">制定日：2026年9月2日</p>
      </div>
    </main>
  );
}
