import Link from "next/link";
import { PlayCircle } from "lucide-react";
import { sendPasswordReset, signInWithPassword, signUpWithPassword } from "@/app/actions";
import { BrandMark } from "@/components/BrandMark";
import { Button } from "@/components/Button";
import { FieldLabel, Input } from "@/components/Field";

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
          <div className="grid gap-2 sm:grid-cols-2">
            <Button type="submit">ログイン</Button>
            <Button formAction={signUpWithPassword} type="submit" variant="secondary">新規登録</Button>
          </div>
          <Button formAction={sendPasswordReset} type="submit" variant="ghost">パスワードを再設定する</Button>
        </form>

        {message ? (
          <p className="mt-4 rounded-md bg-slate-100 px-3 py-2 text-sm text-ink">{message}</p>
        ) : null}
      </section>
    </main>
  );
}
