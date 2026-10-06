import { TierEditor } from "@/components/creator/TierEditor";
import { requireCreatorPage, getCreatorData } from "@/lib/creator/server";
import { newTierDocument } from "@/lib/creator/model";

export const metadata = { title: "Tier表メーカー", robots: { index: false, follow: false } };
export default async function TierPage() {
  const { client } = await requireCreatorPage();
  try {
    const data = await getCreatorData(client);
    return <TierEditor initial={data} initialDocument={newTierDocument()} />;
  } catch {
    return <main className="mx-auto max-w-3xl p-6"><h1 className="text-2xl font-bold">Tier表メーカー</h1><p role="alert" className="mt-4">制作データを取得できませんでした。接続と制作ツール用migrationの適用状況を確認し、ページを再読み込みしてください。</p><a href="/admin?section=tools" className="mt-4 inline-block underline">管理画面へ戻る</a></main>;
  }
}
