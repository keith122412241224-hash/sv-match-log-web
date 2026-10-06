import Link from "next/link";
import { requireCreatorPage } from "@/lib/creator/server";

export const metadata = { title: "クリエイターツール", robots: { index: false, follow: false } };
export default async function CreatorPage() {
  await requireCreatorPage();
  return <main className="mx-auto grid max-w-4xl gap-6 p-5"><Link href="/admin?section=tools">← 管理画面</Link><h1 className="text-2xl font-bold">クリエイターツール</h1><section className="rounded-xl border bg-white p-6"><h2 className="text-xl font-bold">Tier表メーカー</h2><p className="my-3 text-sm text-muted">共通画像ライブラリからTier表を作成し、PNG・OBSで利用できます。</p><Link href="/admin/creator/tier" className="inline-flex min-h-11 items-center rounded bg-ink px-4 text-white">Tier表メーカーを開く</Link></section></main>;
}
