"use client";
/* eslint-disable @next/next/no-img-element */
import { useCallback, useState } from "react";
import { imageUrl, tierLayout, tierImagePosition, tierTextColor, type CreatorImage, type TierDocument } from "@/lib/creator/model";

/** The only artwork renderer: editor preview, PNG and OBS all use this DOM. */
type ArtworkProps = { document: TierDocument; images: CreatorImage[]; transparent?: boolean };
export function useTierImageLayout(doc: TierDocument, images: CreatorImage[]) {
  const [dimensions, setDimensions] = useState<Record<string, number>>({});
  const used = new Set(doc.rows.flatMap(row => row.imageIds));
  const relevant = images.filter(image => used.has(image.id));
  const ratios = Object.fromEntries(relevant.map(image => [image.id, dimensions[imageUrl(image)]]));
  const ready = relevant.every(image => dimensions[imageUrl(image)] !== undefined);
  const onImageLoad = useCallback((image: HTMLImageElement | null) => {
    if (!image?.complete) return;
    const key = image.getAttribute("src")!;
    const ratio = image.naturalWidth && image.naturalHeight ? image.naturalWidth / image.naturalHeight : 1;
    setDimensions(previous => previous[key] === ratio ? previous : { ...previous, [key]: ratio });
  }, []);
  return { layout: tierLayout(doc, ratios), ready, onImageLoad };
}
export function TierArtwork(props: ArtworkProps) {
  const resolved = useTierImageLayout(props.document, props.images);
  return <TierArtworkView {...props} {...resolved} />;
}
export function TierArtworkView({ document: doc, images, transparent = false, layout, ready, onImageLoad }: ArtworkProps & ReturnType<typeof useTierImageLayout>) {
  const byId = new Map(images.map(image => [image.id, image]));
  const titleUnits = Array.from(doc.title).reduce((sum, char) => sum + (char.charCodeAt(0) < 128 ? 0.65 : 1), 0);
  return <div data-tier-artwork data-layout-ready={ready} style={{ width: 1920, height: 1080, padding: 48, overflow: "hidden", background: transparent ? "transparent" : "#0f172a", color: "#f8fafc", fontFamily: 'Arial, "Noto Sans JP", "Yu Gothic", sans-serif', boxSizing: "border-box" }}>
    {doc.showTitle && <div style={{ height: 72, fontSize: Math.min(40, 1780 / Math.max(1, titleUnits)), fontWeight: 700, whiteSpace: "nowrap", overflow: "hidden" }}>{doc.title}</div>}
    <div style={{ width: 1824, transform: `scale(${layout.scale})`, transformOrigin: "top center", display: "grid", gap: 8 }}>
      {doc.rows.map((row, rowIndex) => <div key={row.id} style={{ display: "flex", height: layout.heights[rowIndex], borderRadius: 8, overflow: "hidden", background: "#1e293b" }}>
        <div style={{ width: 160, flexShrink: 0, background: row.color, color: tierTextColor(row.color), padding: 12, display: "flex", alignItems: "center", justifyContent: "center", textAlign: "center", fontSize: Math.min(28, Math.floor(Math.sqrt(136 * (layout.heights[rowIndex] - 24) / Math.max(1, row.name.length)) * 0.8)), lineHeight: 1.2, fontWeight: 700, overflowWrap: "anywhere" }}>{row.name}</div>
        <div style={{ position: "relative", flex: 1 }}>
          {row.imageIds.map((id, index) => {
            const image = byId.get(id);
            const frame = tierImagePosition(layout,index,rowIndex);
            return image ? <img key={`${id}-${index}`} data-tier-row={rowIndex} data-tier-index={index} alt={image.name} src={imageUrl(image)} width={frame.width} height={frame.height} ref={onImageLoad} onLoad={event => onImageLoad(event.currentTarget)} onError={event => onImageLoad(event.currentTarget)} loading="eager" style={{ position: "absolute", ...frame, visibility: ready ? "visible" : "hidden", objectFit: "contain" }} /> : <div key={`${id}-${index}`} style={{ position: "absolute", ...frame, fontSize: 16, padding: 8 }}>画像が見つかりません</div>;
          })}
        </div>
      </div>)}
    </div>
  </div>;
}
