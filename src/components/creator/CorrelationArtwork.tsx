/* eslint-disable @next/next/no-img-element */
import { imageUrl, type CreatorImage } from "@/lib/creator/model";
import { edgeGeometry, type CorrelationDocument } from "@/lib/creator/correlation";

export function CorrelationArtwork({ document: doc, title, images, transparent = false }: { document: CorrelationDocument; title: string; images: CreatorImage[]; transparent?: boolean }) {
  const byId = new Map(images.map(image => [image.id,image]));
  const nodes = new Map(doc.nodes.map(node => [node.id,node]));
  const titleUnits = Array.from(title).reduce((sum,c) => sum + (c.charCodeAt(0) < 128 ? 0.65 : 1),0);
  return <div data-correlation-artwork style={{ position: "relative", width: 1920, height: 1080, overflow: "hidden", background: transparent ? "transparent" : "#0f172a", color: "#f8fafc", fontFamily: 'Arial, "Noto Sans JP", "Yu Gothic", sans-serif' }}>
    {doc.showTitle && <div style={{ position: "absolute", left: 48, top: 32, width: 1824, height: 72, fontSize: Math.min(40,1780 / Math.max(1,titleUnits)), fontWeight: 700, whiteSpace: "nowrap" }}>{title}</div>}
    <svg aria-label="手動の相性矢印" width="1920" height="1080" viewBox="0 0 1920 1080" style={{ position: "absolute", inset: 0, overflow: "hidden" }}>
      {doc.edges.filter(e => e.visible).map(edge => {
        const source = nodes.get(edge.sourceNodeId), target = nodes.get(edge.targetNodeId);
        const geometry = source && target ? edgeGeometry(source,target) : null;
        if (!geometry) return null;
        return <g key={edge.id} data-edge-id={edge.id}>
          <line x1={geometry.start.x} y1={geometry.start.y} x2={geometry.end.x} y2={geometry.end.y} stroke="#38bdf8" strokeWidth="4" />
          <polygon points={geometry.points} fill="#38bdf8" />
          {edge.label && <text x={geometry.label.x} y={geometry.label.y} textAnchor="middle" fill="#f8fafc" stroke="#0f172a" strokeWidth="5" paintOrder="stroke" fontSize="24" fontWeight="700">{edge.label}</text>}
        </g>;
      })}
    </svg>
    {doc.nodes.map(node => {
      const image = byId.get(node.imageId);
      const labelHeight = doc.showNames ? Math.min(30,node.height * 0.25) : 0;
      return <div key={node.id} data-artwork-node={node.id} style={{ position: "absolute", left: node.x, top: node.y, width: node.width, height: node.height }}>
        {image ? <img alt={image.name} src={imageUrl(image)} width={node.width} height={node.height - labelHeight} draggable={false} style={{ width: node.width, height: node.height - labelHeight, objectFit: "contain" }} /> : <span>画像なし</span>}
        {doc.showNames && <div style={{ height: labelHeight, lineHeight: `${labelHeight}px`, fontSize: Math.max(8,Math.min(20,labelHeight * 0.7)), textAlign: "center", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", color: "#f8fafc", textShadow: "0 1px 3px #0f172a, 1px 0 3px #0f172a" }}>{image?.name ?? "画像なし"}</div>}
      </div>;
    })}
  </div>;
}
