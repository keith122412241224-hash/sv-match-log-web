import { UUID, type TierDocument } from "./model";

export type CorrelationNode = { id: string; imageId: string; x: number; y: number; width: number; height: number };
export type CorrelationEdge = { id: string; sourceNodeId: string; targetNodeId: string; origin: "manual"; label: string; visible: boolean; type?: "forward" | "bidirectional"; winRate?: number | null; matchCount?: number | null };
export type CorrelationDocument = { version: 1; title?: string; showTitle: boolean; showNames: boolean; showLabels?: boolean; showStats?: boolean; nodes: CorrelationNode[]; edges: CorrelationEdge[] };
export type CorrelationWork = { id: string; tier_work_id: string; document: CorrelationDocument; revision: number; created_at: string; updated_at: string };
const validId = (id: unknown): id is string => typeof id === "string" && UUID.test(id);

export function parseCorrelation(input: unknown, legacyTitle = ""): CorrelationDocument {
  const d = input as CorrelationDocument;
  if (!d || d.version !== 1 || typeof d.showTitle !== "boolean" || typeof d.showNames !== "boolean" || !Array.isArray(d.nodes) || d.nodes.length > 300 || !Array.isArray(d.edges) || d.edges.length > 600) throw Error("相関図の形式が不正です（画像300個・矢印600本まで）。");
  if ((d.title !== undefined && (typeof d.title !== "string" || d.title.length > 120)) || [d.showLabels,d.showStats].some(v=>v!==undefined && typeof v!=="boolean")) throw Error("相関図のタイトル・表示設定が不正です。");
  const ids = new Set<string>(), edgeIds = new Set<string>(), pairs = new Set<string>();
  const nodes = d.nodes.map(n => {
    if (!n || !validId(n.id) || ids.has(n.id) || !validId(n.imageId) || ![n.x,n.y,n.width,n.height].every(v => typeof v === "number" && Number.isFinite(v)) || n.width < 24 || n.height < 24 || n.width > 480 || n.height > 480 || n.x < 0 || n.y < 0 || n.x + n.width > 1920 || n.y + n.height > 1080) throw Error("ノードのID・座標・サイズが不正です。キャンバス内に配置してください。");
    ids.add(n.id); return { id: n.id, imageId: n.imageId, x: n.x, y: n.y, width: n.width, height: n.height };
  });
  const edges = d.edges.map(e => {
    if (!e || !validId(e.id) || edgeIds.has(e.id) || !ids.has(e.sourceNodeId) || !ids.has(e.targetNodeId) || e.sourceNodeId === e.targetNodeId || e.origin !== "manual" || typeof e.label !== "string" || e.label.length > 60 || typeof e.visible !== "boolean") throw Error("矢印の接続先・ラベル・形式が不正です。自己接続はできません。");
    const pair = [e.sourceNodeId, e.targetNodeId].sort().join(":");
    if (pairs.has(pair)) throw Error("同じ2つのノードには矢印を1本だけ設定できます。方向反転をご利用ください。");
    if (e.type !== undefined && e.type !== "forward" && e.type !== "bidirectional") throw Error("矢印の種類が不正です。");
    if (e.winRate != null && (typeof e.winRate !== "number" || !Number.isFinite(e.winRate) || e.winRate < 0 || e.winRate > 100)) throw Error("勝率は0〜100で入力してください。");
    if (e.matchCount != null && (typeof e.matchCount !== "number" || !Number.isSafeInteger(e.matchCount) || e.matchCount < 0)) throw Error("対戦数は0以上の整数で入力してください。");
    edgeIds.add(e.id); pairs.add(pair);
    return { id: e.id, sourceNodeId: e.sourceNodeId, targetNodeId: e.targetNodeId, origin: "manual" as const, label: e.label, visible: e.visible, type: e.type ?? "forward", winRate: e.winRate ?? null, matchCount: e.matchCount ?? null };
  });
  return { version: 1, title: d.title ?? legacyTitle, showTitle: d.showTitle, showNames: d.showNames, showLabels: d.showLabels ?? true, showStats: d.showStats ?? true, nodes, edges };
}

