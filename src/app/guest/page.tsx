import { ScheduledGuestApp } from "@/components/guest/ScheduledGuestApp";
import { getActiveArchetypes, getEnvironments } from "@/lib/data";

export default async function GuestPage() {
  const [archetypes, environments] = await Promise.all([getActiveArchetypes(), getEnvironments()]);
  return <ScheduledGuestApp archetypes={archetypes} environments={environments} serverNow={Date.now()} />;
}
