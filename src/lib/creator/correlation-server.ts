import { notFound } from "next/navigation";
import { creatorClient, databaseError, getCreatorImages, getCreatorDisplayNames } from "./server";
import { UUID, parseTierDocument, type TierWork } from "./model";
import { parseCorrelation, type CorrelationWork } from "./correlation";

export async function getCorrelationSet(client: Awaited<ReturnType<typeof creatorClient>>["client"], tierId: string) {
  if (!UUID.test(tierId)) notFound();
  const [tier, correlation] = await Promise.all([
    client.from("creator_tier_works").select("*").eq("id", tierId).maybeSingle(),
    client.from("creator_correlations").select("*").eq("tier_work_id", tierId).maybeSingle()
  ]);
  [tier,correlation].forEach(r => databaseError(r.error));
  if (!tier.data) notFound();
  const work = { ...tier.data, document: parseTierDocument(tier.data.document) } as TierWork;
  const linked = correlation.data ? { ...correlation.data, document: parseCorrelation(correlation.data.document, work.document.title) } as CorrelationWork : null;
  const images = await getCreatorImages(client, [...work.document.rows.flatMap(r => r.imageIds), ...linked?.document.nodes.map(n => n.imageId) ?? []]);
  return { tier: work, correlation: linked, images, displayNames: await getCreatorDisplayNames(client, images) };
}
