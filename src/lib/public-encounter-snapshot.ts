// Publish only a reviewed, all-ranks member summary. Copy its current period,
// registered match total, aggregation time, and first 1–3 encounter rows in order
// from buildEnvironmentViewV4(...).encounters. Rates are percentages (0–100).
// Use ISO timestamps with an offset. Leave null until these fields are approved
// for anonymous display, including when the sample is too small to publish.
type PublicEncounterSnapshot = {
  environmentId: string;
  periodStart: string;
  periodEnd: string;
  updatedAt: string;
  totalMatches: number;
  decks: { name: string; encounterRate: number }[];
};

export const approvedEncounterSnapshot: PublicEncounterSnapshot | null = null;

export function currentEncounterSnapshot(environmentId: string | undefined, snapshot = approvedEncounterSnapshot) {
  if (!snapshot || snapshot.environmentId !== environmentId) return null;
  const start = Date.parse(snapshot.periodStart);
  const end = Date.parse(snapshot.periodEnd);
  const updated = Date.parse(snapshot.updatedAt);
  if (!(start < end && end <= updated) || !Number.isSafeInteger(snapshot.totalMatches) || snapshot.totalMatches < 1) return null;
  if (!snapshot.decks.length || snapshot.decks.length > 3 || !snapshot.decks.every(
    row => row.name.trim() && Number.isFinite(row.encounterRate) && row.encounterRate > 0 && row.encounterRate <= 100
  )) return null;
  return snapshot;
}
