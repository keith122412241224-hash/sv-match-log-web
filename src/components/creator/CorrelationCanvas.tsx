"use client";
import { useEffect, useRef, useState } from "react";
import type { CreatorImage } from "@/lib/creator/model";
import { boundNode, type CorrelationDocument, type CorrelationNode } from "@/lib/creator/correlation";
import { CorrelationArtwork } from "./CorrelationArtwork";

export function CorrelationCanvas({ document, images, title, displayNames = {}, transparent = false, selectedId, onSelect, onMove, disabled = false }: {
  document: CorrelationDocument; images: CreatorImage[]; title: string; displayNames?: Record<string,string>; transparent?: boolean;
  selectedId?: string; onSelect?: (id: string) => void; onMove?: (node: CorrelationNode) => void; disabled?: boolean;
}) {
  const host = useRef<HTMLDivElement>(null);
  const [width,setWidth] = useState(0);
  const drag = useRef<{ node: CorrelationNode; x: number; y: number; scale: number } | null>(null);
  useEffect(() => {
    const observer = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width));
    if (host.current) observer.observe(host.current);
    return () => observer.disconnect();
  },[]);
  return <div ref={host} data-correlation-canvas style={{ width: "100%", aspectRatio: "16 / 9", position: "relative", overflow: "hidden" }}>
    <div style={{ position: "absolute", top: 0, left: 0, width: 1920, height: 1080, transform: `scale(${width / 1920})`, transformOrigin: "top left" }}>
      <CorrelationArtwork document={document} images={images} displayNames={displayNames} title={title} transparent={transparent} />
      {onSelect && document.nodes.map(node => <button type="button" key={node.id} data-node-id={node.id} aria-label={`ノード：${displayNames[node.imageId] ?? images.find(image => image.id === node.imageId)?.name ?? "画像"}`} aria-pressed={selectedId === node.id} disabled={disabled}
        style={{ position: "absolute", left: node.x, top: node.y, width: node.width, height: node.height, minHeight: 0, padding: 0, borderRadius: 4, border: selectedId === node.id ? "4px solid #fbbf24" : "2px dashed transparent", background: "transparent", cursor: "grab", touchAction: "none" }}
        onClick={() => onSelect(node.id)}
        onKeyDown={e => {
          const step = e.shiftKey ? 10 : 1;
          const delta = { ArrowLeft: [-step,0], ArrowRight: [step,0], ArrowUp: [0,-step], ArrowDown: [0,step] }[e.key];
          if (delta) { e.preventDefault(); onMove?.(boundNode(node,{ x: node.x + delta[0], y: node.y + delta[1] })); }
        }}
        onPointerDown={e => {
          if (e.button !== 0 || disabled) return;
          onSelect(node.id); e.currentTarget.setPointerCapture(e.pointerId);
          drag.current = { node, x: e.clientX, y: e.clientY, scale: (host.current?.getBoundingClientRect().width ?? 1920) / 1920 };
        }}
        onPointerMove={e => {
          const d = drag.current;
          if (d && e.currentTarget.hasPointerCapture(e.pointerId) && d.scale > 0) onMove?.(boundNode(d.node,{ x: Math.round(d.node.x + (e.clientX - d.x) / d.scale), y: Math.round(d.node.y + (e.clientY - d.y) / d.scale) }));
        }}
        onPointerUp={() => { drag.current = null; }} onPointerCancel={() => { drag.current = null; }} onLostPointerCapture={() => { drag.current = null; }}
      />)}
    </div>
  </div>;
}
