"use client";

import { GuestApp } from "@/components/guest/GuestApp";
import { useScheduledEnvironments } from "@/components/matches/useScheduledEnvironments";
import type { DeckArchetype, Environment } from "@/types/database";

export function ScheduledGuestApp({ archetypes, environments, serverNow }: {
  archetypes: DeckArchetype[];
  environments: Environment[];
  serverNow: number;
}) {
  const enabled = useScheduledEnvironments(environments, serverNow);
  return <GuestApp archetypes={archetypes} environments={enabled} allEnvironments={environments} />;
}
