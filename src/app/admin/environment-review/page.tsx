import Link from "next/link";
import { redirect } from "next/navigation";
import { ThemeSelect } from "@/components/ThemeProvider";
import { ReviewWorkspace } from "@/components/environment-review/ReviewWorkspace";
import { ReviewTab } from "@/components/environment-review/ReviewTab";
import { getEnvironments, getIsAdmin } from "@/lib/data";
import { selectInitialEnvironmentId } from "@/lib/environment-selection";

export const metadata = { title: "総合環境評価管理" };
export const dynamic = "force-dynamic";
export default async function ReviewAdminPage({ searchParams }: { searchParams: Promise<{ environment?: string; view?: string }> }) {
  if (!await getIsAdmin()) redirect("/");
  const environments = await getEnvironments();
  const params = await searchParams;
  const report = params.view === "report";
  const environment = selectInitialEnvironmentId(environments,params.environment);
  return <main className="min-h-screen bg-surface px-4 py-6 text-ink"><div className="mx-auto grid max-w-6xl gap-5">
    <header className="flex flex-wrap items-center justify-between gap-3"><h1 className="text-2xl font-bold">総合環境評価管理</h1><div className="flex items-center gap-3"><Link href="/admin?section=tools" className="text-sm underline">運用ツールへ戻る</Link><ThemeSelect /></div></header>
    <form className="flex items-end gap-2" action="/admin/environment-review"><label className="grid gap-1 text-sm font-bold">対象環境<select name="environment" className="min-h-11 rounded-md border border-slate-300 bg-white px-3" defaultValue={environment}>{environments.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}</select></label><button className="min-h-11 rounded-md border border-slate-300 bg-white px-3">表示</button></form>
    {environment ? <><p className="text-sm">管理者限定の試験運用中です。公開操作後の評価も管理者だけが閲覧できます。</p>
      <Link className="w-fit underline" href={{pathname:"/admin/environment-review",query:{environment,...(report ? {} : {view:"report"})}}}>
        {report ? "編集画面に戻る" : "公開版の表示を確認"}</Link>
      {report ? <section aria-label="管理者限定の公開版"><ReviewTab key={environment} environment={environment}/></section> :
        <ReviewWorkspace key={environment} environment={environment}/>}</> : <p>選択できる環境がありません。</p>}
  </div></main>;
}
