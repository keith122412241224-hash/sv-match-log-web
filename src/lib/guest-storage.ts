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
  | "memo"
>;
