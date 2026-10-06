/* eslint-disable @next/next/no-img-element */
import { imageUrl, tierLayout, tierImagePosition, tierTextColor, type CreatorImage, type TierDocument } from "@/lib/creator/model";

/** The only artwork renderer: editor preview, PNG and OBS all use this DOM. */
export function TierArtwork({ document: doc, images, transparent = false }: { document: TierDocument; images: CreatorImage[]; transparent?: boolean }) {
  const layout = tierLayout(doc);
  const byId = new Map(images.map(image => [image.id, image]));
  const titleUnits = Array.from(doc.title).reduce((sum, char) => sum + (char.charCodeAt(0) < 128 ? 0.65 : 1), 0);
  return <div data-tier-artwork style={{ width: 1920, height: 1080, padding: 48, overflow: "hidden", background: transparent ? "transparent" : "#0f172a", color: "#f8fafc", fontFamily: 'Arial, "Noto Sans JP", "Yu Gothic", sans-serif', boxSizing: "border-box" }}>
    {doc.showTitle && <div style={{ height: 72, fontSize: Math.min(40, 1780 / Math.max(1, titleUnits)), fontWeight: 700, whiteSpace: "nowrap", overflow: "hidden" }}>{doc.title}</div>}
    <div style={{ width: 1824, transform: `scale(${layout.scale})`, transformOrigin: "top center", display: "grid", gap: 8 }}>
      {doc.rows.map((row, rowIndex) => <div key={row.id} style={{ display: "flex", height: layout.heights[rowIndex], borderRadius: 8, overflow: "hidden", background: "#1e293b" }}>
        <div style={{ width: 160, flexShrink: 0, background: row.color, color: tierTextColor(row.color), padding: 12, display: "flex", alignItems: "center", justifyContent: "center", textAlign: "center", fontSize: Math.min(28, Math.floor(Math.sqrt(136 * (layout.heights[rowIndex] - 24) / Math.max(1, row.name.length)) * 0.8)), lineHeight: 1.2, fontWeight: 700, overflowWrap: "anywhere" }}>{row.name}</div>
        <div style={{ position: "relative", flex: 1 }}>
          {row.imageIds.map((id, index) => {
            const image = byId.get(id);
            const frame = tierImagePosition(layout,index);
            return image ? <img key={`${id}-${index}`} alt={image.name} src={imageUrl(image)} width={layout.imageSize} height={layout.imageSize} loading="eager" style={{ position: "absolute", ...frame, objectFit: "contain" }} /> : <div key={`${id}-${index}`} style={{ position: "absolute", ...frame, fontSize: 16, padding: 8 }}>画像が見つかりません</div>;
          })}
        </div>
      </div>)}
    </div>
  </div>;
}
