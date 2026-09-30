import { RANKS, MASTER_GROUPS, GRANDMASTER_RATINGS, type RankOption } from "@/constants/ranks";
import { ANALYSIS_RANK_FILTERS, type AnalysisRankFilter } from "@/lib/analysis-rank-filter";

export const RANK_ATOMS = ["unranked", "beginner", "d", "c", "b", "a", "aa",
  "master:emerald", "master:topaz", "master:ruby", "master:sapphire", "master:diamond",
  "grandmaster:none", "grandmaster:epic", "grandmaster:ultimate", "grandmaster:legend", "grandmaster:beyond"] as const;
export type RankAtomicFilter = typeof RANK_ATOMS[number];
export type RankSelection = readonly RankAtomicFilter[];
export type RankPreset = "all" | "master-plus" | "master" | "grandmaster";
export const MASTER_ATOMS = RANK_ATOMS.slice(7, 12);
export const GRANDMASTER_ATOMS = RANK_ATOMS.slice(12);
export const RANK_PRESETS: readonly { value: RankPreset; label: string; ranks: RankSelection }[] = [
  { value: "all", label: "すべて", ranks: RANK_ATOMS },
  { value: "master-plus", label: "Master以上", ranks: [...MASTER_ATOMS, ...GRANDMASTER_ATOMS] },
  { value: "master", label: "Master", ranks: MASTER_ATOMS },
  { value: "grandmaster", label: "GrandMaster", ranks: GRANDMASTER_ATOMS }
];
export type AtomicRankOption = RankOption & { value: RankAtomicFilter; fullLabel: string };
const gmIcon = RANKS.find(r => r.value === "grandmaster")!.iconSrc;
export const ATOMIC_RANK_GROUPS: readonly { label: string; options: readonly AtomicRankOption[] }[] = [
  { label: "その他", options: [{ value: "unranked", label: "ランク未登録", fullLabel: "ランク未登録", order: 0 }] },
  { label: "通常ランク", options: RANKS.filter(r => !["master", "grandmaster"].includes(r.value)).map(r => ({ ...r, value: r.value as RankAtomicFilter, fullLabel: r.label })) },
  { label: "Master", options: MASTER_GROUPS.map(r => ({ ...r, value: `master:${r.value}`, fullLabel: `Master / ${r.label}` })) },
  { label: "GrandMaster", options: GRANDMASTER_RATINGS.map(r => ({ ...r, iconSrc: gmIcon, value: `grandmaster:${r.value}`, fullLabel: `GrandMaster / ${r.label}` })) }
];
function invalid(): never { throw new Error("ランクの絞り込み条件が不正です。最低1区分を選択してください。"); }
export function normalizeRankSelection(value: unknown): RankAtomicFilter[] {
  if (!Array.isArray(value) || value.length === 0 || value.length > RANK_ATOMS.length
    || value.some(v => typeof v !== "string" || !(RANK_ATOMS as readonly string[]).includes(v))) return invalid();
  const selected = new Set(value);
  return RANK_ATOMS.filter(v => selected.has(v));
}
export function expandLegacyRankFilter(value: unknown): RankAtomicFilter[] {
  const preset = RANK_PRESETS.find(p => p.value === value || (p.value === "grandmaster" && value === "grandmaster-plus"));
  if (preset) return [...preset.ranks];
  // unranked is a new atom, not a legacy wire value.
  if (value === "unranked") return invalid();
  return normalizeRankSelection([value]);
}
export function parseRankSelection(params: { ranks?: unknown; rank?: unknown }): RankAtomicFilter[] {
  if (params.ranks !== undefined) {
    if (params.rank !== undefined || typeof params.ranks !== "string") return invalid();
    return normalizeRankSelection(params.ranks.split(","));
  }
  return params.rank === undefined ? [...RANK_ATOMS] : expandLegacyRankFilter(params.rank);
}
export const serializeRankSelection = (ranks: RankSelection) => normalizeRankSelection(ranks).join(",");
export function getRankSelectionLabel(ranks: RankSelection): string {
  const canonical = serializeRankSelection(ranks);
  return RANK_PRESETS.find(p => serializeRankSelection(p.ranks) === canonical)?.label ?? `カスタム（${normalizeRankSelection(ranks).length}区分）`;
}
export function rankSelectionToMatrixFilter(ranks: RankSelection): AnalysisRankFilter | null {
  const canonical = serializeRankSelection(ranks);
  return ANALYSIS_RANK_FILTERS.find(p => serializeRankSelection(expandLegacyRankFilter(p.value)) === canonical)?.value ?? null;
}
export function rankGroupState(draft: RankSelection, group: RankSelection) {
  const count = group.filter(v => draft.includes(v)).length;
  return { checked: count === group.length, indeterminate: count > 0 && count < group.length };
}
export function toggleRankGroup(draft: RankSelection, group: RankSelection): RankAtomicFilter[] {
  const remove = rankGroupState(draft, group).checked;
  return RANK_ATOMS.filter(v => remove ? draft.includes(v) && !group.includes(v) : draft.includes(v) || group.includes(v));
}
