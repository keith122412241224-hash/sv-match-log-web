import Link from "next/link";
import { redirect } from "next/navigation";
import { ThemeSelect } from "@/components/ThemeProvider";
import { ReviewWorkspace } from "@/components/environment-review/ReviewWorkspace";
import { MemberReleaseControls, type MemberRelease } from "@/components/environment-review/MemberReleaseControls";
import { ReviewReport } from "@/components/environment-review/ReviewReport";
import { creatorClient } from "@/lib/creator/server";
import { checkDb, publicationFor } from "@/lib/environment-review/workflow";
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
  const name = environments.find(e => e.id === environment)?.name ?? "";
  let trial = null, member: MemberRelease | null = null;
  if (environment && report) {
    const { client } = await creatorClient();
    const [publication, release] = await Promise.all([
      publicationFor(client,environment),
      client.from("environment_review_member_releases").select("edition,run_id,source_published_at,active").eq("environment_id",environment).maybeSingle()
    ]);
    checkDb(release.error);
    trial = publication;
    member = release.data;
  }
  return <main className="min-h-screen bg-surface px-4 py-6 text-ink"><div className="mx-auto grid max-w-6xl gap-5">
    <header className="flex flex-wrap items-center justify-between gap-3"><h1 className="text-2xl font-bold">総合環境評価管理</h1><div className="flex items-center gap-3"><Link href="/admin?section=tools" className="text-sm underline">運用ツールへ戻る</Link><ThemeSelect /></div></header>
    <form className="flex items-end gap-2" action="/admin/environment-review"><label className="grid gap-1 text-sm font-bold">対象環境<select name="environment" className="min-h-11 rounded-md border border-slate-300 bg-white px-3" defaultValue={environment}>{environments.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}</select></label><button className="min-h-11 rounded-md border border-slate-300 bg-white px-3">表示</button></form>
    {environment ? <><p className="text-sm">編集画面で確定した版は、「確定版の確認・会員公開」で承認すると会員に表示されます。</p>
      <Link className="w-fit underline" href={{pathname:"/admin/environment-review",query:{environment,...(report ? {} : {view:"report"})}}}>
        {report ? "編集画面に戻る" : "確定版の確認・会員公開"}</Link>
      {report ? <section aria-label="管理者限定の公開版">{trial ? <ReviewReport publication={trial}/> : <h2 className="font-bold">評価準備中</h2>}
        <MemberReleaseControls environment={environment} name={name} trial={trial && {run_id:trial.run_id,as_of:trial.as_of,published_at:trial.published_at}} member={member}/></section> :
        <ReviewWorkspace key={environment} environment={environment} environmentName={name}/>}</> : <p>選択できる環境がありません。</p>}
  </div></main>;
}
