import { updatePassword } from "@/app/actions";
import { Button } from "@/components/Button";
import { FieldLabel, Input } from "@/components/Field";

export default async function ResetPasswordPage({
  searchParams
}: {
  searchParams: Promise<{ message?: string }>;
}) {
  const { message } = await searchParams;

  return (
    <main className="grid min-h-screen place-items-center bg-surface px-4 py-10">
      <section className="w-full max-w-md rounded-md border border-slate-200 bg-white p-6 shadow-sm">
        <h1 className="text-xl font-bold text-ink">パスワード再設定</h1>
        <p className="mt-2 text-sm leading-6 text-muted">新しいパスワードを設定すると、そのままログインします。</p>
        <form action={updatePassword} className="mt-6 grid gap-4">
          <FieldLabel>
            新しいパスワード
            <Input name="password" type="password" autoComplete="new-password" required minLength={6} />
          </FieldLabel>
          <Button type="submit">設定する</Button>
        </form>
        {message ? (
          <p className="mt-4 rounded-md bg-slate-100 px-3 py-2 text-sm text-ink">{message}</p>
        ) : null}
      </section>
    </main>
  );
}
