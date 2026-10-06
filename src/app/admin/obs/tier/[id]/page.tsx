import { notFound } from "next/navigation";
import { requireCreatorPage, databaseError } from "@/lib/creator/server";
import { UUID, parseTierDocument, type CreatorImage } from "@/lib/creator/model";
import { TierPreview } from "@/components/creator/TierPreview";

export const metadata = { title: "OBS Tier表", robots: { index: false, follow: false } };
export default async function ObsTierPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ transparent?: string }> }) {
  const { client } = await requireCreatorPage();
  const [{ id }, query] = await Promise.all([params, searchParams]);
  if (!UUID.test(id)) notFound();
  const work = await client.from("creator_tier_works").select("document").eq("id", id).maybeSingle();
  databaseError(work.error);
  if (!work.data) notFound();
  const document = parseTierDocument(work.data.document);
  const ids = [...new Set(document.rows.flatMap(r => r.imageIds))];
  const images = ids.length ? await client.from("creator_images").select("*").in("id", ids) : { data: [], error: null };
  databaseError(images.error);
  const transparent = query.transparent === "1";
  return <main style={{ minHeight: "100vh", background: transparent ? "transparent" : "#0f172a" }}>
    <style>{`html,body{background:${transparent ? "transparent" : "#0f172a"} !important;}`}</style>
    <TierPreview document={document} images={(images.data ?? []) as CreatorImage[]} transparent={transparent} obs />
  </main>;
}
