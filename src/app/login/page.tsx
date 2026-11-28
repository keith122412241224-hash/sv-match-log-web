import { ThemeSelect } from "@/components/ThemeProvider";
import Link from "next/link";
import Script from "next/script";
import { PlayCircle } from "lucide-react";
import { redirect } from "next/navigation";
import { sendPasswordReset, signInWithPassword, signUpWithPassword } from "@/app/actions";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { authSiteOrigin, googleAuthEnabled, isGoogleAuthorizeUrl } from "@/lib/auth-config";
import { BrandMark } from "@/components/BrandMark";
import { FieldLabel, Input } from "@/components/Field";
import { SubmitButton } from "@/components/SubmitButton";

const forms = {
  login: {
    title: "ログイン",
    action: signInWithPassword,
    submit: "ログイン",
    pending: "ログイン中..."
  },
  signup: {
    title: "新規登録",
    action: signUpWithPassword,
    submit: "新規登録",
    pending: "登録中..."
  },
  reset: {
    title: "パスワード再設定",
    action: sendPasswordReset,
    submit: "パスワードを再設定する",
    pending: "送信中..."
  }
};

const secondaryLink = "inline-flex min-h-11 w-full items-center justify-center rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-ink";

async function signInWithGoogle() {
  "use server";
  if (!googleAuthEnabled()) redirect("/login");
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo: `${authSiteOrigin()}/auth/confirm`,
      queryParams: { prompt: "select_account" }
    }
  });
  if (error || !data.url || !isGoogleAuthorizeUrl(data.url)) {
    redirect(`/login?message=${encodeURIComponent("Googleログインを開始できませんでした")}`);
  }
  redirect(data.url);
}

export default async function LoginPage({
  searchParams
}: {
  searchParams: Promise<{ mode?: string | string[]; message?: string | string[] }>;
}) {
  const { mode, message } = await searchParams;
  const formMode = mode === "signup" || mode === "reset" ? mode : "login";
  const form = forms[formMode];

  return (
    <main className="grid min-h-screen place-items-center bg-surface px-4 py-10">
      {formMode === "login" && (
        <Script id="legacy-signup-link" strategy="afterInteractive">
          {`if (location.pathname === "/login" && !location.search && location.hash === "#signup") location.replace("/login?mode=signup");`}
        </Script>
      )}
      <section className="w-full max-w-md rounded-md border border-slate-200 bg-white p-6 shadow-sm">
        <div className="mb-4 flex justify-end"><ThemeSelect /></div>
        <div className="flex items-center gap-3">
          <BrandMark className="size-12" />
          <div>
            <p className="text-xl font-bold text-ink">SV Match Log Web</p>
            <p className="text-sm text-muted">戦績から勝率と相性表を自動生成</p>
          </div>
        </div>

        <div className="mt-6 border-t border-slate-200 pt-4">
          <h1 id="auth-heading" className="text-xl font-bold text-ink">{form.title}</h1>
          {typeof message === "string" && message && (
            <p role="status" className="mt-4 break-words rounded-md bg-slate-100 px-3 py-2 text-sm text-ink">{message}</p>
          )}
          <form key={formMode} action={form.action} aria-labelledby="auth-heading" className="mt-4 grid gap-4">
            <FieldLabel>
              メールアドレス
              <Input name="email" type="email" autoComplete="email" required placeholder="you@example.com" />
            </FieldLabel>
            {formMode !== "reset" && (
              <FieldLabel>
                パスワード
                <Input name="password" type="password" autoComplete={formMode === "signup" ? "new-password" : "current-password"} required minLength={6} />
              </FieldLabel>
            )}
            <SubmitButton type="submit" pendingLabel={form.pending}>{form.submit}</SubmitButton>
          </form>

          {formMode !== "reset" && googleAuthEnabled() && (
            <form action={signInWithGoogle} className="mt-3">
              <button type="submit" className={secondaryLink}>
                {formMode === "signup" ? "Googleで登録" : "Googleでログイン"}
              </button>
            </form>
          )}

          {formMode === "login" && (
            <>
              <Link className="mt-2 inline-flex min-h-11 items-center text-sm font-semibold text-ink underline" href="/login?mode=reset">
                パスワードを忘れた方
              </Link>
              <div className="mt-3 grid gap-2 border-t border-slate-200 pt-4">
                <p className="text-sm text-muted">アカウントをお持ちでない方</p>
                <Link className={secondaryLink} href="/login?mode=signup">無料で新規登録</Link>
              </div>
            </>
          )}
          {formMode === "signup" && (
            <div className="mt-4 grid gap-2 border-t border-slate-200 pt-4">
              <p className="text-sm text-muted">すでにアカウントをお持ちの方</p>
              <Link className={secondaryLink} href="/login">ログイン</Link>
            </div>
          )}
          {formMode === "reset" && (
            <Link className={`mt-4 ${secondaryLink}`} href="/login">ログインに戻る</Link>
          )}
        </div>

        <Link className="mt-4 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-ink" href="/guest">
          <PlayCircle size={18} aria-hidden="true" />
          ログインせずに試す
        </Link>

        <div className="mt-5 border-t border-slate-200 pt-4 text-center">
          <Link className="text-xs font-semibold text-muted hover:text-ink" href="/privacy">
            プライバシーポリシー
          </Link>
        </div>
      </section>
    </main>
  );
}
