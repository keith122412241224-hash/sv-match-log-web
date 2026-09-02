import Link from "next/link";
import { PlayCircle } from "lucide-react";
import { sendPasswordReset, signInWithPassword, signUpWithPassword } from "@/app/actions";
import { BrandMark } from "@/components/BrandMark";
import { FieldLabel, Input } from "@/components/Field";
import { SubmitButton } from "@/components/SubmitButton";

export default async function LoginPage({
  searchParams
}: {
  searchParams: Promise<{ message?: string }>;
}) {
  const { message } = await searchParams;

  return (
    <main className="grid min-h-screen place-items-center bg-surface px-4 py-10">
      <section className="w-full max-w-md rounded-md border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex items-center gap-3">
          <BrandMark className="size-12" />
          <div>
            <h1 className="text-xl font-bold text-ink">SV Match Log Web</h1>
            <p className="text-sm text-muted">戦績から勝率と相性表を自動生成</p>
          </div>
        </div>

        <Link className="mt-6 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-ink" href="/guest">
          <PlayCircle size={18} aria-hidden="true" />
          ログインせずに試す
        </Link>

        <form action={signInWithPassword} className="mt-6 grid gap-4 border-t border-slate-200 pt-4">
          <FieldLabel>
            メールアドレス
            <Input name="email" type="email" autoComplete="email" required placeholder="you@example.com" />
          </FieldLabel>
          <FieldLabel>
            パスワード
            <Input name="password" type="password" autoComplete="current-password" required minLength={6} />
          </FieldLabel>
          <SubmitButton type="submit" pendingLabel="ログイン中...">ログイン</SubmitButton>
        </form>

        <form action={signUpWithPassword} className="mt-4 grid gap-4 rounded-md bg-slate-50 p-3">
          <FieldLabel>
            メールアドレス
            <Input name="email" type="email" autoComplete="email" required placeholder="you@example.com" />
          </FieldLabel>
          <FieldLabel>
            パスワード
            <Input name="password" type="password" autoComplete="new-password" required minLength={6} />
          </FieldLabel>
          <SubmitButton type="submit" variant="secondary" pendingLabel="登録中...">新規登録</SubmitButton>
        </form>

        <form action={sendPasswordReset} className="mt-4 grid gap-3">
          <FieldLabel>
            パスワード再設定用メールアドレス
            <Input name="email" type="email" autoComplete="email" required placeholder="you@example.com" />
          </FieldLabel>
          <SubmitButton type="submit" variant="ghost" pendingLabel="送信中...">パスワードを再設定する</SubmitButton>
        </form>

        {message ? (
          <p className="mt-4 rounded-md bg-slate-100 px-3 py-2 text-sm text-ink">{message}</p>
        ) : null}

        <div className="mt-5 border-t border-slate-200 pt-4 text-center">
          <Link className="text-xs font-semibold text-muted hover:text-ink" href="/privacy">
            プライバシーポリシー
          </Link>
        </div>
      </section>
    </main>
  );
}
