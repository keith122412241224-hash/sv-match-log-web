/* eslint-disable @next/next/no-img-element */
import { imageUrl, type CreatorImage } from "@/lib/creator/model";
import { correlationEdgeLabel, correlationNameStyle } from "@/lib/creator/correlation-display";
import { edgeGeometry, type CorrelationDocument } from "@/lib/creator/correlation";

export function CorrelationArtwork({ document: doc, title: legacyTitle, images, displayNames = {}, transparent = false }: { document: CorrelationDocument; title: string; images: CreatorImage[]; displayNames?: Record<string, string>; transparent?: boolean }) {
  const title = doc.title ?? legacyTitle;
  const byId = new Map(images.map(image => [image.id,image]));
  const nodes = new Map(doc.nodes.map(node => [node.id,node]));
  const titleUnits = Array.from(title).reduce((sum,c) => sum + (c.charCodeAt(0) < 128 ? 0.65 : 1),0);
  return <div data-correlation-artwork style={{ position: "relative", width: 1920, height: 1080, overflow: "hidden", background: transparent ? "transparent" : "#0f172a", color: "#f8fafc", fontFamily: 'Arial, "Noto Sans JP", "Yu Gothic", sans-serif' }}>
    {doc.showTitle && <div style={{ position: "absolute", left: 48, top: 32, width: 1824, height: 72, fontSize: Math.min(40,1780 / Math.max(1,titleUnits)), fontWeight: 700, whiteSpace: "nowrap" }}>{title}</div>}
    {doc.edges.some(edge => edge.visible && edge.type !== "bidirectional") && <div data-correlation-legend style={{ position: "absolute", left: 48, top: doc.showTitle ? 100 : 32, fontSize: 28, lineHeight: "36px", color: "#cbd5e1" }}><span>矢印方向：有利側 → 不利側</span><span style={{ fontSize: 22 }}>（片方向のみ）</span></div>}
    <svg aria-label="手動の相性矢印" width="1920" height="1080" viewBox="0 0 1920 1080" style={{ position: "absolute", inset: 0, overflow: "hidden" }}>
      {doc.edges.filter(e => e.visible).map(edge => {
        const source = nodes.get(edge.sourceNodeId), target = nodes.get(edge.targetNodeId);
        const geometry = source && target ? edgeGeometry(source,target) : null;
        if (!geometry) return null;
        const label = doc.showLabels !== false ? correlationEdgeLabel(edge.label) : "";
        return <g key={edge.id} data-edge-id={edge.id}>
          <line x1={geometry.start.x} y1={geometry.start.y} x2={geometry.end.x} y2={geometry.end.y} stroke="#38bdf8" strokeWidth="4" />
          <polygon points={geometry.points} fill="#38bdf8" />
          {edge.type === "bidirectional" && <polygon points={edgeGeometry(target!,source!)!.points} fill="#38bdf8" />}
          {label && <text x={geometry.label.x} y={geometry.label.y} textAnchor="middle" fill="#f8fafc" stroke="#0f172a" strokeWidth="5" paintOrder="stroke" fontSize="24" fontWeight="700">{label}</text>}
          {doc.showStats !== false && (edge.winRate != null || edge.matchCount != null) && <text x={geometry.label.x} y={geometry.label.y + (label ? 46 : 0)} textAnchor="middle" fill="#f8fafc" stroke="#0f172a" strokeWidth="5" paintOrder="stroke" fontSize="24" fontWeight="700">{[edge.winRate != null ? `${edge.winRate}%` : null,edge.matchCount != null ? `${edge.matchCount}戦` : null].filter(v=>v!==null).join(" / ")}</text>}
        </g>;
      })}
    </svg>
    {doc.nodes.map(node => {
      const image = byId.get(node.imageId);
      const name = displayNames[node.imageId] ?? image?.name ?? "画像なし";
      const nameStyle = correlationNameStyle(name, node.width, node.height);
      const labelHeight = doc.showNames ? nameStyle.labelHeight : 0;
      return <div key={node.id} data-artwork-node={node.id} style={{ position: "absolute", left: node.x, top: node.y, width: node.width, height: node.height }}>
        {image ? <img alt={name} src={imageUrl(image)} width={node.width} height={node.height - labelHeight} draggable={false} style={{ display: "block", width: node.width, height: node.height - labelHeight, objectFit: "contain" }} /> : <span>画像なし</span>}
        {doc.showNames && <div data-correlation-name style={{ height: labelHeight, padding: "2px 4px", boxSizing: "border-box", display: "flex", alignItems: "center", justifyContent: "center", lineHeight: 1.2, fontSize: nameStyle.fontSize, textAlign: "center", whiteSpace: "normal", textWrap: "balance", lineBreak: "strict", overflowWrap: "anywhere", color: "#f8fafc", textShadow: "0 1px 3px #0f172a, 1px 0 3px #0f172a" }}>{name}</div>}
      </div>;
    })}
  </div>;
}
