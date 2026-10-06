"use client";
import { useEffect, useRef, useState } from "react";
import { TierArtwork } from "./TierArtwork";
import type { CreatorImage, TierDocument } from "@/lib/creator/model";

export function TierPreview({ document, images, transparent = false, obs = false }: { document: TierDocument; images: CreatorImage[]; transparent?: boolean; obs?: boolean }) {
  const host = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  useEffect(() => {
    if (!host.current) return;
    const observer = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width));
    observer.observe(host.current);
    return () => observer.disconnect();
  }, []);
  return <div ref={host} data-tier-preview style={{ width: "100%", maxWidth: obs ? undefined : 1920, aspectRatio: "16 / 9", overflow: "hidden", position: "relative" }}>
    <div style={{ position: "absolute", top: 0, left: 0, transform: `scale(${width / 1920})`, transformOrigin: "top left" }}>
      <TierArtwork document={document} images={images} transparent={transparent} />
    </div>
  </div>;
}
