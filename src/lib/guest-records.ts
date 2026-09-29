import type { StoredGuestMatch } from "@/lib/guest-storage";
import { GUEST_MATCHES_STORAGE_KEY } from "@/lib/guest-storage";
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
