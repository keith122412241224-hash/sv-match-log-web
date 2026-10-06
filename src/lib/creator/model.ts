export const MAX_IMAGE_BYTES = 4 * 1024 * 1024;
export const IMAGE_BUCKET = "creator-images";
export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export type TierRow = { id: string; name: string; color: string; imageIds: string[] };
export type TierDocument = { version: 1; title: string; showTitle: boolean; rows: TierRow[] };
export type TierWork = { id: string; document: TierDocument; revision: number; updated_at: string };
export type CreatorImage = { id: string; name: string; object_path: string; archetype_id: string | null; revision: number; updated_at: string };
export const imageUrl = (image: CreatorImage, variant: "trimmed" | "original" = "trimmed") => `/admin/creator/images/${image.id}?v=${image.revision}&variant=${variant}`;
export function tierTextColor(color: string) {
  const channels = [1, 3, 5].map(i => parseInt(color.slice(i, i + 2), 16) / 255).map(c => c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722 > 0.179 ? "#000000" : "#ffffff";
}

export function newTierDocument(): TierDocument {
  return { version: 1, title: "新しいTier表", showTitle: true, rows: ["S", "A", "B", "C", "D"].map((name, i) => ({ id: crypto.randomUUID(), name, color: ["#fca5a5", "#fdba74", "#fde68a", "#86efac", "#93c5fd"][i], imageIds: [] })) };
}

export function parseTierDocument(input: unknown): TierDocument {
  const d = input as TierDocument;
  if (!d || d.version !== 1 || typeof d.title !== "string" || d.title.length > 120 || typeof d.showTitle !== "boolean" || !Array.isArray(d.rows) || !d.rows.length || d.rows.length > 30) throw Error("Tier表の形式が不正です（タイトル120文字、1〜30行）。");
  const rowIds = new Set<string>();
  let total = 0;
  const rows = d.rows.map(r => {
    if (!r || !UUID.test(r.id) || rowIds.has(r.id) || typeof r.name !== "string" || !r.name.trim() || r.name.length > 40 || !/^#[0-9a-f]{6}$/i.test(r.color) || !Array.isArray(r.imageIds) || r.imageIds.some(id => typeof id !== "string" || !UUID.test(id)) || r.imageIds.length > 100) throw Error("Tier行の形式が不正です（名前1〜40文字、画像100枚まで）。");
    rowIds.add(r.id); total += r.imageIds.length;
    return { id: r.id, name: r.name, color: r.color, imageIds: [...r.imageIds] };
  });
  if (total > 300) throw Error("画像は作品あたり300枚までです。");
  return { version: 1, title: d.title, showTitle: d.showTitle, rows };
}

export type ImageDrag = { imageId: string; rowId?: string; index?: number };
export function placeImage(doc: TierDocument, drag: ImageDrag, rowId: string, index: number): TierDocument {
  if (!doc.rows.some(r => r.id === rowId) || !UUID.test(drag.imageId)) return doc;
  const rows = doc.rows.map(r => ({ ...r, imageIds: [...r.imageIds] }));
  const source = rows.find(r => r.id === drag.rowId);
  if (drag.rowId && (!source || drag.index === undefined || source.imageIds[drag.index] !== drag.imageId)) return doc;
  if (source && drag.index !== undefined) {
    source.imageIds.splice(drag.index, 1);
    if (source.id === rowId && drag.index < index) index--;
  }
  const target = rows.find(r => r.id === rowId)!;
  target.imageIds.splice(Math.max(0, Math.min(index, target.imageIds.length)), 0, drag.imageId);
  return { ...doc, rows };
}

export function validateImageFile(file: { name: string; type: string; size: number }) {
  const ext = file.name.split(".").pop()?.toLowerCase();
  const mime = ext === "jpg" || ext === "jpeg" ? "image/jpeg" : ext === "png" ? "image/png" : ext === "webp" ? "image/webp" : null;
  if (!mime || mime !== file.type) throw Error("JPG・PNG・WEBPのみ使用できます。拡張子とMIME形式を確認してください。");
  if (!file.size || file.size > MAX_IMAGE_BYTES) throw Error("画像は1枚4MB以下にしてください。");
  return { mime, extension: mime === "image/jpeg" ? "jpg" : ext! };
}

/** Fixed artwork dimensions; larger documents fit uniformly instead of clipping. */
export function tierLayout(doc: TierDocument, ratios: Readonly<Record<string, number>> = {}) {
  const available = doc.showTitle ? 912 : 984;
  const baseHeight = Math.max(148, (available - (doc.rows.length - 1) * 8) / doc.rows.length);
  const nominalSize = Math.floor(baseHeight * 0.82), gap = 12;
  const padding = Math.round((baseHeight - nominalSize) / 2);
  const ratio = (id: string) => Number.isFinite(ratios[id]) && ratios[id] > 0 ? ratios[id] : 1;
  // Even an unusually wide image fits without distortion; every image keeps the same height.
  const widest = Math.max(1, ...doc.rows.flatMap(row => row.imageIds.map(ratio)));
  const imageSize = Math.min(nominalSize, (1664 - padding * 2) / widest);
  const columns = Math.max(1, Math.floor((1664 - padding * 2 + gap) / (imageSize + gap)));
  const frames = doc.rows.map(row => {
    let left = padding, top = padding;
    return row.imageIds.map(id => {
      const width = imageSize * ratio(id);
      if (left > padding && left + width > 1664 - padding + 0.001) { left = padding; top += imageSize + gap; }
      const frame = { left, top, width, height: imageSize };
      left += width + gap;
      return frame;
    });
  });
  const heights = frames.map(row => Math.max(baseHeight, (row.at(-1)?.top ?? 0) + imageSize + padding));
  const contentHeight = heights.reduce((sum, h) => sum + h, 0) + Math.max(0, heights.length - 1) * 8;
  return { heights, contentHeight, imageSize, gap, padding, columns, frames, scale: Math.min(1, available / contentHeight) };
}

export function tierImagePosition(layout: ReturnType<typeof tierLayout>, index: number, rowIndex = 0) {
  return layout.frames[rowIndex]?.[index] ?? { left: layout.padding + (index % layout.columns) * (layout.imageSize + layout.gap), top: layout.padding + Math.floor(index / layout.columns) * (layout.imageSize + layout.gap), width: layout.imageSize, height: layout.imageSize };
}
