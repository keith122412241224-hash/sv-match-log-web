import { redirect } from "next/navigation";
import { AdminEnvironmentTable } from "@/components/admin/AdminEnvironmentTable";
import { AdminArchetypeTable } from "@/components/admin/AdminArchetypeTable";
import { CreateEnvironmentForm } from "@/components/admin/CreateEnvironmentForm";
import { CreateArchetypeForm } from "@/components/admin/CreateArchetypeForm";
import { SuggestionsPanel } from "@/components/admin/SuggestionsPanel";
import { ClassIcon } from "@/components/ClassIcon";
import { SHADOWVERSE_CLASSES } from "@/lib/constants";
import { getAdminArchetypes, getDeckSuggestionsForAdmin, getEnvironments, getIsAdmin } from "@/lib/data";

const noticeMessages: Record<string, string> = {
  created: "標準デッキを追加しました。",
  updated: "標準デッキを更新しました。",
  batch_updated: "標準デッキを一括更新しました。",
  environment_created: "環境を追加しました。",
  environments_updated: "環境を一括更新しました。",
  deactivated: "標準デッキを無効化しました。",
  suggestion_updated: "候補の状態を更新しました。",
  suggestion_approved: "候補を標準デッキとして採用しました。"
};

export default async function AdminPage({
  searchParams
}: {
  searchParams: Promise<{ q?: string; class?: string; active?: string; notice?: string }>;
}) {
  const isAdmin = await getIsAdmin();

  if (!isAdmin) {
    redirect("/");
  }

  const [params, archetypes, suggestions, environments] = await Promise.all([
    searchParams,
    getAdminArchetypes(),
    getDeckSuggestionsForAdmin(),
    getEnvironments()
  ]);

  const query = (params.q ?? "").trim().toLowerCase();
  const classFilter = params.class ?? "";
  const activeFilter = params.active ?? "";
  const notice = params.notice ? noticeMessages[params.notice] : null;
  const filtered = archetypes.filter((archetype) => {
    const matchesQuery = !query || archetype.name.toLowerCase().includes(query);
    const matchesClass = !classFilter || archetype.class_name === classFilter;
    const matchesActive = !activeFilter || (activeFilter === "active" ? archetype.is_active : !archetype.is_active);
    return matchesQuery && matchesClass && matchesActive;
  });

  return (
    <main className="min-h-screen bg-surface px-4 py-6">
      <div className="mx-auto grid max-w-7xl gap-6">
        <header className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold text-ink">管理画面</h1>
            <p className="mt-1 text-sm text-muted">標準デッキとユーザー提案を管理します。</p>
          </div>
          <a className="rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-ink" href="/">
            通常画面へ
          </a>
        </header>

        {notice ? (
          <div className="rounded-md border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-900">
            {notice}
          </div>
        ) : null}

        <section className="grid gap-3">
          <div>
            <h2 className="font-bold text-ink">環境管理</h2>
            <p className="mt-1 text-sm text-muted">ユーザーが戦績入力・分析で選ぶ環境を管理します。</p>
          </div>
          <CreateEnvironmentForm />
          <AdminEnvironmentTable environments={environments} />
        </section>

        <section>
          <h2 className="mb-3 font-bold text-ink">標準デッキの追加</h2>
          <CreateArchetypeForm />
        </section>

        <SuggestionsPanel suggestions={suggestions} />

        <section className="rounded-md border border-slate-200 bg-white p-4">
          <h2 className="font-bold text-ink">標準デッキ一覧</h2>
          <form className="mt-3 grid gap-3 lg:grid-cols-[1fr_220px_160px_auto]" action="/admin">
            <input className="min-h-11 rounded-md border border-slate-300 px-3" name="q" placeholder="検索: デッキ名" defaultValue={params.q ?? ""} />
            <select className="min-h-11 rounded-md border border-slate-300 px-3" name="class" defaultValue={classFilter}>
              <option value="">全クラス</option>
              {SHADOWVERSE_CLASSES.map((className) => (
                <option key={className} value={className}>
                  {className}
                </option>
              ))}
            </select>
            <select className="min-h-11 rounded-md border border-slate-300 px-3" name="active" defaultValue={activeFilter}>
              <option value="">有効/無効すべて</option>
              <option value="active">有効のみ</option>
              <option value="inactive">無効のみ</option>
            </select>
            <button className="min-h-11 rounded-md bg-ink px-4 text-sm font-bold text-white" type="submit">
              絞り込み
            </button>
          </form>
          <div className="mt-3 flex flex-wrap gap-2">
            {SHADOWVERSE_CLASSES.map((className) => (
              <a className="rounded-md border border-slate-200 bg-slate-50 p-2" href={`/admin?class=${encodeURIComponent(className)}`} key={className} title={className}>
                <ClassIcon className={className} size={28} />
              </a>
            ))}
          </div>
        </section>

        <AdminArchetypeTable archetypes={filtered} />

        <section className="rounded-md border border-amber-200 bg-amber-50 p-4">
          <h2 className="font-bold text-amber-950">その他デッキの再分類</h2>
          <p className="mt-2 text-sm leading-6 text-amber-950">
            再分類は一括更新になるため、次段階では「その他デッキの対象件数を確認 → 移動先標準デッキを選択 → 確認画面 → 実行」の順に実装します。
            DBには `matches.opponent_archetype_id` が入っているため、安全確認後に対象matchだけを新しい標準デッキIDへ更新できます。
          </p>
        </section>
      </div>
    </main>
  );
}