/** First occurrence of each library image wins; Tier order becomes vertical bands. */
export function correlationFromTier(tier: TierDocument): CorrelationDocument {
  const seen = new Set<string>();
  const groups = tier.rows.map(row => row.imageIds.filter(id => { if (seen.has(id)) return false; seen.add(id); return true; })).filter(ids => ids.length);
  let capacity = 12;
  while (capacity < 64 && groups.reduce((sum, ids) => sum + Math.ceil(ids.length / capacity), 0) > 32) capacity++;
  const totalLines = groups.reduce((sum, ids) => sum + Math.ceil(ids.length / capacity), 0);
  const cellHeight = 900 / Math.max(1, totalLines);
  let offset = 0;
  const nodes = groups.flatMap(ids => {
    const columns = Math.min(ids.length, capacity);
    const lines = Math.ceil(ids.length / columns);
    const cellWidth = 1800 / columns;
    const width = Math.max(24, Math.min(160, cellWidth - 12, (cellHeight - 8) / 1.15));
    const height = Math.max(24, Math.min(184, cellHeight - 6, width * 1.15));
    const rowOffset = offset; offset += lines * cellHeight;
    return ids.map((imageId, index) => ({ id: crypto.randomUUID(), imageId, x: Math.round(60 + (index % columns) * cellWidth + (cellWidth - width) / 2), y: Math.round(120 + rowOffset + Math.floor(index / columns) * cellHeight + (cellHeight - height) / 2), width: Math.round(width), height: Math.round(height) }));
  });
  return { version: 1, title: tier.title, showTitle: tier.showTitle, showNames: true, showLabels: true, showStats: true, nodes, edges: [] };
}

export function boundNode(node: CorrelationNode, patch: Partial<Pick<CorrelationNode, "x" | "y" | "width" | "height">>): CorrelationNode {
  const n = { ...node, ...patch };
  n.width = Math.max(24, Math.min(480, Number.isFinite(n.width) ? n.width : node.width));
  n.height = Math.max(24, Math.min(480, Number.isFinite(n.height) ? n.height : node.height));
  n.x = Math.max(0, Math.min(1920 - n.width, Number.isFinite(n.x) ? n.x : node.x));
  n.y = Math.max(0, Math.min(1080 - n.height, Number.isFinite(n.y) ? n.y : node.y));
  return n;
}

export function removeNode(doc: CorrelationDocument, id: string): CorrelationDocument {
  return { ...doc, nodes: doc.nodes.filter(n => n.id !== id), edges: doc.edges.filter(e => e.sourceNodeId !== id && e.targetNodeId !== id) };
}

/** Endpoints are computed from node rectangles, never persisted as coordinates. */
export function edgeGeometry(source: CorrelationNode, target: CorrelationNode) {
  const a = { x: source.x + source.width / 2, y: source.y + source.height / 2 };
  const b = { x: target.x + target.width / 2, y: target.y + target.height / 2 };
  const dx = b.x - a.x, dy = b.y - a.y;
  if (dx === 0 && dy === 0) return null;
  const fromScale = Math.min(dx ? source.width / 2 / Math.abs(dx) : Infinity, dy ? source.height / 2 / Math.abs(dy) : Infinity);
  const toScale = Math.min(dx ? target.width / 2 / Math.abs(dx) : Infinity, dy ? target.height / 2 / Math.abs(dy) : Infinity);
  if (fromScale + toScale >= 1) return null; // Overlapping nodes: avoid an inverted arrow through images.
  const start = { x: a.x + dx * fromScale, y: a.y + dy * fromScale };
  const end = { x: b.x - dx * toScale, y: b.y - dy * toScale };
  const length = Math.hypot(end.x - start.x, end.y - start.y), ux = dx / Math.hypot(dx,dy), uy = dy / Math.hypot(dx,dy);
  const head = Math.min(16, length / 3);
  return { start, end, label: { x: (start.x + end.x) / 2, y: (start.y + end.y) / 2 - 14 }, points: `${end.x},${end.y} ${end.x - ux * head - uy * head / 2},${end.y - uy * head + ux * head / 2} ${end.x - ux * head + uy * head / 2},${end.y - uy * head - ux * head / 2}` };
}
