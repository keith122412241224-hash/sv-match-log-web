import { TierEditor } from "@/components/creator/TierEditor";
import { requireCreatorPage, getCreatorData } from "@/lib/creator/server";
import { newTierDocument } from "@/lib/creator/model";
export const metadata = { title: "共通画像ライブラリ", robots: { index: false, follow: false } };
export default async function Page() {
  const { client } = await requireCreatorPage();
  return <TierEditor initial={await getCreatorData(client)} initialDocument={newTierDocument()} libraryOnly />;
}
