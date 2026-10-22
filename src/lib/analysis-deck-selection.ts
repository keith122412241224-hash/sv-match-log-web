import { SHADOWVERSE_CLASSES } from "@/lib/constants";
// null means unrestricted; an empty explicit selection is always invalid.
export type DeckSelection = readonly string[] | null;
export const MAX_ANALYSIS_DECKS = 60;
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export class DeckSelectionError extends Error {
  constructor() { super("デッキの絞り込み条件が不正です。1件以上の有効なデッキを選択してください。"); this.name = "DeckSelectionError"; }
}
export function normalizeDeckSelection(value: unknown, catalog?: readonly { id: string; class_name?: string }[]): DeckSelection {
  if (value === null) return null;
  if (!Array.isArray(value) || value.length < 1 || value.length > MAX_ANALYSIS_DECKS || value.some(id => typeof id !== "string" || !uuid.test(id))) throw new DeckSelectionError();
  const ids = new Set<string>(value.map(id => id.toLowerCase()));
  if (!catalog) return [...ids].sort();
  const classes = [...new Set<string>([...SHADOWVERSE_CLASSES, ...catalog.map(d => d.class_name ?? "")])];
  const ordered = [...new Set(classes.flatMap(name => catalog.filter(d => (d.class_name ?? "") === name).map(d => d.id.toLowerCase())))];
  if ([...ids].some(id => !ordered.includes(id))) throw new DeckSelectionError();
  return ordered.filter(id => ids.has(id));
}
export function parseDeckSelection(single: unknown, multiple: unknown, catalog?: readonly { id: string }[]): DeckSelection {
  if (single !== undefined && multiple !== undefined) throw new DeckSelectionError();
  if (multiple !== undefined) {
    if (typeof multiple !== "string" || multiple.length > MAX_ANALYSIS_DECKS * 37) throw new DeckSelectionError();
    return normalizeDeckSelection(multiple.split(","), catalog);
  }
  if (single === undefined || single === "") return null; // Legacy empty selects represent all.
  return normalizeDeckSelection([single], catalog);
}
export function setDeckSelectionQuery(query: URLSearchParams, name: "myDeck" | "opponentDeck", selection: DeckSelection) {
  query.delete(name); query.delete(name + "Ids");
  if (selection === null) return;
  if (selection.length === 0) throw new DeckSelectionError();
  query.set(selection.length === 1 ? name : name + "Ids", selection.join(","));
}
export function canonicalDeckQuery(query: URLSearchParams, catalog: readonly { id: string; class_name?: string }[]) {
  const next = new URLSearchParams(query);
  for (const name of ["myDeck", "opponentDeck"] as const) {
    if (next.getAll(name).length > 1 || next.getAll(name + "Ids").length > 1) throw new DeckSelectionError();
    setDeckSelectionQuery(next, name, parseDeckSelection(next.get(name) ?? undefined, next.get(name + "Ids") ?? undefined, catalog));
  }
  next.sort(); return next;
}
