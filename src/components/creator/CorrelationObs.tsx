import { CorrelationCanvas } from "./CorrelationCanvas";
import { TierPreview } from "./TierPreview";
import { getCorrelationSet } from "@/lib/creator/correlation-server";
import { requireCreatorPage } from "@/lib/creator/server";
import { notFound } from "next/navigation";

export async function CorrelationObs({ tierId, transparent, standalone = false }: { tierId: string; transparent: boolean; standalone?: boolean }) {
  const { client } = await requireCreatorPage();
  const data = await getCorrelationSet(client,tierId);
  if (!data.correlation) notFound();
  return <main style={{ width: "100%", background: transparent ? "transparent" : "#0f172a" }}>
    <style>{`html,body{background:${transparent ? "transparent" : "#0f172a"} !important;scrollbar-width:none;}body::-webkit-scrollbar{display:none;}`}</style>
    {!standalone && <section aria-label="Tier表" data-obs-section="tier"><TierPreview document={data.tier.document} images={data.images} transparent={transparent} obs /></section>}
    <section aria-label="相関図" data-obs-section="correlation"><CorrelationCanvas document={data.correlation.document} title={data.tier.document.title} images={data.images} transparent={transparent} /></section>
  </main>;
}
