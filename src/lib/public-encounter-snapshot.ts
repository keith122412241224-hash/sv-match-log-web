import { createSupabaseServerClient } from "@/lib/supabase/server";

type Deck = { name: string; encounterRate: number };
export type PublicEncounterSnapshot = {
  periodStart: string | null;
  periodEnd: string;
  updatedAt: string;
  totalMatches: number;
  decks: Deck[];
};

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function timestamp(value: unknown): value is string {
  return typeof value === "string" && Number.isFinite(Date.parse(value));
}

function deck(value: unknown): value is Deck {
  return record(value) && typeof value.name === "string" && Boolean(value.name.trim()) &&
    typeof value.encounterRate === "number" && value.encounterRate > 0 && value.encounterRate <= 100;
}

export async function getPublicEncounterSnapshot(environment: { id: string; name: string }): Promise<PublicEncounterSnapshot | null> {
  try {
    const client = await createSupabaseServerClient();
    const { data, error } = await client.rpc("get_current_public_encounters", { p_expected_environment_id: environment.id });
    if (error || !record(data) || data.environmentName !== environment.name) return null;
    const { periodStart, periodEnd, updatedAt, totalMatches, decks } = data;
    if (!timestamp(periodEnd) || !timestamp(updatedAt) || Date.parse(updatedAt) < Date.parse(periodEnd) ||
      !(periodStart === null || (timestamp(periodStart) && Date.parse(periodStart) < Date.parse(periodEnd))) ||
      typeof totalMatches !== "number" || !Number.isSafeInteger(totalMatches) || totalMatches < 1 ||
      !Array.isArray(decks) || !decks.length || decks.length > 3 || !decks.every(deck)) return null;
    return { periodStart, periodEnd, updatedAt, totalMatches, decks: decks.map(({ name, encounterRate }) => ({ name, encounterRate })) };
  } catch {
    return null;
  }
}
