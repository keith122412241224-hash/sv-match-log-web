import { requireCreatorPage } from "@/lib/creator/server";
import { getCorrelationPage } from "@/lib/creator/independent-server";
import { CorrelationList } from "@/components/creator/CorrelationList";
export const metadata = { title: "相関図メーカー", robots: { index: false, follow: false } };
export default async function Page() {
  const { client } = await requireCreatorPage();
  return <CorrelationList initial={await getCorrelationPage(client)} />;
}
