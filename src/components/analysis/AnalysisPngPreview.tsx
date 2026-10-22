"use client";

import { PngSharePreview } from "@/components/PngSharePreview";
import type { AnalysisPng } from "@/lib/analysis-png";

export function AnalysisPngPreview({ title, png, first, onClose }: {
  title: string; png: AnalysisPng; first: File; onClose: () => void;
}) {
  return <PngSharePreview title={title} png={png} first={first} onClose={onClose} dialogTitle="分析画像の保存" />;
}
