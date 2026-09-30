import { isEnvironmentInputEnabled } from "@/lib/environment-input";
import { getMostRecentlyCreatedId } from "@/lib/utils";
import type { Environment } from "@/types/database";

// Preserve explicit history views; only the default follows the input window.
export function selectInitialEnvironmentId(environments: Pick<Environment, "id" | "created_at" | "allow_match_input" | "match_input_start_at" | "match_input_end_at">[], requestedId?: string, now = Date.now()): string {
  if (requestedId && environments.some(environment => environment.id === requestedId)) return requestedId;

  const available = environments.filter(environment => isEnvironmentInputEnabled(environment, now));
  return getMostRecentlyCreatedId(available.length ? available : environments);
}
