import { DASHBOARD_PERIODS, type DashboardSelectionV4 } from "@/lib/environment-dashboard-period";
import { normalizeRankSelection } from "@/lib/rank-selection";
import { UUID, type CreatorImage } from "./model";
import type { CorrelationDocument, CorrelationEdge } from "./correlation";

export type DataSelection = DashboardSelectionV4;
export type DataSnapshot = { selection: DataSelection; start: string | null; end: string; aggregatedAt: string; sourceDeckId: string; targetDeckId: string };
export type MatchupData = { selection: DataSelection; start: string | null; end: string; aggregatedAt: string; imageDecks: Record<string,string | null>; cells: { sourceDeckId: string; targetDeckId: string; winRate: number | null; matchCount: number }[] };
export type MatchupCandidate = { sourceNodeId: string; targetNodeId: string; winRate: number; matchCount: number; snapshot: DataSnapshot };

export function parseDataSelection(value: unknown): DataSelection {
  const v = value as DataSelection;
  if (!v || typeof v.environment !== "string" || !UUID.test(v.environment) || !DASHBOARD_PERIODS.some(p=>p.value===v.period)) throw Error("データ集計条件が不正です。");
  return { environment: v.environment, period: v.period, ranks: normalizeRankSelection(v.ranks) };
}
export function sameSelection(a: DataSelection, b: DataSelection) {
  return JSON.stringify(parseDataSelection(a)) === JSON.stringify(parseDataSelection(b));
}
export function parseDataSnapshot(value: unknown): DataSnapshot {
  const v = value as DataSnapshot;
  const selection = parseDataSelection(v?.selection);
  if (!v || ![v.sourceDeckId,v.targetDeckId].every(id=>typeof id === "string" && UUID.test(id)) || ![v.end,v.aggregatedAt].every(t=>typeof t === "string" && /^\d{4}-\d\d-\d\dT/.test(t) && Number.isFinite(Date.parse(t))) || (selection.period === "all" ? v.start !== null : typeof v.start !== "string" || !Number.isFinite(Date.parse(v.start)) || Date.parse(v.start)>=Date.parse(v.end)) || Date.parse(v.end)>Date.parse(v.aggregatedAt)) throw Error("取得データの記録が不正です。");
  return { selection, start:v.start,end:v.end,aggregatedAt:v.aggregatedAt,sourceDeckId:v.sourceDeckId,targetDeckId:v.targetDeckId };
}
export function linkedDeck(doc: CorrelationDocument, nodeId: string, images: readonly CreatorImage[]) {
  return images.find(i=>i.id===doc.nodes.find(n=>n.id===nodeId)?.imageId)?.archetype_id ?? null;
}
export function withAutomaticData(doc: CorrelationDocument, edge: CorrelationEdge, data: MatchupData): CorrelationEdge {
  const sourceDeckId = data.imageDecks[doc.nodes.find(n=>n.id===edge.sourceNodeId)?.imageId ?? ""];
  const targetDeckId = data.imageDecks[doc.nodes.find(n=>n.id===edge.targetNodeId)?.imageId ?? ""];
  const cell = data.cells.find(c=>c.sourceDeckId===sourceDeckId && c.targetDeckId===targetDeckId);
  if (!sourceDeckId || !targetDeckId || !cell) return { ...edge,dataSource:"auto",winRate:null,matchCount:null,dataSnapshot:undefined };
  return { ...edge,dataSource:"auto",winRate:cell.matchCount>0 && cell.winRate!==null ? Math.round(cell.winRate*10)/10 : null,matchCount:cell.matchCount,
    dataSnapshot:{selection:data.selection,start:data.start,end:data.end,aggregatedAt:data.aggregatedAt,sourceDeckId,targetDeckId} };
}
export function matchupCandidates(doc: CorrelationDocument, data: MatchupData, minimum: number, threshold: number): MatchupCandidate[] {
  if (!Number.isSafeInteger(minimum) || minimum<0 || !Number.isFinite(threshold) || threshold<50 || threshold>100) throw Error("最低対戦数は0以上の整数、有利判定は50〜100%にしてください。");
  const byDeck = new Map<string,string>();
  for (const n of doc.nodes) { const deck=data.imageDecks[n.imageId]; if(deck && !byDeck.has(deck))byDeck.set(deck,n.id); }
  const pair=(a:string,b:string)=>[a,b].sort().join(":");
  const occupied=new Set(doc.edges.map(e=>pair(data.imageDecks[doc.nodes.find(n=>n.id===e.sourceNodeId)?.imageId??""]??"",data.imageDecks[doc.nodes.find(n=>n.id===e.targetNodeId)?.imageId??""]??"")));
  const result:MatchupCandidate[]=[];
  for (const c of [...data.cells].sort((a,b)=>(b.winRate??-1)-(a.winRate??-1) || a.sourceDeckId.localeCompare(b.sourceDeckId))) {
    const source=byDeck.get(c.sourceDeckId),target=byDeck.get(c.targetDeckId),key=pair(c.sourceDeckId,c.targetDeckId);
    if (!source || !target || source===target || occupied.has(key) || c.matchCount===0 || c.matchCount<minimum || c.winRate===null || c.winRate<threshold) continue;
    occupied.add(key);result.push({sourceNodeId:source,targetNodeId:target,winRate:Math.round(c.winRate*10)/10,matchCount:c.matchCount,snapshot:{selection:data.selection,start:data.start,end:data.end,aggregatedAt:data.aggregatedAt,sourceDeckId:c.sourceDeckId,targetDeckId:c.targetDeckId}});
  }
  return result;
}
