import { notFound } from "next/navigation";
import { CreatorError, requireCreatorPage, getCreatorWorkPage } from "@/lib/creator/server";
import { getCorrelationPage, getObsSet, getObsSetPage } from "@/lib/creator/independent-server";
import { ObsSetEditor } from "@/components/creator/ObsSetEditor";
import { getEnvironments } from "@/lib/data";
export const metadata = { title: "OBS表示管理", robots: { index: false, follow: false } };
export default async function Page({ searchParams }: { searchParams: Promise<{ set?: string }> }) {
  const { client } = await requireCreatorPage();
  const { set } = await searchParams;
  try {
    const [sets, tiers, correlations, selection, environments] = await Promise.all([getObsSetPage(client), getCreatorWorkPage(client), getCorrelationPage(client), set === undefined ? null : getObsSet(client,set), getEnvironments()]);
    return <ObsSetEditor initial={{sets,tiers,correlations,selection}} environments={environments} />;
  } catch(e) { if(e instanceof CreatorError && [400,404].includes(e.status)) notFound(); throw e; }
}
