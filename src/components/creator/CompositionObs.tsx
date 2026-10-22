import { notFound } from "next/navigation";
import { CreatorError, requireCreatorPage } from "@/lib/creator/server";
import { getCorrelationWork, getObsSet } from "@/lib/creator/independent-server";
import { TierPreview } from "./TierPreview";
import { CorrelationCanvas } from "./CorrelationCanvas";

export async function CompositionObs({ id, standalone = false, transparent }: { id: string; standalone?: boolean; transparent: boolean }) {
  const { client } = await requireCreatorPage();
  try {
    const data = standalone ? { tier: null, correlation: await getCorrelationWork(client, id) } : await getObsSet(client, id);
    return <main style={{ width: "100%", background: transparent ? "transparent" : "#0f172a" }}>
      <style>{`html,body{background:${transparent ? "transparent" : "#0f172a"} !important;scrollbar-width:none;}body::-webkit-scrollbar{display:none;}`}</style>
      {data.tier && <section aria-label="Tier表" data-obs-section="tier"><TierPreview document={data.tier.work.document} images={data.tier.images} transparent={transparent} obs /></section>}
      {data.correlation && <section aria-label="相関図" data-obs-section="correlation"><CorrelationCanvas document={data.correlation.correlation.document} images={data.correlation.images} title={data.correlation.correlation.document.title ?? ""} displayNames={data.correlation.displayNames} transparent={transparent} /></section>}
    </main>;
  } catch (e) { if (e instanceof CreatorError && [400,404].includes(e.status)) notFound(); throw e; }
}
