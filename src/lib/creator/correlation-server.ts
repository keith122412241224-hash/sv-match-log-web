import { notFound } from "next/navigation";
import { creatorClient, databaseError } from "./server";
import { UUID, type CreatorImage, type TierWork } from "./model";
import { parseCorrelation, type CorrelationWork } from "./correlation";

export async function getCorrelationSet(client: Awaited<ReturnType<typeof creatorClient>>["client"], tierId: string) {
  if (!UUID.test(tierId)) notFound();
  const [tier, correlation, images] = await Promise.all([
    client.from("creator_tier_works").select("*").eq("id", tierId).maybeSingle(),
    client.from("creator_correlations").select("*").eq("tier_work_id", tierId).maybeSingle(),
    client.from("creator_images").select("*").order("created_at", { ascending: false })
  ]);
  [tier,correlation,images].forEach(r => databaseError(r.error));
  if (!tier.data) notFound();
  return { tier: tier.data as TierWork, correlation: correlation.data ? { ...correlation.data, document: parseCorrelation(correlation.data.document) } as CorrelationWork : null, images: (images.data ?? []) as CreatorImage[] };
}
