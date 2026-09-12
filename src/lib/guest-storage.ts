import type { Match } from "@/types/database";

export const GUEST_MATCHES_STORAGE_KEY = "svml:guest-matches:v1";

export type StoredGuestMatch = Pick<
  Match,
  | "environment_id"
  | "my_deck_id"
  | "opponent_deck_id"
  | "my_archetype_id"
  | "opponent_archetype_id"
  | "turn_order"
  | "result"
  | "played_at"
> & { local_id?: string };

export type GuestImportResult = { ok: boolean; importedIds: string[]; message: string };

function readRecords(raw: string): unknown[] {
  const records: unknown = JSON.parse(raw);
  if (!Array.isArray(records)) throw new Error("端末の戦績形式を確認できません。");
  return records;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

// Add identity before sending, including for legacy rows. Preserve unrecognized entries.
export function identifyGuestMatches(raw: string, createId = () => crypto.randomUUID()): string {
  const records = readRecords(raw);
  const reserved = new Set(records.flatMap((row) => isRecord(row) && typeof row.local_id === "string" ? [row.local_id] : []));
  const seen = new Set<string>();
  return JSON.stringify(records.map((row) => {
    if (!isRecord(row)) return row;
    let id = typeof row.local_id === "string" ? row.local_id : "";
    if (!id || seen.has(id)) {
      do { id = createId(); } while (reserved.has(id));
      reserved.add(id);
    }
    seen.add(id);
    return { ...row, local_id: id };
  }));
}

// Re-read storage after the response. Only remove unchanged, acknowledged submissions.
export function removeImportedGuestMatches(raw: string, submitted: string, importedIds: string[]): string {
  const snapshots = new Map(readRecords(submitted).flatMap((row) =>
    isRecord(row) && typeof row.local_id === "string" ? [[row.local_id, JSON.stringify(row)] as const] : []
  ));
  const accepted = new Set(importedIds);
  return JSON.stringify(readRecords(raw).filter((row) => {
    if (!isRecord(row) || typeof row.local_id !== "string" || !accepted.has(row.local_id)
      || snapshots.get(row.local_id) !== JSON.stringify(row)) return true;
    accepted.delete(row.local_id);
    return false;
  }));
}
