import { notFound } from "next/navigation";
import { CreatorError, requireCreatorPage, getCreatorImagePage } from "@/lib/creator/server";
import { getCorrelationWork } from "@/lib/creator/independent-server";
import { CorrelationEditor } from "@/components/creator/CorrelationEditor";
import { getEnvironments } from "@/lib/data";
import { selectInitialEnvironmentId } from "@/lib/environment-selection";
export const metadata = { title: "相関図メーカー", robots: { index: false, follow: false } };
export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { client } = await requireCreatorPage();
  const { id } = await params;
  try {
    const [data, library, environments] = await Promise.all([id === "new" ? null : getCorrelationWork(client, id), getCreatorImagePage(client), getEnvironments()]);
    return <CorrelationEditor tier={data?.tier ?? null} initial={data?.correlation ?? null} images={data?.images ?? []} library={library} displayNames={data?.displayNames} environments={environments.map(e=>({id:e.id,name:e.name}))} defaultEnvironment={selectInitialEnvironmentId(environments)} />;
  } catch (e) { if (e instanceof CreatorError && [400,404].includes(e.status)) notFound(); throw e; }
}
