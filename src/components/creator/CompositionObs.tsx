import { notFound } from "next/navigation";
import { CreatorError, requireCreatorPage } from "@/lib/creator/server";
import { getCorrelationWork, getObsSet } from "@/lib/creator/independent-server";
import { TierPreview } from "./TierPreview";
import { CorrelationCanvas } from "./CorrelationCanvas";
import { ObsEnvironmentSection } from "./ObsEnvironmentSection";

export async function CompositionObs({ id, standalone = false, transparent, view }: { id: string; standalone?: boolean; transparent: boolean; view?: unknown }) {
  const { client } = await requireCreatorPage();
  try {
    const data = standalone ? { tier: null, correlation: await getCorrelationWork(client, id), set: null, contents: ["correlation"] } : await getObsSet(client, id, { view });
    return <main style={{ width: "100%", background: transparent ? "transparent" : "#0f172a" }}>
      <style>{`html,body{background:${transparent ? "transparent" : "#0f172a"} !important;scrollbar-width:none;}body::-webkit-scrollbar{display:none;}`}</style>
      {data.contents.map(content => content === "environment" && data.set ? <section key={content} aria-label="環境データ" data-obs-section="environment"><ObsEnvironmentSection set={data.set} /></section>
        : content === "tier" && data.tier ? <section key={content} aria-label="Tier表" data-obs-section="tier"><TierPreview document={data.tier.work.document} images={data.tier.images} transparent={transparent} obs /></section>
        : content === "correlation" && data.correlation ? <section key={content} aria-label="相関図" data-obs-section="correlation"><CorrelationCanvas document={data.correlation.correlation.document} images={data.correlation.images} title={data.correlation.correlation.document.title ?? ""} displayNames={data.correlation.displayNames} transparent={transparent} /></section> : null)}
    </main>;
  } catch (e) { if (e instanceof CreatorError && [400,404].includes(e.status)) notFound(); throw e; }
}
