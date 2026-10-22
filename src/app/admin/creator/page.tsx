import Link from "next/link";
import { requireCreatorPage } from "@/lib/creator/server";

export const metadata = { title: "クリエイターツール", robots: { index: false, follow: false } };
export default async function CreatorPage() {
  await requireCreatorPage();
  const tools = [
    { title: "Tier表メーカー", href: "/admin/creator/tier", description: "Tier表を作成・編集し、PNG・OBSで利用できます。" },
    { title: "相関図メーカー", href: "/admin/creator/correlation", description: "相関図を単独で作成・編集できます。Tier表の画像を引き継いで作ることもできます。" },
    { title: "OBS表示セット", href: "/admin/creator/obs-sets", description: "保存済みのTier表と相関図を自由に組み合わせて表示します。" }
  ];
  return <main className="mx-auto grid max-w-4xl gap-6 p-5"><Link href="/admin?section=tools">← 管理画面</Link><h1 className="text-2xl font-bold">クリエイターツール</h1>{tools.map(tool=><section key={tool.href} className="min-w-0 rounded-xl border bg-white p-6"><h2 className="text-xl font-bold">{tool.title}</h2><p className="my-3 text-sm text-muted">{tool.description}</p><Link href={tool.href} className="inline-flex min-h-11 items-center rounded bg-ink px-4 text-white">{tool.title}を開く</Link></section>)}</main>;
}
