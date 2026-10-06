import { redirect } from "next/navigation";
import { requireCreatorPage } from "@/lib/creator/server";
import { getCorrelationSet } from "@/lib/creator/correlation-server";
import { CorrelationEditor } from "@/components/creator/CorrelationEditor";

export const metadata = { title: "相関図を編集", robots: { index: false, follow: false } };
export default async function CorrelationPage({ params }: { params: Promise<{ id: string }> }) {
  const { client } = await requireCreatorPage();
  const { id } = await params;
  const data = await getCorrelationSet(client,id);
  if (!data.correlation) redirect(`/admin/creator/tier?work=${id}`);
  return <CorrelationEditor tier={data.tier} initial={data.correlation} images={data.images} />;
}
