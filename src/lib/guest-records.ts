import type { StoredGuestMatch } from "@/lib/guest-storage";
import { GUEST_MATCHES_STORAGE_KEY, identifyGuestMatches } from "@/lib/guest-storage";
import { validateMatchRank } from "@/lib/match-rank";

export function readGuestRecords(raw: string): unknown[] {
  const records: unknown = JSON.parse(raw);
  if (!Array.isArray(records)) throw new Error("端末の戦績形式を確認できません。");
  return records;
}

// Validate only the display projection. Unknown records remain untouched in storage.
export function displayGuestMatches(records: unknown[]): StoredGuestMatch[] {
  return records.filter((value): value is StoredGuestMatch => {
    if (!value || typeof value !== "object") return false;
    const row = value as Record<string, unknown>;
    return typeof row.environment_id === "string" && typeof row.my_deck_id === "string"
      && typeof row.opponent_deck_id === "string"
      && (row.my_archetype_id == null || typeof row.my_archetype_id === "string")
      && (row.opponent_archetype_id == null || typeof row.opponent_archetype_id === "string")
      && (row.local_id == null || typeof row.local_id === "string")
      && (row.result === "win" || row.result === "lose")
      && (row.turn_order === "first" || row.turn_order === "second")
      && typeof row.played_at === "string" && Number.isFinite(Date.parse(row.played_at))
      && validateMatchRank(row).ok;
  });
}

export function appendGuestMatch(storage: Pick<Storage, "getItem" | "setItem">, match: StoredGuestMatch): StoredGuestMatch[] {
  const records = readGuestRecords(storage.getItem(GUEST_MATCHES_STORAGE_KEY) ?? "[]");
  const next = [match, ...records];
  storage.setItem(GUEST_MATCHES_STORAGE_KEY, JSON.stringify(next));
  return displayGuestMatches(next);
}

// Reuse the import identity migration before exposing edit/delete controls.
export function loadIdentifiedGuestMatches(storage: Pick<Storage, "getItem" | "setItem">): StoredGuestMatch[] {
  const raw = storage.getItem(GUEST_MATCHES_STORAGE_KEY) ?? "[]";
  const identified = identifyGuestMatches(raw);
  if (identified !== raw) storage.setItem(GUEST_MATCHES_STORAGE_KEY, identified);
  return displayGuestMatches(readGuestRecords(identified));
}

export function mutateGuestMatch(storage: Pick<Storage, "getItem" | "setItem">, id: string, draft?: Omit<StoredGuestMatch, "local_id">): StoredGuestMatch[] {
  const records = readGuestRecords(storage.getItem(GUEST_MATCHES_STORAGE_KEY) ?? "[]");
  const indexes = records.flatMap((row, index) => row && typeof row === "object" && "local_id" in row && row.local_id === id ? [index] : []);
  if (!id || indexes.length !== 1) throw new Error("戦績を一意に確認できません。画面を再読み込みしてください。");
  const index = indexes[0];
  if (draft) {
    const rank = validateMatchRank(draft);
    if (!rank.ok) throw new Error(rank.message);
    const old = records[index] as StoredGuestMatch;
    const updated = { ...old, ...rank.value, environment_id: draft.environment_id,
      my_deck_id: draft.my_deck_id, opponent_deck_id: draft.opponent_deck_id,
      my_archetype_id: draft.my_archetype_id, opponent_archetype_id: draft.opponent_archetype_id,
      result: draft.result, turn_order: draft.turn_order };
    if (displayGuestMatches([updated]).length !== 1) throw new Error("入力内容を確認してください。");
    records[index] = updated;
  } else records.splice(index, 1);
  storage.setItem(GUEST_MATCHES_STORAGE_KEY, JSON.stringify(records));
  return displayGuestMatches(records);
}
